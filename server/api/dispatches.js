/**
 * 派工管理（2026-10-29 渐进拆分第 15 轮）
 *
 * 搬运自 server.js 原 7966-8204 行，搬入时 239 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerDispatchRoutes(app, deps) {
  const {
    pool,
    getUserId,
    addLog,
    isAdmin,
    getUserPermissions,
    checkPermission,
    buildProjectScopeOrSelfClause,
    notifyReviewSubmitted,
    notifySubmitter,
  } = deps;

  // ==================== 派工管理 ====================
  app.get('/api/dispatches', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const { status, project_id } = req.query;
      // P2 §7.3：派工列表按关联项目 + 提交人(申请单) 收窄
      const scope = await buildProjectScopeOrSelfClause(userId, 'dispatch', 'd', 'project_id', 'applicant_id');
      let sql = `SELECT d.*, e.name as applicant_name FROM dispatches d LEFT JOIN employees e ON d.applicant_id = e.id`;
      const params = [];
      const conditions = [];
      if (status) {
        conditions.push('d.status = ?');
        params.push(status);
      }
      if (project_id) {
        conditions.push('d.project_id = ?');
        params.push(project_id);
      }
      // 把 §7.3 条件拼到 WHERE（去掉前缀的 AND，改为直接用 conditions 串接）
      if (scope.sql) {
        conditions.push(scope.sql.replace(/^ AND/, ''));
        params.push(...scope.params);
      }
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY d.created_at DESC';
      const [rows] = await pool.query(sql, params);
      res.json(rows);
    } catch (err) {
      console.error('dispatches list error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  app.post('/api/dispatches', checkPermission('dispatch:write'), async (req, res) => {
    try {
      const userId = getUserId(req);
      const { project_id, project_name, content, location, worker, fee, start_date, requirement } = req.body;
      const [result] = await pool.query(
        'INSERT INTO dispatches (project_id, project_name, content, location, worker, fee, start_date, requirement, status, applicant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [project_id, project_name || '', content, location || '', worker || '', fee || '', start_date || null, requirement || '', 'pending', userId || 0]
      );
      await addLog(userId, '', '新增', '派工管理', result.insertId, content, `派工内容: ${content}`, req.ip);
      // 2026-10-12：审核提交类 → 通知派工审批人 + 提交人 + 项目经理（不再广播全部关联人/客户）
      notifyReviewSubmitted('dispatch_created', project_id,
        `新派工通知：${content}`,
        `派工内容：${content || ''}，工人：${worker || ''}，项目：${project_name || ''}，请及时处理。`,
        result.insertId, 'dispatch', userId, ['dispatch:approve']
      ).catch(console.error);
      res.json({ id: result.insertId, message: '添加成功' });
    } catch (err) {
      console.error('dispatches create error:', err);
      res.status(500).json({ error: '添加失败' });
    }
  });

  // GET /api/dispatches/my — 我的派工单
  app.get('/api/dispatches/my', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const { page = 1, page_size = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(page_size);
      const [rows] = await pool.query('SELECT d.*, e.name as applicant_name FROM dispatches d LEFT JOIN employees e ON d.applicant_id = e.id WHERE d.applicant_id = ? ORDER BY d.created_at DESC LIMIT ? OFFSET ?', [userId, parseInt(page_size), offset]);
      const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM dispatches WHERE applicant_id = ?', [userId]);
      res.json({ list: rows, total });
    } catch (err) {
      console.error('dispatches my error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // GET /api/dispatches/pending — 待审核派工单（需 dispatch:approve 权限）
  app.get('/api/dispatches/pending', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await getUserPermissions(userId);
      if (!perms.includes('dispatch:approve') && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无审核权限' });
      }
      const { page = 1, page_size = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(page_size);
      const [rows] = await pool.query('SELECT d.*, e.name as applicant_name FROM dispatches d LEFT JOIN employees e ON d.applicant_id = e.id WHERE d.status = ? ORDER BY d.created_at DESC LIMIT ? OFFSET ?', ['pending', parseInt(page_size), offset]);
      const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM dispatches WHERE status = ?', ['pending']);
      res.json({ list: rows, total });
    } catch (err) {
      console.error('dispatches pending error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // PUT /api/dispatches/:id/approve — 审核通过/驳回
  app.put('/api/dispatches/:id/approve', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await getUserPermissions(userId);
      if (!perms.includes('dispatch:approve') && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无审核权限' });
      }
      const [[record]] = await pool.query('SELECT * FROM dispatches WHERE id = ?', [req.params.id]);
      if (!record) return res.status(404).json({ error: '派工单不存在' });
      const { action, reason } = req.body;
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      await pool.query('UPDATE dispatches SET status=?, updated_at=NOW() WHERE id=?', [newStatus, req.params.id]);

      // 审核通过 → 自动在 payment_records 插入待确认支出记录
      // v2.3.12 修：加幂等保护。此前同一派工单被重复点「审核通过」（前端连点/重试）会插多条
      // 收支记录，柏林山水派工 #7 就因此重复入账 2 条 200 元。改为先查是否已有记录再插。
      if (action === 'approve' && record.fee && parseFloat(record.fee) > 0) {
        const [[exist]] = await pool.query(
          "SELECT id FROM payment_records WHERE source_id = ? AND category = 'dispatch' LIMIT 1",
          [req.params.id]
        );
        if (!exist) {
          await pool.query(
            `INSERT INTO payment_records (project_id, type, category, amount, source_id, status, created_by, created_at)
             VALUES (?, 'expense', 'dispatch', ?, ?, 'pending', ?, NOW())`,
            [record.project_id, record.fee, req.params.id, userId]
          );
        }
      }

      await addLog(userId, '', action === 'approve' ? '审核通过' : '审核拒绝', '派工管理', req.params.id, record.content || '', `派工审核${action === 'approve' ? '通过' : '拒绝'}${reason ? '，原因：' + reason : ''}`, req.ip);
      const allNotifyIds = new Set([record.applicant_id]);
      for (const uid of allNotifyIds) {
        if (uid && uid !== userId) {
          const [[emp]] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
          const msg = action === 'approve'
            ? `您的派工申请（项目：${record.project_name}）已审核通过，请准备施工。`
            : `您的派工申请（项目：${record.project_name}）未通过${reason ? '：' + reason : ''}，可重新提交。`;
          // v2.3.4 修：用 messages 表（站内通知），不是 notifications 表（外发短信）
          await pool.query(
            'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, \'sent\')',
            [uid, emp ? emp.name : '', action === 'approve' ? '派工申请已通过' : '派工申请未通过', msg, action === 'approve' ? 'dispatch_approved' : 'dispatch_rejected', req.params.id, 'dispatch']
          );
        }
      }
      res.json({ message: action === 'approve' ? '审核通过' : '已拒绝' });
    } catch (err) {
      console.error('dispatches approve error:', err);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // PUT /api/dispatches/:id/complete — 确认完工
  app.put('/api/dispatches/:id/complete', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const [[record]] = await pool.query('SELECT * FROM dispatches WHERE id = ?', [req.params.id]);
      if (!record) return res.status(404).json({ error: '派工单不存在' });
      await pool.query('UPDATE dispatches SET status=?, updated_at=NOW() WHERE id=?', ['completed', req.params.id]);
      await addLog(userId, '', '确认完工', '派工管理', req.params.id, record.content || '', `派工完工确认`, req.ip);
      res.json({ message: '已确认完工' });
    } catch (err) {
      console.error('dispatches complete error:', err);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // POST /api/dispatches/:id/revert — 反审核（2026-10-10 新增）
  // 把派工单状态从 approved/rejected/completed 改回 pending（仅限审核员/管理员）
  app.post('/api/dispatches/:id/revert', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await getUserPermissions(userId);
      if (!perms.includes('dispatch:approve') && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无审核权限' });
      }
      const [[record]] = await pool.query('SELECT * FROM dispatches WHERE id = ?', [req.params.id]);
      if (!record) return res.status(404).json({ error: '派工单不存在' });
      if (record.status === 'pending') {
        return res.status(400).json({ error: '已经是待审核状态' });
      }
      await pool.query("UPDATE dispatches SET status='pending', updated_at=NOW() WHERE id=?", [req.params.id]);
      // v2.3.12 修：反审核要把该派工产生的「待确认」收支记录一并撤销，
      // 否则重新审核通过时又会插一条，导致重复入账。已确认的记录保留（财务凭证不动）。
      const [revoked] = await pool.query(
        "DELETE FROM payment_records WHERE source_id = ? AND category = 'dispatch' AND status = 'pending'",
        [req.params.id]
      );
      await addLog(userId, '', '反审核', '派工管理', req.params.id, record.content || '', `反审核：派工单从 ${record.status} 改回待审核${revoked.affectedRows ? `，撤销待确认收支 ${revoked.affectedRows} 条` : ''}`, req.ip);
      res.json({ message: '已反审核' });
    } catch (err) {
      console.error('dispatches revert error:', err);
      res.status(500).json({ error: '操作失败' });
    }
  });

  app.put('/api/dispatches/:id', checkPermission('dispatch:write'), async (req, res) => {
    try {
      const userId = getUserId(req);
      const { status, content, location, worker, fee, start_date, requirement } = req.body;
      const [[d]] = await pool.query('SELECT content, status, applicant_id FROM dispatches WHERE id = ?', [req.params.id]);
      const dName = d ? d.content : req.params.id;
      await pool.query('UPDATE dispatches SET status=?, content=?, location=?, worker=?, fee=?, start_date=?, requirement=? WHERE id=?', [status, content, location, worker, fee, start_date, requirement, req.params.id]);
      await addLog(userId, '', '编辑', '派工管理', req.params.id, dName, `更新派工: ${dName}`, req.ip);
      if (d && d.status !== status) {
        // 2026-10-12：审核结果类 → 仅通知派工申请人（谁发起，反馈给谁）
        notifySubmitter('dispatch_status_changed', null,
          `派工状态变更：${dName}`,
          `派工「${dName}」状态已变更为「${status}」，请知悉。`,
          parseInt(req.params.id), 'dispatch', d.applicant_id
        ).catch(console.error);
      }
      res.json({ message: '更新成功' });
    } catch (err) {
      console.error('dispatches update error:', err);
      res.status(500).json({ error: '更新失败' });
    }
  });

  app.delete('/api/dispatches/:id', checkPermission('dispatch:delete'), async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
      const [[d]] = await pool.query('SELECT content FROM dispatches WHERE id = ?', [req.params.id]);
      const dName = d ? d.content : req.params.id;
      await pool.query('DELETE FROM dispatches WHERE id = ?', [req.params.id]);
      // v2.3.12 修：删除派工单时清掉它产生的收支记录，避免留下找不到来源单据的孤儿记录。
      // 柏林山水派工 #6 被删后，payment_records 里那条 2000 元「派工」支出就一直悬着。
      const [orphan] = await pool.query(
        "DELETE FROM payment_records WHERE source_id = ? AND category = 'dispatch'",
        [req.params.id]
      );
      await addLog(userId, '', '删除', '派工管理', req.params.id, dName, `删除派工: ${dName}${orphan.affectedRows ? `，连带清理收支记录 ${orphan.affectedRows} 条` : ''}`, req.ip);
      res.json({ message: '删除成功' });
    } catch (err) {
      console.error('dispatches delete error:', err);
      res.status(500).json({ error: '删除失败' });
    }
  });

};
