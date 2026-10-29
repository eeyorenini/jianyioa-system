/**
 * 合同上传 / 审核 / 撤销 / 按项目查询（移动端）（2026-10-29 渐进拆分第 20 轮）
 *
 * 搬运自 server.js 原 1885-2097 行，搬入时 213 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerMobileContractRoutes(app, deps) {
  const {
    pool,
    getUserId,
    isAdmin,
    getUserPermissions,
    upload,
    addLog,
  } = deps;

  // ==================== 合同上传（移动端） ====================
  app.post('/api/contracts/upload', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      let { project_id, contract_amount, remark, attachment } = req.body;
      if (!project_id) return res.status(400).json({ error: '请先选择关联项目' });
      if (!contract_amount || parseFloat(contract_amount) <= 0) return res.status(400).json({ error: '请填写有效的合同金额' });

      // 2026-10-09 修复：附件统一存 JSON 数组（兼容老数据：如果是逗号分隔字符串则转 JSON 数组）
      if (attachment && typeof attachment === 'string' && !attachment.startsWith('[')) {
        attachment = JSON.stringify(attachment.split(',').filter(Boolean));
      } else if (Array.isArray(attachment)) {
        attachment = JSON.stringify(attachment);
      } else if (!attachment) {
        attachment = JSON.stringify([]);
      }

      const [[project]] = await pool.query('SELECT name FROM projects WHERE id = ?', [project_id]);
      const project_name = project?.name || '';

      // 插入合同记录，状态为待审核
      const [result] = await pool.query(
      `INSERT INTO contracts (project_id, contract_amount, review_status, submitted_by, created_by, creator_id, attachment, created_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, NOW())`,
        [project_id, contract_amount, userId, userId, userId, attachment]
      );

      await addLog(userId, '', '上传', '合同管理', result.insertId, project_name, `上传合同金额：${contract_amount}元`, req.ip);
      // 2026-10-12：审核提交类 → 通知合同审批人 + 提交人 + 项目经理
      notifyReviewSubmitted('contract_uploaded', project_id, `项目「${project_name}」上传合同`, `合同金额：${contract_amount}元`, result.insertId, 'contract', userId, ['contract:approve', 'project_contract:approve']).catch(console.error);

      res.json({ code: 0, id: result.insertId, message: '合同已提交，待审核' });
    } catch (err) {
      console.error('contracts upload error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/contract-reviews/pending — 待审核合同列表（移动端审核页用）
  // 仅返回真实提交的记录（有项目、有金额），排除历史迁移脏数据。
  app.get('/api/contract-reviews/pending', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await getUserPermissions(userId);
      const canApprove = perms.includes('contract:approve') || perms.includes('project_contract:approve') || await isAdmin(userId);
      if (!canApprove) return res.status(403).json({ error: '无合同审核权限' });

      const [rows] = await pool.query(
      `SELECT c.id, c.project_id, c.contract_amount, c.attachment, c.review_status, c.created_at,
              p.name AS project_name, e.name AS submitter_name
       FROM contracts c
       LEFT JOIN projects p ON p.id = c.project_id
       LEFT JOIN employees e ON e.id = c.submitted_by
       WHERE c.review_status = 'pending'
         AND c.project_id IS NOT NULL AND c.contract_amount > 0
       ORDER BY c.created_at DESC LIMIT 200`
      );
      res.json({ code: 0, data: rows });
    } catch (err) {
      console.error('contract-reviews pending error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 合同审核 ====================
  app.put('/api/contracts/:id/review', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await getUserPermissions(userId);
      const canApprove = perms.includes('contract:approve') || perms.includes('project_contract:approve') || await isAdmin(userId);
      if (!canApprove) {
        return res.status(403).json({ error: '无合同审核权限' });
      }
      const [[contract]] = await pool.query('SELECT * FROM contracts WHERE id = ?', [req.params.id]);
      if (!contract) return res.status(404).json({ error: '合同不存在' });
      if (contract.review_status && contract.review_status !== 'pending') {
        return res.status(400).json({ error: '该合同已审核过' });
      }

      const { action, remark } = req.body; // action: approve / reject
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });

      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      await pool.query(
        'UPDATE contracts SET review_status=?, reviewed_by=?, reviewed_at=NOW(), reviewer_remark=? WHERE id=?',
        [newStatus, userId, remark || '', req.params.id]
      );

      // 审核通过 → 自动在 payment_records 插入收入记录
      // v2.3.12 修：加幂等保护，同一份合同只产生一条收入记录
      if (action === 'approve' && contract.contract_amount) {
        const [[existCt]] = await pool.query(
          "SELECT id FROM payment_records WHERE source_id = ? AND category = 'contract' LIMIT 1",
          [req.params.id]
        );
        if (!existCt) {
          await pool.query(
          `INSERT INTO payment_records (project_id, type, category, amount, source_id, status, created_by, created_at)
           VALUES (?, 'income', 'contract', ?, ?, 'confirmed', ?, NOW())`,
            [contract.project_id, contract.contract_amount, req.params.id, userId]
          );
        }
      }

      const [[proj]] = await pool.query('SELECT name FROM projects WHERE id = ?', [contract.project_id]);
      const project_name = proj?.name || `项目#${contract.project_id}`;
      const [[submitter]] = await pool.query('SELECT name FROM employees WHERE id = ?', [contract.submitted_by]);
      const submitterName = submitter?.name || '';
      await addLog(userId, '', action === 'approve' ? '审核通过' : '审核拒绝', '合同管理', req.params.id, `项目#${contract.project_id}`, `合同审核${action === 'approve' ? '通过' : '拒绝'}${remark ? '：' + remark : ''}`, req.ip);

      // 通知：合同审核结果 —— 2026-10-12 仅通知提交人（谁发起，反馈给谁）
      notifySubmitter(
        action === 'approve' ? 'contract_approved' : 'contract_rejected',
        contract.project_id,
        action === 'approve' ? `合同审核通过` : `合同审核未通过`,
        action === 'approve'
          ? `您上传的合同（项目：${project_name}）已审核通过`
          : `您上传的合同（项目：${project_name}）未通过${remark ? '：' + remark : ''}`,
        req.params.id,
        'contract',
        contract.submitted_by
      ).catch(console.error);

      if (contract.submitted_by && contract.submitted_by !== userId) {
        // v2.3.4 修：用 messages 表（站内通知）
        const [[submitter]] = await pool.query('SELECT name FROM employees WHERE id = ?', [contract.submitted_by]);
        await pool.query(
          'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, \'sent\')',
          [contract.submitted_by, submitter ? submitter.name : '', action === 'approve' ? '合同已通过' : '合同未通过', action === 'approve' ? `您上传的合同已审核通过` : `您上传的合同未通过${remark ? '：' + remark : ''}`, action === 'approve' ? 'contract_approved' : 'contract_rejected', req.params.id, 'contract']
        );
      }
      res.json({ message: action === 'approve' ? '已通过' : '已拒绝' });
    } catch (err) {
      console.error('contract review error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 反审核：合同从 approved/rejected 退回 pending，删除对应的 payment_records 收入记录
  app.put('/api/contracts/:id/revert', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await getUserPermissions(userId);
      const canApprove = perms.includes('contract:approve') || perms.includes('project_contract:approve') || await isAdmin(userId);
      if (!canApprove) return res.status(403).json({ error: '无合同审核权限' });

      const [[contract]] = await pool.query('SELECT * FROM contracts WHERE id = ?', [req.params.id]);
      if (!contract) return res.status(404).json({ error: '合同不存在' });
      if (contract.review_status === 'pending') return res.status(400).json({ error: '当前就是待审核状态' });

      await pool.query(
        'UPDATE contracts SET review_status=?, reviewed_by=NULL, reviewed_at=NULL, reviewer_remark=NULL WHERE id=?',
        ['pending', req.params.id]
      );
      await pool.query(
        "DELETE FROM payment_records WHERE source_id=? AND type='income' AND category='contract'",
        [req.params.id]
      );
      res.json({ message: '已反审核' });
    } catch (err) {
      console.error('contract revert error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 合同列表（移动端按项目查） ====================
  // v2.3.6 hotfix 10-15：contracts 表 project_id 全 NULL 时，从 payment_records.category='contract'.confirmed
  // 兜底返回虚拟合同记录（标记 _inferred=true），让前端 contractSummary 能算对合同金额
  app.get('/api/contracts/by-project/:projectId', async (req, res) => {
    try {
      const [rows] = await pool.query(
      `SELECT c.*, reviewed.name as reviewed_by_name, submitter.name as submitted_by_name
       FROM contracts c
       LEFT JOIN employees reviewed ON reviewed.id = c.reviewed_by
       LEFT JOIN employees submitter ON submitter.id = c.submitted_by
       WHERE c.project_id = ?
       ORDER BY c.id DESC`,
        [req.params.projectId]
      );

      // 兜底：contracts 表为空时，从 payment_records 查合同金额
      if (rows.length === 0) {
        const [[paymentRow]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total, MAX(created_at) AS latest_at
         FROM payment_records
         WHERE project_id = ? AND category='contract' AND status='confirmed'`,
          [req.params.projectId]
        );
        const inferredAmount = Number(paymentRow?.total || 0);
        if (inferredAmount > 0) {
          rows.push({
            id: -1,
            project_id: Number(req.params.projectId),
            contract_amount: inferredAmount,
            review_status: 'approved',
            created_at: paymentRow?.latest_at || new Date().toISOString(),
            _inferred_from: 'payment_records',
            reviewed_by_name: null,
            submitted_by_name: null,
          });
        }
      }

      res.json({ code: 0, data: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

};
