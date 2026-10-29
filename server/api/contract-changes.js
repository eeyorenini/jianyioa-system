/**
 * 增减项（contract_changes）—— 6 个路由
 *
 * 2026-10-29 从 server.js 整体抽出（渐进拆分第 10 轮，207 行）。
 * 代码逐行搬迁、逻辑零改动，外部依赖改为参数注入。
 *
 * 路由：
 *   GET    /api/change-orders/list      移动端列表（字段改名适配：reason/change_date/statusText）
 *   GET    /api/change-orders           PC 端全量列表（含 project_name），返回 {code:0,data}
 *   GET    /api/contract-changes        标准列表（关联项目 u 提交人，P2 口径）
 *   POST   /api/contract-changes        提交增减项（pending）
 *   DELETE /api/contract-changes/:id    删除（连带清理收支占位记录）
 *   PUT    /api/contract-changes/:id/review  审核（approve/reject）
 *
 * 三条链路三条口径不一致，**这是本文件最容易踩的地方**：
 *   1. `GET /api/change-orders/list` 和 `GET /api/change-orders` **完全没有登录检查**
 *      也没有 scope 收敛 —— 任何请求（哪怕不带 x-user-id）都能读到全公司增减项金额。
 *      只有 `GET /api/contract-changes` 做了 buildProjectScopeOrSelfClause。
 *      三个入口读同一张表，权限强度差三档。
 *
 *      ⚠️ 这不是理论风险，2026-10-29 实测（不带任何身份头）：
 *        GET /api/change-orders/list  → 200，返回 3 条记录 / 932 字节，含金额 "5000.00"
 *        GET /api/change-orders       → 200，返回 3 条记录 / 1188 字节，含 project_name
 *        GET /api/contract-changes    → {"error":"未登录"}   ← 只有这个是对的
 *      即：**未登录的公网请求就能拉到全公司增减项金额清单**。
 *
 *      ✅ 已止血（2026-10-29）：前两个入口补了 `getUserId` + `if (!userId) return 401`，
 *         现在不带身份头一律 `{"error":"未登录"}`。
 *         调用方已核实会带头的：PC 端 `main.js` 给**全局 axios** 装了拦截器
 *         （所以 ChangeOrders.vue / Projects.vue 里的裸 `axios.get` 也会带），
 *         移动端 `App.vue` 统一注入 x-user-id / x-user-type。
 *
 *      ❗ 仍未做（有意留手）：**没加 scope**。现在任何登录用户（含普通员工）
 *         都能看到全公司增减项，只有「未登录」被挡住。要不要按
 *         buildProjectScopeOrSelfClause 收窄，属业务变更 —— 加错了会让
 *         设计师/工长在自己项目里看不到增减项，得先定可见范围规则。
 *   2. `GET /api/change-orders/list` 的 `project_name` 恒为 null（没 join projects），
 *      而 `GET /api/change-orders` 有。前端如果混用会看到空项目名。
 *   3. 删除权限 = 提交人 ∪ 有 `contract_change:approve` ∪ admin；
 *      审核权限 = 有 `contract_change:approve` ∪ admin。**删除比审核宽**（提交人可自删）。
 *
 * ⚠️ 两条必须保留的业务保护，删了就出错：
 *   - `DELETE` 里连带 `DELETE FROM payment_records WHERE source_id=? AND category='contract_change'`，
 *     不删会留下孤儿占位记录，财务上「已收/已支」凭空多出金额（v2.3.12 修）。
 *   - `review` 通过时先查 `source_id + category='contract_change'` 是否已存在再插入，
 *     幂等保护。去掉会让重复审核同一单产生多条占位（虽然 status!=pending 已拦，但并发下仍需）。
 *
 * 与财务口径的关系：审核通过写入的 `category='contract_change'` **不是真实收支**，
 * 只是给合同金额加/减的锚点。真实收支口径见 api/finance.js 文件头。
 *
 * 依赖 8 个：pool / getUserId / addLog / buildProjectScopeOrSelfClause /
 *            notifyReviewSubmitted / notifySubmitter / getUserPermissions / isAdmin
 */

module.exports = function registerContractChangeRoutes(app, deps) {
  const {
    pool, getUserId, addLog, buildProjectScopeOrSelfClause,
    notifyReviewSubmitted, notifySubmitter, getUserPermissions, isAdmin,
  } = deps;

  // ==================== 增减项 API ====================
  // 兼容移动端 /api/change-orders/list（实际映射到 contract_changes）
  app.get('/api/change-orders/list', async (req, res) => {
    try {
      // 2026-10-29 补登录校验（止血）：本路由此前连 getUserId 都没有，
      // 实测不带任何身份头即可拿到全公司增减项金额清单（3 条 / 932 字节）。
      // 只补「必须登录」，**未加 scope** —— 加 scope 会改变谁能看到哪些记录，
      // 属业务变更，要先确认移动端「增减项」列表的预期可见范围，故留待单独决定。
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const { project_id } = req.query;
      let sql = `SELECT cc.*, s.name as submitted_by_name, r.name as reviewed_by_name
                 FROM contract_changes cc
                 LEFT JOIN employees s ON s.id = cc.submitted_by
                 LEFT JOIN employees r ON r.id = cc.reviewed_by
                 WHERE 1=1`;
      const params = [];
      if (project_id) { sql += ' AND cc.project_id = ?'; params.push(project_id); }
      sql += ' ORDER BY cc.id DESC';
      const [rows] = await pool.query(sql, params);
      // 转换为移动端期望的字段名
      const list = rows.map(r => ({
        id: r.id,
        project_id: r.project_id,
        change_type: r.change_type,
        title: r.title,
        amount: r.amount,
        reason: r.description,
        change_date: r.submitted_at,
        created_at: r.submitted_at,
        status: r.status,
        statusText: r.status === 'approved' ? '已通过' : r.status === 'rejected' ? '已驳回' : r.status === 'pending' ? '待审核' : r.status === 'draft' ? '草稿' : '待审核',
        project_name: null,
        submitted_by_name: r.submitted_by_name
      }));
      res.json(list);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // PC 端全量列表（含项目名称）
  app.get('/api/change-orders', async (req, res) => {
    try {
      // 2026-10-29 补登录校验（止血）：同 /api/change-orders/list，
      // 此前不带身份头可读到全公司 3 条增减项含 project_name（1188 字节）。
      // 只补登录，不加 scope，理由同上。
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const { status } = req.query;
      let sql = `SELECT cc.*, s.name as submitted_by_name, r.name as reviewed_by_name,
                        p.name as project_name
                 FROM contract_changes cc
                 LEFT JOIN employees s ON s.id = cc.submitted_by
                 LEFT JOIN employees r ON r.id = cc.reviewed_by
                 LEFT JOIN projects p ON p.id = cc.project_id
                 WHERE 1=1`;
      const params = [];
      if (status) { sql += ' AND cc.status = ?'; params.push(status === '待审核' ? 'pending' : status === '已通过' ? 'approved' : status === '已驳回' ? 'rejected' : status); }
      sql += ' ORDER BY cc.id DESC';
      const [rows] = await pool.query(sql, params);
      const list = rows.map(r => ({
        id: r.id,
        project_id: r.project_id,
        project_name: r.project_name,
        change_type: r.change_type,
        title: r.title,
        amount: r.amount,
        reason: r.description || r.reason,
        submitted_at: r.submitted_at,
        reviewed_at: r.reviewed_at,
        reviewed_by_name: r.reviewed_by_name,
        reviewer_remark: r.reviewer_remark,
        status: r.status,
        statusText: r.status === 'approved' ? '已通过' : r.status === 'rejected' ? '已驳回' : r.status === 'pending' ? '待审核' : '待审核',
        submitted_by_name: r.submitted_by_name
      }));
      res.json({ code: 0, data: list });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/contract-changes', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const { project_id, contract_id, status } = req.query;
      // 2026-10-11：补 project_name（此前未 join projects，导致移动端审核页「项目」为空）；
      // 同时补 submitter_name 别名（原字段是 submitted_by_name，两处口径统一）。
      // P2 §7.3：增减项按关联项目 ∪ 提交人 收窄
      const scope = await buildProjectScopeOrSelfClause(userId, 'contract_change', 'cc', 'project_id', 'submitted_by');
      let sql = `SELECT cc.*, s.name as submitted_by_name, s.name as submitter_name,
                        r.name as reviewed_by_name, p.name as project_name
                 FROM contract_changes cc
                 LEFT JOIN employees s ON s.id = cc.submitted_by
                 LEFT JOIN employees r ON r.id = cc.reviewed_by
                 LEFT JOIN projects p ON p.id = cc.project_id
                 WHERE 1=1${scope.sql}`;
      const params = [...scope.params];
      if (project_id) { sql += ' AND cc.project_id = ?'; params.push(project_id); }
      if (contract_id) { sql += ' AND cc.contract_id = ?'; params.push(contract_id); }
      if (status) { sql += ' AND cc.status = ?'; params.push(status); }
      sql += ' ORDER BY cc.id DESC';
      const [rows] = await pool.query(sql, params);
      res.json({ code: 0, data: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/contract-changes', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const { project_id, contract_id, change_type, title, amount, description } = req.body;
      if (!project_id) return res.status(400).json({ error: '项目ID不能为空' });
      if (!change_type || !['increase', 'decrease'].includes(change_type)) return res.status(400).json({ error: '类型必选增或减' });
      if (!title) return res.status(400).json({ error: '标题不能为空' });
      if (amount === undefined || parseFloat(amount) <= 0) return res.status(400).json({ error: '金额必须大于0' });

      const [[project]] = await pool.query('SELECT name FROM projects WHERE id = ?', [project_id]);
      const project_name = project?.name || '';

      const [result] = await pool.query(
        `INSERT INTO contract_changes (project_id, contract_id, change_type, title, amount, description, status, submitted_by, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NOW())`,
        [project_id, contract_id || null, change_type, title, amount, description || '', userId]
      );
      await addLog(userId, '', '新增', '增减项', result.insertId, project_name, `${change_type === 'increase' ? '增加' : '减少'}：${title}（${amount}元）`, req.ip);

      // 通知：新增增减项 —— 2026-10-12 审核提交类 → 增减项审批人 + 提交人 + 项目经理
      notifyReviewSubmitted(
        'contract_change_created',
        project_id,
        `新增减项申请：${change_type === 'increase' ? '增加' : '减少'}¥${amount}`,
        `项目「${project_name}」新增${change_type === 'increase' ? '增加' : '减少'}项「${title}」，金额：${amount}元，请及时审核。`,
        result.insertId,
        'contract_change',
        userId,
        ['contract_change:approve']
      ).catch(console.error);

      res.json({ id: result.insertId, message: '增减项已提交，待审核' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/contract-changes/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const [[record]] = await pool.query('SELECT * FROM contract_changes WHERE id = ?', [req.params.id]);
      if (!record) return res.status(404).json({ error: '记录不存在' });
      const perms = await getUserPermissions(userId);
      if (record.submitted_by !== userId && !perms.includes('contract_change:approve') && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无权删除此记录' });
      }
      await pool.query('DELETE FROM contract_changes WHERE id = ?', [req.params.id]);
      // v2.3.12 修：删增减项要连带清掉它产生的收支占位记录，否则留下孤儿
      const [ccOrphan] = await pool.query(
        "DELETE FROM payment_records WHERE source_id = ? AND category = 'contract_change'",
        [req.params.id]
      );
      await addLog(userId, '', '删除', '增减项', req.params.id, '', `删除增减项: ${record.title}${ccOrphan.affectedRows ? `，连带清理收支记录 ${ccOrphan.affectedRows} 条` : ''}`, req.ip);
      res.json({ message: '删除成功' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/contract-changes/:id/review', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await getUserPermissions(userId);
      if (!perms.includes('contract_change:approve') && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无增减项审核权限' });
      }
      const [[record]] = await pool.query('SELECT * FROM contract_changes WHERE id = ?', [req.params.id]);
      if (!record) return res.status(404).json({ error: '记录不存在' });
      if (record.status !== 'pending') return res.status(400).json({ error: '该记录已审核' });

      const { action, remark } = req.body;
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });

      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      await pool.query(
        'UPDATE contract_changes SET status=?, reviewed_by=?, reviewed_at=NOW(), reviewer_remark=? WHERE id=?',
        [newStatus, userId, remark || '', req.params.id]
      );

      // 审核通过 → 自动更新 payment_records
      // v2.3.12 修：加幂等保护，同一增减项只产生一条收支占位记录
      if (action === 'approve' && record.amount) {
        const [[existCc]] = await pool.query(
          "SELECT id FROM payment_records WHERE source_id = ? AND category = 'contract_change' LIMIT 1",
          [req.params.id]
        );
        if (!existCc) {
          const pType = record.change_type === 'increase' ? 'income' : 'expense';
          await pool.query(
            `INSERT INTO payment_records (project_id, type, category, amount, source_id, status, created_by, created_at)
             VALUES (?, ?, 'contract_change', ?, ?, 'confirmed', ?, NOW())`,
            [record.project_id, pType, record.amount, req.params.id, userId]
          );
        }
      }

      await addLog(userId, '', action === 'approve' ? '审核通过' : '审核拒绝', '增减项', req.params.id, record.title, `增减项审核${action === 'approve' ? '通过' : '拒绝'}${remark ? '：' + remark : ''}`, req.ip);

      // 通知：增减项审核结果 —— 2026-10-12 仅通知提交人（谁发起，反馈给谁）
      notifySubmitter(
        action === 'approve' ? 'contract_change_approved' : 'contract_change_rejected',
        record.project_id,
        action === 'approve' ? `增减项审核通过` : `增减项审核未通过`,
        action === 'approve'
          ? `您提交的增减项「${record.title}」（${record.change_type === 'increase' ? '增加' : '减少'}¥${record.amount}）已审核通过`
          : `您提交的增减项「${record.title}」未通过${remark ? '：' + remark : ''}`,
        record.project_id,
        'contract_change',
        record.submitted_by
      ).catch(console.error);

      res.json({ message: action === 'approve' ? '已通过' : '已拒绝' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
};
