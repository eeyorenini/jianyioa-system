/**
 * 系统日志 / 调试保存合同（2026-10-29 渐进拆分第 20 轮）
 *
 * 搬运自 server.js 原 1200-1249 行，搬入时 50 行。
 * 第 24 轮追加搬运原 347-362 行（POST /api/debug/add-type-column，16 行），
 * 与 /api/debug/save-contract 同属调试接口，集中在这里。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerSystemLogRoutes(app, deps) {
  const {
    db,
    getUserId,
    isAdmin,
  } = deps;

  // ================================================================
  // 系统日志（记录所有 API 请求）
  // ================================================================
  // v2.5.3 鉴权加固：原本 GET 零校验。`DELETE` 已限成管理员，但**读**一直裸奔 ——
  // system_logs 记录每一条 API 请求（path / method / user_id / IP / 是否成功），
  // 等于把整个系统的接口调用轨迹和活跃时段交出去。
  app.get('/api/system-logs', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '仅管理员可查看系统日志' });
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const { page = 1, limit = 50, path, method, success, user_id, start_date, end_date } = req.query;
    let sql = 'SELECT * FROM system_logs WHERE 1=1';
    const params = [];
    if (path) { sql += ' AND path LIKE ?'; params.push(`%${path}%`); }
    if (method) { sql += ' AND method = ?'; params.push(method); }
    if (success !== undefined && success !== '') { sql += ' AND success = ?'; params.push(parseInt(success)); }
    if (user_id) { sql += ' AND user_id = ?'; params.push(parseInt(user_id)); }
    if (start_date) { sql += ' AND created_at >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND created_at <= ?'; params.push(end_date); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const countSql = 'SELECT COUNT(*) as total FROM system_logs WHERE 1=1' + sql.split('WHERE 1=1')[1].split('ORDER BY')[0];
    const stmt = db.prepare(sql);
    const countStmt = db.prepare(countSql);
    try {
      const logs = await stmt.all(...params);
      const countResult = await countStmt.all(...params.slice(0, -2));
      const total = countResult[0] ? countResult[0].total : 0;
      res.json({ logs, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (e) {
      res.json({ logs: [], total: 0, page: parseInt(page), limit: parseInt(limit) });
    }
  });

  // 清空系统日志
  // v2.5.3 鉴权加固：同上，零校验直接 TRUNCATE，属于可被匿名清空审计记录的漏洞。
  app.delete('/api/system-logs', async (req, res) => {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可清空系统日志' });
    await db.prepare('TRUNCATE TABLE system_logs').run();
    res.json({ success: true, message: '系统日志已清空' });
  });

  // GET /api/debug/save-contract —— v2.5.3 已删除。
  // 它只做三件事：把 req.headers 和 req.body 打进服务端日志、把 body 原样回显。
  // 真正的危害不是回显（回显的是请求者自己的内容），而是 console.log(req.headers) ——
  // 任何人都能往服务端日志里注入任意伪造内容，污染事后审计。且前端零调用方。
  // 排障需要看 content-type 时，用浏览器的 Network 面板即可，不需要服务端 echo。
  //
  // 原实现（保留备查）：
  //   app.get('/api/debug/save-contract', (req, res) => {
  //     console.log('收到请求:', req.method);
  //     console.log('Headers:', req.headers);
  //     console.log('Body:', req.body);
  //     res.json({ received: true, body: req.body, headers: req.headers['content-type'] });
  //   });

  app.post('/api/debug/add-type-column', async (req, res) => {
    try {
      // 2026-10-29 补 admin 校验：这是遗留的**一次性建列调试接口**，公网可调且直接
      // 执行 `ALTER TABLE project_logs ADD COLUMN`。列已存在时只会报错，但把 DDL
      // 暴露在无鉴权的 POST 上本身就不该存在。没删是因为不确定是否还有人依赖它
      // 在别的环境跑（如新部署初始化），退一步先限制成仅管理员。
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '仅管理员可执行' });
      const stmt = db.prepare('ALTER TABLE project_logs ADD COLUMN type VARCHAR(20) DEFAULT "construction" AFTER project_id');
      await stmt.run();
      res.json({ message: 'type 列已添加' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};
