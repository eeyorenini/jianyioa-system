/**
 * 项目管理 / 阶段 / 施工日志 / 图库 / 报价 / 材料出入库（2026-10-29 渐进拆分第 17 轮）
 *
 * 搬运自 server.js 原 1968-2727 行，搬入时 760 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 *
 * ⚠️ 唯一改写：块内 `__dirname` 已全部替换为 `ROOT`。
 *    原文件中 __dirname 指 server/ 根（uploads、tmp 等路径），
 *    搬进 api/ 后会变成 server/api，路径全部错位，所以模块内补
 *    `const ROOT = path.join(__dirname, '..')` 还原成原语义。
 */
module.exports = function registerProjectRoutes(app, deps) {
  const {
    db,
    pool,
    fs,
    path,
    getUserId,
    addLog,
    notifyProject,
    isAdmin,
    checkPermission,
    checkAnyPermission,
    hasReadAllPermission,
    permCore,
    sendAppNotification,
    insertInAppNotification,
    buildProjectScopeOrSelfClause,
  } = deps;

  // 还原原 server.js 的 __dirname（server/ 根）
  const ROOT = path.join(__dirname, '..');

  // ==================== 项目管理（增强：关联客户）====================
  app.get('/api/projects', async (req, res) => {
    console.log('[/api/projects] called, query:', req.query);
    try {
      const { customer_id, status, search } = req.query;
      const userId = getUserId(req);
      const userRole = req.headers['x-user-role'] || '';
      const userIsAdmin = userRole === 'admin' || userRole === '管理员' || userRole === '超级管理员' || userRole === '系统管理员';

      // ============================================================
      // 2026-10-29 新增「选择器模式」?picker=1
      //
      // 业务规则（用户明确要求）：
      //   「项目实际关联谁，谁才能在提交数据时选到这个项目；admin 可以看到所有。」
      //
      // 与普通模式的区别：
      //   普通模式（项目列表 / 财务汇总 / 看板）：尊重 read_all 权限 ——
      //     项目经理、财务、主材三个角色配了 project:read_all，本来就要看全部项目；
      //   选择器模式（提交表单里的「关联项目」下拉）：**忽略 read_all**，
      //     只认 admin(*) 与「实际关联」——
      //     关联 = creator_id / designer_id / supervisor_id / manager_id / foreman_id
      //            / 客户手机号与员工手机号一致（见 perm.relatedProjectIds）。
      //
      // admin 判定走数据库（loadUserPermissions 对 role_code='admin' 或 username='admin'
      // 直接给 '*'），不信任客户端 x-user-role 头 —— 否则谁都能加个头冒充管理员。
      // ============================================================
      const pickerMode = req.query.picker === '1' || req.query.picker === 'true';
      let dbIsAdmin = false;
      if (pickerMode) {
        try {
          const perms = await permCore.loadUserPermissions(userId);
          dbIsAdmin = perms.has('*');
        } catch (_) { /* 查不到权限就按普通员工处理，最保守 */ }
      }
      const hasAll = pickerMode
        ? dbIsAdmin
        : (userIsAdmin || await hasReadAllPermission(userId, 'project'));

      let sql = `SELECT p.*, 
                 c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
                 des.name as designer_name, des.phone as designer_phone,
                 sup.name as supervisor_name, sup.phone as supervisor_phone,
                 mgr.name as manager_name, mgr.phone as manager_phone
                 FROM projects p
                 LEFT JOIN customers c ON p.customer_id = c.id
                 LEFT JOIN employees des ON p.designer_id = des.id
                 LEFT JOIN employees sup ON p.supervisor_id = sup.id
                 LEFT JOIN employees mgr ON p.manager_id = mgr.id`;
      const params = [];
      const conditions = [];

      // ============================================================
      // 2026-10-29 修复越权（P0）+ 接入项目级授权
      //
      // 原实现：只要传 ?customer_id=X 就直接 `WHERE p.customer_id = X`，
      // 完全不校验请求者是谁 —— 任何人（甚至未登录）知道客户 id 就能拉走
      // 该客户全套项目（客户姓名 / 电话 / 地址、合同信息、施工节点）。
      // 而业主端 home.vue、projects.vue 正是用 `?customer_id=` 调的。
      //
      // 现在：业主端（x-user-type=customer 或带 x-user-scope）一律**忽略**
      // customer_id 参数，改由身份算可见项目（customerProjectIds 并集：
      // 自己名下 + 被授权项目）。无授权项目时返回空数组，前端提示联系销售。
      // 员工端的跨客户筛选（PC 选客户查项目）保持原逻辑不变。
      // ============================================================
      const userTypeHeader = String(req.headers['x-user-type'] || '').toLowerCase();
      const isCustomerSide = userTypeHeader === 'customer' || !!req.headers['x-user-scope'];

      if (isCustomerSide) {
        const ident = await permCore.resolveCustomerIdentity(
          userId, 'customer', req.headers['x-user-scope']
        );
        if (!ident) return res.status(401).json({ error: '请先登录业主账号' });
        const myIds = Array.from(await permCore.customerProjectIds(ident));
        if (!myIds.length) return res.json([]); // 无任何可见项目
        conditions.push(`p.id IN (${myIds.map(() => '?').join(',')})`);
        params.push(...myIds);
      } else if (customer_id) {
        conditions.push('p.customer_id = ?');
        params.push(customer_id);
      } else if (!hasAll) {
        // P2 §4.2：仅关联项目（创建人/设计师/监理/工长/项目经理/客户）
        // 客户表通过 phone 关联
        const ids = Array.from(await permCore.relatedProjectIds(userId));
        if (!ids.length) {
          // 无任何关联项目：返回空（不返回 null project）
          return res.json([]);
        }
        conditions.push(`p.id IN (${ids.map(() => '?').join(',')})`);
        params.push(...ids);
      }

      if (status) {
        conditions.push('p.status = ?');
        params.push(status);
      }
      if (search) {
        conditions.push('(p.name LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)');
        const s = `%${search}%`;
        params.push(s, s, s);
      }
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY p.created_at DESC';
      const stmt = db.prepare(sql);
      const projects = await stmt.all(...params);

      // 附加每个项目的节点列表
      // v2.6.1 性能修复：原来是 for 循环里逐个 project_id 查一次（N+1），
      // 100 个项目 = 1 + 100 次数据库往返，这是"项目列表 / 项目详情打开慢"的主因。
      // 改为按 id 集合一次 IN 查询，再在内存里分组。
      if (projects.length) {
        const ids = projects.map((p) => p.id);
        const allNodes = await db.prepare(`SELECT ps.*, s.name as sms_template_name
          FROM project_progress_nodes ps
          LEFT JOIN sms_templates s ON s.id = ps.sms_template_id
          WHERE ps.project_id IN (${ids.map(() => '?').join(',')})
          ORDER BY ps.sort_order ASC, ps.id ASC`).all(...ids);
        const nodesByProject = new Map();
        for (const n of allNodes) {
          const key = Number(n.project_id);
          if (!nodesByProject.has(key)) nodesByProject.set(key, []);
          nodesByProject.get(key).push(n);
        }
        for (const p of projects) {
          p.nodes = nodesByProject.get(Number(p.id)) || [];
          // 计算进度百分比
          if (p.nodes.length > 0) {
            const completedNodes = p.nodes.filter(n => n.status === 'completed').length;
            p.progress = Math.round((completedNodes / p.nodes.length) * 100);
            // 当前节点名称：第一个未完成的节点，全部完成则显示最后一个
            const pendingNodes = p.nodes.filter(n => n.status !== 'completed');
            p.current_node_name = pendingNodes.length > 0 ? pendingNodes[0].node_name : p.nodes[p.nodes.length - 1].node_name;
          } else {
            p.progress = 0;
            p.current_node_name = '';
          }
        }
      }

      res.json(projects);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/projects/:id', async (req, res) => {
    try {
      const stmt = db.prepare(`SELECT p.*,
        c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
        des.name as designer_name, des.phone as designer_phone,
        sup.name as supervisor_name, sup.phone as supervisor_phone,
        mgr.name as manager_name, mgr.phone as manager_phone
        FROM projects p
        LEFT JOIN customers c ON p.customer_id = c.id
        LEFT JOIN employees des ON p.designer_id = des.id
        LEFT JOIN employees sup ON p.supervisor_id = sup.id
        LEFT JOIN employees mgr ON p.manager_id = mgr.id
        WHERE p.id = ?`);
      const project = await stmt.get(req.params.id);
      if (!project) return res.status(404).json({ error: '项目不存在' });
      // v2.6.1：单条接口补齐 nodes / progress / current_node_name，
      // 与 /api/projects 列表保持同一数据结构 —— 小程序项目详情页已改为调本接口
      // （不再拉全量列表再 find），若这里不返回 nodes，进度节点 tab 会变空。
      project.nodes = await db.prepare(`SELECT ps.*, s.name as sms_template_name
        FROM project_progress_nodes ps
        LEFT JOIN sms_templates s ON s.id = ps.sms_template_id
        WHERE ps.project_id = ?
        ORDER BY ps.sort_order ASC, ps.id ASC`).all(req.params.id);
      if (project.nodes.length > 0) {
        const completedNodes = project.nodes.filter(n => n.status === 'completed').length;
        project.progress = Math.round((completedNodes / project.nodes.length) * 100);
        const pendingNodes = project.nodes.filter(n => n.status !== 'completed');
        project.current_node_name = pendingNodes.length > 0
          ? pendingNodes[0].node_name
          : project.nodes[project.nodes.length - 1].node_name;
      } else {
        project.progress = 0;
        project.current_node_name = '';
      }
      res.json(project);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/projects', checkPermission('project:write'), async (req, res) => {
    try {
      const userId = getUserId(req);
      const { name, customer_id, status, start_date, end_date, budget, description, designer_id, supervisor_id, manager_id, template_id } = req.body;
      const stmt = db.prepare('INSERT INTO projects (name, customer_id, status, start_date, end_date, budget, description, designer_id, supervisor_id, manager_id, template_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const result = await stmt.run(name, customer_id || null, status || '开工准备', start_date || null, end_date || null, budget || null, description || null, designer_id || null, supervisor_id || null, manager_id || null, template_id || null, userId);
      const projectId = result.lastInsertRowid;

      // 注意：节点模板的初始化由前端在 handleSave 里调 /api/progress-nodes/init/:projectId 完成
      // 这里不再 INSERT 节点，避免双重插入导致节点重复（2026-10-09 修复）

      await addLog(userId, '', '新增', '项目管理', projectId, name, `项目名称: ${name}`, req.ip);
      // 通知：新增项目
      notifyProject('project_created', projectId,
        `新项目创建：${name}`,
        `项目「${name}」已创建，客户ID：${customer_id || ''}，请相关人员及时跟进。`,
        projectId, 'project', null, { mode: 'subscribers' }
      ).catch(console.error);
      res.json({ id: projectId, message: '添加成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/projects/:id', checkPermission('project:write'), async (req, res) => {
    try {
      const userId = getUserId(req);
      const { name, customer_id, status, start_date, end_date, budget, description, designer_id, supervisor_id, manager_id, template_id } = req.body;
      // 权限检查
      const [existing] = await db.prepare('SELECT creator_id FROM projects WHERE id = ?').all(req.params.id);
      if (!existing) return res.status(404).json({ error: '项目不存在' });
      if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
      const stmt = db.prepare('UPDATE projects SET name=?, customer_id=?, status=?, start_date=?, end_date=?, budget=?, description=?, designer_id=?, supervisor_id=?, manager_id=?, template_id=? WHERE id=?');
      await stmt.run(name, customer_id || null, status, start_date || null, end_date || null, budget || null, description || null, designer_id || null, supervisor_id || null, manager_id || null, template_id || null, req.params.id);
      await addLog(userId, '', '编辑', '项目管理', req.params.id, name, `更新项目: ${name}`, req.ip);
      // 通知：项目状态变更
      if (existing.status !== status) {
        notifyProject('project_status_changed', parseInt(req.params.id),
          `项目状态变更：${name}`,
          `项目「${name}」状态已变更为「${status}」，请知悉。`,
          parseInt(req.params.id), 'project', null, { mode: 'subscribers' }
        ).catch(console.error);
      }
      res.json({ message: '更新成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/projects/:id', checkPermission('project:delete'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const userId = getUserId(req);
      const [proj] = await conn.query('SELECT name, creator_id FROM projects WHERE id = ?', [req.params.id]);
      if (!proj.length) return res.status(404).json({ error: '记录不存在' });
      if (proj[0].creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
      const projName = proj[0].name;
      const pid = req.params.id;

      await conn.beginTransaction();

      const tablesWithProjectId = [
        'contract_changes',
        'contracts',
        'project_logs',
        'inspections',
        'rectification_issues',
        'dispatches',
        'material_orders',
        'project_progress_nodes',
        'collection_records',
        'payment_records',
        'project_stages',
        'purchase_requests',
        'sms_send_logs',
        'acceptance',
        'cost_records',
        'finance',
        'material_out',
        'purchases',
        'warranties',
      ];
      for (const tbl of tablesWithProjectId) {
        await conn.query(`DELETE FROM ${tbl} WHERE project_id = ?`, [pid]);
      }
      await conn.query('DELETE FROM projects WHERE id = ?', [pid]);
      await conn.commit();

      await addLog(userId, '', '删除', '项目管理', pid, projName, `删除项目: ${projName}`, req.ip);
      res.json({ message: '删除成功' });
    } catch (err) {
      await conn.rollback();
      res.status(500).json({ error: err.message });
    } finally {
      conn.release();
    }
  });

  app.get('/api/project-stages', async (req, res) => {
    const stmt = db.prepare(`SELECT ps.*, s.name as sms_template_name
      FROM project_progress_nodes ps
      LEFT JOIN sms_templates s ON s.id = ps.sms_template_id
      WHERE ps.project_id = ?
      ORDER BY ps.sort_order, ps.id`);
    res.json(await stmt.all(req.query.project_id));
  });

  app.post('/api/project-stages', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { project_id, node_name, plan_date, plan_end_date, status, progress, note, sms_template_id, after_node_id } = req.body;
    try {
      // 2026-10-23：通知里用真项目名（原来写「项目「ID:15」」把 ID 当项目名）
      const [projForNotify] = await db.prepare('SELECT name FROM projects WHERE id = ?').all(project_id);
      const projLabel = (projForNotify && projForNotify.name) || `项目${project_id}`;
      if (after_node_id !== undefined && after_node_id !== null) {
        const [after] = await db.prepare('SELECT sort_order FROM project_progress_nodes WHERE id = ?').all(after_node_id);
        if (after) {
          await db.prepare('UPDATE project_progress_nodes SET sort_order = sort_order + 1 WHERE project_id = ? AND sort_order > ?').run(project_id, after.sort_order);
          const stmt = db.prepare('INSERT INTO project_progress_nodes (project_id, node_name, plan_date, plan_end_date, sort_order, status, note, sms_template_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
          const result = await stmt.run(project_id, node_name, plan_date, plan_end_date || null, after.sort_order + 1, status || 'pending', note, sms_template_id || null, userId);
          const nodeId = result.lastInsertRowid;
          notifyProject('node_status_changed', project_id,
            `新增项目节点：${node_name}`,
            `项目「${projLabel}」新增节点「${node_name}」，请及时跟进。`,
            nodeId, 'node', null, { mode: 'subscribers' }
          ).catch(console.error);
          await addLog(userId, '', '新增', '项目节点', nodeId, node_name, `新增节点: ${node_name}`, req.ip);
          return res.json({ id: nodeId, message: '添加成功' });
        }
      }
      const [max] = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM project_progress_nodes WHERE project_id = ?').all(project_id);
      const stmt = db.prepare('INSERT INTO project_progress_nodes (project_id, node_name, plan_date, plan_end_date, sort_order, status, note, sms_template_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const result = await stmt.run(project_id, node_name, plan_date, plan_end_date || null, max.m + 1, status || 'pending', note, sms_template_id || null, userId);
      const nodeId = result.lastInsertRowid;
      await addLog(userId, '', '新增', '项目节点', nodeId, node_name, `新增节点: ${node_name}`, req.ip);
      notifyProject('node_status_changed', project_id,
        `新增项目节点：${node_name}`,
        `项目「${projLabel}」新增节点「${node_name}」，请及时跟进。`,
        nodeId, 'node', null, { mode: 'subscribers' }
      ).catch(console.error);
      res.json({ id: nodeId, message: '添加成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/project-stages/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      const [row] = await db.prepare('SELECT * FROM project_progress_nodes WHERE id = ?').all(req.params.id);
      if (!row) return res.status(404).json({ error: '节点不存在' });
      if (row.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
      const { node_name, plan_date, plan_end_date, actual_date, status, note, sms_template_id, sort_order } = req.body;
      const updated = {
        node_name: node_name !== undefined ? node_name : row.node_name,
        plan_date: plan_date !== undefined ? plan_date : row.plan_date,
        plan_end_date: plan_end_date !== undefined ? plan_end_date : row.plan_end_date,
        actual_date: actual_date !== undefined ? actual_date : row.actual_date,
        status: status !== undefined ? status : row.status,
        note: note !== undefined ? note : row.note,
        sms_template_id: sms_template_id !== undefined ? (sms_template_id || null) : row.sms_template_id,
        sort_order: sort_order !== undefined ? sort_order : row.sort_order
      };
      const stmt = db.prepare('UPDATE project_progress_nodes SET node_name=?, plan_date=?, plan_end_date=?, actual_date=?, status=?, note=?, sms_template_id=?, sort_order=? WHERE id=?');
      await stmt.run(updated.node_name, updated.plan_date, updated.plan_end_date, updated.actual_date, updated.status, updated.note, updated.sms_template_id, updated.sort_order, req.params.id);

      await addLog(userId, '', '编辑', '项目节点', parseInt(req.params.id), updated.node_name || row.node_name, `更新节点: ${updated.node_name || row.node_name}`, req.ip);

      // ✅ 节点状态变化时，通知项目成员和客户（任意状态变化都通知）
      let smsResults = null;  // 2026-10-09：把短信结果返回给前端
      if (row.status !== updated.status) {
        // 2026-10-23：文案统一为「项目进度更新「节点名」完成」（大王指定）
        //   旧文案「项目节点已完成：xxx」不含项目名；content 里还把节点名当项目名写（bug）
        const statusLabel = { pending: '待处理', in_progress: '进行中', completed: '完成', skipped: '已跳过' };
        const typeMap = { pending: 'node_pending', in_progress: 'node_in_progress', completed: 'node_completed', skipped: 'node_skipped' };
        const type = typeMap[updated.status] || 'node_completed';
        const nodeName = updated.node_name || row.node_name;
        const label = statusLabel[updated.status] || updated.status;
        // content 里要带真项目名；短信的项目名也从这里兜底提取
        const [projRow] = await db.prepare('SELECT name FROM projects WHERE id = ?').all(row.project_id);
        const projectName = (projRow && projRow.name) || `项目${row.project_id}`;
        const title = `项目进度更新「${nodeName}」${label}`;
        const content = `项目「${projectName}」的节点「${nodeName}」${label}，请知悉。`;
        const smsNotify = parseInt(req.body.sms_notify || 0);
        // 2026-10-23 统一接收人口径（原来两条路径不一致，还重复）：
        //   旧实现：勾短信 → notifyProject（订阅角色+关联人+管理员），不勾 → insertInAppNotification（仅经理/设计师/监理/客户4人）
        //   后果 ① 操作者（管理员）自己收不到；② 勾短信时会写两遍。
        //   现在统一走 notifyProject(subscribers)：订阅角色 + 项目关联人 + 管理员(id=1)；
        //   短信仍只在勾选 + 客户身份时才真发（notifyProject 内部判定）。
        smsResults = await notifyProject(
          type, row.project_id, title, content, row.id, 'node',
          smsNotify ? updated.sms_template_id : null,
          { mode: 'subscribers' }
        );
      }

      // 2026-10-09：返回短信结果（数组），前端可显示每条的成功/失败
      res.json({ message: '更新成功', sms: smsResults });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/project-stages/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      const [row] = await db.prepare('SELECT id, creator_id FROM project_progress_nodes WHERE id = ?').all(req.params.id);
      if (!row) return res.status(404).json({ error: '记录不存在' });
      if (row.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
      const stmt = db.prepare('DELETE FROM project_progress_nodes WHERE id = ?');
      await stmt.run(req.params.id);
      await addLog(userId, '', '删除', '项目节点', parseInt(req.params.id), row.id, `删除节点 ID: ${row.id}`, req.ip);
      res.json({ message: '删除成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 通用施工/巡检日志列表（支持 type/page/project_id 过滤）
  app.get('/api/project-logs', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });

      const { type, project_id, page = 1, page_size = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(page_size);

      let where = [];
      let params = [];

      if (type && type !== 'all') {
        where.push('l.type = ?');
        params.push(type);
      }
      if (project_id) {
        // 即使传 project_id 也要校验它在可见范围内
        const ids = Array.from(await permCore.relatedProjectIds(userId));
        const admin = await permCore.canReadAll(userId, 'project_log');
        if (!admin && !ids.includes(Number(project_id))) return res.status(403).json({ error: '该项目不在可见范围内' });
        where.push('l.project_id = ?');
        params.push(project_id);
      } else {
        // P2 §4.4：施工日志的可见性继承 project 模块
        const scope = await buildProjectScopeOrSelfClause(userId, 'project_log', 'l', 'project_id', 'creator_id');
        if (scope.sql) {
          where.push(scope.sql.replace(/^ AND/, ''));
          params.push(...scope.params);
        } else if (!(await permCore.canReadAll(userId, 'project_log'))) {
          // 既非 read_all 又无关联项目：返回空
          return res.json({ list: [], total: 0, page: 1, page_size: parseInt(page_size) });
        }
      }

      const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
      const countStmt = db.prepare(`SELECT COUNT(*) as total FROM project_logs l ${whereSql}`);
      const [{ total }] = await countStmt.all(...params);

      const listStmt = db.prepare(`
        SELECT l.*, p.name as project_name
        FROM project_logs l
        LEFT JOIN projects p ON l.project_id = p.id
        ${whereSql}
        ORDER BY l.created_at DESC
        LIMIT ? OFFSET ?
      `);
      const list = await listStmt.all(...params, parseInt(page_size), offset);

      res.json({ list, total, page: parseInt(page), page_size: parseInt(page_size) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/project-logs/:projectId', async (req, res) => {
    const stmt = db.prepare(`
      SELECT l.*, p.name as project_name
      FROM project_logs l
      LEFT JOIN projects p ON l.project_id = p.id
      WHERE l.project_id = ?
      ORDER BY l.created_at DESC
    `);
    res.json(await stmt.all(req.params.projectId));
  });

  // 按分类获取项目图库（从 project_logs.images 聚合）
  app.get('/api/project-gallery', async (req, res) => {
    const { project_id, category } = req.query;
    const cats = ['开工', '水电', '防水', '泥瓦', '木工', '油漆', '安装', '验收'];

    if (project_id) {
      // 指定项目：单个或全部分类
      let sql = `SELECT id, category, content, images, created_at FROM project_logs WHERE project_id = ? AND images IS NOT NULL AND images != '' AND images != '[]'`;
      const params = [project_id];
      if (category && category !== '全部') {
        sql += ` AND category = ?`;
        params.push(category);
      }
      sql += ` ORDER BY created_at DESC`;
      const logs = await db.prepare(sql).all(...params);

      const photos = [];
      for (const log of logs) {
        let imgs = [];
        try {
          const raw = log.images || '[]';
          const first = JSON.parse(raw);
          imgs = typeof first === 'string' ? JSON.parse(first) : first;
        } catch (_) {}
        for (const url of imgs) {
          photos.push({ url, category: log.category, date: log.created_at?.split('T')[0], desc: log.content?.substring(0, 30) });
        }
      }
      return res.json({ list: photos });
    }

    // 全项目聚合：按分类统计
    const allCats = cats.map(c => ({ category: c, count: 0 }));
    const logs = await db.prepare(`
      SELECT category, COUNT(*) as cnt
      FROM project_logs
      WHERE images IS NOT NULL AND images != '' AND images != '[]'
      GROUP BY category
    `).all();
    for (const row of logs) {
      const idx = allCats.findIndex(c => c.category === row.category);
      if (idx !== -1) allCats[idx].count = row.cnt;
    }
    res.json({ list: allCats });
  });

  app.post('/api/project-logs', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { project_id, content, operator, images, worker_count, work_type, tomorrow_plan, note, category } = req.body;
    const stmt = db.prepare('INSERT INTO project_logs (project_id, content, operator, images, worker_count, work_type, tomorrow_plan, note, category, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
    const result = await stmt.run(project_id, content, operator, JSON.stringify(images || []), worker_count || null, work_type || null, tomorrow_plan || null, note || null, category || null, userId);
    const logId = result.lastInsertRowid;

    // ✅ 新增项目进展时，通知项目成员和客户
    const [proj] = await db.prepare('SELECT name FROM projects WHERE id = ?').all(project_id);
    await addLog(userId, '', '新增', '项目进展', logId, proj?.name || project_id, `项目「${proj?.name || project_id}」添加进展`, req.ip);
    // 2026-10-23：两类日志不再推「项目新进展」
    //   ① 节点状态变更（action_type=node_* 或带 stage_id）—— 节点变更已有专门的
    //      「项目进度更新「节点名」完成」通知（PUT /api/project-stages/:id），再推一条就重复了，
    //      而且点进去是施工日志，跟用户做的操作对不上。
    //   ② 内容为空 —— 推出去是「有新进展：...」，纯噪音。
    const isNodeAction = String(req.body.action_type || '').startsWith('node_') || !!req.body.stage_id;
    const hasContent = String(content || '').trim().length > 0;
    if (proj && !isNodeAction && hasContent) {
      await notifyProject('project_progress', project_id,
        `项目新进展`,
        `「${proj.name}」有新进展：${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
        logId, 'project_log', null, { mode: 'subscribers' });
    }

    res.json({ id: logId, message: '添加成功' });
  });

  // 删除日志（谁创建谁可以删除）
  app.delete('/api/project-logs/:id', async (req, res) => {
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';

    const [log] = await db.prepare('SELECT * FROM project_logs WHERE id = ?').all(req.params.id);
    if (!log) return res.status(404).json({ error: '日志不存在' });

    // 检查权限：创建者本人或管理员可以删除
    if (log.creator_id !== userId && !userIsAdmin) {
      return res.status(403).json({ error: '无权删除他人的日志' });
    }

    // 删除日志关联的图片文件（兼容新旧数据：路径格式 vs base64格式）
    try {
      let paths = [];
      if (log.images) {
        let parsed = JSON.parse(log.images);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (Array.isArray(parsed)) {
          paths = parsed.filter(p => p && typeof p === 'string');
        }
      }
      for (const p of paths) {
        if (!p.startsWith('/uploads/')) continue;
        const fullPath = path.join(ROOT, p);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          console.log(`[删除日志图片] ${p}`);
        }
      }
    } catch (e) {
      console.error('删除日志图片失败:', e);
    }

    await db.prepare('DELETE FROM project_logs WHERE id = ?').run(req.params.id);
    res.json({ message: '删除成功' });
  });

  // 更新日志
  app.put('/api/project-logs/:id', async (req, res) => {
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';

    const [log] = await db.prepare('SELECT * FROM project_logs WHERE id = ?').all(req.params.id);
    if (!log) return res.status(404).json({ error: '日志不存在' });

    // 检查权限：创建者本人或管理员可以编辑
    if (log.creator_id !== userId && !userIsAdmin) {
      return res.status(403).json({ error: '无权编辑他人的日志' });
    }

    const { content, operator, images } = req.body;
    const stmt = db.prepare('UPDATE project_logs SET content = ?, operator = ?, images = ? WHERE id = ?');
    await stmt.run(content, operator, JSON.stringify(images || []), req.params.id);
    res.json({ message: '更新成功' });
  });

  // 获取单个日志详情
  app.get('/api/project-log/:id', async (req, res) => {
    const [log] = await db.prepare('SELECT * FROM project_logs WHERE id = ?').all(req.params.id);
    if (!log) return res.status(404).json({ error: '日志不存在' });
    res.json(log);
  });

  // 获取我的日志（当前用户创建的所有日志）
  app.get('/api/my/logs', async (req, res) => {
    const userId = getUserId(req);
    const stmt = db.prepare(`
      SELECT l.*, p.name as project_name 
      FROM project_logs l 
      LEFT JOIN projects p ON l.project_id = p.id 
      WHERE l.creator_id = ? 
      ORDER BY l.created_at DESC
    `);
    res.json(await stmt.all(userId));
  });

  app.get('/api/quotes', async (req, res) => {
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
    const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'quote');
    if (hasAll) {
      const stmt = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC');
      return res.json(await stmt.all());
    }
    const stmt = db.prepare('SELECT * FROM quotes WHERE creator_id = ? ORDER BY created_at DESC');
    res.json(await stmt.all(userId));
  });

  app.post('/api/quotes', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { customer_name, project_name, total_amount, status, items, valid_date } = req.body;
    const stmt = db.prepare('INSERT INTO quotes (customer_name, project_name, total_amount, status, items, valid_date, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(customer_name, project_name, total_amount, status || '待确认', JSON.stringify(items), valid_date, userId);
    await addLog(userId, '', '新增', '报价管理', result.lastInsertRowid, project_name, `项目: ${project_name}, 客户: ${customer_name}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.delete('/api/quotes/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const [q] = await db.prepare('SELECT project_name, creator_id FROM quotes WHERE id = ?').all(req.params.id);
    if (!q) return res.status(404).json({ error: '记录不存在' });
    if (q.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
    const qName = q.project_name;
    const stmt = db.prepare('DELETE FROM quotes WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '报价管理', req.params.id, qName, `删除报价: ${qName}`, req.ip);
    res.json({ message: '删除成功' });
  });

  app.get('/api/materials', async (req, res) => {
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
    // v2.3.12：主材模块（material）正式生效。原判定只看 warehouse，
    //   导致角色管理里勾「主材管理」毫无作用。现在两个模块都认（迁移期兼容）。
    const hasAll = userIsAdmin
      || await hasReadAllPermission(userId, 'material')
      || await hasReadAllPermission(userId, 'warehouse');
    if (hasAll) {
      const stmt = db.prepare('SELECT * FROM materials ORDER BY created_at DESC');
      return res.json(await stmt.all());
    }
    const stmt = db.prepare('SELECT * FROM materials WHERE creator_id = ? ORDER BY created_at DESC');
    res.json(await stmt.all(userId));
  });

  app.post('/api/materials', checkAnyPermission(['material:write', 'warehouse:write']), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location } = req.body;
    const stmt = db.prepare('INSERT INTO materials (code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(code, name, category, unit, quantity || 0, price || 0, cost_price || 0, supplier, min_stock || 0, location, userId);
    await addLog(userId, '', '新增', '材料管理', result.lastInsertRowid, name, `材料名称: ${name}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.put('/api/materials/:id', checkAnyPermission(['material:write', 'warehouse:write']), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location } = req.body;
    // 权限检查
    const [existing] = await db.prepare('SELECT creator_id FROM materials WHERE id = ?').all(req.params.id);
    if (!existing) return res.status(404).json({ error: '材料不存在' });
    if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
    const stmt = db.prepare('UPDATE materials SET code=?, name=?, category=?, unit=?, quantity=?, price=?, cost_price=?, supplier=?, min_stock=?, location=? WHERE id=?');
    await stmt.run(code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location, req.params.id);
    await addLog(userId, '', '编辑', '材料管理', req.params.id, name, `更新材料: ${name}`, req.ip);
    res.json({ message: '更新成功' });
  });

  app.delete('/api/materials/:id', checkAnyPermission(['material:delete', 'warehouse:delete']), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const [m] = await db.prepare('SELECT name, creator_id FROM materials WHERE id = ?').all(req.params.id);
    if (!m) return res.status(404).json({ error: '记录不存在' });
    if (m.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
    const mName = m.name;
    const stmt = db.prepare('DELETE FROM materials WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '材料管理', req.params.id, mName, `删除材料: ${mName}`, req.ip);
    res.json({ message: '删除成功' });
  });

  app.post('/api/materials/in', checkAnyPermission(['material:write', 'warehouse:write']), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { material_id, quantity, unit_price, supplier, operator, note, date } = req.body;
    const stmt = db.prepare('INSERT INTO material_in (material_id, quantity, unit_price, supplier, operator, note, date, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(material_id, quantity, unit_price || 0, supplier, operator, note, date, userId);
    await db.prepare('UPDATE materials SET quantity = quantity + ? WHERE id = ?').run(quantity, material_id);
    const [matIn] = await db.prepare('SELECT name FROM materials WHERE id = ?').all(material_id);
    const inId = result.lastInsertRowid;
    await addLog(userId, '', '新增', '材料入库', inId, matIn?.name || material_id, `材料入库: ${matIn?.name || material_id}, 数量: ${quantity}`, req.ip);

    // 发送应用内通知：查找使用了该材料的在建项目，通知相关人
    try {
      const [recentOut] = await db.prepare('SELECT project_id FROM material_out WHERE material_id = ? ORDER BY id DESC LIMIT 1').all(material_id);
      if (recentOut && recentOut.project_id) {
        const [proj] = await db.prepare(`
          SELECT p.*,
            des.phone as designer_phone, des.name as designer_name, des.id as designer_id,
            sup.phone as supervisor_phone, sup.name as supervisor_name, sup.id as supervisor_id,
            mgr.phone as manager_phone, mgr.name as manager_name, mgr.id as manager_id
          FROM projects p
          LEFT JOIN employees des ON p.designer_id = des.id
          LEFT JOIN employees sup ON p.supervisor_id = sup.id
          LEFT JOIN employees mgr ON p.manager_id = mgr.id
          WHERE p.id = ?
        `).all(recentOut.project_id);

        const targets = [];
        if (proj) {
          if (proj.designer_phone) targets.push({ phone: proj.designer_phone, name: proj.designer_name, user_id: proj.designer_id });
          if (proj.supervisor_phone) targets.push({ phone: proj.supervisor_phone, name: proj.supervisor_name, user_id: proj.supervisor_id });
          if (proj.manager_phone) targets.push({ phone: proj.manager_phone, name: proj.manager_name, user_id: proj.manager_id });
        }
        const [admin] = await db.prepare('SELECT phone, name, id FROM employees WHERE id = 1').all();
        if (admin && admin.phone) targets.push({ phone: admin.phone, name: admin.name || '管理员', user_id: admin.id });

        if (targets.length > 0) {
          const content = `【${matIn?.name || '材料'}】已入库，数量：${quantity}，供应商：${supplier || '未知'}`;
          sendAppNotification('material_in', '材料已入库', content, inId, 'material_in', targets).catch(console.error);
        }
      }
    } catch (err) {
      console.error('material_in notification error:', err);
    }

    res.json({ message: '入库成功' });
  });

  app.post('/api/materials/out', checkAnyPermission(['material:write', 'warehouse:write']), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    const userId = getUserId(req);
    const { material_id, quantity, project_id, operator, note, date } = req.body;

    // 库存校验：出库数量不能超过当前库存
    const [material] = await db.prepare('SELECT quantity FROM materials WHERE id = ?').all(material_id);
    if (!material) {
      return res.status(404).json({ error: '材料不存在' });
    }
    if (material.quantity < quantity) {
      return res.status(400).json({ error: `库存不足，当前库存 ${material.quantity}，申请出库 ${quantity}` });
    }

    const stmt = db.prepare('INSERT INTO material_out (material_id, quantity, project_id, operator, note, date) VALUES (?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(material_id, quantity, project_id, operator, note, date);
    await db.prepare('UPDATE materials SET quantity = quantity - ? WHERE id = ?').run(quantity, material_id);
    const [matOut] = await db.prepare('SELECT name FROM materials WHERE id = ?').all(material_id);
    const outId = result.lastInsertRowid;
    await addLog(userId, '', '新增', '材料出库', outId, matOut?.name || material_id, `材料出库: ${matOut?.name || material_id}, 数量: ${quantity}`, req.ip);

    // 发送应用内通知：通知项目相关人
    if (project_id) {
      try {
        const [proj] = await db.prepare(`
          SELECT p.*,
            des.phone as designer_phone, des.name as designer_name, des.id as designer_id,
            sup.phone as supervisor_phone, sup.name as supervisor_name, sup.id as supervisor_id,
            mgr.phone as manager_phone, mgr.name as manager_name, mgr.id as manager_id
          FROM projects p
          LEFT JOIN employees des ON p.designer_id = des.id
          LEFT JOIN employees sup ON p.supervisor_id = sup.id
          LEFT JOIN employees mgr ON p.manager_id = mgr.id
          WHERE p.id = ?
        `).all(project_id);

        const targets = [];
        if (proj) {
          if (proj.designer_phone) targets.push({ phone: proj.designer_phone, name: proj.designer_name, user_id: proj.designer_id });
          if (proj.supervisor_phone) targets.push({ phone: proj.supervisor_phone, name: proj.supervisor_name, user_id: proj.supervisor_id });
          if (proj.manager_phone) targets.push({ phone: proj.manager_phone, name: proj.manager_name, user_id: proj.manager_id });
        }
        const [admin] = await db.prepare('SELECT phone, name, id FROM employees WHERE id = 1').all();
        if (admin && admin.phone) targets.push({ phone: admin.phone, name: admin.name || '管理员', user_id: admin.id });

        if (targets.length > 0) {
          const content = `【${matOut?.name || '材料'}】已出库，数量：${quantity}，用于项目ID：${project_id}`;
          sendAppNotification('material_out', '材料已出库', content, outId, 'material_out', targets).catch(console.error);
        }
      } catch (err) {
        console.error('material_out notification error:', err);
      }
    }

    res.json({ message: '出库成功' });
  });

  /* ==================================================================
   * 主材档案 v2 —— 品类 / 品牌 / 检索
   * ------------------------------------------------------------------
   * 设计说明见 docs/prototype/main-materials-v2.html
   *
   * 核心变化：
   *   1. 品类走 material_categories 三级字典（type_id → category_id → sub_id）
   *   2. 品牌走 material_brands 字典（brand_id），brand 旧字段继续回填保持兼容
   *   3. 检索支持：多字段 + 拼音 + 品牌别名 + 多条件组合 + 排序
   *   4. /facets 给前端做动态计数（左侧树 / 品牌下拉 / 快捷筛选的数字）
   *   5. 无 purchase 权限也能查目录，但成本类字段脱敏（原来直接 1=0 返回空，
   *      工长完全看不到主材，只能走 material-search 那个后门接口）
   * ================================================================== */

  // 成本类字段：无权限时置空（报价 quote_price 保留，本来就要给客户看）
};
