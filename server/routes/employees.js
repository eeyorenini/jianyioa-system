'use strict';

const express = require('express');
const router = express.Router();

const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');
const { addLog } = require('../utils/addLog');
const { pool } = require('../db-mysql-async');
const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');

router.post('/api/departments', checkPermission('department:write'), async (req, res) => {
  const userId = getUserId(req);
  const { name, parent_id, manager_id, description } = req.body;
  const stmt = db.prepare('INSERT INTO departments (name, parent_id, manager_id, description) VALUES (?, ?, ?, ?)');
  const result = await stmt.run(name, parent_id, manager_id, description);
  await addLog(userId, '', '新增', '部门管理', result.lastInsertRowid, name, `部门名称: ${name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.delete('/api/departments/:id', checkPermission('department:delete'), async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [dept] = await db.prepare('SELECT name FROM departments WHERE id = ?').all(req.params.id);
  const deptName = dept ? dept.name : req.params.id;
  const stmt = db.prepare('DELETE FROM departments WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '部门管理', req.params.id, deptName, `删除部门: ${deptName}`, req.ip);
  res.json({ message: '删除成功' });
});


router.get('/api/user/info', async (req, res) => {
    
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


router.get('/api/departments', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'department');
  if (hasAll) {
    const stmt = db.prepare('SELECT * FROM departments ORDER BY id');
    return res.json(await stmt.all());
  }
  // 非 read_all 只能看到自己所属部门，兼容 creator_id 逻辑
  const stmt = db.prepare('SELECT * FROM departments ORDER BY id');
  res.json(await stmt.all());
});


router.get('/api/employees', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'employee');
  if (hasAll) {
    const stmt = db.prepare(`SELECT e.*, d.name as department_name, r.name as role_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN roles r ON e.role_id = r.id ORDER BY e.created_at DESC`);
    return res.json(await stmt.all());
  }
  const stmt = db.prepare(`SELECT e.*, d.name as department_name, r.name as role_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN roles r ON e.role_id = r.id WHERE e.id = ? ORDER BY e.created_at DESC`);
  res.json(await stmt.all(userId));
});

// GET /api/employees/grouped-by-department — 按部门分组的员工列表，供项目编辑页下拉用

router.get('/api/employees/grouped-by-department', async (req, res) => {
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

// 生成6位随机数字密码
function generateRandomPassword() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 密码取电话后6位
function passwordFromPhone(phone) {
  return phone ? phone.slice(-6) : '123456';
}


router.post('/api/employees', checkPermission('employee:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { name, phone, email, department_id, position, role_id, status, entry_date, salary, id_card, emergency_contact, emergency_phone } = req.body;
  if (!phone) return res.status(400).json({ error: '手机号必填' });
  if (!name) return res.status(400).json({ error: '姓名必填' });

  // 用户名=电话，初始密码=电话后6位
  const username = phone;
  const password = passwordFromPhone(phone);

  const stmt = db.prepare(`
    INSERT INTO employees (username, password, name, phone, email, department_id, position, role_id, status, entry_date, salary, id_card, emergency_contact, emergency_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = await stmt.run(username, password, name, phone, email, department_id, position, role_id, status || '在职', entry_date, salary, id_card, emergency_contact, emergency_phone);
  await addLog(userId, '', '新增', '员工管理', result.lastInsertRowid, name, `员工姓名: ${name}，用户名: ${username}，初始密码: ${password}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功', password });
});


router.put('/api/employees/:id', checkPermission('employee:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { name, phone, email, department_id, position, role_id, status, entry_date, salary, id_card, emergency_contact, emergency_phone } = req.body;
  if (!name) return res.status(400).json({ error: '姓名必填' });

  // 不允许通过此接口修改用户名（用户名就是电话）
  const stmt = db.prepare(`
    UPDATE employees SET name=?, phone=?, email=?, department_id=?, position=?, role_id=?, status=?, entry_date=?, salary=?, id_card=?, emergency_contact=?, emergency_phone=?
    WHERE id=?
  `);
  await stmt.run(name, phone, email, department_id, position, role_id, status, entry_date, salary, id_card, emergency_contact, emergency_phone, req.params.id);
  await addLog(userId, '', '编辑', '员工管理', req.params.id, name || '', `更新员工: ${name || req.params.id}`, req.ip);
  res.json({ message: '更新成功' });
});

// 管理员重置密码（重置为手机号后6位）

router.post('/api/employees/:id/reset-password', checkPermission('employee:reset_password'), async (req, res) => {
    
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

router.put('/api/employees/:id/password', async (req, res) => {
    
  const userId = getUserId(req);
  const { old_password, new_password } = req.body;

  // 校验旧密码
  const emp = await db.prepare('SELECT password FROM employees WHERE id=?').get(userId);
  if (!emp || emp.password !== old_password) {
    return res.status(400).json({ error: '旧密码错误' });
  }
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: '新密码至少6位' });
  }
  await db.prepare('UPDATE employees SET password=? WHERE id=?').run(new_password, userId);
  await addLog(userId, '', '修改密码', '员工管理', userId, '', '修改登录密码', req.ip);
  res.json({ message: '密码修改成功' });
});


router.delete('/api/employees/:id', checkPermission('employee:delete'), async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [emp] = await db.prepare('SELECT name FROM employees WHERE id = ?').all(req.params.id);
  const empName = emp ? emp.name : req.params.id;
  const stmt = db.prepare('DELETE FROM employees WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '员工管理', req.params.id, empName, `删除员工: ${empName}`, req.ip);
  res.json({ message: '删除成功' });
});


router.get('/api/roles', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM roles ORDER BY id');
  res.json(await stmt.all());
});


router.post('/api/roles', checkPermission('role:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { name, code, description, permissions } = req.body;
  const stmt = db.prepare('INSERT INTO roles (name, code, description, permissions) VALUES (?, ?, ?, ?)');
  const result = await stmt.run(name, code, description, JSON.stringify(permissions || []));
  await addLog(userId, '', '新增', '角色管理', result.lastInsertRowid, name, `角色名称: ${name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/roles/:id', checkPermission('role:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { name, code, description, permissions } = req.body;
  const stmt = db.prepare('UPDATE roles SET name=?, code=?, description=?, permissions=? WHERE id=?');
  await stmt.run(name, code, description, JSON.stringify(permissions || []), req.params.id);
  await addLog(userId, '', '编辑', '角色管理', req.params.id, name, `更新角色: ${name}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/roles/:id', checkPermission('role:delete'), async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [role] = await db.prepare('SELECT name FROM roles WHERE id = ?').all(req.params.id);
  const roleName = role ? role.name : req.params.id;
  const stmt = db.prepare('DELETE FROM roles WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '角色管理', req.params.id, roleName, `删除角色: ${roleName}`, req.ip);
  res.json({ message: '删除成功' });
});


router.get('/api/permissions', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM permissions ORDER BY sort_order, id');
  res.json(await stmt.all());
});


router.post('/api/permissions', async (req, res) => {
  const { name, code, parent_id, type, path, icon, sort_order } = req.body;
  const stmt = db.prepare('INSERT INTO permissions (name, code, parent_id, type, path, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(name, code, parent_id, type || 'menu', path, icon, sort_order || 0);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

// 旧版审批 CRUD 已移除（见下方新版审批 API）

// ==================== 审批相关 API ====================

module.exports = router;