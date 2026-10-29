'use strict';
/**
 * 身份与授权：角色 / 权限 / 借权 / 我的权限
 * ---------------------------------------------------------------
 * 2026-10-29 从 server.js 整体抽出（渐进拆分第 6 步，160 行 / 11 个路由）。
 * 代码逐行搬迁、逻辑零改动，只把外部依赖改成参数注入。
 *
 * 为什么这 11 个路由编在一个文件：
 *   它们在 server.js 里本来就是连续的 160 行，「谁能做什么」是同一个域——
 *   roles（角色定义）· permissions（权限点表）· impersonate（管理员借权）
 *   · me / my-permissions（当前身份与权限）。按业务模块名硬切成三个文件，
 *   反而要重复注入同一批依赖，徒增出错面。
 *
 * 接口清单：
 *   GET    /api/roles                      角色列表（无鉴权，前端建表用）
 *   POST   /api/roles                      新增角色      role:write
 *   PUT    /api/roles/:id                  修改角色      role:write
 *   DELETE /api/roles/:id                  删除角色      role:delete + 管理员
 *   GET    /api/me                         当前身份 + 权限（前端据此渲染菜单）
 *   GET    /api/admin/impersonate-targets  可借权员工列表（仅管理员）
 *   POST   /api/admin/impersonate          以他人身份进入（仅管理员，写审计）
 *   POST   /api/admin/impersonate/stop     结束借权（仅管理员，写审计）
 *   GET    /api/permissions                权限点全表
 *   GET    /api/my-permissions             当前用户权限码（移动端用）
 *   POST   /api/permissions                新增权限点
 *
 * ⚠️ 三个历史坑，改这几行之前先读：
 *   1. PUT /api/roles/:id 必须只更新「本次传入」的字段。
 *      2026-10-10 事故：配置消息订阅时把 admin 角色的 name/code 写成空
 *      → isAdmin 失效 → 管理员掉权限。所以用 sets[] 动态拼，别改成整行 UPDATE。
 *   2. 这里 db 与 pool 混用：db 是 db-mysql-async 的 Database 实例（带 prepare().run/all/get），
 *      pool 是 mysql2 原生连接池。PUT 用 pool.query 是因为要动态拼 SET。
 *   3. 每个写操作之后必须 clearAuthRoleCache()——权限有 10s 缓存，
 *      不清的话改完角色要等 10 秒才生效，现场容易被误判为「没保存成功」。
 *
 * 注入的依赖（全部来自 server.js，本模块不自己连库、不自己算权限）：
 *   db                  Database 实例（prepare 风格）
 *   pool                mysql2 连接池
 *   checkPermission     鉴权中间件工厂
 *   getUserId           req → 员工 id
 *   isAdmin             userId → 是否管理员
 *   getUserPermissions  userId → 权限码数组
 *   addLog              写操作日志
 *   clearAuthRoleCache  清权限缓存
 */

module.exports = function registerIdentityRoutes(app, deps) {
  const {
    db, pool, checkPermission, getUserId, isAdmin,
    getUserPermissions, addLog, clearAuthRoleCache,
  } = deps;

  app.get('/api/roles', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM roles ORDER BY id');
    res.json(await stmt.all());
  });

  app.post('/api/roles', checkPermission('role:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];

    const userId = getUserId(req);
    const { name, code, description, permissions, notification_types, managed_department_ids } = req.body;
    const stmt = db.prepare('INSERT INTO roles (name, code, description, permissions, notification_types, managed_department_ids) VALUES (?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(
      name, code, description,
      JSON.stringify(permissions || []),
      JSON.stringify(notification_types || []),
      managed_department_ids ? JSON.stringify(managed_department_ids) : null
    );
    await addLog(userId, '', '新增', '角色管理', result.lastInsertRowid, name, `角色名称: ${name}`, req.ip);
    clearAuthRoleCache();
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.put('/api/roles/:id', checkPermission('role:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];

    const userId = getUserId(req);
    const { name, code, description, permissions, notification_types, managed_department_ids } = req.body;
    // 注意：这里使用 pool 而不是 db（db 是 better-sqlite3，pool 是 mysql2）
    // 2026-10-10 修复：只更新"本次传入"的字段，避免只改消息订阅时把 name/code 等写成空
    // （历史事故：配置 notification_types 导致 admin 角色的 name/code 被清空 → isAdmin 失效）
    const sets = [];
    const vals = [];
    if (name !== undefined) { sets.push('name=?'); vals.push(name); }
    if (code !== undefined) { sets.push('code=?'); vals.push(code); }
    if (description !== undefined) { sets.push('description=?'); vals.push(description); }
    if (permissions !== undefined) { sets.push('permissions=?'); vals.push(JSON.stringify(permissions || [])); }
    if (notification_types !== undefined) { sets.push('notification_types=?'); vals.push(JSON.stringify(notification_types || [])); }
    if (managed_department_ids !== undefined) { sets.push('managed_department_ids=?'); vals.push(managed_department_ids ? JSON.stringify(managed_department_ids) : null); }
    if (sets.length === 0) return res.json({ message: '无更新字段' });
    vals.push(req.params.id);
    await pool.query(`UPDATE roles SET ${sets.join(', ')} WHERE id=?`, vals);
    await addLog(userId, '', '编辑', '角色管理', req.params.id, name || '', `更新角色: ${name || req.params.id}`, req.ip);
    clearAuthRoleCache();
    res.json({ message: '更新成功' });
  });

  app.delete('/api/roles/:id', checkPermission('role:delete'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [role] = await db.prepare('SELECT name FROM roles WHERE id = ?').all(req.params.id);
    const roleName = role ? role.name : req.params.id;
    const stmt = db.prepare('DELETE FROM roles WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '角色管理', req.params.id, roleName, `删除角色: ${roleName}`, req.ip);
    clearAuthRoleCache();
    res.json({ message: '删除成功' });
  });

  // ==================== 管理员借权（模拟身份，仅用于测试业务流程） 2026-10-10 ====================
  // 当前身份（含是否管理员）——客户端据此决定是否展示"借权"入口
  app.get('/api/me', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const emp = await db.prepare(`
        SELECT e.id, e.username, e.name, e.phone, e.position,
               r.name AS role_name, r.code AS role_code
        FROM employees e LEFT JOIN roles r ON e.role_id = r.id WHERE e.id = ?
      `).get(userId);
      if (!emp) return res.status(404).json({ error: '用户不存在' });
      const permissions = await getUserPermissions(userId);
      res.json({ ...emp, is_admin: await isAdmin(userId), permissions });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 可借权目标列表（在职员工）——仅管理员
  app.get('/api/admin/impersonate-targets', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '仅管理员可使用借权功能' });
      const rows = await db.prepare(`
        SELECT e.id, e.username, e.name, e.position, e.status,
               r.name AS role_name, r.code AS role_code
        FROM employees e LEFT JOIN roles r ON e.role_id = r.id
        WHERE e.status = '在职'
        ORDER BY r.name, e.name
      `).all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 借权：以指定员工身份进入系统——仅管理员，且会写入操作日志
  app.post('/api/admin/impersonate', async (req, res) => {
    try {
      const adminId = getUserId(req);
      if (!(await isAdmin(adminId))) return res.status(403).json({ error: '仅管理员可使用借权功能' });
      const targetId = parseInt(req.body.target_employee_id);
      if (!targetId || isNaN(targetId)) return res.status(400).json({ error: '缺少 target_employee_id' });
      const target = await db.prepare(`
        SELECT e.id, e.username, e.name, e.phone, e.position, e.role_id, e.status,
               r.name AS role_name, r.code AS role_code, r.permissions AS role_permissions
        FROM employees e LEFT JOIN roles r ON e.role_id = r.id
        WHERE e.id = ?
      `).get(targetId);
      if (!target) return res.status(404).json({ error: '目标员工不存在' });
      await addLog(adminId, '', '借权登录', '身份借用', targetId, target.name,
        `管理员借权为 ${target.name}(${target.username}/${target.role_name || '-'})`, req.ip);
      res.json({
        success: true,
        impersonate_by: adminId,
        user: { ...target, permissions: target.role_permissions || '[]' }
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 结束借权（仅记录审计）
  app.post('/api/admin/impersonate/stop', async (req, res) => {
    try {
      const adminId = getUserId(req);
      const targetId = parseInt(req.body.target_employee_id) || 0;
      if (adminId && await isAdmin(adminId)) {
        await addLog(adminId, '', '结束借权', '身份借用', targetId, '', '管理员结束借权', req.ip);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/permissions', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM permissions ORDER BY sort_order, id');
    res.json(await stmt.all());
  });

  // 获取当前用户的权限列表（供移动端使用）
  app.get('/api/my-permissions', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await getUserPermissions(userId);
      res.json({ permissions: perms });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // v2.5.3 鉴权加固：
  // ① 原本零校验，任何人不带 header 就能往权限表插数据（能凭空造出权限点，用于给角色授权）；
  // ② 原本整个 handler 没有 try/catch —— await 抛错会变成 unhandled rejection，
  //    在 Node 18+ 默认行为下直接终止进程 → 全站 502。这里补上，和同文件其他写接口一致。
  app.post('/api/permissions', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可新增权限项' });
      const { name, code, parent_id, type, path, icon, sort_order } = req.body;
      const stmt = db.prepare('INSERT INTO permissions (name, code, parent_id, type, path, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const result = await stmt.run(name, code, parent_id, type || 'menu', path, icon, sort_order || 0);
      res.json({ id: result.lastInsertRowid, message: '添加成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};
