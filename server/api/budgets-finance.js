/**
 * 预算 / 财务记录（2026-10-29 渐进拆分第 20 轮）
 *
 * 搬运自 server.js 原 1251-1349 行，搬入时 99 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerBudgetFinanceRoutes(app, deps) {
  const {
    db,
    getUserId,
    checkPermission,
    addLog,
    isAdmin,
    hasReadAllPermission,
  } = deps;

  app.get('/api/budgets', async (req, res) => {
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
    const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'budget');
    if (hasAll) {
      const stmt = db.prepare('SELECT * FROM budgets ORDER BY created_at DESC');
      return res.json(await stmt.all());
    }
    const stmt = db.prepare('SELECT * FROM budgets WHERE creator_id = ? ORDER BY created_at DESC');
    res.json(await stmt.all(userId));
  });

  app.post('/api/budgets', checkPermission('budget:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { customer_id, project_name, house_area, style, total_amount, profit_rate, status, items } = req.body;
    const stmt = db.prepare('INSERT INTO budgets (customer_id, project_name, house_area, style, total_amount, profit_rate, status, items, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(customer_id, project_name, house_area, style, total_amount, profit_rate, status || '草稿', JSON.stringify(items), userId);
    await addLog(userId, '', '新增', '预算管理', result.lastInsertRowid, project_name, `项目名称: ${project_name}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.delete('/api/budgets/:id', checkPermission('budget:delete'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const [b] = await db.prepare('SELECT category, creator_id FROM budgets WHERE id = ?').all(req.params.id);
    if (!b) return res.status(404).json({ error: '记录不存在' });
    if (b.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
    const bCat = b.category;
    const stmt = db.prepare('DELETE FROM budgets WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '预算管理', req.params.id, bCat, `删除预算: ${bCat}`, req.ip);
    res.json({ message: '删除成功' });
  });

  app.get('/api/finance', async (req, res) => {
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
    const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'finance');
    if (hasAll) {
      const stmt = db.prepare('SELECT * FROM finance ORDER BY created_at DESC');
      return res.json(await stmt.all());
    }
    const stmt = db.prepare('SELECT * FROM finance WHERE creator_id = ? ORDER BY created_at DESC');
    res.json(await stmt.all(userId));
  });

  app.post('/api/finance', checkPermission('finance:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { type, amount, category, description, date, project_id } = req.body;
    const stmt = db.prepare('INSERT INTO finance (type, amount, category, description, date, project_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(type, amount, category, description, date, project_id, userId);
    await addLog(userId, '', '新增', '财务管理', result.lastInsertRowid, category || type, `财务类型: ${type}, 金额: ${amount}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  // POST /api/finance/add —— 移动端「收支记录」新增（pages/finance/add.vue）
  // 移动端表单字段为 { type, amount, category, payee, remark, date, project_id }，
  // 且以 res.data.code === 0 判定成功；这里做字段映射并统一返回 code:0。
  app.post('/api/finance/add', checkPermission('finance:write'), async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ code: 1, error: '未登录' });
      const { type, amount, category, date, project_id } = req.body;
      const description = req.body.description || req.body.remark || req.body.payee || '';
      if (!type) return res.status(400).json({ code: 1, error: '缺少收支类型' });
      if (amount === undefined || amount === null || amount === '') return res.status(400).json({ code: 1, error: '缺少金额' });

      const result = await db.prepare(
        'INSERT INTO finance (type, amount, category, description, date, project_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(type, amount, category || '', description, date || null, project_id || null, userId);
      await addLog(userId, '', '新增', '财务管理', result.lastInsertRowid, category || type, `财务类型: ${type}, 金额: ${amount}`, req.ip);
      res.json({ code: 0, id: result.lastInsertRowid, message: '添加成功' });
    } catch (err) {
      console.error('finance/add error:', err);
      res.status(500).json({ code: 1, error: err.message });
    }
  });

  app.delete('/api/finance/:id', checkPermission('finance:delete'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const [f] = await db.prepare('SELECT category, creator_id FROM finance WHERE id = ?').all(req.params.id);
    if (!f) return res.status(404).json({ error: '记录不存在' });
    if (f.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
    const fCat = f.category;
    const stmt = db.prepare('DELETE FROM finance WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '财务管理', req.params.id, fCat, `删除财务记录: ${fCat}`, req.ip);
    res.json({ message: '删除成功' });
  });

};
