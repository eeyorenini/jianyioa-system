'use strict';
/**
 * 统一待办中心（只读聚合）
 * ---------------------------------------------------------------
 * 2026-10-29 从 server.js 整体抽出（渐进拆分第 5 步，622 行）。
 * 代码逐行搬迁、逻辑零改动，只把外部依赖改成参数注入。
 *
 * 设计：把各模块「待我处理」的条目统一收口，按权限过滤后返回；
 *       仅做只读聚合，不修改任何现有接口与审批业务逻辑。
 *
 * 两个接口：
 *   GET /api/todo/count   待办数量汇总（首页角标）
 *   GET /api/todo/center  待办中心列表（分 tab 聚合，只读）
 *
 * ⚠️ 关键口径：计数与列表必须同一作用域（见 __todoScope）。
 *    未配 read_all 时按「关联项目 ∪ 提交人=我」过滤；否则徽章数字会把
 *    用户实际看不到的条目也算进去（徽章 6 / 列表 4 的老问题）。
 *
 * 注入的依赖（全部来自 server.js，本模块不自己连库）：
 *   pool               mysql2 连接池
 *   permCore           middleware/perm（relatedProjectIds 等）
 *   getUserId          req → 用户 id
 *   isAdmin            是否管理员
 *   getUserPermissions userId → 权限码数组
 *
 * 注：目录叫 api/ 不叫 routes/ —— 旧的 server/routes/ 是 2026-09 那次半成品
 *     拆分的遗留物（从未被 require），已于 2026-10-29 归档，不要混为一谈。
 */
const { RECTIFY_OPEN_SQL } = require('../lib/rectify');

module.exports = function registerTodoRoutes(app, deps) {
  const { pool, permCore, getUserId, isAdmin, getUserPermissions } = deps;

  function __todoScope(userId, perms, admin, relatedIds) {
    const fullScope = {
      purchase: admin || perms.includes('purchase:read_all'),
      dispatch: admin || perms.includes('dispatch:read_all'),
      contract: admin || perms.includes('contract:read_all') || perms.includes('project_contract:read_all'),
      contract_change: admin || perms.includes('contract_change:read_all'),
      inspection: admin || perms.includes('inspection:read_all'),
    };
    // 待办子项 SQL 子句：当 fullScope=false 时，project_id 必须在 relatedIds 内，
    // 或"提交人=我"（采购 applicant_name / 派工 applicant_id）。
    // 返回 { sql, params }：sql 已含前导 " AND "；params 是占位符对应的参数数组。
    const buildScope = (mod, extraCol = 'project_id') => {
      if (fullScope[mod]) return { sql: '', params: [] };
      const ids = (relatedIds && relatedIds.length) ? relatedIds : [-1];
      const placeholders = ids.map(() => '?').join(',');
      const submitters = {
        purchase: "`pr`.applicant_name = (SELECT name FROM employees WHERE id = ?)",
        dispatch: "`d`.applicant_id = ?",
        contract: "`c`.submitted_by = ?",
        contract_change: "`cc`.submitted_by = ?",
        // 2026-10-23：巡检整改的三类人要看待办 ——
        //   ① 项目关联人（原有）② 提交问题的监理（原有）③ 被派为整改负责人的工长（新增）
        // 派单在 POST 时按 projects.foreman_id 自动落 responsible_id，这里按它精确推送。
        inspection: "(`ri`.creator_id = ? OR `ri`.responsible_id = ?)",
      }[mod] || null;
      if (submitters) {
        return {
          sql: ` AND (${extraCol} IN (${placeholders}) OR ${submitters})`,
          params: [...ids, userId, userId],
        };
      }
      return {
        sql: ` AND ${extraCol} IN (${placeholders})`,
        params: [...ids],
      };
    };
    return { fullScope, buildScope };
  }

  async function __todoCounts(userId, perms, admin) {
    const can = (p) => admin || (perms || []).includes(p);
    // 2026-10-12：计数与列表同口径 —— 按"关联项目 ∪ 提交人"过滤
    const relatedIds = admin ? null : Array.from(await permCore.relatedProjectIds(userId));
    const { buildScope } = __todoScope(userId, perms, admin, relatedIds);
    const out = {};
    // 1) 采购待审核（purchase:approve）
    if (can('purchase:approve')) {
      const sc = buildScope('purchase');
      const [[r]] = await pool.query("SELECT COUNT(*) AS c FROM purchase_requests pr WHERE pr.status='pending'" + sc.sql, sc.params);
      out.purchase_approve = { key: 'purchase_approve', label: '采购待审核', icon: '📦', type: 'purchase_approve', count: Number(r.c) || 0 };
    }
    // 2) 报销待确认 / 待上传回执（purchase:finance）
    if (can('purchase:finance')) {
      const scA = buildScope('purchase');
      const [[a]] = await pool.query("SELECT COUNT(*) AS c FROM purchase_requests pr WHERE pr.status='reimbursing'" + scA.sql, scA.params);
      out.purchase_reimburse = { key: 'purchase_reimburse', label: '报销待确认', icon: '🧾', type: 'purchase_reimburse', count: Number(a.c) || 0 };
      const scB = buildScope('purchase');
      const [[b]] = await pool.query("SELECT COUNT(*) AS c FROM purchase_requests pr WHERE pr.status='finance_confirmed'" + scB.sql, scB.params);
      out.purchase_receipt = { key: 'purchase_receipt', label: '待上传回执', icon: '🏦', type: 'purchase_receipt', count: Number(b.c) || 0 };
    }
    // 3) 通用审批（approver_ids 含当前用户，与权限无关，天然同口径）
    {
      const [[r]] = await pool.query("SELECT COUNT(*) AS c FROM approvals WHERE status='待审批' AND FIND_IN_SET(?, approver_ids)", [String(userId)]);
      out.approval = { key: 'approval', label: '通用审批', icon: '📝', type: 'approval', count: Number(r.c) || 0 };
    }
    // 4) 派工待审核（dispatch:approve）
    if (can('dispatch:approve')) {
      const sc = buildScope('dispatch');
      const [[r]] = await pool.query("SELECT COUNT(*) AS c FROM dispatches d WHERE d.status='pending'" + sc.sql, sc.params);
      out.dispatch = { key: 'dispatch', label: '派工待审核', icon: '👷', type: 'dispatch', count: Number(r.c) || 0 };
    }
    // 5) 合同待审核（主合同上传后待审）
    //    注意：contracts 表里有历史迁移产生的脏数据（project_id 为空、金额为 0），
    //    它们不是真实提交，必须过滤掉，否则待办角标会出现几十条虚假数字。
    if (can('contract:approve') || can('project_contract:approve')) {
      const sc = buildScope('contract');
      const [[r]] = await pool.query(
        "SELECT COUNT(*) AS c FROM contracts c WHERE c.review_status='pending' AND c.project_id IS NOT NULL AND c.contract_amount > 0" + sc.sql,
        sc.params
      );
      out.contract_approve = { key: 'contract_approve', label: '合同待审核', icon: '📄', type: 'contract_approve', count: Number(r.c) || 0 };
    }
    // 6) 增减项待审核（contract_change:approve）
    if (can('contract_change:approve')) {
      const sc = buildScope('contract_change');
      const [[r]] = await pool.query("SELECT COUNT(*) AS c FROM contract_changes cc WHERE cc.status='pending'" + sc.sql, sc.params);
      out.change_approve = { key: 'change_approve', label: '增减项待审核', icon: '🧮', type: 'change_approve', count: Number(r.c) || 0 };
    }
    // 7) 催收未确认收款（项目相关人可见，2026-10-23 扩围）
    //    ⚠️ 口径变更：初版只推给提交人（submitted_by=我），业务上不对 ——
    //       "这笔款还没收到"应该让**整个项目组**都知道（项目经理/监理/工长/设计师/创建人），
    //       不能只让提交催收的那个人自己盯着。
    //    新口径：project_id ∈ 我的关联项目 ∪ 我提交的；admin / collection:read_all / finance:read_all 看全部。
    //    财务确认收款（status='confirmed'）后，所有人列表里同时消失。
    {
      const colAllScope = admin || perms.includes('collection:read_all') || perms.includes('finance:read_all');
      let sql = "SELECT COUNT(*) AS c FROM collection_records cr WHERE cr.status='pending'";
      const params = [];
      if (!colAllScope) {
        // relatedIds 为空时不能拼 IN ()（语法错），退回"仅自己提交的"
        if (relatedIds && relatedIds.length) {
          sql += ` AND (cr.project_id IN (${relatedIds.map(() => '?').join(',')}) OR cr.submitted_by = ?)`;
          params.push(...relatedIds, userId);
        } else {
          sql += ' AND cr.submitted_by = ?';
          params.push(userId);
        }
      }
      const [[r]] = await pool.query(sql, params);
      out.collection_pending = { key: 'collection_pending', label: '催收未确认收款', icon: '📞', type: 'collection_pending', count: Number(r.c) || 0 };
    }
    return out;
  }

  // ============================================================
  // 项目相关待办计数（节点即将到期 / 待整改 / 我的派工）
  // 2026-10-21 新增：/api/todo/center 的 home.sections 一直有这三类事项，
  //   但 /api/todo/count 只统计审批流（采购/报销/合同/增减项/审批/派工审核），
  //   导致 PC 侧边栏「待办中心」角标为 0、而首页待办却有条目。
  //   这里把 home.sections 的口径单独抽出来，供 count 与 center 共用，保证
  //   「角标数字 = 列表条数」。
  //   ⚠️ 与 center 里 sections 的查询条件必须保持一字不差（含 LIMIT 之外的 WHERE）。
  // ============================================================
  async function __todoProjectCounts(userId, perms, admin, relatedIds) {
    const projectAllScope = (admin || perms.includes('project:read_all'))
      && !perms.includes('finance:read_all');
    // ⚠️ 必须与 /api/todo/center 里的 hasRelated/homePh/homeProjectParams 一字不差：
    //    无关联项目时 homePh 用字面量 -1（无占位符），参数列表返回空数组，
    //    否则占位符与参数个数对不上（曾报 `near '?)'`）。
    const hasRelated = !!(relatedIds && relatedIds.length);
    const homePh = hasRelated ? relatedIds.map(() => '?').join(',') : '-1';
    const projectFilter = (col = 'p.id') => projectAllScope ? '' : ` AND ${col} IN (${homePh})`;
    const projectParams = () => (projectAllScope ? [] : (hasRelated ? [...relatedIds] : []));
    const today = new Date().toISOString().split('T')[0];
    const todayPlus3 = new Date(Date.now() + 3 * 86400 * 1000).toISOString().split('T')[0];

    // 1) 节点提前 3 天到期（读 project_progress_nodes，与项目详情/节点管理同源）
    //    2026-10-23 修复：原读 project_stages（废弃表）→ 与列表、与项目里看到的节点全对不上。
    const [[stageDue]] = await pool.query(
      `SELECT COUNT(*) AS c FROM project_progress_nodes ps
       JOIN projects p ON p.id = ps.project_id
       WHERE ps.plan_end_date IS NOT NULL AND ps.plan_end_date != ''
         AND (ps.status IS NULL OR ps.status NOT IN ('completed', '已完成'))
         AND ps.plan_end_date BETWEEN ? AND ?${projectFilter('p.id')}`,
      [today, todayPlus3, ...projectParams()]
    );
    // 2) 待整改巡检（作用域与列表完全一致，口径用模块级 RECTIFY_OPEN_SQL）
    const sc = __todoScope(userId, perms, admin, relatedIds).buildScope('inspection');
    const [[rectify]] = await pool.query(
      `SELECT COUNT(*) AS c FROM rectification_issues ri
       WHERE ${RECTIFY_OPEN_SQL}${sc.sql}`,
      sc.params
    );
    // 3) 我的派工（与 center 同条件）
    const [[myDispatch]] = await pool.query(
      `SELECT COUNT(*) AS c FROM dispatches d
       WHERE (d.applicant_id = ? OR d.worker LIKE ?) AND d.status IN ('pending', 'in_progress', '已派工')`,
      [userId, '%' + userId + '%']
    );
    return {
      stage_due: Number(stageDue.c) || 0,
      inspect_rectify: Number(rectify.c) || 0,
      dispatch_mine: Number(myDispatch.c) || 0,
    };
  }

  const __fmtTodoTime = (t) => {
    if (!t) return '';
    try { return String(t).replace('T', ' ').substring(0, 16); } catch { return String(t); }
  };

  // GET /api/todo/count — 待办数量汇总（用于首页角标）
  app.get('/api/todo/count', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await getUserPermissions(userId);
      const admin = await isAdmin(userId);
      const map = await __todoCounts(userId, perms, admin);
      // 2026-10-21：补项目相关事项（节点到期/待整改/我的派工），与 /api/todo/center
      // 的 home.sections 同口径 —— 否则 PC 侧边栏角标 0、首页待办却有内容。
      const relatedIds = admin ? null : Array.from(await permCore.relatedProjectIds(userId));
      const project = await __todoProjectCounts(userId, perms, admin, relatedIds);
      const total = Object.values(map).reduce((s, g) => s + (g.count || 0), 0)
        + Object.values(project).reduce((s, n) => s + (Number(n) || 0), 0);
      res.json({ code: 0, total, groups: map, project });
    } catch (e) {
      console.error('[todo/count] error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/todo/center — 待办中心列表（按权限分组返回）
  // 2026-10-10 扩展：同时返回 home 区块（按角色过滤的统计 + 项目相关事项 + 逾期预警）
  // 2026-10-11 P2 §7.3 改造：采购/派工/合同/增减项/巡检整改 5 类按"提交人 ∪ 关联项目 ∪ read_all"过滤。
  app.get('/api/todo/center', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await getUserPermissions(userId);
      const admin = await isAdmin(userId);
      const can = (p) => admin || (perms || []).includes(p);
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
      const counts = await __todoCounts(userId, perms, admin);
      // §7.3：项目关联人（创建人/设计师/监理/工长/项目经理/客户）
      const relatedIds = admin ? null : Array.from(await permCore.relatedProjectIds(userId));
      // 计数与列表共用同一作用域（2026-10-12 抽取为 __todoScope）
      const { fullScope, buildScope } = __todoScope(userId, perms, admin, relatedIds);
      const groups = [];

      // 1) 采购待审核
      if (can('purchase:approve')) {
        const sc = buildScope('purchase');
        const [rows] = await pool.query(
          `SELECT pr.id, pr.project_name, pr.applicant_name, pr.total_amount, pr.created_at,
                  (SELECT GROUP_CONCAT(pri.material_name SEPARATOR '、') FROM purchase_request_items pri WHERE pri.request_id = pr.id) AS material_name
           FROM purchase_requests pr WHERE pr.status = 'pending'${sc.sql}
           ORDER BY pr.created_at DESC LIMIT ?`, [...sc.params, limit]);
        groups.push({
          ...counts.purchase_approve,
          items: rows.map(r => ({
            id: r.id, type: 'purchase_approve',
            title: r.material_name || '采购申请',
            subtitle: [r.project_name, r.applicant_name ? ('申请人：' + r.applicant_name) : ''].filter(Boolean).join(' · '),
            amount: r.total_amount != null ? Number(r.total_amount) : null,
            time: __fmtTodoTime(r.created_at),
            url: `/pages/purchase/detail?id=${r.id}`
          }))
        });
      }

      // 2) 报销待确认
      if (can('purchase:finance')) {
        const sc = buildScope('purchase');
        const [rows] = await pool.query(
          `SELECT pr.id, pr.project_name, pr.applicant_name, pr.total_amount, pr.created_at,
                  (SELECT GROUP_CONCAT(pri.material_name SEPARATOR '、') FROM purchase_request_items pri WHERE pri.request_id = pr.id) AS material_name
           FROM purchase_requests pr WHERE pr.status = 'reimbursing'${sc.sql}
           ORDER BY pr.created_at DESC LIMIT ?`, [...sc.params, limit]);
        groups.push({
          ...counts.purchase_reimburse,
          items: rows.map(r => ({
            id: r.id, type: 'purchase_reimburse',
            title: r.material_name || '采购报销',
            subtitle: [r.project_name, r.applicant_name ? ('申请人：' + r.applicant_name) : ''].filter(Boolean).join(' · '),
            amount: r.total_amount != null ? Number(r.total_amount) : null,
            time: __fmtTodoTime(r.created_at),
            url: `/pages/purchase/detail?id=${r.id}`
          }))
        });

        // 3) 待上传回执（财务）
        const sc2 = buildScope('purchase');
        const [rows2] = await pool.query(
          `SELECT pr.id, pr.project_name, pr.applicant_name, pr.total_amount, pr.created_at,
                  (SELECT GROUP_CONCAT(pri.material_name SEPARATOR '、') FROM purchase_request_items pri WHERE pri.request_id = pr.id) AS material_name
           FROM purchase_requests pr WHERE pr.status = 'finance_confirmed'${sc2.sql}
           ORDER BY pr.created_at DESC LIMIT ?`, [...sc2.params, limit]);
        groups.push({
          ...counts.purchase_receipt,
          items: rows2.map(r => ({
            id: r.id, type: 'purchase_receipt',
            title: r.material_name || '采购回执',
            subtitle: [r.project_name, r.applicant_name ? ('申请人：' + r.applicant_name) : ''].filter(Boolean).join(' · '),
            amount: r.total_amount != null ? Number(r.total_amount) : null,
            time: __fmtTodoTime(r.created_at),
            url: `/pages/purchase/detail?id=${r.id}`
          }))
        });
      }

      // 4) 通用审批
      {
        const [rows] = await pool.query(
          `SELECT id, title, type, applicant_name, amount, created_at
           FROM approvals WHERE status = '待审批' AND FIND_IN_SET(?, approver_ids)
           ORDER BY created_at DESC LIMIT ?`, [String(userId), limit]);
        groups.push({
          ...counts.approval,
          items: rows.map(r => ({
            id: r.id, type: 'approval',
            title: r.title || '审批申请',
            subtitle: [r.type, r.applicant_name ? ('申请人：' + r.applicant_name) : ''].filter(Boolean).join(' · '),
            amount: r.amount != null ? Number(r.amount) : null,
            time: __fmtTodoTime(r.created_at),
            url: `/pages/approval/detail?id=${r.id}&tab=todo`
          }))
        });
      }

      // 5) 派工待审核
      if (can('dispatch:approve')) {
        const sc = buildScope('dispatch');
        const [rows] = await pool.query(
          `SELECT id, project_id, project_name, content, worker, created_at
           FROM dispatches d WHERE d.status = 'pending'${sc.sql}
           ORDER BY d.created_at DESC LIMIT ?`, [...sc.params, limit]);
        groups.push({
          ...counts.dispatch,
          items: rows.map(r => ({
            id: r.id, type: 'dispatch',
            title: r.content || '派工单',
            subtitle: [r.project_name, r.worker].filter(Boolean).join(' · '),
            amount: null,
            time: __fmtTodoTime(r.created_at),
            url: `/pages/dispatch/detail?id=${r.id}`
          }))
        });
      }

      // 6) 合同待审核（主合同上传后待审）—— 过滤历史脏数据 + §7.3 关联过滤
      if (can('contract:approve') || can('project_contract:approve')) {
        const sc = buildScope('contract');
        const [rows] = await pool.query(
          `SELECT c.id, c.project_id, c.contract_amount, c.attachment, c.created_at,
                  p.name AS project_name, e.name AS submitter_name
           FROM contracts c
           LEFT JOIN projects p ON p.id = c.project_id
           LEFT JOIN employees e ON e.id = c.submitted_by
           WHERE c.review_status = 'pending'
             AND c.project_id IS NOT NULL AND c.contract_amount > 0${sc.sql}
           ORDER BY c.created_at DESC LIMIT ?`, [...sc.params, limit]);
        groups.push({
          ...counts.contract_approve,
          items: rows.map(r => ({
            id: r.id, type: 'contract_approve',
            title: r.project_name || ('合同#' + r.id),
            subtitle: ['合同审核', r.submitter_name ? ('提交人：' + r.submitter_name) : ''].filter(Boolean).join(' · '),
            amount: r.contract_amount != null ? Number(r.contract_amount) : null,
            time: __fmtTodoTime(r.created_at),
            url: `/pages/contracts/approval?tab=contract&id=${r.id}`
          }))
        });
      }

      // 7) 增减项待审核
      if (can('contract_change:approve')) {
        const sc = buildScope('contract_change');
        const [rows] = await pool.query(
          `SELECT cc.id, cc.project_id, cc.change_type, cc.title, cc.amount, cc.submitted_at,
                  p.name AS project_name, e.name AS submitter_name
           FROM contract_changes cc
           LEFT JOIN projects p ON p.id = cc.project_id
           LEFT JOIN employees e ON e.id = cc.submitted_by
           WHERE cc.status = 'pending'${sc.sql}
           ORDER BY cc.id DESC LIMIT ?`, [...sc.params, limit]);
        groups.push({
          ...counts.change_approve,
          items: rows.map(r => ({
            id: r.id, type: 'change_approve',
            title: (r.change_type === 'decrease' ? '减项 · ' : '增项 · ') + (r.title || ''),
            subtitle: [r.project_name, r.submitter_name ? ('提交人：' + r.submitter_name) : ''].filter(Boolean).join(' · '),
            amount: r.amount != null ? Number(r.amount) : null,
            time: __fmtTodoTime(r.submitted_at),
            url: `/pages/contracts/approval?tab=change&id=${r.id}`
          }))
        });
      }

      // 8) 催收未确认收款（项目相关人可见，2026-10-23 扩围）
      //    ⚠️ 口径变更：初版只推给提交人（submitted_by=我），业务上不对 ——
      //       "这笔款还没收到"应该让**整个项目组**都知道（项目经理/监理/工长/设计师/创建人），
      //       不能只让提交催收的那个人自己盯着。
      //    新口径：project_id ∈ 我的关联项目 ∪ 我提交的；admin / collection:read_all / finance:read_all 看全部。
      //    财务确认收款（status='confirmed'）后，所有人列表里同时消失。
      {
        const colAllScope = can('collection:read_all') || can('finance:read_all');
        let sql = `SELECT cr.id, cr.project_id, cr.amount, cr.collect_date, cr.remark, cr.submitted_at,
                          COALESCE(NULLIF(p.name, ''), CONCAT('项目#', cr.project_id)) AS project_name,
                          e.name AS submitter_name
                   FROM collection_records cr
                   LEFT JOIN projects p ON p.id = cr.project_id
                   LEFT JOIN employees e ON e.id = cr.submitted_by
                   WHERE cr.status = 'pending'`;
        const params = [];
        if (!colAllScope) {
          // relatedIds 为空时不能拼 IN ()（语法错），退回"仅自己提交的"
          if (relatedIds && relatedIds.length) {
            sql += ` AND (cr.project_id IN (${relatedIds.map(() => '?').join(',')}) OR cr.submitted_by = ?)`;
            params.push(...relatedIds, userId);
          } else {
            sql += ' AND cr.submitted_by = ?';
            params.push(userId);
          }
        }
        sql += ' ORDER BY cr.id DESC LIMIT ?';
        params.push(limit);
        const [rows] = await pool.query(sql, params);
        groups.push({
          ...counts.collection_pending,
          items: rows.map(r => ({
            id: r.id, type: 'collection_pending',
            project_id: r.project_id,
            title: `催收未确认收款 · ${r.project_name || ''}`.trim(),
            // 扩围后别人也能看到这条，副标题必须写清「谁提交的」，否则不知道找谁问。
            // ⚠️ 不再重复项目名 —— title 里已经有了，重复会把「提交人」挤出可视区被截断。
            subtitle: [
              r.submitter_name ? ('提交人：' + r.submitter_name) : '',
              r.remark || '等待财务确认收款'
            ].filter(Boolean).join(' · '),
            amount: r.amount != null ? Number(r.amount) : null,
            time: __fmtTodoTime(r.submitted_at || r.collect_date),
            // 移动端：项目详情财务 tab（待确认催收列表就在这里）
            url: `/pages/projects/detail?id=${r.project_id}&tab=finance`
          }))
        });
      }

      const total = groups.reduce((s, g) => s + (g.count || 0), 0);

      // ==== home 区块：按角色过滤的统计 + 项目相关事项 + 逾期预警 ====
      const today = new Date().toISOString().split('T')[0];
      const todayPlus3 = new Date(Date.now() + 3 * 86400 * 1000).toISOString().split('T')[0];

      // ⚠️ 2026-10-23：「待整改」的唯一口径见模块级 RECTIFY_OPEN_SQL（待办列表 / 待办计数 / 统计卡片共用）。
      // 这里不再重复定义，避免三处各写一份后再次漂移。

      // v2.3.1 §7.3：home 统计/列表口径严格按"我能看到的项目"
      //   - admin → 看全部（特殊）
      //   - project:read_all 且非财务角色 → 看全部（经理/监理等需要全局项目提醒）
      //   - 财务（finance:read_all）→ 按 relatedIds 过滤（财务只关心金额，不关心项目节点进度；财务员工均无项目关联 → 自然返空）
      //   - 其他 → 仅关联项目集合 relatedIds
      //   - 无 project 权限 → 全空
      // 2026-10-12 修复：原 `|| perms.includes('finance:read_all')` 把财务误豁免 → 财务首页出现与金额业务无关的节点/巡检提醒；现改为反向排除。
      const projectAllScope = (admin || perms.includes('project:read_all'))
        && !perms.includes('finance:read_all');
      // 2026-10-21 修复：原来 homePh 由 homeProjectIds=[-1] 算出 '?'（占位符），
      // 而下面 pendingInspect 那条查询在 relatedIds 为空时只传 1 个参数，
      // 第 2 个 ? 没被替换 → MySQL 报 `near '?)'`，整个 /api/todo/center 500
      // （非 admin、无 project:read_all、且无任何关联项目的员工：待办中心和首页全白）。
      // 与 __todoProjectCounts 对齐：无关联项目时 homePh 用字面量 -1（无占位符），参数列表也 return []。
      const hasRelated = !!(relatedIds && relatedIds.length);
      const homeProjectIds = projectAllScope
        ? null  // null = 不加项目过滤
        : (hasRelated ? relatedIds : [-1]);
      const homePh = hasRelated ? relatedIds.map(() => '?').join(',') : '-1';
      const homeProjectFilter = (col = 'p.id') => projectAllScope ? '' : ` AND ${col} IN (${homePh})`;
      const homeProjectParams = () => (projectAllScope ? [] : (hasRelated ? [...relatedIds] : []));

      // 1) 节点提前 3 天提醒 —— 仅展示我能看到的项目下的节点
      // ⚠️ 2026-10-23 修复：原来查 project_stages（已废弃的历史表，全库只剩 3 条 9 月的脏数据），
      //    而项目详情/节点管理真正读写的都是 project_progress_nodes（连 /api/project-stages 这个
      //    URL 内部也是查 progress_nodes）。两套表数据完全不同 → 首页提醒与项目里看到的节点对不上。
      let stage_alerts = [];
      {
        const [rows] = await pool.query(
          `SELECT ps.id, ps.project_id, ps.node_name AS stage_name, ps.plan_end_date, ps.status, p.name AS project_name
           FROM project_progress_nodes ps
           JOIN projects p ON p.id = ps.project_id
           WHERE ps.plan_end_date IS NOT NULL AND ps.plan_end_date != ''
             AND (ps.status IS NULL OR ps.status NOT IN ('completed', '已完成'))
             AND ps.plan_end_date BETWEEN ? AND ?${homeProjectFilter('p.id')}
           ORDER BY ps.plan_end_date ASC LIMIT 10`,
          [today, todayPlus3, ...homeProjectParams()]
        );
        stage_alerts = rows.map(r => {
          const days = (new Date(r.plan_end_date) - new Date(today)) / 86400;
          return {
            id: r.id, type: 'stage_due',
            title: r.stage_name,
            subtitle: r.project_name,
            time: r.plan_end_date,
            days_left: Math.round(days),
            priority: days <= 0 ? 'danger' : 'warning',
            url: `/pages/projects/detail?id=${r.project_id}`
          };
        });
      }

      // 2) 待整改巡检（整改问题表 rectification_issues，详情页 /api/rectification-issues/:id 读这张表）
      // 原实现查的是 inspections.rectify_status='待整改'，id 与详情接口对不上（不同表）。
      // 2026-10-23：口径统一为 RECTIFY_OPEN（未完成），与首页"待整改"统计卡片完全一致。
      let rectify_alerts = [];
      {
        const sc = buildScope('inspection', 'ri.project_id');
        // 2026-10-23 修复：rectification_issues.project_name 是"提交时快照"，
        // 移动端巡检提交页取不到项目名时会写空串（实测 2026-10-22 的 10 条全是 ''），
        // 待办中心列表的副标题就读成 '—'，看起来像"列表没有信息"。
        // 这里 LEFT JOIN projects 兜底：字段为空时用项目表当前名称。
        const [rows] = await pool.query(
          `SELECT ri.id, ri.project_id,
                  COALESCE(NULLIF(ri.project_name, ''), p.name) AS project_name,
                  ri.issue_desc, ri.title, ri.created_at, ri.due_date, ri.status,
                  ri.responsible_id, ri.responsible_name, ri.accept_date, ri.accept_name
           FROM rectification_issues ri
           LEFT JOIN projects p ON p.id = ri.project_id
           WHERE ${RECTIFY_OPEN_SQL}${sc.sql}
           ORDER BY ri.created_at DESC LIMIT 10`,
          sc.params
        );
        rectify_alerts = rows.map(r => {
          let urgency = 'normal';
          let days_left = null;
          if (r.due_date) {
            const due = new Date(r.due_date);
            // 直接用外层 const today（YYYY-MM-DD 字符串），避免 TDZ/shadowing
            const todayDate = new Date(today);
            const diffMs = due.getTime() - todayDate.getTime();
            const diffDays = Math.ceil(diffMs / 86400000);
            days_left = diffDays;
            if (diffDays < 0) urgency = 'overdue';
            else if (diffDays <= 3) urgency = 'urgent';
          }
          return {
            id: r.id, type: 'inspect_rectify',
            source_type: 'rectification_issue', source_id: r.id,
            title: (r.title || r.issue_desc || '待整改').slice(0, 30),
            subtitle: [r.project_name, r.responsible_name].filter(Boolean).join(' · '),
            time: __fmtTodoTime(r.created_at),
            due_date: r.due_date || null,
            days_left,
            urgency,
            priority: urgency === 'overdue' ? 'danger' : 'warning',
            url: `/pages/inspection/detail?id=${r.id}`
          };
        });
      }

      // 3) 派工待我处理（worker=本人 或 applicant=本人）
      let my_dispatch = [];
      {
        const [rows] = await pool.query(
          `SELECT d.id, d.project_id, d.project_name, d.content, d.worker, d.status, d.created_at
           FROM dispatches d
           WHERE (d.applicant_id = ? OR d.worker LIKE ?) AND d.status IN ('pending', 'in_progress', '已派工')
           ORDER BY d.created_at DESC LIMIT 10`,
          [userId, '%' + userId + '%']
        );
        my_dispatch = rows.map(r => ({
          id: r.id, type: 'dispatch_mine',
          title: r.content || '派工单',
          subtitle: [r.project_name, r.worker].filter(Boolean).join(' · '),
          time: __fmtTodoTime(r.created_at),
          priority: 'normal',
          url: `/pages/dispatch/detail?id=${r.id}`
        }));
      }

      // 4) 逾期节点预警 —— 仅展示我能看到的项目下的逾期节点
      // ⚠️ 2026-10-23 修复：同 1)，改读 project_progress_nodes（真正的节点表）。
      //    原来读 project_stages 导致"首页说水电验收逾期、项目里该节点却还没到计划结束日"。
      let warnings = [];
      {
        const [rows] = await pool.query(
          `SELECT ps.id, ps.project_id, ps.node_name AS stage_name, ps.plan_end_date, p.name AS project_name,
                  DATEDIFF(?, ps.plan_end_date) AS days
           FROM project_progress_nodes ps
           JOIN projects p ON p.id = ps.project_id
           WHERE ps.plan_end_date IS NOT NULL AND ps.plan_end_date != ''
             AND ps.plan_end_date < ?
             AND (ps.status IS NULL OR ps.status NOT IN ('completed', '已完成'))
             ${homeProjectFilter('p.id')}
           ORDER BY ps.plan_end_date ASC LIMIT 10`,
          [today, today, ...homeProjectParams()]
        );
        warnings = rows.map(r => ({
          id: r.project_id,
          node_id: r.id,
          name: r.project_name || '未知项目',
          node: r.stage_name || '',
          days: r.days || 0,
          url: `/pages/projects/detail?id=${r.project_id}`
        }));
      }

      // 5) 首页统计卡片 —— 仅我能看到的项目（与 §7.3 一致）
      //    进行中：非终止态
      const inProgress = (await pool.query(
        `SELECT COUNT(*) c FROM projects
         WHERE status IS NOT NULL AND status <> ''
           AND status NOT IN ('已完成','已交付','已取消','已完工','已结算','作废','archived','completed','cancelled')
           ${projectAllScope ? '' : ' AND id IN (' + homePh + ')'}`,
        homeProjectParams()
      ))[0][0].c;
      //    逾期节点：项目进度节点中逾期未完成的（读 project_progress_nodes，与项目详情同源）
      const overdue = (await pool.query(
        `SELECT COUNT(*) c FROM project_progress_nodes ps
         JOIN projects p ON p.id = ps.project_id
         WHERE ps.plan_end_date IS NOT NULL AND ps.plan_end_date <> '' AND ps.plan_end_date < ?
           AND (ps.status IS NULL OR ps.status NOT IN ('completed', '已完成'))
           ${projectAllScope ? '' : ' AND p.id IN (' + homePh + ')'}`,
        [today, ...homeProjectParams()]
      ))[0][0].c;
      //    待整改：整改问题（关联项目要在可见集内，或我是创建人）
      // 注意：relatedIds=[] 时 homePh='-1'（字面量，无占位），参数只有 userId 1 个；
      //       relatedIds=[15] 时 homePh='?'（占位）+ userId 1 个占位 = 2 个参数。
      // ⚠️ 2026-10-23 修复：原来这条 COUNT 完全没有状态过滤，把「已完成」的历史整改也算进来
      //    （实测库里 6 条：3 条已完成、1 条待处理、2 条 status 为 NULL 但 finish_date 也为空）。
      //    卡片显示 6 而下方待办列表只有 1 条 → 用户看到的就是"待整改 6 但实际只有 1 个"。
      //    口径统一为「未完成」：status 不在已完成集合，且没有完成时间。与下方 rectify_alerts 一致。
      const pendingInspect = (await pool.query(
        `SELECT COUNT(*) c FROM rectification_issues ri
         WHERE ${RECTIFY_OPEN_SQL}${projectAllScope ? '' : ' AND (ri.project_id IN (' + homePh + ') OR ri.creator_id = ?)'}`,
        projectAllScope ? [] : [...homeProjectParams(), userId]
      ))[0][0].c;

      // 6) 待收款金额 —— 仅财务（finance:read_all）或 admin 才显示
      //    应收 = 已审核合同金额 + 已通过增项 - 已通过减项
      //    已收 = 催收记录中已确认的金额（collection_records.status='confirmed'）
      //    v2.3.6 hotfix 10-15：合同金额改读 payment_records.category='contract'.confirmed（contracts 表 project_id 全 NULL）
      //    口径与 /api/finance/receivable-by-project / /api/finance/summary 完全一致。
      //    注意：payment_records 里 category='contract' 的收入是「合同审核通过时自动写入」的应收记录，
      //    并非实际到账，不能用于计算已收款。
      const financeScope = admin || perms.includes('finance:read_all');
      let receivableTotal = 0, collectedTotal = 0, pendingReceiveAmount = 0;
      if (financeScope) {
        const [[recvAgg]] = await pool.query(
          `SELECT
             (SELECT COALESCE(SUM(amount),0) FROM payment_records
               WHERE category='contract' AND status='confirmed') AS contract_amount,
             (SELECT COALESCE(SUM(cc.amount),0) FROM contract_changes cc
               WHERE cc.status='approved' AND cc.change_type='increase') AS increase_total,
             (SELECT COALESCE(SUM(cc.amount),0) FROM contract_changes cc
               WHERE cc.status='approved' AND cc.change_type='decrease') AS decrease_total,
             (SELECT COALESCE(SUM(cr.amount),0) FROM collection_records cr WHERE cr.status='confirmed') AS collected`
        );
        receivableTotal = Number(recvAgg.contract_amount || 0) + Number(recvAgg.increase_total || 0) - Number(recvAgg.decrease_total || 0);
        collectedTotal = Number(recvAgg.collected || 0);
        pendingReceiveAmount = receivableTotal - collectedTotal;
      }

      // 7) 财务角色（purchase:finance）关心的金额：报销中总金额（保留字段，兼容旧消费方）
      let pendingPayAmount = null;
      if (can('purchase:finance')) {
        const [[r]] = await pool.query(
          "SELECT COALESCE(SUM(total_amount),0) AS s FROM purchase_requests WHERE status IN ('reimbursing','finance_confirmed')"
        );
        pendingPayAmount = Number(r.s) || 0;
      }

      const projCounts = await __todoProjectCounts(userId, perms, admin, relatedIds);

      const home = {
        stats: {
          inProgress: Number(inProgress) || 0,
          overdue: Number(overdue) || 0,
          pendingInspect: Number(pendingInspect) || 0,
          // 待收款金额（应收 - 已收），所有项目汇总
          pendingReceiveAmount,
          receivableTotal,
          collectedTotal,
          pendingPayAmount,
        },
        // 按角色排序：经理/设计师/监理/工长 先看预警+整改；财务看采购；admin 全见
        // count 为真实总数（items 受 LIMIT 10 限制），前端「角标/汇总」用 count，
        // 列表显示 items.length / count —— 避免"角标 13 列表只有 10"的错觉。
        sections: [
          { key: 'stage_due', label: '节点即将到期（3天内）', icon: '⏰', items: stage_alerts, count: projCounts.stage_due },
          { key: 'inspect_rectify', label: '待整改', icon: '🔧', items: rectify_alerts, count: projCounts.inspect_rectify },
          { key: 'dispatch_mine', label: '我的派工', icon: '👷', items: my_dispatch, count: projCounts.dispatch_mine },
        ].filter(s => s.items.length > 0),
        warnings,
      };

      res.json({ code: 0, total, groups, home, generated_at: new Date().toISOString() });
    } catch (e) {
      console.error('[todo/center] error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

};
