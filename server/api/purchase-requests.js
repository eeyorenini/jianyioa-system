/**
 * 采购申请（含报销/财务受理/审批链路）（2026-10-29 渐进拆分第 18 轮）
 *
 * 搬运自 server.js 原 2737-3559 行，搬入时 823 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 *
 * ⚠️ 唯一改写：块内 `__dirname` 已全部替换为 `ROOT`。
 *    原文件中 __dirname 指 server/ 根（uploads、tmp 等路径），
 *    搬进 api/ 后会变成 server/api，路径全部错位，所以模块内补
 *    `const ROOT = path.join(__dirname, '..')` 还原成原语义。
 */
module.exports = function registerPurchaseRequestRoutes(app, deps) {
  const {
    pool,
    getCurrentUser,
    isAdmin,
    addLog,
    getUserId,
    checkPermission,
    checkAnyPermission,
    getUserPermissions,
    upload,
    path,
    fs,
    fixMojibake,
    getProjectRelatedUserIds,
    getUserIdsByPermission,
    getUserIdsByNotificationType,
    sendPurchaseNotification,
  } = deps;

  // 还原原 server.js 的 __dirname（server/ 根）
  const ROOT = path.join(__dirname, '..');

  app.get('/api/purchase-requests', async (req, res) => {
    try {
      const { project_id, status, applicant_id, page, limit, keyword } = req.query;
      const { userId } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const perms = await getUserPermissions(userId);
      const isAdminUser = await isAdmin(userId);
      // v2.3.12：purchase:view 在角色管理里没有对应勾选列，永远授不出去；
      //   统一并入 purchase:read_all（「全部数据」），老数据里的 purchase:view 继续兼容。
      const canViewAll = isAdminUser || perms.includes('purchase:read_all') || perms.includes('purchase:view');
      const canApprove = perms.includes('purchase:approve');
      const canFinance = perms.includes('purchase:finance');

      let sql = 'SELECT * FROM purchase_requests WHERE 1=1';
      let countSql = 'SELECT COUNT(*) as total FROM purchase_requests WHERE 1=1';
      const params = [];

      // 权限过滤：非管理员且无全视图权限，只能看自己提交的
      if (!canViewAll) {
        sql += ' AND applicant_id = ?';
        countSql += ' AND applicant_id = ?';
        params.push(userId);
      }

      if (project_id) { sql += ' AND project_id = ?'; countSql += ' AND project_id = ?'; params.push(project_id); }
      if (status) { sql += ' AND status = ?'; countSql += ' AND status = ?'; params.push(status); }
      if (applicant_id) { sql += ' AND applicant_id = ?'; countSql += ' AND applicant_id = ?'; params.push(applicant_id); }
      if (keyword) {
        sql += ' AND (project_name LIKE ? OR applicant_name LIKE ?)';
        countSql += ' AND (project_name LIKE ? OR applicant_name LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`);
      }

      const p = parseInt(page) || 1;
      const l = parseInt(limit) || 50;
      const offset = (p - 1) * l;

      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      const [countResult] = await pool.query(countSql, params);
      const [rows] = await pool.query(sql, [...params, l, offset]);

      // 附上 items
      if (rows.length > 0) {
        const ids = rows.map(r => r.id);
        const [items] = await pool.query(
        `SELECT * FROM purchase_request_items WHERE request_id IN (${ids.map(() => '?').join(',')})`,
          ids
        );
        const [reimbursements] = await pool.query(
        `SELECT * FROM purchase_reimbursements WHERE request_id IN (${ids.map(() => '?').join(',')})`,
          ids
        );
        rows.forEach(r => {
          r.items = items.filter(i => i.request_id === r.id);
          r.reimbursement = reimbursements.find(re => re.request_id === r.id) || null;
          // 附上权限标记（admin 跳过权限检查）
          r._canApprove = isAdminUser || canApprove;
          r._canFinance = isAdminUser || canFinance;
          r._isApplicant = r.applicant_id === userId;
          r._isAdmin = isAdminUser;
        });
      }

      res.json({ list: rows, total: countResult[0].total, page: p, limit: l });
    } catch (err) {
      console.error('purchase-requests list error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // POST /api/purchase-requests — 新建申请
  app.post('/api/purchase-requests', async (req, res) => {
    try {
      const { userId, userName } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const raw = req.body;
      // 兼容移动端单条格式 vs PC端items数组格式
      let items = raw.items;
      if (!items || !Array.isArray(items) || items.length === 0) {
        // 移动端单字段格式：从顶层字段构造单条item
        if (!raw.project_id) return res.status(400).json({ error: '请选择项目' });
        if (!raw.material_name) return res.status(400).json({ error: '请选择主材' });
        const qty = parseFloat(raw.quantity) || 0;
        const amt = parseFloat(raw.amount) || 0;
        items = [{
          material_id: raw.material_id || null,
          material_name: raw.material_name,
          unit: raw.unit || '',
          quantity: qty,
          unit_price: amt && qty ? (amt / qty) : 0,
          total_price: amt,
        }];
      }

      const supplier_id = raw.supplier_id || null;
      const supplier_name = raw.supplier_name || '';
      const total_amount = items.reduce((sum, i) => sum + (parseFloat(i.total_price) || 0), 0);
      const project_name = raw.project_name || '';
      const remark = raw.remark || '';
      const images = raw.images ? (typeof raw.images === 'string' ? raw.images : JSON.stringify(raw.images)) : '';

      const [result] = await pool.query(
      `INSERT INTO purchase_requests (project_id, project_name, supplier_id, supplier_name, applicant_id, applicant_name, total_amount, status, remark, images, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NOW())`,
        [raw.project_id, project_name, supplier_id, supplier_name, userId, userName, total_amount, remark, images]
      );
      const requestId = result.insertId;

      // 插入 items
      for (const item of items) {
        await pool.query(
        `INSERT INTO purchase_request_items (request_id, material_id, material_name, unit, quantity, unit_price, total_price, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [requestId, item.material_id || null, item.material_name || '', item.unit || '', item.quantity || 0, item.unit_price || 0, item.total_price || 0]
        );
      }

      await addLog(userId, '', '新增', '采购管理', requestId, project_name || '', `提交采购申请，金额：${total_amount}`, req.ip);

      // 通知有 purchase:approve 权限的人 + 订阅了 purchase_submit 的角色成员 + 项目相关人员
      const approverIds = await getUserIdsByPermission('purchase:approve');
      const subscribedIds = await getUserIdsByNotificationType('purchase_submit');
      const projectUserIds = await getProjectRelatedUserIds(raw.project_id);
      const allNotifyIds = [...new Set([...approverIds, ...subscribedIds, ...projectUserIds])];
      for (const uid of allNotifyIds) {
        if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
          const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
          await sendPurchaseNotification({
            userId: uid, userName: emp[0]?.name || '',
            title: '新采购申请待审核',
            content: `${userName} 提交了采购申请，项目：${project_name || ''}，金额：${total_amount}`,
            type: '采购', relatedId: requestId, relatedType: 'purchase_request'
          });
        }
      }

      res.json({ id: requestId, message: '提交成功' });
    } catch (err) {
      console.error('purchase-requests create error:', err);
      res.status(500).json({ error: '提交失败' });
    }
  });

  // 采购申请列表的项目名快照可能是空串（客户端提交时项目未选/取值失败），
  // 按 project_id 反查 projects 补齐。同类"快照字段为空"都按这个思路兜底，不要指望历史数据。
  async function attachPurchaseProjectName(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return rows;
    const need = [...new Set(
      rows.filter(r => !r.project_name && r.project_id).map(r => r.project_id)
    )];
    if (need.length === 0) return rows;
    try {
      const [prows] = await pool.query(
      `SELECT id, name FROM projects WHERE id IN (${need.map(() => '?').join(',')})`,
        need
      );
      const map = new Map(prows.map(p => [p.id, p.name]));
      rows.forEach(r => {
        if (!r.project_name && r.project_id && map.get(r.project_id)) {
          r.project_name = map.get(r.project_id);
        }
      });
    } catch (e) {
      console.warn('[purchase] 补项目名失败:', e.message);
    }
    return rows;
  }

  // GET /api/purchase-requests/my — 我的申请（applicant_id 过滤）
  // 权限用 checkAnyPermission：财务角色只有 purchase:read_all（无 purchase:read），
  // 而 checkPermission 是精确匹配、不认 read_all 覆盖 read，会导致财务点「我的申请」403。
  app.get('/api/purchase-requests/my', checkAnyPermission(['purchase:read', 'purchase:read_all', 'purchase:finance']), async (req, res) => {
    const { applicant_id, page, page_size } = req.query;
    const targetId = applicant_id || getUserId(req);
    const p = parseInt(page) || 1;
    const l = parseInt(page_size) || 50;
    const offset = (p - 1) * l;

    try {
      const [rows] = await pool.query(
      `SELECT pr.*, pri.quantity, pri.unit, pri.material_name
       FROM purchase_requests pr
       LEFT JOIN purchase_request_items pri ON pri.request_id = pr.id
       WHERE pr.applicant_id = ?
       ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`,
        [targetId, l, offset]
      );
      const [countResult] = await pool.query(
        'SELECT COUNT(*) as total FROM purchase_requests WHERE applicant_id = ?',
        [targetId]
      );
      // 2026-10-10：附上每条的 reimbursement 记录，让 list 卡片能展示报销凭证
      if (rows.length > 0) {
        const ids = rows.map(r => r.id);
        const [reim] = await pool.query(
        `SELECT request_id, images, actual_amount, financial_notes, confirmed_by_name, confirmed_at, reject_reason
         FROM purchase_reimbursements WHERE request_id IN (${ids.map(() => '?').join(',')})`,
          ids
        );
        const map = new Map(reim.map(r => [r.request_id, r]));
        rows.forEach(r => { r.reimbursement = map.get(r.id) || null; });
      }
      await attachPurchaseProjectName(rows);
      res.json({ list: rows, total: countResult[0].total, page: p, page_size: l });
    } catch (err) {
      console.error('purchase-requests my error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // GET /api/purchase-requests/pending — 待审批列表（status=pending）
  app.get('/api/purchase-requests/pending', checkPermission('purchase:approve'), async (req, res) => {
    const { page, page_size } = req.query;
    const p = parseInt(page) || 1;
    const l = parseInt(page_size) || 50;
    const offset = (p - 1) * l;

    try {
      const [rows] = await pool.query(
      `SELECT pr.*, pri.quantity, pri.unit, pri.material_name
       FROM purchase_requests pr
       LEFT JOIN purchase_request_items pri ON pri.request_id = pr.id
       WHERE pr.status = ?
       ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`,
        ['pending', l, offset]
      );
      const [countResult] = await pool.query(
        'SELECT COUNT(*) as total FROM purchase_requests WHERE status = ?',
        ['pending']
      );
      await attachPurchaseProjectName(rows);
      res.json({ list: rows, total: countResult[0].total, page: p, page_size: l });
    } catch (err) {
      console.error('purchase-requests pending error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // GET /api/purchase-requests/reimburse — 报销中列表（status=reimbursing）
  app.get('/api/purchase-requests/reimburse', checkPermission('purchase:finance'), async (req, res) => {
    const { page, page_size } = req.query;
    const p = parseInt(page) || 1;
    const l = parseInt(page_size) || 50;
    const offset = (p - 1) * l;

    try {
      const [rows] = await pool.query(
      `SELECT pr.*, pri.quantity, pri.unit, pri.material_name
       FROM purchase_requests pr
       LEFT JOIN purchase_request_items pri ON pri.request_id = pr.id
       WHERE pr.status = ?
       ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`,
        ['reimbursing', l, offset]
      );
      const [countResult] = await pool.query(
        'SELECT COUNT(*) as total FROM purchase_requests WHERE status = ?',
        ['reimbursing']
      );
      await attachPurchaseProjectName(rows);
      res.json({ list: rows, total: countResult[0].total, page: p, page_size: l });
    } catch (err) {
      console.error('purchase-requests reimburse error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // GET /api/purchase-requests/to-reimburse — 申请人待上传报销列表（status=approved + 未上传报销）
  app.get('/api/purchase-requests/to-reimburse', checkPermission('purchase:write'), async (req, res) => {
    const { page, page_size } = req.query;
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const p = parseInt(page) || 1;
    const l = parseInt(page_size) || 50;
    const offset = (p - 1) * l;

    try {
      const [rows] = await pool.query(
      `SELECT pr.*, pri.quantity, pri.unit, pri.material_name
       FROM purchase_requests pr
       LEFT JOIN purchase_request_items pri ON pri.request_id = pr.id
       WHERE pr.applicant_id = ?
         AND pr.status = 'approved'
         AND NOT EXISTS (SELECT 1 FROM purchase_reimbursements WHERE request_id = pr.id)
       ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`,
        [userId, l, offset]
      );
      const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM purchase_requests pr
       WHERE pr.applicant_id = ?
         AND pr.status = 'approved'
         AND NOT EXISTS (SELECT 1 FROM purchase_reimbursements WHERE request_id = pr.id)`,
        [userId]
      );
      await attachPurchaseProjectName(rows);
      res.json({ list: rows, total: countResult[0].total, page: p, page_size: l });
    } catch (err) {
      console.error('purchase-requests to-reimburse error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // GET /api/purchase-requests/finance — 财务确认列表
  // v2.3.12 改：支持 status 筛选，并单独返回 pending_count 供角标使用
  //   status=pending（默认）→ finance_confirmed 待上传回执（真正的待办）
  //   status=done          → reimbursed 已报销（终态，历史）
  //   status=all           → 两者都要
  // 角标 pending_count 只算 finance_confirmed。此前前端拿 total（含 reimbursed）当角标，
  // 导致已报销完成的记录永远挂在角标上，数字消不掉。
  app.get('/api/purchase-requests/finance', checkPermission('purchase:finance'), async (req, res) => {
    const { page, page_size, status } = req.query;
    const p = parseInt(page) || 1;
    const l = parseInt(page_size) || 50;
    const offset = (p - 1) * l;

    let statuses;
    if (status === 'done') statuses = ['reimbursed'];
    else if (status === 'all') statuses = ['finance_confirmed', 'reimbursed'];
    else statuses = ['finance_confirmed'];
    const placeholders = statuses.map(() => '?').join(',');

    try {
      const [rows] = await pool.query(
      `SELECT pr.*, pri.quantity, pri.unit, pri.material_name
       FROM purchase_requests pr
       LEFT JOIN purchase_request_items pri ON pri.request_id = pr.id
       WHERE pr.status IN (${placeholders})
       ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`,
        [...statuses, l, offset]
      );
      const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM purchase_requests WHERE status IN (${placeholders})`,
        statuses
      );
      const [[{ pending_count }]] = await pool.query(
        "SELECT COUNT(*) as pending_count FROM purchase_requests WHERE status = 'finance_confirmed'"
      );
      await attachPurchaseProjectName(rows);
      res.json({ list: rows, total, pending_count, page: p, page_size: l });
    } catch (err) {
      console.error('purchase-requests finance error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // GET /api/purchase-requests/:id — 详情
  app.get('/api/purchase-requests/:id', async (req, res) => {
    try {
      const { userId } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: '申请不存在' });

      const [items] = await pool.query('SELECT * FROM purchase_request_items WHERE request_id = ?', [req.params.id]);
      const [reimbursements] = await pool.query('SELECT * FROM purchase_reimbursements WHERE request_id = ?', [req.params.id]);

      const perms = await getUserPermissions(userId);
      const isAdminUser = await isAdmin(userId);
      const canApprove = isAdminUser || perms.includes('purchase:approve');
      const canFinance = isAdminUser || perms.includes('purchase:finance');

      const record = rows[0];
      record.items = items;
      record.reimbursement = reimbursements[0] || null;
      // 2026-10-10：权限/身份标记统一用 can_xxx（前端 detail.vue 读的是这个键名）
      record._canApprove = canApprove;  // 兼容两种字段名
      record._canFinance = canFinance;
      record.can_approve = canApprove;
      record.can_finance_confirm = canFinance;
      record.is_admin = await isAdmin(userId);
      record.is_applicant = record.applicant_id === userId;

      res.json(record);
    } catch (err) {
      console.error('purchase-requests get error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // PUT /api/purchase-requests/:id — 修改申请（仅待审核状态）
  app.put('/api/purchase-requests/:id', async (req, res) => {
    try {
      const { userId, userName } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
      if (rows[0].status !== 'pending') return res.status(400).json({ error: '只有待审核状态可以修改' });
      if (rows[0].applicant_id !== userId) return res.status(403).json({ error: '只能修改自己的申请' });

      const { project_name, items, remark } = req.body;
      const total_amount = items.reduce((sum, i) => sum + (parseFloat(i.total_price) || 0), 0);

      await pool.query(
      `UPDATE purchase_requests SET project_name=?, total_amount=?, remark=?, updated_at=NOW() WHERE id=?`,
        [project_name || rows[0].project_name, total_amount, remark || '', req.params.id]
      );

      // 删除旧items，插入新items
      await pool.query('DELETE FROM purchase_request_items WHERE request_id = ?', [req.params.id]);
      for (const item of items) {
        await pool.query(
        `INSERT INTO purchase_request_items (request_id, material_id, material_name, unit, quantity, unit_price, total_price, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [req.params.id, item.material_id || null, item.material_name || '', item.unit || '', item.quantity || 0, item.unit_price || 0, item.total_price || 0]
        );
      }

      await addLog(userId, '', '编辑', '采购管理', req.params.id, project_name || '', `修改采购申请，金额：${total_amount}`, req.ip);
      res.json({ message: '修改成功' });
    } catch (err) {
      console.error('purchase-requests update error:', err);
      res.status(500).json({ error: '修改失败' });
    }
  });

  // DELETE /api/purchase-requests/:id — 删除申请（仅申请人；pending/rejected/未上传报销的 approved 可删）
  app.delete('/api/purchase-requests/:id', async (req, res) => {
    try {
      const { userId } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
      if (rows[0].applicant_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除' });

      // 读取报销记录，状态 approved 但已上传报销则禁止删除（避免误删财务凭证）
      const [reimRows] = await pool.query('SELECT id, images FROM purchase_reimbursements WHERE request_id = ?', [req.params.id]);
      const allowedStatuses = ['pending', 'rejected', 'approved'];
      if (!allowedStatuses.includes(rows[0].status)) {
        return res.status(400).json({ error: `当前状态（${rows[0].status}）不可删除` });
      }
      if (rows[0].status === 'approved' && reimRows.length > 0) {
        return res.status(400).json({ error: '已上传报销凭证的申请不可删除' });
      }

      // 删前 unlink 报销凭证物理文件
      for (const r of reimRows) {
        let arr = [];
        try { arr = Array.isArray(r.images) ? r.images : JSON.parse(r.images || '[]'); } catch {}
        for (const p of arr) {
          if (!p) continue;
          const m = String(p).match(/\/uploads\/logs\/([^/?#]+)$/);
          if (m) {
            const abs = path.join(ROOT, 'uploads', 'logs', m[1]);
            fs.unlink(abs, (e) => { if (e && e.code !== 'ENOENT') console.error('unlink fail:', abs, e.message); });
          }
        }
      }

      await pool.query('DELETE FROM purchase_request_items WHERE request_id = ?', [req.params.id]);
      await pool.query('DELETE FROM purchase_reimbursements WHERE request_id = ?', [req.params.id]);
      await pool.query('DELETE FROM purchase_requests WHERE id = ?', [req.params.id]);

      await addLog(userId, '', '删除', '采购管理', req.params.id, rows[0].project_name || '', `删除采购申请`, req.ip);
      res.json({ message: '删除成功' });
    } catch (err) {
      console.error('purchase-requests delete error:', err);
      res.status(500).json({ error: '删除失败' });
    }
  });

  // PUT /api/purchase-requests/:id/approve — 审核（通过/拒绝）
  app.put('/api/purchase-requests/:id/approve', async (req, res) => {
    try {
      const { userId, userName } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const perms = await getUserPermissions(userId);
      if (!perms.includes('purchase:approve') && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无审核权限' });
      }

      const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: '申请不存在' });

      const { action, reason } = req.body; // action: 'approve' | 'reject'
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });

      const newStatus = action === 'approve' ? 'approved' : 'rejected';

      await pool.query(
      `UPDATE purchase_requests SET status=?, rejection_reason=?, updated_at=NOW() WHERE id=?`,
        [newStatus, action === 'reject' ? (reason || '') : '', req.params.id]
      );

      await addLog(userId, '', action === 'approve' ? '审核通过' : '审核拒绝', '采购管理', req.params.id, rows[0].project_name || '', `采购审核${action === 'approve' ? '通过' : '拒绝'}${reason ? '，原因：' + reason : ''}`, req.ip);

      // 通知申请人 + 订阅了该通知类型的角色成员 + 项目相关人员
      const record = rows[0];
      const subscribedIds = await getUserIdsByNotificationType(action === 'approve' ? 'purchase_approved' : 'purchase_rejected');
      const projectUserIds = await getProjectRelatedUserIds(record.project_id);
      const allNotifyIds = new Set([record.applicant_id, ...subscribedIds, ...projectUserIds]);
      for (const uid of allNotifyIds) {
        if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
          const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
          if (action === 'approve') {
            await sendPurchaseNotification({
              userId: uid, userName: emp[0]?.name || '',
              title: '采购申请已通过',
              content: `您的采购申请（项目：${record.project_name}，金额：${record.total_amount}）已审核通过，请上传报销单`,
              type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
            });
          } else {
            await sendPurchaseNotification({
              userId: uid, userName: emp[0]?.name || '',
              title: '采购申请未通过',
              content: `您的采购申请（项目：${record.project_name}）未通过${reason ? '：' + reason : ''}，可重新提交`,
              type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
            });
          }
        }
      }

      res.json({ message: action === 'approve' ? '审核通过' : '已拒绝' });
    } catch (err) {
      console.error('purchase-requests approve error:', err);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // PUT /api/purchase-requests/:id/unapprove — 反审核（仅申请人，状态 approved 且未上传报销时回退到 pending）
  app.put('/api/purchase-requests/:id/unapprove', async (req, res) => {
    try {
      const { userId, userName } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
      if (rows[0].applicant_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '只能反审核自己的申请' });
      if (rows[0].status !== 'approved') return res.status(400).json({ error: '只有已通过的申请可以反审核' });

      // 已上传报销凭证则禁止反审核（避免漏单）
      const [reimRows] = await pool.query('SELECT id FROM purchase_reimbursements WHERE request_id = ?', [req.params.id]);
      if (reimRows.length > 0) return res.status(400).json({ error: '已上传报销凭证，不可反审核' });

      await pool.query(
      `UPDATE purchase_requests SET status='pending', rejection_reason=NULL, updated_at=NOW() WHERE id=?`,
        [req.params.id]
      );

      await addLog(userId, '', '反审核', '采购管理', req.params.id, rows[0].project_name || '', `反审核，状态从 approved 回退到 pending`, req.ip);

      // 通知有 purchase:approve 权限的人 + 项目相关人员
      const approverIds = await getUserIdsByPermission('purchase:approve');
      const projectUserIds = await getProjectRelatedUserIds(rows[0].project_id);
      const allUnapproveIds = [...new Set([...approverIds, ...projectUserIds])];
      for (const uid of allUnapproveIds) {
        if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
          const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
          await sendPurchaseNotification({
            userId: uid, userName: emp[0]?.name || '',
            title: '采购申请反审核待重审',
            content: `${userName} 撤回了项目：${rows[0].project_name} 的采购申请（已通过），已退回待审核队列`,
            type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
          });
        }
      }

      res.json({ message: '已反审核，状态回到待审核' });
    } catch (err) {
      console.error('purchase-requests unapprove error:', err);
      res.status(500).json({ error: '反审核失败' });
    }
  });

  // POST /api/purchase-requests/:id/reimburse — 上传报销单（申请人）
  // 支持两种方式：1) multipart/form-data（files字段）2) JSON body { images: ["url1","url2"] }
  app.post('/api/purchase-requests/:id/reimburse', upload.array('files', 10), async (req, res) => {
    try {
      // v2.3.6-hotfix2：修复中文文件名乱码（upload.array 后是 req.files 数组）
      if (Array.isArray(req.files)) {
        req.files.forEach(f => { f.originalname = fixMojibake(f.originalname); });
      }
      const { userId, userName } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
      if (rows[0].applicant_id !== userId) return res.status(403).json({ error: '只能上传自己的报销单' });
      if (rows[0].status !== 'approved') return res.status(400).json({ error: '只有在审核通过后才能上传报销单' });

      const { actual_amount, financial_notes, images: imagesJson } = req.body;

      // 处理图片：优先从文件上传获取，其次从 JSON body 解析
      let images = (req.files || []).map(f => `/uploads/logs/${f.filename}`);
      if (images.length === 0 && imagesJson) {
        try { images = JSON.parse(imagesJson); } catch { images = []; }
      }

      // 检查是否已有报销记录
      const [existing] = await pool.query('SELECT id FROM purchase_reimbursements WHERE request_id = ?', [req.params.id]);
      if (existing.length > 0) {
        await pool.query(
        `UPDATE purchase_reimbursements SET images=?, actual_amount=?, financial_notes=?, created_at=NOW() WHERE request_id=?`,
          [JSON.stringify(images), actual_amount || 0, financial_notes || '', req.params.id]
        );
      } else {
        await pool.query(
        `INSERT INTO purchase_reimbursements (request_id, images, actual_amount, financial_notes, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
          [req.params.id, JSON.stringify(images), actual_amount || 0, financial_notes || '']
        );
      }

      // 更新状态为 reimbursing（报销中）
      await pool.query(`UPDATE purchase_requests SET status='reimbursing', updated_at=NOW() WHERE id=?`, [req.params.id]);

      await addLog(userId, '', '上传报销', '采购管理', req.params.id, rows[0].project_name || '', `上传报销单，实付金额：${actual_amount || 0}`, req.ip);

      // 通知有 purchase:finance 权限的人 + 订阅了 purchase_reimbursing 的角色成员 + 项目相关人员
      const financeIds = await getUserIdsByPermission('purchase:finance');
      const subscribedIds = await getUserIdsByNotificationType('purchase_reimbursing');
      const projectUserIds = await getProjectRelatedUserIds(rows[0].project_id);
      const allNotifyIds = [...new Set([...financeIds, ...subscribedIds, ...projectUserIds])];
      for (const uid of allNotifyIds) {
        if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
          const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
          await sendPurchaseNotification({
            userId: uid, userName: emp[0]?.name || '',
            title: '有报销单待核对',
            content: `${userName} 已上传报销单，项目：${rows[0].project_name}，实付金额：${actual_amount || 0}，请及时核对`,
            type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
          });
        }
      }

      res.json({ message: '上传成功' });
    } catch (err) {
      console.error('purchase-requests reimburse error:', err);
      res.status(500).json({ error: '上传失败' });
    }
  });

  // PUT /api/purchase-requests/:id/finance-reject — 财务驳回报销（打回给员工重新上传）
  app.put('/api/purchase-requests/:id/finance-reject', async (req, res) => {
    try {
      const { userId, userName } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const perms = await getUserPermissions(userId);
      if (!perms.includes('purchase:finance') && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无财务操作权限' });
      }

      const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
      if (rows[0].status !== 'reimbursing') return res.status(400).json({ error: '状态不允许财务驳回' });

      const { reason } = req.body;

      // 更新报销记录填入驳回原因
      await pool.query(
      `UPDATE purchase_reimbursements SET reject_reason=? WHERE request_id=?`,
        [reason || '', req.params.id]
      );

      // 状态打回 approved，员工可重新上传
      await pool.query(`UPDATE purchase_requests SET status='approved', updated_at=NOW() WHERE id=?`, [req.params.id]);

      await addLog(userId, '', '财务驳回', '采购管理', req.params.id, rows[0].project_name || '', `财务驳回报销，原因：${reason || '未填写'}`, req.ip);

      // 通知申请人 + 订阅了 purchase_rejected 的角色成员 + 项目相关人员
      const subscribedIds = await getUserIdsByNotificationType('purchase_rejected');
      const projectUserIds = await getProjectRelatedUserIds(rows[0].project_id);
      const allNotifyIds = new Set([rows[0].applicant_id, ...subscribedIds, ...projectUserIds]);
      for (const uid of allNotifyIds) {
        if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
          const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
          await sendPurchaseNotification({
            userId: uid, userName: emp[0]?.name || '',
            title: '报销单被驳回',
            content: `您的报销单（项目：${rows[0].project_name}）被财务驳回${reason ? '：' + reason : ''}，请重新上传`,
            type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
          });
        }
      }

      res.json({ message: '已驳回' });
    } catch (err) {
      console.error('purchase-requests finance-reject error:', err);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // POST /api/purchase-requests/:id/finance-accept — 财务受理（输入金额，进入受理中）
  app.post('/api/purchase-requests/:id/finance-accept', async (req, res) => {
    try {
      const { userId, userName } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const perms = await getUserPermissions(userId);
      if (!perms.includes('purchase:finance') && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无财务确认权限' });
      }

      const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
      if (rows[0].status !== 'reimbursing') return res.status(400).json({ error: '状态不允许财务受理' });

      const { actual_amount = 0, financial_notes = '' } = req.body;
      const amount = req.body.finance_amount ?? actual_amount;

      // 更新报销记录
      await pool.query(
      `UPDATE purchase_reimbursements SET actual_amount=?, financial_notes=?, confirmed_by=?, confirmed_by_name=?, confirmed_at=NOW() WHERE request_id=?`,
        [amount, financial_notes, userId, userName, req.params.id]
      );

      // 更新申请状态为财务受理中
      await pool.query(`UPDATE purchase_requests SET status='finance_confirmed', actual_amount=?, updated_at=NOW() WHERE id=?`, [amount, req.params.id]);

      await addLog(userId, '', '财务受理', '采购管理', req.params.id, rows[0].project_name || '', `财务受理报销申请，实付：${amount}`, req.ip);

      // 通知申请人 + 订阅了 purchase_finance_confirmed 的角色成员 + 项目相关人员
      const subscribedIds = await getUserIdsByNotificationType('purchase_finance_confirmed');
      const projectUserIds = await getProjectRelatedUserIds(rows[0].project_id);
      const allNotifyIds = new Set([rows[0].applicant_id, ...subscribedIds, ...projectUserIds]);
      for (const uid of allNotifyIds) {
        if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
          const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
          await sendPurchaseNotification({
            userId: uid, userName: emp[0]?.name || '',
            title: '采购报销已受理',
            content: `采购申请（项目：${rows[0].project_name}）已受理，等待上传报销回执`,
            type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
          });
        }
      }

      res.json({ message: '财务受理成功' });
    } catch (err) {
      console.error('purchase-requests finance-accept error:', err);
      res.status(500).json({ error: '受理失败' });
    }
  });

  // POST /api/purchase-requests/:id/finance-confirm — 财务最终确认（上传回执，完结）
  app.post('/api/purchase-requests/:id/finance-confirm', async (req, res) => {
    try {
      const { userId, userName } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const perms = await getUserPermissions(userId);
      if (!perms.includes('purchase:finance') && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无财务确认权限' });
      }

      const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
      if (rows[0].status !== 'finance_confirmed') return res.status(400).json({ error: '状态不允许财务确认' });

      const { images = '' } = req.body;

      // 更新报销回执图片
      await pool.query(
      `UPDATE purchase_requests SET status='reimbursed', finance_images=?, updated_at=NOW() WHERE id=?`,
        [images, req.params.id]
      );

      await addLog(userId, '', '财务确认', '采购管理', req.params.id, rows[0].project_name || '', `财务确认报销完成，回执图片已上传`, req.ip);

      // 通知申请人 + 原审核人 + 订阅了 purchase_reimbursed 的角色成员 + 项目相关人员
      const subscribedIds = await getUserIdsByNotificationType('purchase_reimbursed');
      const projectUserIds = await getProjectRelatedUserIds(rows[0].project_id);
      const notifyIds = new Set([rows[0].applicant_id, ...await getUserIdsByPermission('purchase:approve'), ...subscribedIds, ...projectUserIds]);
      for (const uid of notifyIds) {
        if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
          const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
          await sendPurchaseNotification({
            userId: uid, userName: emp[0]?.name || '',
            title: '采购已报销完成',
            content: `采购申请（项目：${rows[0].project_name}）已报销完成，实付金额：${rows[0].actual_amount}`,
            type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
          });
        }
      }

      res.json({ message: '财务确认完成' });
    } catch (err) {
      console.error('purchase-requests finance-confirm error:', err);
      res.status(500).json({ error: '确认失败' });
    }
  });

  // POST /api/purchase-requests/:id/resubmit — 重新提交（驳回后）
  app.post('/api/purchase-requests/:id/resubmit', async (req, res) => {
    try {
      const { userId, userName } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
      if (rows[0].applicant_id !== userId) return res.status(403).json({ error: '只能重新提交自己的申请' });
      if (rows[0].status !== 'rejected') return res.status(400).json({ error: '只能重新提交被拒绝的申请' });

      await pool.query(`UPDATE purchase_requests SET status='pending', rejection_reason='', updated_at=NOW() WHERE id=?`, [req.params.id]);

      // 通知有 purchase:approve 权限的人 + 项目相关人员
      const approverIds = await getUserIdsByPermission('purchase:approve');
      const projectUserIds = await getProjectRelatedUserIds(rows[0].project_id);
      const allResubmitIds = [...new Set([...approverIds, ...projectUserIds])];
      for (const uid of allResubmitIds) {
        if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
          const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
          await sendPurchaseNotification({
            userId: uid, userName: emp[0]?.name || '',
            title: '采购申请重新提交',
            content: `${userName} 重新提交了采购申请，项目：${rows[0].project_name || ''}，金额：${rows[0].total_amount}`,
            type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
          });
        }
      }

      res.json({ message: '重新提交成功' });
    } catch (err) {
      console.error('purchase-requests resubmit error:', err);
      res.status(500).json({ error: '重新提交失败' });
    }
  });

};
