/**
 * 数据看板 / 部门 / 员工 / 用户信息（2026-10-29 渐进拆分第 17 轮）
 *
 * 搬运自 server.js 原 4423-4678 行，搬入时 256 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerOrgRoutes(app, deps) {
  const {
    db,
    pool,
    getUserId,
    addLog,
    checkPermission,
    isAdmin,
    passwordFromPhone,
    clearAuthRoleCache,
    clearUserPermCache,
    getUserPermissions,
    hasReadAllPermission,
    getManagedDepartmentIds,
    expandDepartmentIds,
  } = deps;

  app.get('/api/dashboard/stats', async (req, res) => {
    const customerCount = await db.prepare("SELECT COUNT(*) as count FROM customers").get();
    const customerThisMonth = await db.prepare("SELECT COUNT(*) as count FROM customers WHERE DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')").get();
    const contractCount = await db.prepare("SELECT COUNT(*) as count FROM contracts WHERE status = '已签订'").get();
    // v2.3.6 hotfix（10-15）: 已签合同总额——Dashboard.vue 美化版副标用
    const contractTotalAmount = await db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM contracts WHERE status = '已签订'").get();
    const projectCount = await db.prepare("SELECT COUNT(*) as count FROM projects WHERE status != '已竣工'").get();
    // v2.3.6 hotfix（10-15）: 项目总数——Dashboard.vue 美化版副标用
    const projectTotal = await db.prepare("SELECT COUNT(*) as count FROM projects").get();
    const pendingQuote = await db.prepare("SELECT COUNT(*) as count FROM quotes WHERE status = '待确认'").get();

    const income = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'income'").get();
    const expense = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'expense'").get();

    const lowStock = await db.prepare("SELECT COUNT(*) as count FROM materials WHERE quantity <= min_stock").get();

    res.json({
      customerCount: customerCount.count,
      customerThisMonth: customerThisMonth.count,
      contractCount: contractCount.count,
      contractTotalAmount: contractTotalAmount.total,
      projectCount: projectCount.count,
      projectTotal: projectTotal.count,
      pendingQuote: pendingQuote.count,
      totalIncome: income.total,
      totalExpense: expense.total,
      balance: income.total - expense.total,
      lowStock: lowStock.count
    });
  });

  app.get('/api/departments', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM departments ORDER BY id');
    res.json(await stmt.all());
  });

  app.post('/api/departments', checkPermission('department:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { name, parent_id, manager_id, description } = req.body;
    const stmt = db.prepare('INSERT INTO departments (name, parent_id, manager_id, description) VALUES (?, ?, ?, ?)');
    const result = await stmt.run(name, parent_id, manager_id, description);
    await addLog(userId, '', '新增', '部门管理', result.lastInsertRowid, name, `部门名称: ${name}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.delete('/api/departments/:id', checkPermission('department:delete'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [dept] = await db.prepare('SELECT name FROM departments WHERE id = ?').all(req.params.id);
    const deptName = dept ? dept.name : req.params.id;
    const stmt = db.prepare('DELETE FROM departments WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '部门管理', req.params.id, deptName, `删除部门: ${deptName}`, req.ip);
    res.json({ message: '删除成功' });
  });

  app.get('/api/user/info', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }
    try {
      const [rows] = await pool.query(
        `SELECT e.id, e.username, e.name, e.phone, e.position, r.name as role_name
         FROM employees e LEFT JOIN roles r ON e.role_id = r.id WHERE e.id = ?`,
        [userId]
      );
      if (rows[0]) {
        res.json(rows[0]);
      } else {
        res.status(404).json({ error: '用户不存在' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/employees', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
    const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'employee');
    // v2.3.1 P2 §3：外部人员默认不显示在通讯录，除非显式 ?include_external=1
    const includeExternal = String(req.query.include_external) === '1';
    const externalFilter = includeExternal ? '' : ' AND COALESCE(e.is_external, 0) = 0';

    // §5 通讯录默认范围：全员内部可见（不在 employees 表不算），
    // 配了 employee:read_all 才包含外部；配了 managed_department_ids 才收窄到部门范围。
    if (hasAll) {
      const stmt = db.prepare(`SELECT e.id, e.username, e.name, e.phone, e.email, e.department_id, e.position, e.role_id, e.status, e.entry_date, e.is_external, e.avatar, e.created_at, d.name as department_name, r.name as role_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN roles r ON e.role_id = r.id WHERE 1=1${externalFilter} ORDER BY e.created_at DESC`);
      return res.json(await stmt.all());
    }

    // 默认：全部内部员工（满足 employee:read 或 admin）
    const perms = await getUserPermissions(userId);
    const canReadEmployee = userIsAdmin || perms.includes('*') || perms.includes('employee:read_all') || perms.includes('employee:read');
    if (!canReadEmployee) {
      const stmt = db.prepare(`SELECT e.id, e.username, e.name, e.phone, e.email, e.department_id, e.position, e.role_id, e.status, e.entry_date, e.is_external, e.avatar, e.created_at, d.name as department_name, r.name as role_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN roles r ON e.role_id = r.id WHERE e.id = ?${externalFilter} ORDER BY e.created_at DESC`);
      return res.json(await stmt.all(userId));
    }

    // ② 有权限时，看是否配了「可管理部门」（managed_department_ids）→ 收窄到这些部门（含子部门）
    const managedDeptIds = await getManagedDepartmentIds(userId);
    if (managedDeptIds && managedDeptIds.length) {
      const deptIds = await expandDepartmentIds(managedDeptIds);
      if (deptIds.length) {
        const placeholders = deptIds.map(() => '?').join(',');
        const stmt = db.prepare(`SELECT e.id, e.username, e.name, e.phone, e.email, e.department_id, e.position, e.role_id, e.status, e.entry_date, e.is_external, e.avatar, e.created_at, d.name as department_name, r.name as role_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN roles r ON e.role_id = r.id WHERE (e.department_id IN (${placeholders}) OR e.id = ?)${externalFilter} ORDER BY e.created_at DESC`);
        return res.json(await stmt.all([...deptIds, userId]));
      }
    }
    // ③ 默认全内部（不含外部）
    const stmt = db.prepare(`SELECT e.id, e.username, e.name, e.phone, e.email, e.department_id, e.position, e.role_id, e.status, e.entry_date, e.is_external, e.avatar, e.created_at, d.name as department_name, r.name as role_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN roles r ON e.role_id = r.id WHERE 1=1${externalFilter} ORDER BY e.created_at DESC`);
    res.json(await stmt.all());
  });

  // GET /api/employees/grouped-by-department — 按部门分组的员工列表，供项目编辑页下拉用
  app.get('/api/employees/grouped-by-department', async (req, res) => {
    // 安全修复：该接口原先完全无鉴权，未登录即可拉取全公司姓名+手机号，现要求登录
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    try {
      const deptRows = await db.prepare('SELECT id, name FROM departments ORDER BY name').all();
      const empRows = await db.prepare('SELECT id, name, phone, department_id FROM employees ORDER BY department_id, name').all();
      const grouped = deptRows.map(dept => ({
        department_id: dept.id,
        department_name: dept.name,
        employees: empRows.filter(e => e.department_id === dept.id)
      }));
      const unassigned = empRows.filter(e => e.department_id === null || e.department_id === undefined);
      if (unassigned.length > 0) {
        grouped.push({ department_id: null, department_name: '未分配部门', employees: unassigned });
      }
      res.json(grouped);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 初始密码规则已抽到 ./lib/phone.js（passwordFromPhone）
  app.post('/api/employees', checkPermission('employee:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];

    const userId = getUserId(req);
    const { name, phone, email, department_id, position, role_id, status, entry_date, is_external } = req.body;
    if (!phone) return res.status(400).json({ error: '手机号必填' });
    if (!name) return res.status(400).json({ error: '姓名必填' });

    // 用户名=电话，初始密码=电话后6位
    const username = phone;
    const password = passwordFromPhone(phone);
    // v2.3.1：is_external 字段保留但不再单独使用，外部人员走独立「外部联系人」模块管理
    const ext = (Number(is_external) === 1) ? 1 : 0;

    const stmt = db.prepare(`
      INSERT INTO employees (username, password, name, phone, email, department_id, position, role_id, status, entry_date, is_external)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = await stmt.run(username, password, name, phone, email, department_id, position, role_id, status || '在职', entry_date, ext);
    await addLog(userId, '', '新增', '员工管理', result.lastInsertRowid, name, `员工姓名: ${name}，用户名: ${username}，初始密码: ${password}，外部=${ext}`, req.ip);
    clearAuthRoleCache();
    res.json({ id: result.lastInsertRowid, message: '添加成功', password });
  });

  app.put('/api/employees/:id', checkPermission('employee:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];

    const userId = getUserId(req);
    const { name, phone, email, department_id, position, role_id, status, entry_date, is_external } = req.body;
    if (!name) return res.status(400).json({ error: '姓名必填' });

    const ext = (Number(is_external) === 1) ? 1 : 0;
    const stmt = db.prepare(`
      UPDATE employees SET name=?, phone=?, email=?, department_id=?, position=?, role_id=?, status=?, entry_date=?, is_external=?
      WHERE id=?
    `);
    await stmt.run(name, phone, email, department_id, position, role_id, status, entry_date, ext, req.params.id);
    await addLog(userId, '', '编辑', '员工管理', req.params.id, name || '', `更新员工: ${name || req.params.id}，外部=${ext}`, req.ip);
    clearAuthRoleCache();
    clearUserPermCache(parseInt(req.params.id));
    res.json({ message: '更新成功' });
  });

  // 管理员重置密码（重置为手机号后6位）
  app.post('/api/employees/:id/reset-password', checkPermission('employee:reset_password'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    // 仅管理员可操作
    if (!(await isAdmin(userId))) {
      return res.status(403).json({ error: '仅管理员可重置密码' });
    }
    // 查出该员工手机号，取后6位作为新密码
    const [emp] = await db.prepare('SELECT phone FROM employees WHERE id = ?').all(req.params.id);
    if (!emp) return res.status(404).json({ error: '员工不存在' });
    const newPassword = passwordFromPhone(emp.phone);
    await db.prepare('UPDATE employees SET password=? WHERE id=?').run(newPassword, req.params.id);
    await addLog(userId, '', '重置密码', '员工管理', req.params.id, '', `重置密码，新密码: ${newPassword}`, req.ip);
    res.json({ message: '密码已重置', password: newPassword });
  });

  // 个人修改密码
  app.put('/api/employees/:id/password', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { old_password, new_password } = req.body;

    if (!userId) return res.status(401).json({ error: '未登录，请重新登录后再试' });
    if (!old_password) return res.status(400).json({ error: '请输入旧密码' });

    // 【重要】旧密码校验必须与登录接口同一口径 —— 走 MySQL 比对，不能取回 JS 里比。
    //   employees.password 列是 utf8mb4_general_ci（大小写不敏感），登录接口
    //   `WHERE username=? AND password=?` 用 `524811nini` 也能登进系统；
    //   而原来这里 `emp.password !== old_password` 是 JS 严格比较（大小写敏感），
    //   于是出现「能登录、但改密码一直提示旧密码错误」的必现 bug。
    //   改成同一口径后，两边判定完全一致。
    const emp = await db.prepare('SELECT id FROM employees WHERE id=? AND password=?')
      .get(userId, String(old_password));
    if (!emp) {
      return res.status(400).json({ error: '旧密码错误' });
    }
    const newPwd = new_password == null ? '' : String(new_password);
    if (newPwd.length < 6) {
      return res.status(400).json({ error: '新密码至少6位' });
    }
    // 提示而非拦截：密码列大小写不敏感，只改大小写等于没改
    if (newPwd.toLowerCase() === String(old_password).toLowerCase() && newPwd !== String(old_password)) {
      return res.status(400).json({ error: '新密码与旧密码仅大小写不同，系统校验不区分大小写，请换一个' });
    }
    await db.prepare('UPDATE employees SET password=? WHERE id=?').run(newPwd, userId);
    await addLog(userId, '', '修改密码', '员工管理', userId, '', '修改登录密码', req.ip);
    res.json({ message: '密码修改成功' });
  });

  app.delete('/api/employees/:id', checkPermission('employee:delete'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [emp] = await db.prepare('SELECT name FROM employees WHERE id = ?').all(req.params.id);
    const empName = emp ? emp.name : req.params.id;
    const stmt = db.prepare('DELETE FROM employees WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '员工管理', req.params.id, empName, `删除员工: ${empName}`, req.ip);
    clearAuthRoleCache();
    res.json({ message: '删除成功' });
  });

};
