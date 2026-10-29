/**
 * 调试权限查询 / 材料订单审批 / 移动端首页统计（2026-10-29 渐进拆分第 22 轮）
 *
 * 搬运自 server.js 原 1387-1642 行，搬入时 256 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerMobileMiscRoutes(app, deps) {
  const {
    pool,
    db,
    getUserId,
    isAdmin,
    getUserPermissions,
    addLog,
    RECTIFY_OPEN_SQL,
  } = deps;

  // GET /api/debug-perms —— 按手机号批量查员工的角色与完整 permissions 数组
  //
  // v2.5.3 鉴权加固：原本**零校验**，公网任何人都能按手机号枚举任意员工的
  // 姓名、手机号、角色名和完整权限数组（等于把内部权限模型整个抖出去，
  // 配合已知的明文 header 身份就能精确构造越权调用）。
  //
  // 保留接口而不是删除：排障「某员工登录后看不到某菜单」时，比手写 SQL 快得多。
  // 前端零调用方（PC/H5/小程序全搜过），加门槛不影响任何页面。
  app.get('/api/debug-perms', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '仅管理员可查询' });
    const phones = (req.query.phones || '').split(',');
    if (!phones.length) return res.json({ error: '需要 phones 参数' });
    try {
      const placeholders = phones.map(() => '?').join(',');
      const emps = await db.prepare(
      `SELECT e.id, e.name, e.phone, r.name as role_name, r.code as role_code, r.permissions
       FROM employees e LEFT JOIN roles r ON e.role_id = r.id
       WHERE e.phone IN (${placeholders})`
      ).all(...phones);
      const result = emps.map(e => ({
        id: e.id, name: e.name, phone: e.phone,
        role_name: e.role_name, role_code: e.role_code,
        permissions: e.permissions ? (typeof e.permissions === 'string' ? JSON.parse(e.permissions) : e.permissions) : []
      }));
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ================================================================
  // 采购单审核流程（2026-10-10 新增，仿派工审核）
  // ================================================================

  // GET /api/material-orders/my — 我的采购单（按 applicant_id 过滤）
  app.get('/api/material-orders/my', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const { page = 1, page_size = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(page_size);
      const [rows] = await pool.query(
      `SELECT m.*, p.name as project_name, e.name as applicant_name
       FROM material_orders m
       LEFT JOIN projects p ON m.project_id = p.id
       LEFT JOIN employees e ON m.applicant_id = e.id
       WHERE m.applicant_id = ?
       ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
        [userId, parseInt(page_size), offset]
      );
      const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM material_orders WHERE applicant_id = ?', [userId]);
      res.json({ list: rows, total });
    } catch (err) {
      console.error('material-orders my error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // GET /api/material-orders/pending — 待审核采购单（需 purchase:approve 权限）
  app.get('/api/material-orders/pending', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await getUserPermissions(userId);
      if (!perms.includes('purchase:approve') && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无审核权限' });
      }
      const { page = 1, page_size = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(page_size);
      const [rows] = await pool.query(
      `SELECT m.*, p.name as project_name, e.name as applicant_name
       FROM material_orders m
       LEFT JOIN projects p ON m.project_id = p.id
       LEFT JOIN employees e ON m.applicant_id = e.id
       WHERE m.status = 'pending'
       ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
        [parseInt(page_size), offset]
      );
      const [[{ total }]] = await pool.query("SELECT COUNT(*) as total FROM material_orders WHERE status = 'pending'");
      res.json({ list: rows, total });
    } catch (err) {
      console.error('material-orders pending error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // GET /api/material-orders/by-status?status=approved — 按状态查询（前端"进行中/已完成"用）
  app.get('/api/material-orders/by-status', async (req, res) => {
    try {
      const { status, page = 1, page_size = 20 } = req.query;
      if (!status) return res.status(400).json({ error: '缺少 status 参数' });
      const offset = (parseInt(page) - 1) * parseInt(page_size);
      const [rows] = await pool.query(
      `SELECT m.*, p.name as project_name, e.name as applicant_name
       FROM material_orders m
       LEFT JOIN projects p ON m.project_id = p.id
       LEFT JOIN employees e ON m.applicant_id = e.id
       WHERE m.status = ?
       ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
        [status, parseInt(page_size), offset]
      );
      const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM material_orders WHERE status = ?', [status]);
      res.json({ list: rows, total });
    } catch (err) {
      console.error('material-orders by-status error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // PUT /api/material-orders/:id/approve — 审核通过/驳回
  app.put('/api/material-orders/:id/approve', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await getUserPermissions(userId);
      if (!perms.includes('purchase:approve') && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无审核权限' });
      }
      const [[record]] = await pool.query('SELECT * FROM material_orders WHERE id = ?', [req.params.id]);
      if (!record) return res.status(404).json({ error: '采购单不存在' });
      const { action, reason } = req.body;
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      await pool.query(
        'UPDATE material_orders SET status=?, reject_reason=?, updated_at=NOW() WHERE id=?',
        [newStatus, action === 'reject' ? (reason || '') : null, req.params.id]
      );
      await addLog(userId, '', action === 'approve' ? '审核通过' : '审核拒绝', '采购管理', req.params.id, record.material_name || '', `采购审核${action === 'approve' ? '通过' : '拒绝'}${reason ? '，原因：' + reason : ''}`, req.ip);
      // 通知申请人
      if (record.applicant_id && record.applicant_id !== userId) {
        // v2.3.4 修：用 messages 表（站内通知）
        const [[applicant]] = await pool.query('SELECT name FROM employees WHERE id = ?', [record.applicant_id]);
        const msg = action === 'approve'
          ? `您的采购申请（${record.material_name}）已审核通过。`
          : `您的采购申请（${record.material_name}）未通过${reason ? '：' + reason : ''}。`;
        await pool.query(
          'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, \'sent\')',
          [record.applicant_id, applicant ? applicant.name : '', action === 'approve' ? '采购申请已通过' : '采购申请未通过', msg, action === 'approve' ? 'purchase_approved' : 'purchase_rejected', req.params.id, 'purchase']
        );
      }
      res.json({ message: action === 'approve' ? '审核通过' : '已拒绝' });
    } catch (err) {
      console.error('material-orders approve error:', err);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // PUT /api/material-orders/:id/complete — 确认到货/完成
  app.put('/api/material-orders/:id/complete', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const [[record]] = await pool.query('SELECT * FROM material_orders WHERE id = ?', [req.params.id]);
      if (!record) return res.status(404).json({ error: '采购单不存在' });
      await pool.query("UPDATE material_orders SET status='completed', updated_at=NOW() WHERE id=?", [req.params.id]);
      await addLog(userId, '', '确认到货', '采购管理', req.params.id, record.material_name || '', '采购到货确认', req.ip);
      res.json({ message: '已确认到货' });
    } catch (err) {
      console.error('material-orders complete error:', err);
      res.status(500).json({ error: '操作失败' });
    }
  });


  app.get('/api/mobile/home-stats', async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. 进行中项目数：所有"非终止态"（开工准备/进行中/施工中/暂停等都算在跑；只排除已收尾/已取消/已交付/已完成）
      const inProgress = Number((await db.prepare(
        "SELECT COUNT(*) as count FROM projects WHERE status NOT IN ('已完成','已交付','已取消','已完工','已结算','作废','archived','completed','cancelled') AND status IS NOT NULL AND status <> ''"
      ).get())?.count) || 0;

      // 2. 逾期节点数（plan_end_date < 今天 且 未完成）
      // ⚠️ 2026-10-23：改读 project_progress_nodes（项目详情/节点管理真正读写的表）。
      //    project_stages 已是废弃历史表，两套数据对不上会导致首页与项目里不一致。
      const overdue = Number((await db.prepare(
        "SELECT COUNT(*) as count FROM project_progress_nodes WHERE plan_end_date IS NOT NULL AND plan_end_date < ? AND (status IS NULL OR status NOT IN ('completed', '已完成'))"
      ).get(today))?.count) || 0;

      // 3. 待整改巡检（rectification_issues 未完成口径，与待办中心/首页统计一致）
      const pendingInspect = Number((await db.prepare(
      `SELECT COUNT(*) as count FROM rectification_issues ri WHERE ${RECTIFY_OPEN_SQL}`
      ).get())?.count) || 0;

      // 4. 待回款金额 = 已签订合同的总金额 - 已收款（payment1+payment2+payment3）
      const payRow = (await db.prepare(
        "SELECT COALESCE(SUM(total_amount - COALESCE(payment1,0) - COALESCE(payment2,0) - COALESCE(payment3,0)), 0) as total FROM contracts WHERE status = '已签订'"
      ).get()) || { total: 0 };
      const pendingPay = Number(payRow.total) || 0;

      // 5. 待办事项（按优先级混合：节点待审核 + 巡检待整改 + 财务待审核，最多 5 条）
      const todos = [];
      // 节点待审核（读 project_progress_nodes）
      try {
        const stages = await db.prepare(
          "SELECT ps.id, ps.node_name AS stage_name, ps.project_id, p.name as project_name FROM project_progress_nodes ps LEFT JOIN projects p ON ps.project_id = p.id WHERE ps.status IN ('pending', 'in_progress') ORDER BY ps.created_at DESC LIMIT 5"
        ).all();
        for (const s of stages.slice(0, 2)) {
          todos.push({
            id: 'stage-' + s.id,
            title: `项目「${s.project_name || '未知'}」${s.stage_name}待审核`,
            project: s.project_name || '',
            time: '待处理',
            priority: 'warning',
            type: 'node',
          });
        }
      } catch (_) {}
      // 巡检待整改（rectification_issues 未完成口径）
      try {
        const inspects = await db.prepare(
        `SELECT ri.id, COALESCE(NULLIF(ri.project_name, ''), p.name) AS project_name, ri.issue_desc AS issues
           FROM rectification_issues ri
           LEFT JOIN projects p ON p.id = ri.project_id
          WHERE ${RECTIFY_OPEN_SQL}
          ORDER BY ri.created_at DESC LIMIT 3`
        ).all();
        for (const i of inspects.slice(0, 2)) {
          todos.push({
            id: 'inspect-' + i.id,
            title: `巡检问题待整改：${(i.issues || '').substring(0, 20) || '需检查'}`,
            project: i.project_name || '',
            time: '今天',
            priority: 'danger',
            type: 'inspect',
          });
        }
      } catch (_) {}

      // 6. 逾期预警（project_progress_nodes 里 plan_end_date < today 的节点 + 项目名 + 逾期天数）
      let warnings = [];
      try {
        const warns = await db.prepare(
        `SELECT ps.id, ps.node_name AS stage_name, p.name as project_name, p.id as project_id,
                DATEDIFF(?, ps.plan_end_date) as days
         FROM project_progress_nodes ps
         LEFT JOIN projects p ON ps.project_id = p.id
         WHERE ps.plan_end_date IS NOT NULL AND ps.plan_end_date < ? AND (ps.status IS NULL OR ps.status NOT IN ('completed', '已完成'))
         ORDER BY ps.plan_end_date ASC LIMIT 5`
        ).all(today, today);
        warnings = warns.map(w => ({
          id: w.project_id,
          name: w.project_name || '未知项目',
          node: w.stage_name || '',
          days: w.days || 0,
        }));
      } catch (_) {}

      res.json({
        stats: {
          inProgress,
          overdue,
          pendingInspect,
          pendingPay: '¥' + (pendingPay >= 10000 ? (pendingPay / 10000).toFixed(1) + '万' : String(Math.round(pendingPay))),
          pendingPayRaw: pendingPay,
        },
        todos: todos.slice(0, 5),
        warnings,
      });
    } catch (err) {
      console.error('[mobile/home-stats] error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
};
