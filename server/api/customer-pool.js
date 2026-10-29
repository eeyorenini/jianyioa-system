/**
 * 公海客户池（v2.5.3 已加登录 + 管理员校验）（2026-10-29 渐进拆分第 22 轮）
 *
 * 搬运自 server.js 原 1227-1273 行，搬入时 47 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerCustomerPoolRoutes(app, deps) {
  const {
    pool,
    db,
    getUserId,
    isAdmin,
  } = deps;

  // 公海客户
  // v2.5.3 鉴权加固：客户池里是姓名+手机号+预算+需求，属于客户资源，未登录不该能整表拉取。
  // （这个 GET 不在「未登录写操作」清单里，但同一张表的读和写一样敏感，一起收口。）
  app.get('/api/customer-pool', async (req, res) => {
    if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
    const stmt = db.prepare('SELECT * FROM customer_pool ORDER BY created_at DESC');
    res.json(await stmt.all());
  });

  // v2.5.3：原实现没有 try/catch —— await 抛错即 unhandled rejection，Node 18+ 直接退进程
  // （全站 502）。同时补登录校验。
  app.post('/api/customer-pool', async (req, res) => {
    try {
      if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
      const { name, phone, source, area, budget, demand, lost_reason, lost_date } = req.body;
      const stmt = db.prepare('INSERT INTO customer_pool (name, phone, source, area, budget, demand, lost_reason, lost_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      const result = await stmt.run(name, phone, source, area, budget, demand, lost_reason, lost_date);
      res.json({ id: result.lastInsertRowid, message: '添加成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // v2.5.3：补 PUT —— 前端 CustomerPool.vue 的「编辑」一直发 PUT /api/customer-pool/:id，
  // 但后端从来没注册过这个路由，命中兜底 → 404；前端又不检查 res.ok，于是弹「保存成功」
  // 而数据没变（静默丢改动）。这里补齐，且只更新表单里有的那 8 个字段。
  app.put('/api/customer-pool/:id', async (req, res) => {
    try {
      if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
      const { name, phone, source, area, budget, demand, lost_reason, lost_date } = req.body;
      await db.prepare(
        'UPDATE customer_pool SET name=?, phone=?, source=?, area=?, budget=?, demand=?, lost_reason=?, lost_date=? WHERE id=?'
      ).run(name, phone, source, area, budget, demand, lost_reason, lost_date, req.params.id);
      res.json({ message: '更新成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/customer-pool/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    await db.prepare('DELETE FROM customer_pool WHERE id = ?').run(req.params.id);
    res.json({ message: '删除成功' });
  });
};
