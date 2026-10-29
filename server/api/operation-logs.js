/**
 * 操作日志（查看 / 管理员清空）（2026-10-29 渐进拆分第 22 轮）
 *
 * 搬运自 server.js 原 1033-1075 行，搬入时 43 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerOperationLogRoutes(app, deps) {
  const {
    pool,
    getUserId,
    isAdmin,
  } = deps;

  // v2.5.3 鉴权加固：原本 GET 零校验。`DELETE` 早就限成管理员了，但**读**一直裸奔 ——
  // 审计日志恰恰是最不该公开的：谁在什么时候改了哪个项目/客户/金额，全在里面。
  // 前端零调用方，仅保留给管理员排障。
  app.get('/api/operation-logs', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '仅管理员可查看操作日志' });
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const { page, limit, module, action } = req.query;
    const p = parseInt(page) || 1;
    const l = parseInt(limit) || 50;
    const offset = (p - 1) * l;
    let countSql = 'SELECT COUNT(*) as total FROM operation_logs';
    let sql = 'SELECT * FROM operation_logs';
    const params = [];
    const conditions = [];
    if (module) {
      conditions.push('module = ?');
      params.push(module);
    }
    if (action) {
      conditions.push('action = ?');
      params.push(action);
    }
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    const [countResult] = await pool.query(countSql, params);
    const [rows] = await pool.query(sql, [...params, l, offset]);
    res.json({ logs: rows, total: countResult[0].total, page: p, limit: l });
  });

  // 清空操作日志
  // v2.5.3 鉴权加固：原本零校验，任何人不带 header 就能 POST 一次清空全部审计日志。
  // 审计日志是事后追溯的唯一依据，只允许管理员清空。
  app.delete('/api/operation-logs', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可清空操作日志' });
      await pool.query('TRUNCATE TABLE operation_logs');
      res.json({ success: true, message: '操作日志已清空' });
    } catch (e) {
      res.status(500).json({ success: false, message: '清空失败: ' + e.message });
    }
  });
};
