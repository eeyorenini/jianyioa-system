/**
 * 外部联系人（external_contact）—— 4 个路由
 *
 * 2026-10-29 从 server.js 整体抽出（渐进拆分第 7 轮，88 行 / 4 个路由）。
 * 代码逐行搬迁、逻辑零改动，外部依赖改为参数注入。
 *
 * 管理外部工人 / 供应商 / 设计师等**不参与登录系统**的联系人，
 * 独立表 external_contacts，与 employees 无关（别混）。
 * 原 /api/suppliers/* 已废弃，统一走本模块 ?category=供应商。
 *
 * 权限口径（与其他模块不同，别照抄）：
 *   - 列表 GET 需要 `external_contact:read_all` 或 `external_contact:read`，
 *     两者都**看全部**（本模块不分「关联项目」维度，没有 visibleScope）。
 *   - 写 / 删走 checkPermission('external_contact:write'|':delete')。
 *
 * 路由：
 *   GET    /api/external-contacts       列表（支持 category / search / is_active）
 *   POST   /api/external-contacts       新增
 *   PUT    /api/external-contacts/:id   编辑（只更新传入字段）
 *   DELETE /api/external-contacts/:id   删除（物理删除，先查名字写日志）
 *
 * ⚠️ 已知问题（原样保留，未动）：
 *   1. GET 用 `req.headers['x-user-role']` 判断是否 admin。该头由
 *      server.js:201 中间件按 x-user-id 重算覆盖，不可伪造，但依赖
 *      「中间件先跑」这个隐含前提，不如 isAdmin(userId) 直接。
 *   2. DELETE 是物理删除，没有软删除/回收站，删了写日志可追溯但不便恢复。
 *
 * 依赖 6 个：pool / checkPermission / getUserId / addLog /
 *            hasReadAllPermission / permCore
 */

module.exports = function registerExternalContactRoutes(app, deps) {
  const { pool, checkPermission, getUserId, addLog, hasReadAllPermission, permCore } = deps;

  // ==================== 外部联系人（v2.3.1 新模块 external_contact）====================
  // 独立表 external_contacts：管理外部工人/供应商/设计师等不参与登录系统的联系人。
  // 权限码：external_contact:read / write / delete / read_all（语义同其它模块）。
  app.get('/api/external-contacts', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const userRole = req.headers['x-user-role'] || '';
      const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
      const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'external_contact');
      const { category, search, is_active } = req.query;
      const where = [];
      const params = [];
      if (hasAll) {
        // 看全部
      } else if (await permCore.canAction(userId, 'external_contact', 'read')) {
        // read 权限可看全部（外部联系人不分关联，按模块整体权限）
      } else {
        return res.status(403).json({ error: '无权限查看外部联系人' });
      }
      if (category) { where.push('category = ?'); params.push(category); }
      if (is_active != null && is_active !== '') {
        where.push('is_active = ?'); params.push(Number(is_active) === 0 ? 0 : 1);
      }
      if (search) {
        where.push('(name LIKE ? OR phone LIKE ? OR company LIKE ? OR role LIKE ? OR remark LIKE ?)');
        const s = `%${search}%`;
        params.push(s, s, s, s, s);
      }
      const sql = `SELECT * FROM external_contacts
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY is_active DESC, id DESC`;
      const [rows] = await pool.query(sql, params);
      res.json({ list: rows, total: rows.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/external-contacts', checkPermission('external_contact:write'), async (req, res) => {
    try {
      const userId = getUserId(req);
      const { name, phone, category, company, role, remark } = req.body;
      if (!name) return res.status(400).json({ error: '姓名必填' });
      const [r] = await pool.query(
        `INSERT INTO external_contacts (name, phone, category, company, role, remark, is_active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
        [name, phone || null, category || '工人', company || null, role || null, remark || null, userId]
      );
      await addLog(userId, '', '新增', '外部联系人', r.insertId, name, `分类: ${category || '工人'}，姓名: ${name}`, req.ip);
      res.json({ id: r.insertId, message: '添加成功' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/external-contacts/:id', checkPermission('external_contact:write'), async (req, res) => {
    try {
      const { name, phone, category, company, role, remark, is_active } = req.body;
      if (!name) return res.status(400).json({ error: '姓名必填' });
      const fields = [];
      const params = [];
      for (const key of ['name','phone','category','company','role','remark']) {
        if (req.body[key] !== undefined) {
          fields.push(`${key}=?`);
          params.push(req.body[key] || null);
        }
      }
      if (is_active !== undefined) {
        fields.push('is_active=?');
        params.push(Number(is_active) === 0 ? 0 : 1);
      }
      if (!fields.length) return res.json({ message: '无更新字段' });
      fields.push('updated_at=NOW()');
      params.push(req.params.id);
      await pool.query(`UPDATE external_contacts SET ${fields.join(', ')} WHERE id=?`, params);
      const userId = getUserId(req);
      await addLog(userId, '', '编辑', '外部联系人', parseInt(req.params.id), name || '', `更新外部联系人: ${name || req.params.id}`, req.ip);
      res.json({ message: '更新成功' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/external-contacts/:id', checkPermission('external_contact:delete'), async (req, res) => {
    try {
      const [c] = await pool.query('SELECT name FROM external_contacts WHERE id=?', [req.params.id]);
      const cName = c && c[0] ? c[0].name : req.params.id;
      await pool.query('DELETE FROM external_contacts WHERE id=?', [req.params.id]);
      const userId = getUserId(req);
      await addLog(userId, '', '删除', '外部联系人', parseInt(req.params.id), cName, `删除外部联系人: ${cName}`, req.ip);
      res.json({ message: '删除成功' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
};
