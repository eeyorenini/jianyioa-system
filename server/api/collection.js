/**
 * 催收记录（collection_records）—— 3 个路由
 *
 * 2026-10-29 从 server.js 整体抽出（渐进拆分第 9 轮，109 行）。
 * 代码逐行搬迁、逻辑零改动，外部依赖改为参数注入。
 *
 * 业务链路：财务/项目经理录入催收（pending）→ 财务确认收款（confirmed）
 *   → **确认时自动往 payment_records 写一条 `category='collection'` 的收入记录**。
 *   这条 payment_records 才是财务口径里的"真实到账"，collection_records 是流水台账。
 *
 * 路由：
 *   GET /api/collection-records           列表（关联项目 ∪ 提交人，P2 口径）
 *   POST /api/collection-records          录入催收（必须传凭证图片，金额 > 0）
 *   PUT /api/collection-records/:id/confirm 确认收款（幂等，同一记录只入账一次）
 *
 * ⚠️ 改动前必读：
 *   1. 确认收款那段有**幂等保护**（v2.3.12）：先查 payment_records 里
 *      `source_id=本记录id AND category='collection'`，存在就不再插入。
 *      去掉它会让同一条催收重复计入实收，直接算错利润。
 *   2. `GET` 用的是 buildProjectScopeOrSelfClause（关联项目 ∪ 提交人），
 *      不是 visibleScope。财务(collection:read_all)看全部，其他人只看
 *      自己关联项目或自己提交的。
 *   3. 三个路由**都没有 checkPermission 权限点**，靠登录 + scope 收敛。
 *
 * 依赖 6 个：pool / getUserId / addLog / buildProjectScopeOrSelfClause /
 *            notifyReviewSubmitted / notifySubmitter
 */

module.exports = function registerCollectionRoutes(app, deps) {
  const {
    pool, getUserId, addLog, buildProjectScopeOrSelfClause,
    notifyReviewSubmitted, notifySubmitter,
  } = deps;

  // ==================== 催收记录 API ====================
  app.get('/api/collection-records', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const { project_id } = req.query;
      // P2：催收 = 关联项目 ∪ 提交人
      const scope = await buildProjectScopeOrSelfClause(userId, 'collection', 'cr', 'project_id', 'submitted_by');
      let sql = `SELECT cr.*, s.name as submitted_by_name, c.name as confirmed_by_name
                 FROM collection_records cr
                 LEFT JOIN employees s ON s.id = cr.submitted_by
                 LEFT JOIN employees c ON c.id = cr.confirmed_by
                 WHERE 1=1${scope.sql}`;
      const params = [...scope.params];
      if (project_id) { sql += ' AND cr.project_id = ?'; params.push(project_id); }
      sql += ' ORDER BY cr.id DESC';
      const [rows] = await pool.query(sql, params);
      res.json({ list: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/collection-records', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const { project_id, amount, collect_date, remark, images } = req.body;
      if (!project_id) return res.status(400).json({ error: '项目ID不能为空' });
      if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: '催收金额必须大于0' });
      if (!images || (Array.isArray(images) && images.length === 0)) return res.status(400).json({ error: '请上传凭证图片' });

      const [[project]] = await pool.query('SELECT name FROM projects WHERE id = ?', [project_id]);
      const project_name = project?.name || '';
      const imagesStr = Array.isArray(images) ? JSON.stringify(images) : (typeof images === 'string' ? images : '');

      const [result] = await pool.query(
        `INSERT INTO collection_records (project_id, amount, collect_date, remark, images, status, submitted_by, submitted_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, NOW())`,
        [project_id, amount, collect_date || null, remark || '', imagesStr, userId]
      );
      await addLog(userId, '', '新增', '催收记录', result.insertId, project_name, `催收金额：${amount}元`, req.ip);

      // 通知：新增催收记录 —— 2026-10-12 审核提交类 → 财务（purchase:finance）+ 提交人 + 项目经理
      notifyReviewSubmitted(
        'collection_created',
        project_id,
        `催收录入：¥${amount}`,
        `项目「${project_name}」录入催收记录，金额：${amount}元，请财务及时确认收款。`,
        result.insertId,
        'collection',
        userId,
        ['purchase:finance']
      ).catch(console.error);

      res.json({ id: result.insertId, message: '催收记录已录入' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/collection-records/:id/confirm', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const [[record]] = await pool.query('SELECT * FROM collection_records WHERE id = ?', [req.params.id]);
      if (!record) return res.status(404).json({ error: '记录不存在' });
      if (record.status !== 'pending') return res.status(400).json({ error: '该记录已确认' });

      const { confirmed_amount, confirmed_remark, confirmed_images } = req.body;
      const confAmt = confirmed_amount || record.amount;
      const confImages = Array.isArray(confirmed_images) ? JSON.stringify(confirmed_images) : (confirmed_images || '');

      await pool.query(
        `UPDATE collection_records SET status='confirmed', confirmed_by=?, confirmed_at=NOW(),
         confirmed_amount=?, confirmed_remark=?, confirmed_images=? WHERE id=?`,
        [userId, confAmt, confirmed_remark || '', confImages, req.params.id]
      );

      // 确认收款 → 自动在 payment_records 插入收入记录
      // v2.3.12 修：加幂等保护，同一条催收记录只入账一次
      const [[existCol]] = await pool.query(
        "SELECT id FROM payment_records WHERE source_id = ? AND category = 'collection' LIMIT 1",
        [req.params.id]
      );
      if (!existCol) {
        await pool.query(
          `INSERT INTO payment_records (project_id, type, category, amount, source_id, status, created_by, created_at)
           VALUES (?, 'income', 'collection', ?, ?, 'confirmed', ?, NOW())`,
          [record.project_id, confAmt, req.params.id, userId]
        );
      }

      const [[proj]] = await pool.query('SELECT name FROM projects WHERE id = ?', [record.project_id]);
      const project_name = proj?.name || `项目#${record.project_id}`;

      await addLog(userId, '', '确认收款', '催收记录', req.params.id, `项目#${record.project_id}`, `确认收款：${confAmt}元`, req.ip);

      // 通知：催收已确认收款 —— 2026-10-12 仅通知提交人（谁发起，反馈给谁）
      notifySubmitter(
        'collection_confirmed',
        record.project_id,
        `催收已确认收款：¥${confAmt}`,
        `项目「${project_name}」的催收记录已确认收款，金额：${confAmt}元。`,
        req.params.id,
        'collection',
        record.submitted_by
      ).catch(console.error);

      res.json({ message: '已确认收款' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
};
