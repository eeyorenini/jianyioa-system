/**
 * 1装ERP扩展（采购/成本/整改/考勤/保修/量房/老板看板/合同变量/AI识别）（2026-10-29 渐进拆分第 14 轮）
 *
 * 搬运自 server.js 原 8271-9006 行，搬入时 736 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerErpExtRoutes(app, deps) {
  const {
    db,
    https,
    getUserId,
    addLog,
    isAdmin,
    notifyProject,
  } = deps;

  // ==================== 供应商管理（已合并到外部联系人 v2.3.1）====================
  // 原 /api/suppliers/* 路由已废弃；统一走 /api/external-contacts?category=供应商。
  // 历史 suppliers 表数据已迁移到 external_contacts（见 migrations/v2_3_1_merge_suppliers.js）。

  // 采购单
  app.get('/api/purchases', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM purchases ORDER BY created_at DESC');
    res.json(await stmt.all());
  });

  app.post('/api/purchases', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { purchase_no, supplier_id, supplier_name, project_id, project_name, total_amount, status, purchase_date, expected_date, operator, remark } = req.body;
    const stmt = db.prepare('INSERT INTO purchases (purchase_no, supplier_id, supplier_name, project_id, project_name, total_amount, status, purchase_date, expected_date, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(purchase_no, supplier_id, supplier_name, project_id, project_name, total_amount || 0, status || '待审核', purchase_date, expected_date, operator, remark);
    await addLog(userId, '', '新增', '采购管理', result.lastInsertRowid, project_name || purchase_no, `采购单号: ${purchase_no}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.put('/api/purchases/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { total_amount, paid_amount, status, remark } = req.body;
    await db.prepare('UPDATE purchases SET total_amount=?, paid_amount=?, status=?, remark=? WHERE id=?')
      .run(total_amount, paid_amount, status, remark, req.params.id);
    await addLog(userId, '', '编辑', '采购管理', req.params.id, '', `更新采购单 ID: ${req.params.id}`, req.ip);
    res.json({ message: '更新成功' });
  });

  app.delete('/api/purchases/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    await db.prepare('DELETE FROM purchases WHERE id = ?').run(req.params.id);
    await addLog(userId, '', '删除', '采购管理', req.params.id, '', `删除采购单 ID: ${req.params.id}`, req.ip);
    res.json({ message: '删除成功' });
  });

  // 成本记录
  app.get('/api/cost-records', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM cost_records ORDER BY created_at DESC');
    res.json(await stmt.all());
  });

  app.get('/api/cost-records/project/:projectId', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM cost_records WHERE project_id = ? ORDER BY date DESC');
    res.json(await stmt.all(req.params.projectId));
  });

  app.post('/api/cost-records', async (req, res) => {
    const userId = getUserId(req);
    const { project_id, project_name, type, category, amount, date, operator, invoice_status, remark } = req.body;
    const stmt = db.prepare('INSERT INTO cost_records (project_id, project_name, type, category, amount, date, operator, invoice_status, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(project_id, project_name, type, category, amount, date, operator, invoice_status || '未开票', remark);
    await addLog(userId, '', '新增', '费用记录', result.lastInsertRowid, project_name, `费用项目: ${project_name}, 金额: ${amount}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.delete('/api/cost-records/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    await db.prepare('DELETE FROM cost_records WHERE id = ?').run(req.params.id);
    await addLog(userId, '', '删除', '费用记录', parseInt(req.params.id), '', `删除费用记录 ID: ${req.params.id}`, req.ip);
    res.json({ message: '删除成功' });
  });

  // 整改问题列表
  app.get('/api/rectification-issues', async (req, res) => {
    const { project_id } = req.query;
    // 2026-10-23：project_name 是提交时快照，历史上存在空串（移动端提交页取不到项目名），
    // 统一用项目表当前名称兜底，避免各端列表/详情显示空白。
    let sql = `SELECT ri.*, COALESCE(NULLIF(ri.project_name, ''), p.name) AS project_name,
      e.name as creator_name
      FROM rectification_issues ri
      LEFT JOIN employees e ON ri.creator_id = e.id
      LEFT JOIN projects p ON p.id = ri.project_id`;
    const params = [];
    if (project_id) {
      sql += ' WHERE ri.project_id = ?';
      params.push(project_id);
    }
    sql += ' ORDER BY ri.created_at DESC';
    const stmt = db.prepare(sql);
    res.json(params.length ? await stmt.all(...params) : await stmt.all());
  });

  // 整改问题详情（移动端巡检详情页调用）
  app.get('/api/rectification-issues/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      // 2026-10-23：同上，project_name 空串时用项目表名称兜底
      const stmt = db.prepare(`SELECT ri.*, COALESCE(NULLIF(ri.project_name, ''), p.name) AS project_name
        FROM rectification_issues ri
        LEFT JOIN projects p ON p.id = ri.project_id
        WHERE ri.id = ?`);
      const row = await stmt.get(req.params.id);
      if (!row) return res.status(404).json({ error: '记录不存在' });
      res.json(row);
    } catch (err) {
      console.error('rectification-issues detail error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  app.post('/api/rectification-issues', async (req, res) => {
    const userId = getUserId(req);
    const { inspection_id, project_id, project_name, issue_desc, priority, status, responsible_id, responsible_name, due_date, images, remark, title, category, location, level, description } = req.body;
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    // 2026-10-23 修复：移动端巡检提交页只带了 project_id，project_name 取不到就是空串，
    // 导致整改表落库后项目名为空 → 待办中心/巡检列表副标题显示空白。
    // 服务端按 project_id 反查项目名兜底，不依赖客户端是否传对。
    let finalProjectName = project_name || '';
    if (!finalProjectName && project_id) {
      try {
        const p = await db.prepare('SELECT name FROM projects WHERE id = ?').get(project_id);
        if (p && p.name) finalProjectName = p.name;
      } catch (_) { /* 项目查不到就保持空，不影响主流程 */ }
    }
    // 2026-10-23 业务流程：监理提交 → 待处理 → 工长受理 → 处理中 → 结案 → 已完成。
    // 提交页不选负责人时，按项目关联的工长（projects.foreman_id）自动指派，
    // 这样待办中心能精确推给工长本人，而不是丢给全体项目关联人。
    let finalResponsibleId = responsible_id || null;
    let finalResponsibleName = responsible_name || '';
    if (!finalResponsibleId && project_id) {
      try {
        const p = await db.prepare('SELECT foreman_id FROM projects WHERE id = ?').get(project_id);
        if (p && p.foreman_id) {
          finalResponsibleId = p.foreman_id;
          const f = await db.prepare('SELECT name FROM employees WHERE id = ?').get(p.foreman_id);
          finalResponsibleName = (f && f.name) || '';
        }
      } catch (_) { /* 查不到工长就保持为空，通知走项目关联人兜底 */ }
    }
    // 关键修复：兼容客户端两种提交方式——
    //   老客户端：images 已是 JSON 字符串（["url1","url2"]），服务端不应再 stringify 一次
    //   新客户端：images 是数组
    // 服务端规范化：无论收到什么，最终存进 DB 的是 JSON 字符串
    let normalizedImages = '[]';
    try {
      let parsed = typeof images === 'string' ? JSON.parse(images) : images;
      if (!Array.isArray(parsed)) parsed = [];
      normalizedImages = JSON.stringify(parsed);
    } catch (_) {
      // 解析失败时当作空数组
      normalizedImages = '[]';
    }
    const stmt = db.prepare(`INSERT INTO rectification_issues
      (inspection_id, project_id, project_name, issue_desc, priority, status, responsible_id, responsible_name, due_date, images, remark, title, category, location, level, description, creator_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const result = await stmt.run(
      inspection_id, project_id, finalProjectName,
      issue_desc || title || '', priority || '普通', status || '待处理',
      finalResponsibleId, finalResponsibleName, due_date,
      normalizedImages, remark || description || '',
      title || issue_desc || '', category || '', location || '', level || '', description || '', userId, nowStr
    );
    await addLog(userId, '', '新增', '整改问题', result.lastInsertRowid, finalProjectName, `整改问题: ${(title || issue_desc || '').slice(0, 30)}`, req.ip);

    // 发送站内通知：有工长时精确通知「工长 + 提交人」；没派到工长才退回全体项目关联人
    const notifyTargets = [finalResponsibleId, userId].filter(Boolean);
    if (notifyTargets.length) {
      await notifyProject('inspection_submit', project_id,
        `【新巡检问题】${finalProjectName || '项目'}`,
        `问题：${(issue_desc || title || '').slice(0, 100)}${finalResponsibleName ? `（负责人：${finalResponsibleName}）` : ''}`,
        result.lastInsertRowid, 'rectification_issue',
        undefined, { mode: 'participants', userIds: notifyTargets }
      );
    } else {
      await notifyProject('inspection_submit', project_id,
        `【新巡检问题】${finalProjectName || '项目'}`,
        `问题：${(issue_desc || title || '').slice(0, 100)}`,
        result.lastInsertRowid, 'rectification_issue'
      );
    }

    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.put('/api/rectification-issues/:id', async (req, res) => {
    // 2026-10-23 修复：原代码直接引用未声明的 userId，一旦有人更新整改状态就抛
    // ReferenceError 并把整个 Node 进程带崩（Express 4 + Node 22 未捕获 rejection 直接退出）
    const userId = getUserId(req);
    const { status, finish_date, remark, action, new_due_date, delay_reason } = req.body;
    const issueId = parseInt(req.params.id);
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 取当前记录（动作需要做状态机校验 + 通知要用项目/负责人信息）
    const cur = await db.prepare('SELECT * FROM rectification_issues WHERE id = ?').get(issueId);
    if (!cur) return res.status(404).json({ error: '记录不存在' });

    // 操作人姓名（通知/日志用）
    let operatorName = '';
    try {
      const op = await db.prepare('SELECT name FROM employees WHERE id = ?').get(userId);
      operatorName = (op && op.name) || '';
    } catch (_) {}

    const notifyRectify = async (title, content) => {
      // 通知对象：负责人（工长）+ 提交人（监理），去重去空；都没有才退回项目关联人
      const targets = [cur.responsible_id, cur.creator_id, userId].filter(Boolean);
      const uniq = [...new Set(targets)];
      if (uniq.length) {
        await notifyProject('inspection_submit', cur.project_id, title, content,
          issueId, 'rectification_issue', undefined, { mode: 'participants', userIds: uniq });
      } else {
        await notifyProject('inspection_submit', cur.project_id, title, content,
          issueId, 'rectification_issue');
      }
    };

    // ===== 动作分支（业务流程）=====
    if (action === 'accept') {
      // 受理：待处理 → 处理中。可同时修改整改截止时间（工长评估后调整）。
      if (String(cur.status) !== '待处理') {
        return res.status(400).json({ error: `当前状态是「${cur.status}」，不能重复受理` });
      }
      const finalDue = new_due_date || cur.due_date;
      await db.prepare(`UPDATE rectification_issues
        SET status='处理中', accept_date=?, accept_by=?, accept_name=?, due_date=?, remark=? WHERE id=?`)
        .run(nowStr, userId, operatorName, finalDue || null,
          remark || cur.remark, issueId);
      await addLog(userId, '', '受理', '整改问题', issueId, cur.project_name || '',
        `受理整改${new_due_date && new_due_date !== cur.due_date ? `，整改时间调整为 ${new_due_date}` : ''}`, req.ip);
      await notifyRectify(`【整改已受理】${cur.project_name || ''}`,
        `${(cur.title || cur.issue_desc || '').slice(0, 40)} 已由 ${operatorName || '工长'} 受理${new_due_date && new_due_date !== cur.due_date ? `，整改时间调整为 ${new_due_date}` : ''}`);
      return res.json({ message: '已受理', status: '处理中', due_date: finalDue || null, accept_name: operatorName, accept_date: nowStr });
    }

    if (action === 'delay') {
      // 延期：处理中 → 处理中（改 due_date + 记延期历史）。原因必填。
      if (String(cur.status) !== '处理中') {
        return res.status(400).json({ error: `当前状态是「${cur.status}」，只有处理中才能申请延期` });
      }
      if (!new_due_date) return res.status(400).json({ error: '请选择延期后的截止时间' });
      if (!String(delay_reason || '').trim()) return res.status(400).json({ error: '请填写延期原因' });
      let log = [];
      try { log = cur.delay_log ? JSON.parse(cur.delay_log) : []; } catch (_) { log = []; }
      if (!Array.isArray(log)) log = [];
      log.push({
        from: cur.due_date || null,
        to: new_due_date,
        reason: String(delay_reason).trim(),
        by: operatorName || String(userId),
        at: nowStr
      });
      await db.prepare('UPDATE rectification_issues SET due_date=?, delay_log=? WHERE id=?')
        .run(new_due_date, JSON.stringify(log), issueId);
      await addLog(userId, '', '延期', '整改问题', issueId, cur.project_name || '',
        `整改时间 ${cur.due_date || '未设置'} → ${new_due_date}，原因：${String(delay_reason).slice(0, 50)}`, req.ip);
      await notifyRectify(`【整改延期】${cur.project_name || ''}`,
        `${(cur.title || cur.issue_desc || '').slice(0, 40)} 延期至 ${new_due_date}，原因：${String(delay_reason).slice(0, 60)}`);
      return res.json({ message: '已延期', due_date: new_due_date, delay_log: log });
    }

    if (action === 'complete') {
      // 结案：处理中（或历史遗留的待处理）→ 已完成。已完成是终态。
      const st = String(cur.status);
      if (st === '已完成') {
        return res.status(400).json({ error: '该问题已结案，不能重复提交' });
      }
      if (st !== '处理中' && st !== '待处理') {
        return res.status(400).json({ error: `当前状态是「${st}」，不能结案` });
      }
      await db.prepare('UPDATE rectification_issues SET status=?, finish_date=?, remark=? WHERE id=?')
        .run('已完成', finish_date || nowStr, remark || '已整改完成', issueId);
      await addLog(userId, '', '结案', '整改问题', issueId, cur.project_name || '',
        `整改完成结案${cur.due_date ? `（原定 ${cur.due_date}）` : ''}`, req.ip);
      await notifyRectify(`【整改已完成】${cur.project_name || ''}`,
        `${(cur.title || cur.issue_desc || '').slice(0, 40)} 已由 ${operatorName || '负责人'} 完成并结案`);
      return res.json({ message: '已结案', status: '已完成', finish_date: finish_date || nowStr });
    }

    // ===== 兼容旧调用：直接传 status（老客户端/内部工具）=====
    if (!status) return res.status(400).json({ error: '缺少 status' });
    await db.prepare('UPDATE rectification_issues SET status=?, finish_date=?, remark=? WHERE id=?')
      .run(status, finish_date || null, remark || null, req.params.id);
    await addLog(userId, '', '编辑', '整改问题', issueId, '', `更新整改状态: ${status}`, req.ip);
    res.json({ message: '更新成功' });
  });

  app.delete('/api/rectification-issues/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    await db.prepare('DELETE FROM rectification_issues WHERE id = ?').run(req.params.id);
    await addLog(userId, '', '删除', '整改问题', parseInt(req.params.id), '', `删除整改问题 ID: ${req.params.id}`, req.ip);
    res.json({ message: '删除成功' });
  });

  // 考勤管理
  app.get('/api/attendance', async (req, res) => {
    const { employee_id, date } = req.query;
    let sql = 'SELECT * FROM attendance WHERE 1=1';
    const params = [];
    if (employee_id) { sql += ' AND employee_id = ?'; params.push(employee_id); }
    if (date) { sql += ' AND date = ?'; params.push(date); }
    sql += ' ORDER BY date DESC, check_in_time DESC';
    const stmt = db.prepare(sql);
    res.json(await stmt.all(...params));
  });

  app.post('/api/attendance', async (req, res) => {
    const userId = getUserId(req);
    const { employee_id, employee_name, date, check_in_time, check_out_time, work_hours, status, type, remark } = req.body;
    const stmt = db.prepare('INSERT INTO attendance (employee_id, employee_name, date, check_in_time, check_out_time, work_hours, status, type, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(employee_id, employee_name, date, check_in_time, check_out_time, work_hours || 0, status || '正常', type || '上班', remark);
    await addLog(userId, '', '新增', '考勤记录', result.lastInsertRowid, employee_name, `考勤: ${employee_name}, 日期: ${date}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.delete('/api/attendance/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    await db.prepare('DELETE FROM attendance WHERE id = ?').run(req.params.id);
    await addLog(userId, '', '删除', '考勤记录', parseInt(req.params.id), '', `删除考勤记录 ID: ${req.params.id}`, req.ip);
    res.json({ message: '删除成功' });
  });

  // 售后维保
  app.get('/api/warranties', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM warranties ORDER BY created_at DESC');
    res.json(await stmt.all());
  });

  app.post('/api/warranties', async (req, res) => {
    const userId = getUserId(req);
    const { project_id, project_name, customer_name, customer_phone, type, description, images, status, handle_user, handle_date, result, satisfaction, cost } = req.body;
    const stmt = db.prepare('INSERT INTO warranties (project_id, project_name, customer_name, customer_phone, type, description, images, status, handle_user, handle_date, result, satisfaction, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result2 = await stmt.run(project_id, project_name, customer_name, customer_phone, type, description, JSON.stringify(images || []), status || '待处理', handle_user, handle_date, result, satisfaction, cost || 0);
    await addLog(userId, '', '新增', '售后维保', result2.lastInsertRowid, project_name, `维保项目: ${project_name}, 类型: ${type}`, req.ip);
    res.json({ id: result2.lastInsertRowid, message: '添加成功' });
  });

  app.put('/api/warranties/:id', async (req, res) => {
    const userId = getUserId(req);
    const { status, handle_date, result, satisfaction, cost, remark } = req.body;
    await db.prepare('UPDATE warranties SET status=?, handle_date=?, result=?, satisfaction=?, cost=?, remark=? WHERE id=?')
      .run(status, handle_date, result, satisfaction, cost, remark, req.params.id);
    await addLog(userId, '', '编辑', '售后维保', parseInt(req.params.id), '', `更新维保状态: ${status}`, req.ip);
    res.json({ message: '更新成功' });
  });

  app.delete('/api/warranties/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    await db.prepare('DELETE FROM warranties WHERE id = ?').run(req.params.id);
    await addLog(userId, '', '删除', '售后维保', parseInt(req.params.id), '', `删除维保记录 ID: ${req.params.id}`, req.ip);
    res.json({ message: '删除成功' });
  });

  // 设计量房
  app.get('/api/design-measurements', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM design_measurements ORDER BY created_at DESC');
    res.json(await stmt.all());
  });

  app.post('/api/design-measurements', async (req, res) => {
    const userId = getUserId(req);
    const { customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status, drawings, remark } = req.body;
    const stmt = db.prepare('INSERT INTO design_measurements (customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status, drawings, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status || '待测量', drawings, remark);
    await addLog(userId, '', '新增', '设计量房', result.lastInsertRowid, customer_name, `量房客户: ${customer_name}, 楼盘: ${building_name}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.put('/api/design-measurements/:id', async (req, res) => {
    const userId = getUserId(req);
    const { status, drawings, remark } = req.body;
    await db.prepare('UPDATE design_measurements SET status=?, drawings=?, remark=? WHERE id=?')
      .run(status, drawings, remark, req.params.id);
    await addLog(userId, '', '编辑', '设计量房', parseInt(req.params.id), '', `更新量房状态: ${status}`, req.ip);
    res.json({ message: '更新成功' });
  });

  app.delete('/api/design-measurements/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    await db.prepare('DELETE FROM design_measurements WHERE id = ?').run(req.params.id);
    await addLog(userId, '', '删除', '设计量房', parseInt(req.params.id), '', `删除量房记录 ID: ${req.params.id}`, req.ip);
    res.json({ message: '删除成功' });
  });

  // Boss看板数据
  app.get('/api/boss-dashboard', async (req, res) => {
    // 汇总统计数据
    const today = new Date().toISOString().split('T')[0];
  
    const customerStats = {
      total: (await db.prepare('SELECT COUNT(*) as count FROM customers').get()).count,
      today: (await db.prepare("SELECT COUNT(*) as count FROM customers WHERE DATE(created_at) = ?").get(today))?.count || 0,
      thisMonth: (await db.prepare("SELECT COUNT(*) as count FROM customers WHERE DATE_FORMAT(created_at, '%Y-%m') = ?").get(today.substring(0, 7)))?.count || 0
    };
  
    const contractStats = {
      total: (await db.prepare('SELECT COUNT(*) as count FROM contracts').get()).count,
      signed: (await db.prepare("SELECT COUNT(*) as count FROM contracts WHERE status = '已签订'").get()).count,
      totalAmount: (await db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM contracts WHERE status = '已签订'").get()).total
    };
  
    const projectStats = {
      total: (await db.prepare('SELECT COUNT(*) as count FROM projects').get()).count,
      active: (await db.prepare("SELECT COUNT(*) as count FROM projects WHERE status NOT IN ('已完工', '已终止')").get()).count,
      finished: (await db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = '已完工'").get()).count
    };
  
    const financeStats = {
      income: (await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'income'").get()).total,
      expense: (await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'expense'").get()).total,
      thisMonthIncome: (await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'income' AND DATE_FORMAT(date, '%Y-%m') = ?").get(today.substring(0, 7)))?.total || 0,
      thisMonthExpense: (await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'expense' AND DATE_FORMAT(date, '%Y-%m') = ?").get(today.substring(0, 7)))?.total || 0
    };
  
    const warehouseStats = {
      totalMaterials: (await db.prepare('SELECT COUNT(*) as count FROM materials').get()).count,
      lowStock: (await db.prepare('SELECT COUNT(*) as count FROM materials WHERE quantity <= min_stock').get()).count,
      totalValue: (await db.prepare('SELECT COALESCE(SUM(quantity * cost_price), 0) as total FROM materials').get()).total
    };
  
    const employeeStats = {
      total: (await db.prepare("SELECT COUNT(*) as count FROM employees WHERE status = '在职'").get()).count
    };
  
    res.json({
      customer: customerStats,
      contract: contractStats,
      project: projectStats,
      finance: financeStats,
      warehouse: warehouseStats,
      employee: employeeStats
    });
  });

  // 项目利润统计
  // ⚠️ 必须 async + await：db.prepare().all() 返回的是 Promise，
  // 原写法 res.json(Promise) 会被序列化成 {}，接口 200 但没数据（静默失败）
  app.get('/api/project-profit', async (req, res) => {
    try {
      const projects = await db.prepare(`
        SELECT p.id, p.name, p.budget, p.cost, p.status,
               (p.budget - p.cost) as profit,
               CASE WHEN p.budget > 0 THEN ((p.budget - p.cost) / p.budget * 100) ELSE 0 END as profit_rate
        FROM projects p
        WHERE p.budget > 0
        ORDER BY profit_rate DESC
      `).all();
      res.json(projects);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 每月收入趋势
  app.get('/api/monthly-trend', async (req, res) => {
    try {
      const months = await db.prepare(`
        SELECT DATE_FORMAT(date, '%Y-%m') as month,
               SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
               SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
        FROM finance
        WHERE date IS NOT NULL
        GROUP BY DATE_FORMAT(date, '%Y-%m')
        ORDER BY month DESC
        LIMIT 12
      `).all();
      res.json(months.reverse());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 合同变量管理 API
  app.get('/api/contract-variables', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM contract_variables ORDER BY id');
    res.json(await stmt.all());
  });

  app.post('/api/contract-variables', async (req, res) => {
    const userId = getUserId(req);
    const { name, label, description } = req.body;
    if (!name || !label) {
      return res.json({ success: false, message: '变量名和显示名必填' });
    }
    const stmt = db.prepare('INSERT INTO contract_variables (name, label, description) VALUES (?, ?, ?)');
    const result = await stmt.run(name, label, description || '');
    await addLog(userId, '', '新增', '合同变量', result.lastInsertRowid, label, `变量: ${label}`, req.ip);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  app.delete('/api/contract-variables/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [variable] = await db.prepare('SELECT var_name FROM contract_variables WHERE id = ?').all(req.params.id);
    const stmt = db.prepare('DELETE FROM contract_variables WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '合同变量', parseInt(req.params.id), variable?.var_name || '', `删除变量: ${variable?.var_name || req.params.id}`, req.ip);
    res.json({ success: true, message: '删除成功' });
  });

  // 创建变量表（如果不存在）
  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_variables (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      label VARCHAR(255) NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT '2024-01-01 00:00:00'
    )
  `);

  // 检查并添加默认变量
  const defaultVars = [
    { name: 'customer_name', label: '客户姓名' },
    { name: 'phone', label: '联系电话' },
    { name: 'address', label: '施工地址' },
    { name: 'project_name', label: '项目名称' },
    { name: 'amount', label: '合同金额' },
    { name: 'start_date', label: '开工日期' },
    { name: 'end_date', label: '完工日期' },
    { name: 'company_name', label: '公司名称' },
    { name: 'company_address', label: '公司地址' },
    { name: 'contact_person', label: '联系人' },
  ];

  // 初始化合同变量默认数据（异步执行）
  (async () => {
    const existingVars = await db.prepare('SELECT name FROM contract_variables').all();
    const existingNames = existingVars.map(v => v.name);
    for (const v of defaultVars) {
      if (!existingNames.includes(v.name)) {
        await db.prepare('INSERT INTO contract_variables (name, label) VALUES (?, ?)').run(v.name, v.label);
      }
    }
  })();

  // AI识别合同变量API
  app.post('/api/ai/recognize-variables', async (req, res) => {
    try {
      // v2.5.3 鉴权加固：每次调用都消耗 MiniMax 额度，匿名开放等于送人一个免费 API 代理。
      if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
      const { content, type } = req.body;
    
      if (!content) {
        return res.json({ error: '内容不能为空' });
      }
    
      // 调用MiniMax API识别变量
      const apiKey = process.env.MINIMAX_API_KEY;
      const groupId = process.env.MINIMAX_GROUP_ID;
    
      if (!apiKey || !groupId) {
        console.log('MiniMax API密钥未配置，使用规则匹配');
        const variables = extractVariablesByRules(req.body.content || '');
        return res.json({ variables });
      }
    
      const prompt = `请分析以下合同文档内容，识别出所有需要用户填写的字段。

  识别规则：
  1. 冒号后面需要填写的内容（如：甲方名称：____、地址：____）
  2. 带下划线的内容（如：_______下划线部分）
  3. 带方框□需要勾选的内容
  4. 常见的合同填写项

  请提取所有可识别的字段，返回JSON数组格式。每个元素包含：
  - name：变量名（英文驼峰式，如 jiaFangName）
  - label：显示名称（中文，如 甲方名称）

  只返回JSON数组，不要任何解释文字。

  合同内容：
  ${content.substring(0, 4000)}

  返回格式：
  [{"name":"jiaFangName","label":"甲方名称"},{"name":"yiFangName","label":"乙方名称"},{"name":"jiaFangPhone","label":"甲方电话"},{"name":"projectAddress","label":"工程地址"},{"name":"contractAmount","label":"合同金额"},...]`;
    
      const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'MiniMax-Text-01',
          messages: [
            { role: 'system', content: '你是一个专业的合同变量识别助手。请分析合同内容，提取需要用户填写的字段。只返回JSON数组格式，不要其他解释文字。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1
        })
      });
    
      const data = await response.json();
    
      if (data.choices && data.choices[0] && data.choices[0].messages) {
        const msg = data.choices[0].messages.find(m => m.role === 'assistant');
        if (msg && msg.text) {
          let resultText = msg.text.trim();
          try {
            resultText = resultText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
            const variables = JSON.parse(resultText);
            return res.json({ variables });
          } catch (e) {
            console.log('JSON解析失败，使用规则匹配');
          }
        }
      }
    
      // 出错或解析失败时使用规则匹配
      const variables = extractVariablesByRules(req.body.content || '');
      res.json({ variables });
    } catch (error) {
      console.error('AI识别变量错误:', error);
      // 出错时使用规则匹配
      const variables = extractVariablesByRules(req.body.content || '');
      res.json({ variables });
    }
  });

  // 规则匹配提取变量（扩展版）
  function extractVariablesByRules(content) {
    const variables = [];
    const seen = new Set();
  
    const addVar = (name, label) => {
      if (!seen.has(name)) {
        seen.add(name);
        variables.push({ name, label });
      }
    };
  
    // 1. 甲方相关
    if (/甲方/.test(content)) {
      const patterns1 = [
        { name: 'jiaFangName', label: '甲方名称', regex: /甲方[（(]?[^）)]*?[）)]?[：:]?\s*[\u4e00-\u9fa5]{2,30}/ },
        { name: 'jiaFangContact', label: '甲方联系人', regex: /甲方[\u4e00-\u9fa5]*联系人[：:]?\s*[\u4e00-\u9fa5]{2,10}/ },
        { name: 'jiaFangPhone', label: '甲方电话', regex: /甲方[\u4e00-\u9fa5]*电话[：:]?\s*[0-9\-]{7,20}/ },
        { name: 'jiaFangMobile', label: '甲方手机', regex: /甲方[\u4e00-\u9fa5]*手机[：:]?\s*[0-9]{11}/ },
        { name: 'jiaFangAddress', label: '甲方地址', regex: /甲方[\u4e00-\u9fa5]*地址[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{5,50}/ },
        { name: 'jiaFangIdCard', label: '甲方身份证号', regex: /甲方[\u4e00-\u9fa5]*身份证[：:]?\s*[0-9Xx]{15,18}/ },
      ];
      patterns1.forEach(p => { if (p.regex.test(content)) addVar(p.name, p.label); });
    }
  
    // 2. 乙方相关
    if (/乙方/.test(content)) {
      const patterns2 = [
        { name: 'yiFangName', label: '乙方名称', regex: /乙方[（(]?[^）)]*?[）)]?[：:]?\s*[\u4e00-\u9fa5]{2,30}/ },
        { name: 'yiFangContact', label: '乙方联系人', regex: /乙方[\u4e00-\u9fa5]*联系人[：:]?\s*[\u4e00-\u9fa5]{2,10}/ },
        { name: 'yiFangPhone', label: '乙方电话', regex: /乙方[\u4e00-\u9fa5]*电话[：:]?\s*[0-9\-]{7,20}/ },
        { name: 'yiFangMobile', label: '乙方手机', regex: /乙方[\u4e00-\u9fa5]*手机[：:]?\s*[0-9]{11}/ },
        { name: 'yiFangAddress', label: '乙方地址', regex: /乙方[\u4e00-\u9fa5]*地址[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{5,50}/ },
        { name: 'yiFangIdCard', label: '乙方身份证号', regex: /乙方[\u4e00-\u9fa5]*身份证[：:]?\s*[0-9Xx]{15,18}/ },
        { name: 'yiFangBank', label: '乙方开户行', regex: /乙方[\u4e00-\u9fa5]*开户行[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{5,30}/ },
        { name: 'yiFangAccount', label: '乙方银行账号', regex: /乙方[\u4e00-\u9fa5]*账号[：:]?\s*[0-9]{10,25}/ },
        { name: 'yiFangLicense', label: '乙方营业执照', regex: /乙方[\u4e00-\u9fa5]*营业执照[号：:]?\s*[0-9]{15,20}/ },
      ];
      patterns2.forEach(p => { if (p.regex.test(content)) addVar(p.name, p.label); });
    }
  
    // 3. 工程/项目相关
    const patterns3 = [
      { name: 'projectName', label: '项目名称', regex: /项目名称[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{2,50}/ },
      { name: 'projectAddress', label: '工程地址', regex: /(?:工程|施工|项目)[\u4e00-\u9fa5]*地址[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{5,80}/ },
      { name: 'projectArea', label: '装修面积', regex: /(?:面积|建筑面积|装饰面积)[：:]?\s*[0-9.]{1,10}[平平方米]/ },
      { name: 'projectType', label: '工程类型', regex: /(?:户型|工程类型|装修类型)[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{2,20}/ },
      { name: 'engineeringAddress', label: '施工地址', regex: /施工地址[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{5,80}/ },
    ];
    patterns3.forEach(p => { if (p.regex.test(content)) addVar(p.name, p.label); });
  
    // 4. 日期相关
    const patterns4 = [
      { name: 'signDate', label: '签订日期', regex: /签订日期[：:]?\s*[0-9年\-月日]{8,20}/ },
      { name: 'startDate', label: '开工日期', regex: /开工日期[：:]?\s*[0-9年\-月日]{8,20}/ },
      { name: 'endDate', label: '竣工日期', regex: /竣工(?:日期|时间)?[：:]?\s*[0-9年\-月日]{8,20}/ },
      { name: 'signDate', label: '签署日期', regex: /签署日期[：:]?\s*[0-9年\-月日]{8,20}/ },
    ];
    patterns4.forEach(p => { if (p.regex.test(content)) addVar(p.name, p.label); });
  
    // 5. 金额相关
    const patterns5 = [
      { name: 'contractAmount', label: '合同金额', regex: /合同(?:总价|金额|总款)[：:]?\s*[0-9.,]+[元]?/ },
      { name: 'totalAmount', label: '总金额', regex: /总金额[：:]?\s*[0-9.,]+[元]?/ },
      { name: 'designFee', label: '设计费', regex: /设计费[：:]?\s*[0-9.,]+[元]?/ },
      { name: 'engineeringFee', label: '工程款', regex: /工程款[：:]?\s*[0-9.,]+[元]?/ },
      { name: 'depositAmount', label: '定金金额', regex: /定金[：:]?\s*[0-9.,]+[元]?/ },
      { name: 'premiumAmount', label: '预付款', regex: /预付款[：:]?\s*[0-9.,]+[元]?/ },
    ];
    patterns5.forEach(p => { if (p.regex.test(content)) addVar(p.name, p.label); });
  
    // 6. 通用字段
    const patterns6 = [
      { name: 'customerName', label: '客户姓名', regex: /(?:客户|业主|发包方)[\u4e00-\u9fa5]*姓名[：:]?\s*[\u4e00-\u9fa5]{2,10}/ },
      { name: 'customerPhone', regex: /客户[\u4e00-\u9fa5]*电话[：:]?\s*[0-9\-]{7,20}/ },
      { name: 'customerAddress', label: '客户地址', regex: /客户[\u4e00-\u9fa5]*地址[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{5,80}/ },
      { name: 'agentName', label: '委托代理人', regex: /委托代理人[：:]?\s*[\u4e00-\u9fa5]{2,10}/ },
      { name: 'idCard', label: '身份证号', regex: /身份证[号：:]?\s*[0-9Xx]{15,18}/ },
      { name: 'bankName', label: '开户银行', regex: /开户银行[：:]?\s*[\u4e00-\u9fa5]{4,20}/ },
      { name: 'bankAccount', label: '银行账号', regex: /银行账号?[：:]?\s*[0-9]{10,25}/ },
      { name: 'remark', label: '备注', regex: /备注[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{2,100}/ },
    ];
    patterns6.forEach(p => { if (p.regex.test(content)) addVar(p.name, p.label); });
  
    // 7. 从下划线模式提取（_____ 这种）
    const underlinePattern = /[\u4e00-\u9fa5]{2,10}[：:][\s　]*[_－—\-]{3,}/g;
    const matches = content.match(underlinePattern);
    if (matches) {
      matches.forEach((m, idx) => {
        const label = m.replace(/[：:][\s　]*[_－—\-]+/, '').trim();
        if (label && label.length >= 2 && label.length <= 10) {
          const name = 'field' + (idx + 1);
          if (!seen.has(name)) {
            addVar(name, label);
          }
        }
      });
    }
  
    return variables;
  }

};
