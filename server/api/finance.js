/**
 * 收支记录 + 财务汇总（payment_records）—— 6 个路由
 *
 * 2026-10-29 从 server.js 整体抽出（渐进拆分第 9 轮，409 行）。
 * 代码逐行搬迁、逻辑零改动，外部依赖改为参数注入。
 *
 * ⚠️⚠️ 这是**全系统财务口径的唯一真源**，改之前先读完这段：
 *
 * payment_records 里混着两种性质完全不同的记录：
 *   【真实收支】category IS NULL（手工记账）/ 'collection'（催收确认到账）
 *              / 'dispatch'（派工支出）/ 'purchase'（采购支出）/ 'manual'
 *   【金额占位，不是钱】category='contract'        合同应收占位
 *                      category='contract_change' 增项应收 / 减项应付占位
 *   占位是「合同/增减项审核通过」时自动写入的金额锚点，**从未真实到账**。
 *
 * 所以算已收/已支的 SQL 必须写成：
 *   `type='income' AND status='confirmed' AND (category IS NULL OR category NOT IN ('contract','contract_change'))`
 * ⚠️ 只写 `NOT IN (...)` 会把 category 为 NULL 的手工记账**整条漏掉**，
 *    金额凭空变少，且不报错。这个坑踩过（见下方 v2.4.6 注释）。
 *
 * 两个接口口径不同，别再改错：
 *   - /api/finance/dashboard：支出用 `category IN ('dispatch','purchase','manual')`
 *     白名单，实收 = collection_records.confirmed + payment_records.collection。
 *   - /api/finance/summary  ：支出用 `NOT IN (...)` 黑名单（v2.4.6 才对齐）。
 *     两者结果应当一致，但写法不同，改动时要一起看。
 *
 * 已知遗留问题（未动）：
 *   1. `/api/finance/dashboard` 第 10 段按项目循环查库（N+1），
 *      项目数多时慢；且 `LEFT JOIN contracts c ON c.project_id=p.id` 恒为 NULL
 *      （contracts.project_id 全 NULL，见"财务口径"节），这个 JOIN 实际是死 JOIN，金额靠 payment_records 补。
 *   2. `POST /api/payment-records` 允许前端自带 `status`，也就是能直接插 confirmed
 *      记录绕过确认流程；`category` 也能任意传，理论上可以伪造 'contract' 占位。
 *   3. `GET /api/payment-records` 零权限校验、无项目范围过滤，任何登录用户可看全公司收支。
 *   4. 只有 confirm 用了 checkPermission('finance:write')，其余 5 个都没权限点。
 *
 * 依赖 4 个：pool / getUserId / addLog / checkPermission
 */

module.exports = function registerFinanceRoutes(app, deps) {
  const { pool, getUserId, addLog, checkPermission } = deps;

  // ==================== 收支记录 API ====================
  app.get('/api/payment-records', async (req, res) => {
    try {
      const { project_id, type, status } = req.query;
      let sql = `SELECT pr.*, c.name as created_by_name
                 FROM payment_records pr
                 LEFT JOIN employees c ON c.id = pr.created_by
                 WHERE 1=1`;
      const params = [];
      if (project_id) { sql += ' AND pr.project_id = ?'; params.push(project_id); }
      if (type) { sql += ' AND pr.type = ?'; params.push(type); }
      if (status) { sql += ' AND pr.status = ?'; params.push(status); }
      sql += ' ORDER BY pr.id DESC';
      const [rows] = await pool.query(sql, params);
      res.json({ list: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/payment-records', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const { project_id, type, category, amount, remark, status } = req.body;
      if (!project_id) return res.status(400).json({ error: '项目ID不能为空' });
      if (!type || !['income', 'expense'].includes(type)) return res.status(400).json({ error: '类型必选收入或支出' });
      if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: '金额必须大于0' });

      const [result] = await pool.query(
        `INSERT INTO payment_records (project_id, type, category, amount, status, description, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [project_id, type, category || 'manual', amount, status || 'pending', remark || '', userId]
      );
      await addLog(userId, '', '新增', '收支记录', result.insertId, `项目#${project_id}`, `${type === 'income' ? '收入' : '支出'}：${amount}元`, req.ip);
      res.json({ id: result.insertId, message: '记录已添加' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // PUT /api/payment-records/:id/confirm — 确认收支记录（待确认 → 已确认）
  // v2.3.12 新增：此前 payment_records 只有「插入」没有「确认」入口，
  // 派工审核通过产生的支出永远是「待确认」，财务在 PC 端和移动端都点不到确认按钮。
  app.put('/api/payment-records/:id/confirm', checkPermission('finance:write'), async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const [[record]] = await pool.query('SELECT * FROM payment_records WHERE id = ?', [req.params.id]);
      if (!record) return res.status(404).json({ error: '记录不存在' });
      if (record.status === 'confirmed') return res.status(400).json({ error: '该记录已确认，无需重复操作' });
      if (record.status === 'cancelled') return res.status(400).json({ error: '该记录已取消，不能确认' });

      // 带 status='pending' 条件，防止并发重复确认
      const [result] = await pool.query(
        "UPDATE payment_records SET status='confirmed', confirmed_by=?, confirmed_at=NOW() WHERE id=? AND status='pending'",
        [userId, req.params.id]
      );
      if (!result.affectedRows) return res.status(409).json({ error: '状态已变化，请刷新后重试' });

      const label = record.type === 'income' ? '收入' : '支出';
      await addLog(userId, '', '确认', '财务管理', req.params.id, `项目#${record.project_id}`,
        `确认收支：${label} ${record.amount} 元`, req.ip);
      res.json({ message: '已确认', id: record.id, status: 'confirmed' });
    } catch (err) {
      console.error('payment-records confirm error:', err);
      res.status(500).json({ error: '确认失败' });
    }
  });

  // ==================== 财务汇总 ====================
  app.get('/api/finance/summary', async (req, res) => {
    try {
      const { project_id } = req.query;
      let args = [];
      let whereProject = project_id ? ' WHERE project_id = ?' : '';
      if (project_id) args.push(project_id);

      // 合同营收合计（v2.3.6 hotfix 10-15：改读 payment_records.category='contract'.confirmed）
      // 原因：contracts 表的 project_id/customer_id 字段在 v2.2 引入后从未被填充（全 NULL），
      //     真实业务合同金额在 payment_records 的"合同自动入账占位"里
      const [[contractSum]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payment_records ${whereProject ? 'WHERE project_id = ? AND category=\'contract\' AND status=\'confirmed\'' : 'WHERE category=\'contract\' AND status=\'confirmed\''}`,
        project_id ? [project_id] : []
      );

      // 增减项合计（审核通过的）
      const [[changeSum]] = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN change_type='increase' THEN amount ELSE 0 END), 0) as increase_total,
           COALESCE(SUM(CASE WHEN change_type='decrease' THEN amount ELSE 0 END), 0) as decrease_total
         FROM contract_changes ${whereProject ? 'WHERE project_id = ? AND status = \'approved\'' : 'WHERE status = \'approved\''}`,
        project_id ? [project_id] : []
      );

      // 已确认实收
      // v2.4.6 修正（2026-10-23）：排除"应收占位"记录。
      // payment_records 里 category='contract'（合同应收占位）和 category='contract_change'
      // （增项应收占位 / 减项应付占位）是业务审核通过时自动写入的"金额锚点"，
      // **不是真实到账**。原来的 `type='income'` 把它们一起算进已收，
      // 导致项目 17「云秀花园紫竹院1102」显示已收 80000（50000 占位 + 30000 真实催收），
      // 剩余应收算成 -30000（超收）。口径与 v2.3.6 的 /api/finance/dashboard 对齐。
      // ⚠️ category 可能为 NULL（手工记账），必须用 IS NULL OR NOT IN，否则会漏记录。
      const [[collected]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payment_records ${whereProject ? 'WHERE project_id = ? AND' : 'WHERE'} type='income' AND status='confirmed' AND (category IS NULL OR category NOT IN ('contract','contract_change'))`,
        project_id ? [project_id] : []
      );

      // 已确认支出（同样排除减项应付占位）
      const [[expensed]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payment_records ${whereProject ? 'WHERE project_id = ? AND' : 'WHERE'} type='expense' AND status='confirmed' AND (category IS NULL OR category NOT IN ('contract','contract_change'))`,
        project_id ? [project_id] : []
      );

      // 待确认支出（同样排除占位）
      const [[pendingExpense]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payment_records ${whereProject ? 'WHERE project_id = ? AND' : 'WHERE'} type='expense' AND status='pending' AND (category IS NULL OR category NOT IN ('contract','contract_change'))`,
        project_id ? [project_id] : []
      );

      const contractTotal = parseFloat(contractSum?.total || 0);
      const increaseTotal = parseFloat(changeSum?.increase_total || 0);
      const decreaseTotal = parseFloat(changeSum?.decrease_total || 0);
      const receivable = contractTotal + increaseTotal - decreaseTotal; // 应收 = 合同 + 增 - 减

      res.json({
        contract_amount: contractTotal,
        increase_total: increaseTotal,
        decrease_total: decreaseTotal,
        receivable,           // 应收
        collected: parseFloat(collected?.total || 0),       // 实收
        expensed: parseFloat(expensed?.total || 0),         // 已支出
        pending_expense: parseFloat(pendingExpense?.total || 0), // 待确认支出
        balance: receivable - parseFloat(collected?.total || 0) // 未收
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // 按项目汇总应收（Finance.vue 应收统计 Tab 用）
  // v2.3.6 hotfix 10-15：合同金额改读 payment_records.category='contract'.confirmed（contracts 表里 project_id 全 NULL）
  app.get('/api/finance/receivable-by-project', async (req, res) => {
    try {
      const [projects] = await pool.query(`
        SELECT p.id, p.name as project_name,
          cu.name as customer_name
        FROM projects p
        LEFT JOIN customers cu ON cu.id = p.customer_id
        WHERE p.status != '已删除'
        ORDER BY p.id DESC
      `);

      const result = [];
      for (const p of projects) {
        const [[changeSum]] = await pool.query(
          `SELECT
             COALESCE(SUM(CASE WHEN change_type='increase' THEN amount ELSE 0 END), 0) as increase_total,
             COALESCE(SUM(CASE WHEN change_type='decrease' THEN amount ELSE 0 END), 0) as decrease_total
           FROM contract_changes WHERE project_id = ? AND status = 'approved'`,
          [p.id]
        );
        const [[collected]] = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) as total FROM collection_records WHERE project_id = ? AND status = 'confirmed'`,
          [p.id]
        );
        const [[pendingUnconfirmed]] = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) as total FROM collection_records WHERE project_id = ? AND status = 'pending'`,
          [p.id]
        );
        // v2.3.6 hotfix 10-15：合同金额改读 payment_records.category='contract'.confirmed
        const [[contractRow]] = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
           WHERE project_id = ? AND category='contract' AND status='confirmed'`,
          [p.id]
        );
        const contractAmount = parseFloat(contractRow?.total || 0);
        const increaseTotal = parseFloat(changeSum?.increase_total || 0);
        const decreaseTotal = parseFloat(changeSum?.decrease_total || 0);
        const receivable = contractAmount + increaseTotal - decreaseTotal;
        const collectedAmt = parseFloat(collected?.total || 0);
        const pendingAmt = parseFloat(pendingUnconfirmed?.total || 0);
        result.push({
          project_id: p.id,
          project_name: p.project_name,
          customer_name: p.customer_name || '',
          contract_amount: contractAmount,
          increase_total: increaseTotal,
          decrease_total: decreaseTotal,
          receivable,
          collected: collectedAmt,
          pending_unconfirmed: pendingAmt,
          unpaid: receivable - collectedAmt
        });
      }

      // 全局汇总
      const grand = result.reduce((acc, r) => {
        acc.contract_amount += r.contract_amount;
        acc.increase_total += r.increase_total;
        acc.decrease_total += r.decrease_total;
        acc.receivable += r.receivable;
        acc.collected += r.collected;
        acc.unpaid += r.unpaid;
        return acc;
      }, { contract_amount: 0, increase_total: 0, decrease_total: 0, receivable: 0, collected: 0, unpaid: 0 });

      res.json({ list: result, grand });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== 全公司财务大盘（汇总所有项目）====================
  // v2.3.6 新增：替代 BossDashboard / Dashboard / 移动端首页 💰 按钮的"死数据"财务卡片
  // v2.3.6 hotfix（2026-10-15）：修正口径——"增减项占位"不参与收支计算。
  // payment_records 里的 4 类：
  //   - income/contract        = 合同应收占位（合同审核通过自动写入，不是真实收入）
  //   - income/contract_change = 增项应收占位（同上，不算收入）
  //   - expense/contract_change= 减项应付占位（同上，不算支出）
  //   - expense/dispatch       = 派工支出（财务受理后才 confirmed，**真实支出**）
  //   - expense/purchase       = 采购支出（**真实支出**，未来类别）
  //   - income/collection      = 催收确认收款（**真实收入**）
  //   - manual                 = 手动记账（兜底）
  // 数据源：
  //   - contracts WHERE review_status='approved'（业务已审核 = 应收源头）
  //   - contract_changes WHERE status='approved'（增/减项，只参与应收计算）
  //   - payment_records WHERE category NOT IN ('contract','contract_change')（真实收支）
  //   - collection_records（催收流水）
  // 替代了：
  //   - /api/boss-dashboard 的 financeStats（读老 finance 表）
  //   - /api/dashboard/stats（读老 finance 表）
  //   - /api/monthly-trend（读老 finance 表）
  // 保留兼容：
  //   - 老 finance 表 + /api/finance 路由继续保留（PC 端 Finance.vue 还在用）
  app.get('/api/finance/dashboard', async (req, res) => {
    try {
      // ===== 1. 公司级合同营收（v2.3.6 hotfix 10-15：改读 payment_records.category='contract'.confirmed）=====
      // 原因：contracts 表 project_id/customer_id 全 NULL（v2.2 引入字段后从未填），真实数据在 payment_records
      const [[contractRow]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records WHERE category='contract' AND status='confirmed'`
      );
      const contractAmount = parseFloat(contractRow?.total || 0);

      // ===== 2. 全公司增减项（增/减项分别汇总，独立显示在数据盘，不参与收支计算）=====
      const [[changeRow]] = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN change_type='increase' THEN amount ELSE 0 END), 0) AS increase_total,
           COALESCE(SUM(CASE WHEN change_type='decrease' THEN amount ELSE 0 END), 0) AS decrease_total
         FROM contract_changes WHERE status = 'approved'`
      );
      const increaseTotal = parseFloat(changeRow?.increase_total || 0);
      const decreaseTotal = parseFloat(changeRow?.decrease_total || 0);

      // ===== 3. 已确认实收（催收已确认 + 派工到位的收款）=====
      //    注意：payment_records WHERE category='collection' 是催收确认收款写入的"实收"标记
      //    collection_records 是独立的催收流水表（财务录入催收金额 → 待确认 → 确认收款）
      const [[collectedCollectionRow]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM collection_records WHERE status = 'confirmed'`
      );
      const [[collectedPaymentRow]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
         WHERE type='income' AND status='confirmed' AND category='collection'`
      );
      const collected = parseFloat(collectedCollectionRow?.total || 0) + parseFloat(collectedPaymentRow?.total || 0);

      // ===== 4. 待确认催收（collection_records 表的 pending 状态）=====
      const [[unconfirmedRow]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM collection_records WHERE status = 'pending'`
      );
      const unconfirmed = parseFloat(unconfirmedRow?.total || 0);

      // ===== 5. 已确认支出（真实支出：派工/采购/手动，**排除 contract_change 占位**）=====
      const [[expensedRow]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
         WHERE type='expense' AND status='confirmed'
           AND category IN ('dispatch', 'purchase', 'manual')`
      );
      const expensed = parseFloat(expensedRow?.total || 0);

      // ===== 6. 待确认支出（同上，排除 contract_change 占位）=====
      const [[pendingExpenseRow]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
         WHERE type='expense' AND status='pending'
           AND category IN ('dispatch', 'purchase', 'manual')`
      );
      const pendingExpense = parseFloat(pendingExpenseRow?.total || 0);

      // ===== 7. 待确认收入（collection 类型 pending，催收未到账）=====
      const [[incomePendingRow]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
         WHERE type='income' AND status='pending' AND category='collection'`
      );
      const incomePending = parseFloat(incomePendingRow?.total || 0);

      // ===== 8. 计算派生口径（按真实收支）=====
      const receivable = contractAmount + increaseTotal - decreaseTotal;  // 应收 = 合同 + 增 - 减
      const unpaid = receivable - collected;                               // 未收
      const profit = collected - expensed;                                // 利润：实收 - 已支
      const changeNet = increaseTotal - decreaseTotal;                    // 增减项净额（独立显示）

      // ===== 9. 月度真实收支趋势（最近 12 个月，按 payment_records.created_at 汇总）=====
      //    **排除 category='contract' 和 'contract_change'（占位不是真实收支）**
      const [trendRows] = await pool.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
                SUM(CASE WHEN type='income'  AND category='collection' THEN amount ELSE 0 END) AS income,
                SUM(CASE WHEN type='expense' AND category IN ('dispatch','purchase','manual') THEN amount ELSE 0 END) AS expense
         FROM payment_records
         WHERE created_at IS NOT NULL
         GROUP BY DATE_FORMAT(created_at, '%Y-%m')
         ORDER BY month DESC
         LIMIT 12`
      );
      const monthlyTrend = (trendRows || []).reverse(); // 时间正序：旧 → 新

      // 本月（最后一月 = 最新月）真实收入/支出
      const thisMonth = monthlyTrend.length > 0 ? monthlyTrend[monthlyTrend.length - 1] : { month: '', income: 0, expense: 0 };
      const thisMonthIncome = parseFloat(thisMonth.income || 0);
      const thisMonthExpense = parseFloat(thisMonth.expense || 0);

      // ===== 10. 各项目财务汇总（按项目分行，复用 receivable-by-project 口径 + 真实收支）=====
      const [projectRows] = await pool.query(`
        SELECT p.id, p.name AS project_name,
          cu.name AS customer_name,
          COALESCE(c.contract_amount, 0) AS contract_amount
        FROM projects p
        LEFT JOIN contracts c ON c.project_id = p.id AND c.review_status = 'approved'
        LEFT JOIN customers cu ON cu.id = p.customer_id
        WHERE p.status != '已删除'
        ORDER BY p.id DESC
      `);

      const byProject = [];
      for (const p of projectRows) {
        const [[inc]] = await pool.query(
          `SELECT
             COALESCE(SUM(CASE WHEN change_type='increase' THEN amount ELSE 0 END), 0) AS increase_total,
             COALESCE(SUM(CASE WHEN change_type='decrease' THEN amount ELSE 0 END), 0) AS decrease_total
           FROM contract_changes WHERE project_id = ? AND status = 'approved'`,
          [p.id]
        );
        const [[col]] = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM collection_records WHERE project_id = ? AND status = 'confirmed'`,
          [p.id]
        );
        const [[realExp]] = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
           WHERE project_id = ? AND type='expense' AND status='confirmed'
             AND category IN ('dispatch','purchase','manual')`,
          [p.id]
        );
        // v2.3.6 hotfix 10-15：合同金额改读 payment_records.category='contract'.confirmed（不再读 contracts.contract_amount）
        const [[contractRowP]] = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
           WHERE project_id = ? AND category='contract' AND status='confirmed'`,
          [p.id]
        );
        const contractAmountP = parseFloat(contractRowP?.total || 0);
        const increaseP = parseFloat(inc?.increase_total || 0);
        const decreaseP = parseFloat(inc?.decrease_total || 0);
        const receivableP = contractAmountP + increaseP - decreaseP;
        const collectedP = parseFloat(col?.total || 0);
        const realExpensedP = parseFloat(realExp?.total || 0);
        byProject.push({
          project_id: p.id,
          project_name: p.project_name,
          customer_name: p.customer_name || '',
          contract_amount: contractAmountP,
          change_net: increaseP - decreaseP,            // 增减项净额
          receivable: receivableP,
          collected: collectedP,
          unpaid: receivableP - collectedP,
          real_expensed: realExpensedP,                  // 真实已支出
        });
      }

      // ===== 11. 返回 =====
      res.json({
        code: 0,
        data: {
          // 应收侧（合同 + 增减项 → 应收 → 未收）
          contract_amount: contractAmount,        // 合同营收（已审核）
          increase_total: increaseTotal,          // 增项
          decrease_total: decreaseTotal,          // 减项
          change_net: changeNet,                  // 增减项净额 = 增 - 减
          receivable,                              // 应收 = 合同 + 增 - 减
          collected,                               // 已确认实收（催收+派工到位）
          unconfirmed,                             // 待确认催收
          unpaid,                                  // 未收 = 应收 - 已确认实收

          // 支出侧（真实支出，排除 contract_change 占位）
          expensed,                                // 已确认支出（dispatch/purchase/manual）
          pending_expense: pendingExpense,         // 待确认支出

          // 利润（按真实收支算）
          profit,                                  // 利润 = 实收 - 已支

          // 待确认收入（催收未到账）
          income_pending: incomePending,

          // 本月/趋势
          this_month: thisMonth.month,
          this_month_income: thisMonthIncome,
          this_month_expense: thisMonthExpense,
          monthly_trend: monthlyTrend,
          // 各项目分行
          by_project: byProject,
          // 元数据：服务器当前时间，方便前端显示"截至 YYYY-MM-DD HH:mm"
          server_time: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('finance/dashboard error:', err);
      res.status(500).json({ code: 1, error: err.message });
    }
  });
};
