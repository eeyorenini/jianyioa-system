/**
 * 移动端数据报表 / 收支统计与列表（2026-10-29 渐进拆分第 20 轮）
 *
 * 搬运自 server.js 原 1350-1477 行，搬入时 128 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerMobileReportRoutes(app, deps) {
  const {
    db,
  } = deps;

  // ==================== 移动端：数据报表 / 收支统计与列表（补齐缺失接口）====================
  // 移动端 pages/report/index.vue 请求 /api/report/stats，
  // pages/finance/list.vue 请求 /api/finance/stats + /api/finance/list，
  // 后端此前没有这三个路由 → 控制台 404、页面空白。此处补齐。
  // 统一返回 { code: 0, data: {...} } 以匹配移动端 res.data.code === 0 的判断。

  // GET /api/report/stats —— 数据报表页
  app.get('/api/report/stats', async (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const notDone = "(status IS NULL OR (status NOT LIKE '%完工%' AND status NOT LIKE '%完成%' AND status NOT LIKE '%竣工%' AND status NOT LIKE '%验收%'))";
      const isDone = "(status LIKE '%完工%' OR status LIKE '%完成%' OR status LIKE '%竣工%' OR status LIKE '%验收%')";

      const pTotal = await db.prepare('SELECT COUNT(*) AS n FROM projects').get();
      const pActive = await db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE ${notDone}`).get();
      const pDone = await db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE ${isDone}`).get();
      const pOverdue = await db.prepare(
      `SELECT COUNT(*) AS n FROM projects
       WHERE end_date IS NOT NULL AND end_date <> '' AND end_date < ? AND ${notDone}`
      ).get(today);

      const iTotal = await db.prepare('SELECT COUNT(*) AS n FROM rectification_issues').get();
      const iPending = await db.prepare(`SELECT COUNT(*) AS n FROM rectification_issues WHERE (status IS NULL OR status NOT IN ('已整改','已完成'))`).get();
      const iFixed = await db.prepare(`SELECT COUNT(*) AS n FROM rectification_issues WHERE status IN ('已整改','已完成')`).get();
      const iOverdue = await db.prepare(
      `SELECT COUNT(*) AS n FROM rectification_issues
       WHERE due_date IS NOT NULL AND due_date <> '' AND due_date < ? AND (status IS NULL OR status NOT IN ('已整改','已完成'))`
      ).get(today);

      const incRow = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM finance WHERE type='income'`).get();
      const expRow = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM finance WHERE type='expense'`).get();

      // 2026-10-26 修复：原来直接读 projects.progress 列，但那一列是**死列**（全库恒为 0，
      // 没有任何写入方），真实进度一直是按 project_progress_nodes 的已完成节点占比实时算的
      // （见 GET /api/projects 与 routes/projects.js）。所以报表里所有项目进度都显示 0%。
      // 这里改成同样的口径：已完成节点数 / 总节点数，无节点则为 0。
      // 顺带：客户名原来取 projects.customer（老字段，多数为空），改成跟 /api/projects 一致
      // 走 customers.name 关联，老数据有值时优先用老字段。
      const projects = await db.prepare(
      `SELECT p.id, p.name,
              COALESCE(NULLIF(p.customer, ''), c.name) AS customer_name,
              COALESCE((
                SELECT ROUND(SUM(CASE WHEN n.status = 'completed' THEN 1 ELSE 0 END) / COUNT(*) * 100)
                FROM project_progress_nodes n WHERE n.project_id = p.id
              ), 0) AS progress
       FROM projects p
       LEFT JOIN customers c ON c.id = p.customer_id
       ORDER BY progress DESC, p.id DESC
       LIMIT 10`
      ).all();

      res.json({
        code: 0,
        data: {
          stats: {
            project_total: Number(pTotal && pTotal.n || 0),
            project_active: Number(pActive && pActive.n || 0),
            project_overdue: Number(pOverdue && pOverdue.n || 0),
            project_completed: Number(pDone && pDone.n || 0),
            inspection_total: Number(iTotal && iTotal.n || 0),
            inspection_pending: Number(iPending && iPending.n || 0),
            inspection_fixed: Number(iFixed && iFixed.n || 0),
            inspection_overdue: Number(iOverdue && iOverdue.n || 0),
            income: Number(incRow && incRow.s || 0),
            expense: Number(expRow && expRow.s || 0),
          },
          projects: projects || [],
        },
      });
    } catch (err) {
      console.error('report/stats error:', err);
      res.status(500).json({ code: 1, error: err.message });
    }
  });

  // GET /api/finance/stats —— 收支统计卡片
  app.get('/api/finance/stats', async (req, res) => {
    try {
      const inc = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM finance WHERE type='income'`).get();
      const exp = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM finance WHERE type='expense'`).get();
      const income = Number(inc && inc.s || 0);
      const expense = Number(exp && exp.s || 0);
      res.json({ code: 0, data: { income, expense, balance: income - expense } });
    } catch (err) {
      console.error('finance/stats error:', err);
      res.status(500).json({ code: 1, error: err.message });
    }
  });

  // GET /api/finance/list —— 收支分页列表
  app.get('/api/finance/list', async (req, res) => {
    try {
      const type = req.query.type || '';
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size) || 20));
      const offset = (page - 1) * pageSize;

      const where = [];
      const params = [];
      if (type === 'income' || type === 'expense') { where.push('f.type = ?'); params.push(type); }
      const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

      const rows = await db.prepare(
      `SELECT f.id, f.type, f.amount, f.category, f.description, f.date, f.project_id, f.created_at,
              p.name AS project_name
       FROM finance f LEFT JOIN projects p ON f.project_id = p.id
       ${whereSql}
       ORDER BY f.created_at DESC, f.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`
      ).all(...params);

      const list = (rows || []).map(r => ({
        id: r.id,
        type: r.type === 'income' ? 'income' : 'expense',
        amount: r.amount,
        category: r.category,
        project_name: r.project_name || '',
        payee: r.description || r.category || '',
        created_at: r.created_at,
      }));

      res.json({ code: 0, data: { list, page, page_size: pageSize } });
    } catch (err) {
      console.error('finance/list error:', err);
      res.status(500).json({ code: 1, error: err.message });
    }
  });

};
