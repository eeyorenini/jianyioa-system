/**
 * 验收管理 + 主材验收（2026-10-29 渐进拆分第 15 轮）
 *
 * 搬运自 server.js 原 7401-7965 行，搬入时 565 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerAcceptanceRoutes(app, deps) {
  const {
    permCore,
    pool,
    db,
    getUserId,
    checkPermission,
    hasReadAllPermission,
    isAdmin,
    addLog,
    notifyProject,
  } = deps;

  // ===== 验收管理（工长类模块：权限粒度与「施工日志 / 巡检」一致）=====
  // 说明：GET 暂不强制 checkPermission（与 /api/inspections 现状保持一致），仅要求登录；
  //       支持 project_id / status / mine 过滤，并 JOIN 出创建人姓名。
  //       服务端强制校验将在权限体系 P2 阶段统一补齐。
  // ==================== 验收管理（v2.3.1 P2：严格按动作 + 三档可见性） ====================

  // 列表：登录即需；可见性 = read_all(全部) / read(关联项目 + 自己提交) / 无权限→403
  app.get('/api/acceptance', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      // 业主端：x-user-id 是 customers.id / family_members.id，不在 employees 表，
      // 走员工 RBAC 会得到 visibleScope='none' 直接 403。业主只看自己名下项目的验收。
      const customer = await permCore.resolveCustomerIdentity(userId, req.headers['x-user-type'], req.headers['x-user-scope']);
      let scope;
      if (customer) {
        scope = 'customer';
      } else {
        scope = await permCore.visibleScope(userId, 'acceptance');
        if (scope === 'none') return res.status(403).json({ error: '无权限查看验收' });
      }
      const { project_id, status, mine } = req.query;
      const where = [];
      const params = [];
      if (project_id) {
        if (scope === 'customer') {
          const myIds = await permCore.customerProjectIds(customer);
          if (!myIds.has(Number(project_id))) {
            return res.status(403).json({ error: '该项目不在您的名下' });
          }
        }
        where.push('a.project_id = ?');
        params.push(project_id);
      }
      if (status) { where.push('a.accept_status = ?'); params.push(status); }
      if (String(mine) === '1') { where.push('a.creator_id = ?'); params.push(userId); }
      if (scope === 'related') {
        // 仅关联项目 + 我提交的
        const rel = await permCore.relatedProjectIds(userId);
        if (!rel.size) {
          where.push('(a.project_id IN (?) OR a.creator_id = ?)');
          // 占位（IN 0 用 -1 兼容空集）
          params.push([-1], userId);
        } else {
          where.push('(a.project_id IN (?) OR a.creator_id = ?)');
          params.push(Array.from(rel), userId);
        }
      } else if (scope === 'customer') {
        // 业主：只看自己名下项目
        const ids = Array.from(await permCore.customerProjectIds(customer));
        if (!ids.length) return res.json([]);
        where.push('a.project_id IN (?)');
        params.push(ids);
      }
      const sql = `SELECT a.*, e.name AS creator_name
                   FROM acceptance a
                   LEFT JOIN employees e ON e.id = a.creator_id
                   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY a.created_at DESC, a.id DESC`;
      const [rows] = await pool.query(sql, params);
      res.json(rows);
    } catch (err) {
      console.error('acceptance list error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 详情：登录 + (read_all OR 关联项目 OR 我提交) 才允许
  app.get('/api/acceptance/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const [rows] = await pool.query(
        `SELECT a.*, e.name AS creator_name
         FROM acceptance a
         LEFT JOIN employees e ON e.id = a.creator_id
         WHERE a.id = ?`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: '验收记录不存在' });
      const a = rows[0];
      const scope = await permCore.visibleScope(userId, 'acceptance');
      if (scope === 'none') return res.status(403).json({ error: '无权限查看' });
      if (scope === 'related') {
        const rel = await permCore.relatedProjectIds(userId);
        const ok = (a.project_id && rel.has(a.project_id)) || a.creator_id === userId;
        if (!ok) return res.status(403).json({ error: '无权限查看该验收记录' });
      }
      res.json(a);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/acceptance', checkPermission('acceptance:write'), async (req, res) => {
    const userId = getUserId(req);
    const { project_id, project_name, stage, accept_status, accept_date, quality_score, issues, attachment } = req.body;
    // 写权限校验：要求 acceptance:write；项目必须在我可见范围内（read_all OR 关联 OR 是创建人）
    if (!project_id) return res.status(400).json({ error: '缺少 project_id' });
    const scope = await permCore.visibleScope(userId, 'project');
    if (scope === 'none') return res.status(403).json({ error: '无项目可见权限' });
    if (scope === 'related') {
      const rel = await permCore.relatedProjectIds(userId);
      if (!rel.has(Number(project_id))) return res.status(403).json({ error: '仅可对关联项目提交验收' });
    }
    // 归一化附件：数组 -> JSON 字符串（只 stringify 一次，避免双重编码）
    const attachmentVal = Array.isArray(attachment) ? JSON.stringify(attachment) : (attachment ?? null);
    const stmt = db.prepare('INSERT INTO acceptance (project_id, project_name, stage, accept_status, accept_date, quality_score, issues, attachment, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
    const result = await stmt.run(project_id, project_name, stage, accept_status || '待验收', accept_date, quality_score ?? null, issues, attachmentVal, userId);
    await addLog(userId, '', '新增', '验收管理', result.lastInsertRowid, project_name, `项目: ${project_name}`, req.ip);
    notifyProject('acceptance_submit', project_id,
      `验收提交：${project_name}`,
      `项目「${project_name}」验收已提交，阶段：${stage || ''}，状态：${accept_status || '待验收'}。`,
      result.lastInsertRowid, 'acceptance'
    ).catch(console.error);
    res.json({ code: 0, id: result.lastInsertRowid, message: '添加成功' });
  });

  app.put('/api/acceptance/:id', checkPermission('acceptance:write'), async (req, res) => {
    const userId = getUserId(req);
    const { stage, accept_status, accept_date, quality_score, issues, attachment } = req.body;
    // 权限检查
    const [existing] = await db.prepare('SELECT project_id, project_name, creator_id, accept_status FROM acceptance WHERE id = ?').all(req.params.id);
    if (!existing) return res.status(404).json({ error: '验收记录不存在' });
    if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
    const aName = existing.project_name;
    // 动态字段更新：只更新传入的字段，避免 undefined 覆盖
    const fields = [];
    const params = [];
    if (stage !== undefined) { fields.push('stage=?'); params.push(stage); }
    if (accept_status !== undefined) { fields.push('accept_status=?'); params.push(accept_status); }
    if (accept_date !== undefined) { fields.push('accept_date=?'); params.push(accept_date); }
    if (quality_score !== undefined) { fields.push('quality_score=?'); params.push(quality_score); }
    if (issues !== undefined) { fields.push('issues=?'); params.push(issues); }
    if (attachment !== undefined) {
      fields.push('attachment=?');
      params.push(Array.isArray(attachment) ? JSON.stringify(attachment) : attachment);
    }
    if (!fields.length) return res.json({ code: 0, message: '无更新内容' });
    params.push(req.params.id);
    await pool.query(`UPDATE acceptance SET ${fields.join(', ')} WHERE id=?`, params);
    await addLog(userId, '', '编辑', '验收管理', req.params.id, aName, `更新验收: ${aName}`, req.ip);
    if (accept_status !== undefined && existing.accept_status !== accept_status) {
      notifyProject('acceptance_submit', existing.project_id,
        `验收状态变更：${aName}`,
        `验收「${aName}」状态已变更为「${accept_status}」，请知悉。`,
        parseInt(req.params.id), 'acceptance'
      ).catch(console.error);
    }
    res.json({ code: 0, message: '更新成功' });
  });

  app.delete('/api/acceptance/:id', checkPermission('acceptance:delete'), async (req, res) => {
    const userId = getUserId(req);
    const [a] = await db.prepare('SELECT project_name, creator_id FROM acceptance WHERE id = ?').all(req.params.id);
    if (!a) return res.status(404).json({ error: '记录不存在' });
    if (a.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
    const aName = a.project_name;
    const stmt = db.prepare('DELETE FROM acceptance WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '验收管理', req.params.id, aName, `删除验收: ${aName}`, req.ip);
    res.json({ message: '删除成功' });
  });

  // ==================== 主材验收（v2.4.1）====================
  // 业务：工长在材料进场时逐项验收（对不对版 / 数量 / 外观 / 资料），
  //   记录可追溯，不合格可作为退换货依据。
  // 表：material_acceptances（主单）+ material_acceptance_items（材料明细）
  // 权限：material_acceptance:read / read_all / write / delete
  // 可见范围与 acceptance 同口径：业主看名下项目，员工按 visibleScope（all / related）

  /** 生成验收单号：MA + yyyyMMdd + 3 位当天序号 */
  async function genMaterialAcceptNo(runner) {
    const q = runner || pool;
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const prefix = 'MA' + ymd;
    const [rows] = await q.query(
      'SELECT accept_no FROM material_acceptances WHERE accept_no LIKE ? ORDER BY accept_no DESC LIMIT 1',
      [prefix + '%']
    );
    let seq = 1;
    if (rows && rows[0] && rows[0].accept_no) {
      const tail = String(rows[0].accept_no).slice(prefix.length);
      seq = (parseInt(tail, 10) || 0) + 1;
    }
    return prefix + String(seq).padStart(3, '0');
  }

  /** 写一条材料明细（POST / PUT 共用） */
  async function insertMaterialAcceptItems(conn, acceptId, items) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      await conn.query(
        `INSERT INTO material_acceptance_items
         (accept_id, material_id, material_name, spec, brand, unit, plan_qty, actual_qty, verdict, problem_tags, remark, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          acceptId,
          it.material_id || null,
          it.material_name || '',
          it.spec || '',
          it.brand || '',
          it.unit || '',
          it.plan_qty === '' || it.plan_qty == null ? null : Number(it.plan_qty),
          it.actual_qty === '' || it.actual_qty == null ? null : Number(it.actual_qty),
          it.verdict || '合格',
          JSON.stringify(Array.isArray(it.problem_tags) ? it.problem_tags : []),
          it.remark || '',
          i,
        ]
      );
    }
  }

  /** 统计合格/不合格项数（列表页直接展示"3 项中 1 项不合格"） */
  function countMaterialAcceptVerdicts(items = []) {
    let pass = 0, fail = 0;
    for (const it of items) {
      if (!it) continue;
      if (it.verdict === '合格') pass++;
      else if (it.verdict === '不合格') fail++;
    }
    return { item_count: items.length, pass_count: pass, fail_count: fail };
  }

  // 新增页所需的项目元信息：项目名 + 工长 + 项目关联员工（验收人可选）+ 供应商候选
  // ⚠️ 必须注册在 /:id 之前，否则 'meta' 会被当成 id
  app.get('/api/material-acceptances/meta', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const projectId = Number(req.query.project_id);
      if (!projectId) return res.status(400).json({ error: '缺少 project_id' });
      const [prows] = await pool.query(
        `SELECT p.id, p.name, p.foreman_id, p.manager_id, p.designer_id, p.supervisor_id, p.creator_id,
                f.name AS foreman_name, c.name AS customer
         FROM projects p
         LEFT JOIN employees f ON f.id = p.foreman_id
         LEFT JOIN customers c ON c.id = p.customer_id
         WHERE p.id = ? LIMIT 1`,
        [projectId]
      );
      const p = prows && prows[0];
      if (!p) return res.status(404).json({ error: '项目不存在' });
      // 项目关联员工（验收人下拉）：工长 / 项目经理 / 设计师 / 监理 / 创建人
      const ids = [...new Set([p.foreman_id, p.manager_id, p.designer_id, p.supervisor_id, p.creator_id].filter(Boolean))];
      let staff = [];
      if (ids.length) {
        const [rows] = await pool.query(
          `SELECT id, name, position FROM employees WHERE id IN (?) AND (status IS NULL OR status <> '离职') ORDER BY FIELD(id, ?)`,
          [ids, ids]
        );
        staff = rows;
      }
      // 供应商候选（外部联系人里 category=supplier 或 role 含供应商的，取前 200 个）
      let suppliers = [];
      try {
        const [rows] = await pool.query(
          `SELECT id, name FROM external_contacts
           WHERE is_active IS NULL OR is_active = 1
           ORDER BY id DESC LIMIT 200`
        );
        suppliers = rows;
      } catch (_) { suppliers = []; }
      res.json({
        project_name: p.name,
        customer: p.customer || '',
        foreman_id: p.foreman_id || null,
        foreman_name: p.foreman_name || '',
        staff,
        suppliers,
      });
    } catch (err) {
      console.error('material-acceptance meta error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 材料选择器用的轻量搜索（登录即可，不要求 purchase:read_all ——
  // 工长是普通员工角色，走 /api/main-materials 会被 hasReadAllPermission 挡成空列表）
  app.get('/api/material-acceptances/material-search', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const kw = String(req.query.keyword || '').trim();
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
      // main_materials 的实际列名是 specification / quote_unit / purchase_unit，没有 spec / unit，
      // 这里直接起别名对齐前端，避免每个端各写一套取值逻辑
      let sql = `SELECT id, name, specification AS spec, model, brand,
                        COALESCE(NULLIF(purchase_unit, ''), quote_unit) AS unit, category
                 FROM main_materials`;
      const params = [];
      if (kw) {
        sql += ' WHERE (name LIKE ? OR code LIKE ? OR brand LIKE ? OR model LIKE ?)';
        const k = `%${kw}%`;
        params.push(k, k, k, k);
      }
      sql += ' ORDER BY sort_order ASC, id ASC LIMIT ?';
      params.push(limit);
      const [rows] = await pool.query(sql, params);
      res.json({ list: rows, total: rows.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/material-acceptances', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const customer = await permCore.resolveCustomerIdentity(userId, req.headers['x-user-type'], req.headers['x-user-scope']);
      let scope;
      if (customer) {
        scope = 'customer';
      } else {
        scope = await permCore.visibleScope(userId, 'material_acceptance');
        if (scope === 'none') return res.status(403).json({ error: '无权限查看材料验收' });
      }
      const { project_id, result, keyword, page, limit } = req.query;
      const where = [];
      const params = [];
      if (project_id) {
        if (scope === 'customer') {
          const myIds = await permCore.customerProjectIds(customer);
          if (!myIds.has(Number(project_id))) return res.status(403).json({ error: '该项目不在您的名下' });
        }
        where.push('a.project_id = ?');
        params.push(project_id);
      }
      if (result) { where.push('a.result = ?'); params.push(result); }
      if (keyword) {
        where.push('(a.accept_no LIKE ? OR a.project_name LIKE ? OR a.supplier_name LIKE ?)');
        const k = `%${keyword}%`;
        params.push(k, k, k);
      }
      if (scope === 'related') {
        const rel = await permCore.relatedProjectIds(userId);
        where.push('(a.project_id IN (?) OR a.creator_id = ?)');
        params.push(rel.size ? Array.from(rel) : [-1], userId);
      } else if (scope === 'customer') {
        const ids = Array.from(await permCore.customerProjectIds(customer));
        if (!ids.length) return res.json({ list: [], total: 0 });
        where.push('a.project_id IN (?)');
        params.push(ids);
      }
      const pageNum = Math.max(1, parseInt(page) || 1);
      const pageSize = Math.min(200, Math.max(1, parseInt(limit) || 50));
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const [cntRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM material_acceptances a ${whereSql}`, params
      );
      const total = (cntRows && cntRows[0] && cntRows[0].total) || 0;
      const [rows] = await pool.query(
        `SELECT a.*, e.name AS creator_name,
                COALESCE(NULLIF(a.project_name, ''), p.name) AS project_name_display
         FROM material_acceptances a
         LEFT JOIN employees e ON e.id = a.creator_id
         LEFT JOIN projects p ON p.id = a.project_id
         ${whereSql}
         ORDER BY a.accept_date DESC, a.id DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, (pageNum - 1) * pageSize]
      );
      res.json({ list: rows, total });
    } catch (err) {
      console.error('material-acceptance list error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/material-acceptances/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const [rows] = await pool.query(
        `SELECT a.*, e.name AS creator_name,
                COALESCE(NULLIF(a.project_name, ''), p.name) AS project_name_display
         FROM material_acceptances a
         LEFT JOIN employees e ON e.id = a.creator_id
         LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.id = ?`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: '材料验收记录不存在' });
      const a = rows[0];
      const customer = await permCore.resolveCustomerIdentity(userId, req.headers['x-user-type'], req.headers['x-user-scope']);
      const scope = customer ? 'customer' : await permCore.visibleScope(userId, 'material_acceptance');
      if (scope === 'none') return res.status(403).json({ error: '无权限查看' });
      if (scope === 'related') {
        const rel = await permCore.relatedProjectIds(userId);
        const ok = (a.project_id && rel.has(a.project_id)) || a.creator_id === userId;
        if (!ok) return res.status(403).json({ error: '无权限查看该记录' });
      }
      if (scope === 'customer') {
        const ids = await permCore.customerProjectIds(customer);
        if (!a.project_id || !ids.has(a.project_id)) return res.status(403).json({ error: '无权限查看该记录' });
      }
      const [items] = await pool.query(
        'SELECT * FROM material_acceptance_items WHERE accept_id = ? ORDER BY sort_order ASC, id ASC',
        [a.id]
      );
      res.json({ ...a, items });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/material-acceptances', checkPermission('material_acceptance:write'), async (req, res) => {
    const userId = getUserId(req);
    const b = req.body || {};
    if (!b.project_id) return res.status(400).json({ error: '缺少 project_id' });
    const items = Array.isArray(b.items) ? b.items.filter((x) => x && (x.material_name || x.material_id)) : [];
    if (!items.length) return res.status(400).json({ error: '请至少添加一项验收材料' });
    // 项目可见范围校验（同 acceptance：related 只能对自己关联的项目提交）
    const scope = await permCore.visibleScope(userId, 'project');
    if (scope === 'none') return res.status(403).json({ error: '无项目可见权限' });
    if (scope === 'related') {
      const rel = await permCore.relatedProjectIds(userId);
      if (!rel.has(Number(b.project_id))) return res.status(403).json({ error: '仅可对关联项目提交材料验收' });
    }
    // 项目名兜底：前端没传就按 project_id 反查（快照字段不能指望前端）
    let projectName = b.project_name || '';
    let foremanName = b.foreman_name || '';
    if (!projectName || !foremanName) {
      const [prows] = await pool.query(
        `SELECT p.name, f.name AS foreman_name FROM projects p
         LEFT JOIN employees f ON f.id = p.foreman_id WHERE p.id = ? LIMIT 1`,
        [b.project_id]
      );
      const prow = prows && prows[0];
      if (prow) {
        if (!projectName) projectName = prow.name || '';
        if (!foremanName) foremanName = prow.foreman_name || '';
      }
    }
    const stat = countMaterialAcceptVerdicts(items);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const acceptNo = await genMaterialAcceptNo(conn);
      const [r1] = await conn.query(
        `INSERT INTO material_acceptances
         (accept_no, project_id, project_name, accept_date, stage, foreman_id, foreman_name,
          supplier_id, supplier_name, delivery_no, docs, storage, result, handling,
          item_count, pass_count, fail_count, photos, remark, creator_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          acceptNo, b.project_id, projectName, b.accept_date || '', b.stage || '',
          b.foreman_id || null, foremanName,
          b.supplier_id || null, b.supplier_name || '', b.delivery_no || '',
          JSON.stringify(Array.isArray(b.docs) ? b.docs : []),
          b.storage || '', b.result || '', b.handling || '',
          stat.item_count, stat.pass_count, stat.fail_count,
          JSON.stringify(Array.isArray(b.photos) ? b.photos : []),
          b.remark || '', userId,
        ]
      );
      const acceptId = r1.insertId;
      await insertMaterialAcceptItems(conn, acceptId, items);
      await conn.commit();
      await addLog(userId, '', '新增', '主材验收', acceptId, projectName,
        `主材验收提交：${projectName}（${acceptNo}，${stat.item_count} 项，不合格 ${stat.fail_count} 项）`, req.ip);
      notifyProject('material_acceptance_submit', b.project_id,
        `材料验收：${projectName}`,
        `项目「${projectName}」提报材料进场验收 ${acceptNo}，共 ${stat.item_count} 项，合格 ${stat.pass_count} 项、不合格 ${stat.fail_count} 项，结论：${b.result || '未填'}。`,
        acceptId, 'material_acceptance'
      ).catch(console.error);
      res.json({ code: 0, id: acceptId, accept_no: acceptNo, message: '提交成功' });
    } catch (err) {
      try { await conn.rollback(); } catch (_) {}
      console.error('material-acceptance create error:', err.message);
      res.status(500).json({ error: err.message });
    } finally {
      conn.release();
    }
  });

  app.put('/api/material-acceptances/:id', checkPermission('material_acceptance:write'), async (req, res) => {
    const userId = getUserId(req);
    const b = req.body || {};
    const [existRows] = await pool.query(
      'SELECT id, project_id, project_name, creator_id FROM material_acceptances WHERE id = ? LIMIT 1',
      [req.params.id]
    );
    if (!existRows[0]) return res.status(404).json({ error: '记录不存在' });
    const existing = existRows[0];
    if (existing.creator_id !== userId && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无权修改他人的数据' });
    }
    const items = Array.isArray(b.items) ? b.items.filter((x) => x && (x.material_name || x.material_id)) : null;
    const stat = items ? countMaterialAcceptVerdicts(items) : null;
    const fields = [];
    const params = [];
    const setField = (col, val) => { if (val !== undefined) { fields.push(`${col}=?`); params.push(val); } };
    setField('accept_date', b.accept_date);
    setField('stage', b.stage);
    setField('foreman_id', b.foreman_id);
    setField('foreman_name', b.foreman_name);
    setField('supplier_id', b.supplier_id);
    setField('supplier_name', b.supplier_name);
    setField('delivery_no', b.delivery_no);
    setField('storage', b.storage);
    setField('result', b.result);
    setField('handling', b.handling);
    setField('remark', b.remark);
    if (b.docs !== undefined) { fields.push('docs=?'); params.push(JSON.stringify(Array.isArray(b.docs) ? b.docs : [])); }
    if (b.photos !== undefined) { fields.push('photos=?'); params.push(JSON.stringify(Array.isArray(b.photos) ? b.photos : [])); }
    if (stat) {
      fields.push('item_count=?', 'pass_count=?', 'fail_count=?');
      params.push(stat.item_count, stat.pass_count, stat.fail_count);
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (fields.length) {
        params.push(req.params.id);
        await conn.query(`UPDATE material_acceptances SET ${fields.join(', ')}, updated_at=NOW() WHERE id=?`, params);
      }
      if (items) {
        await conn.query('DELETE FROM material_acceptance_items WHERE accept_id = ?', [req.params.id]);
        await insertMaterialAcceptItems(conn, Number(req.params.id), items);
      }
      await conn.commit();
      await addLog(userId, '', '编辑', '主材验收', req.params.id, existing.project_name,
        `更新主材验收：${existing.project_name}`, req.ip);
      res.json({ code: 0, message: '更新成功' });
    } catch (err) {
      try { await conn.rollback(); } catch (_) {}
      console.error('material-acceptance update error:', err.message);
      res.status(500).json({ error: err.message });
    } finally {
      conn.release();
    }
  });

  app.delete('/api/material-acceptances/:id', checkPermission('material_acceptance:delete'), async (req, res) => {
    try {
      const userId = getUserId(req);
      const [rows] = await pool.query(
        'SELECT project_name, creator_id FROM material_acceptances WHERE id = ? LIMIT 1', [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: '记录不存在' });
      const a = rows[0];
      if (a.creator_id !== userId && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无权删除他人的数据' });
      }
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM material_acceptance_items WHERE accept_id = ?', [req.params.id]);
        await conn.query('DELETE FROM material_acceptances WHERE id = ?', [req.params.id]);
        await conn.commit();
      } catch (e) {
        try { await conn.rollback(); } catch (_) {}
        throw e;
      } finally {
        conn.release();
      }
      await addLog(userId, '', '删除', '主材验收', req.params.id, a.project_name,
        `删除主材验收：${a.project_name}`, req.ip);
      res.json({ message: '删除成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

};
