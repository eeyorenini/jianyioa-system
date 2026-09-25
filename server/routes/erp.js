'use strict';

const express = require('express');
const router = express.Router();

const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');
const { addLog } = require('../utils/addLog');
const { pool } = require('../db-mysql-async');
const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');

router.get('/api/buildings', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM buildings ORDER BY created_at DESC');
  res.json(await stmt.all());
});


router.post('/api/buildings', async (req, res) => {
  const { name, address, area, building_type, total_houses, developer, property_fee, status } = req.body;
  const stmt = db.prepare('INSERT INTO buildings (name, address, area, building_type, total_houses, developer, property_fee, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(name, address, area, building_type, total_houses, developer, property_fee, status || '在售');
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/buildings/:id', async (req, res) => {
    
  const userId = getUserId(req);
  const { name, address, area, building_type, total_houses, developer, property_fee, status } = req.body;
  await db.prepare('UPDATE buildings SET name=?, address=?, area=?, building_type=?, total_houses=?, developer=?, property_fee=?, status=? WHERE id=?')
    .run(name, address, area, building_type, total_houses, developer, property_fee, status, req.params.id);
  await addLog(userId, '', '编辑', '楼盘管理', req.params.id, name, `更新楼盘: ${name}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/buildings/:id', async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [b] = await db.prepare('SELECT name FROM buildings WHERE id = ?').all(req.params.id);
  const bName = b ? b.name : req.params.id;
  await db.prepare('DELETE FROM buildings WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '楼盘管理', req.params.id, bName, `删除楼盘: ${bName}`, req.ip);
  res.json({ message: '删除成功' });
});

// 渠道管理

router.get('/api/channels', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM channels ORDER BY created_at DESC');
  res.json(await stmt.all());
});


router.post('/api/channels', async (req, res) => {
  const { name, type, contact_person, contact_phone, address, commission_rate, status, remark } = req.body;
  const stmt = db.prepare('INSERT INTO channels (name, type, contact_person, contact_phone, address, commission_rate, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(name, type, contact_person, contact_phone, address, commission_rate || 0, status || '合作中', remark);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/channels/:id', async (req, res) => {
    
  const userId = getUserId(req);
  const { name, type, contact_person, contact_phone, address, commission_rate, status, remark } = req.body;
  await db.prepare('UPDATE channels SET name=?, type=?, contact_person=?, contact_phone=?, address=?, commission_rate=?, status=?, remark=? WHERE id=?')
    .run(name, type, contact_person, contact_phone, address, commission_rate, status, remark, req.params.id);
  await addLog(userId, '', '编辑', '渠道管理', req.params.id, name, `更新渠道: ${name}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/channels/:id', async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [c] = await db.prepare('SELECT name FROM channels WHERE id = ?').all(req.params.id);
  const cName = c ? c.name : req.params.id;
  await db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '渠道管理', req.params.id, cName, `删除渠道: ${cName}`, req.ip);
  res.json({ message: '删除成功' });
});

// 营销案例

router.get('/api/marketing-cases', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM marketing_cases ORDER BY created_at DESC');
  res.json(await stmt.all());
});


router.post('/api/marketing-cases', async (req, res) => {
  const { title, building_name, area, style, budget, cost, images, description, status, publish_date } = req.body;
  const stmt = db.prepare('INSERT INTO marketing_cases (title, building_name, area, style, budget, cost, images, description, status, publish_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(title, building_name, area, style, budget, cost, JSON.stringify(images || []), description, status || '草稿', publish_date);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/marketing-cases/:id', async (req, res) => {
    
  const userId = getUserId(req);
  const { title, building_name, area, style, budget, cost, images, description, status, publish_date } = req.body;
  await db.prepare('UPDATE marketing_cases SET title=?, building_name=?, area=?, style=?, budget=?, cost=?, images=?, description=?, status=?, publish_date=? WHERE id=?')
    .run(title, building_name, area, style, budget, cost, JSON.stringify(images || []), description, status, publish_date, req.params.id);
  await addLog(userId, '', '编辑', '营销案例', req.params.id, title, `更新案例: ${title}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/marketing-cases/:id', async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [mc] = await db.prepare('SELECT title FROM marketing_cases WHERE id = ?').all(req.params.id);
  const mcTitle = mc ? mc.title : req.params.id;
  await db.prepare('DELETE FROM marketing_cases WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '营销案例', req.params.id, mcTitle, `删除案例: ${mcTitle}`, req.ip);
  res.json({ message: '删除成功' });
});

// 供应商管理

router.get('/api/suppliers', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM suppliers ORDER BY created_at DESC');
  res.json(await stmt.all());
});


router.post('/api/suppliers', async (req, res) => {
  const { name, type, contact_person, contact_phone, address, bank_account, tax_number, status, remark } = req.body;
  const stmt = db.prepare('INSERT INTO suppliers (name, type, contact_person, contact_phone, address, bank_account, tax_number, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(name, type, contact_person, contact_phone, address, bank_account, tax_number, status || '合作中', remark);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/suppliers/:id', async (req, res) => {
    
  const userId = getUserId(req);
  const { name, type, contact_person, contact_phone, address, bank_account, tax_number, status, remark } = req.body;
  await db.prepare('UPDATE suppliers SET name=?, type=?, contact_person=?, contact_phone=?, address=?, bank_account=?, tax_number=?, status=?, remark=? WHERE id=?')
    .run(name, type, contact_person, contact_phone, address, bank_account, tax_number, status, remark, req.params.id);
  await addLog(userId, '', '编辑', '供应商管理', req.params.id, name, `更新供应商: ${name}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/suppliers/:id', async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [s] = await db.prepare('SELECT name FROM suppliers WHERE id = ?').all(req.params.id);
  const sName = s ? s.name : req.params.id;
  await db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '供应商管理', req.params.id, sName, `删除供应商: ${sName}`, req.ip);
  res.json({ message: '删除成功' });
});

// 采购单

router.get('/api/purchases', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM purchases ORDER BY created_at DESC');
  res.json(await stmt.all());
});


router.post('/api/purchases', async (req, res) => {
    
  const userId = getUserId(req);
  const { purchase_no, supplier_id, supplier_name, project_id, project_name, total_amount, status, purchase_date, expected_date, operator, remark } = req.body;
  const stmt = db.prepare('INSERT INTO purchases (purchase_no, supplier_id, supplier_name, project_id, project_name, total_amount, status, purchase_date, expected_date, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(purchase_no, supplier_id, supplier_name, project_id, project_name, total_amount || 0, status || '待审核', purchase_date, expected_date, operator, remark);
  await addLog(userId, '', '新增', '采购管理', result.lastInsertRowid, project_name || purchase_no, `采购单号: ${purchase_no}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/purchases/:id', async (req, res) => {
    
  const userId = getUserId(req);
  const { total_amount, paid_amount, status, remark } = req.body;
  await db.prepare('UPDATE purchases SET total_amount=?, paid_amount=?, status=?, remark=? WHERE id=?')
    .run(total_amount, paid_amount, status, remark, req.params.id);
  await addLog(userId, '', '编辑', '采购管理', req.params.id, '', `更新采购单 ID: ${req.params.id}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/purchases/:id', async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM purchases WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '采购管理', req.params.id, '', `删除采购单 ID: ${req.params.id}`, req.ip);
  res.json({ message: '删除成功' });
});

// 成本记录

router.get('/api/cost-records', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM cost_records ORDER BY created_at DESC');
  res.json(await stmt.all());
});


router.get('/api/cost-records/project/:projectId', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM cost_records WHERE project_id = ? ORDER BY date DESC');
  res.json(await stmt.all(req.params.projectId));
});


router.post('/api/cost-records', async (req, res) => {
  const { project_id, project_name, type, category, amount, date, operator, invoice_status, remark } = req.body;
  const stmt = db.prepare('INSERT INTO cost_records (project_id, project_name, type, category, amount, date, operator, invoice_status, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(project_id, project_name, type, category, amount, date, operator, invoice_status || '未开票', remark);
  await addLog(userId, '', '新增', '费用记录', result.lastInsertRowid, project_name, `费用项目: ${project_name}, 金额: ${amount}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.delete('/api/cost-records/:id', async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM cost_records WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '费用记录', parseInt(req.params.id), '', `删除费用记录 ID: ${req.params.id}`, req.ip);
  res.json({ message: '删除成功' });
});

// 整改问题

router.get('/api/rectification-issues', async (req, res) => {
  const { project_id } = req.query;
  let sql = `SELECT ri.*, e.name as creator_name
    FROM rectification_issues ri
    LEFT JOIN employees e ON ri.creator_id = e.id`;
  const params = [];
  if (project_id) {
    sql += ' WHERE ri.project_id = ?';
    params.push(project_id);
  }
  sql += ' ORDER BY ri.created_at DESC';
  const stmt = db.prepare(sql);
  res.json(params.length ? await stmt.all(...params) : await stmt.all());
});


router.post('/api/rectification-issues', async (req, res) => {
  const userId = getUserId(req);
  const { inspection_id, project_id, project_name, issue_desc, priority, status, responsible_id, responsible_name, due_date, images, remark, title, category, location, level, description } = req.body;
  const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const stmt = db.prepare(`INSERT INTO rectification_issues
    (inspection_id, project_id, project_name, issue_desc, priority, status, responsible_id, responsible_name, due_date, images, remark, title, category, location, level, description, creator_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const result = await stmt.run(
    inspection_id, project_id, project_name,
    issue_desc || title || '', priority || '普通', status || '待处理',
    responsible_id, responsible_name, due_date,
    JSON.stringify(images || []), remark || description || '',
    title || issue_desc || '', category || '', location || '', level || '', description || '', userId, nowStr
  );
  await addLog(userId, '', '新增', '整改问题', result.lastInsertRowid, project_name, `整改问题: ${(title || issue_desc || '').slice(0, 30)}`, req.ip);

  // 发送站内通知：项目经理/监理/管理员/客户
  await notifyProject('inspection_submit', project_id,
    `【新巡检问题】${project_name || '项目'}`,
    `问题：${(issue_desc || title || '').slice(0, 100)}`,
    result.lastInsertRowid, 'rectification_issue', null, project_id
  );

  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/rectification-issues/:id', async (req, res) => {
  const { status, finish_date, remark } = req.body;
  await db.prepare('UPDATE rectification_issues SET status=?, finish_date=?, remark=? WHERE id=?')
    .run(status, finish_date, remark, req.params.id);
  await addLog(userId, '', '编辑', '整改问题', parseInt(req.params.id), '', `更新整改状态: ${status}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/rectification-issues/:id', async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM rectification_issues WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '整改问题', parseInt(req.params.id), '', `删除整改问题 ID: ${req.params.id}`, req.ip);
  res.json({ message: '删除成功' });
});

// 考勤管理

router.get('/api/attendance', async (req, res) => {
  const { employee_id, date } = req.query;
  let sql = 'SELECT * FROM attendance WHERE 1=1';
  const params = [];
  if (employee_id) { sql += ' AND employee_id = ?'; params.push(employee_id); }
  if (date) { sql += ' AND date = ?'; params.push(date); }
  sql += ' ORDER BY date DESC, check_in_time DESC';
  const stmt = db.prepare(sql);
  res.json(await stmt.all(...params));
});


router.post('/api/attendance', async (req, res) => {
  const { employee_id, employee_name, date, check_in_time, check_out_time, work_hours, status, type, remark } = req.body;
  const stmt = db.prepare('INSERT INTO attendance (employee_id, employee_name, date, check_in_time, check_out_time, work_hours, status, type, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(employee_id, employee_name, date, check_in_time, check_out_time, work_hours || 0, status || '正常', type || '上班', remark);
  await addLog(userId, '', '新增', '考勤记录', result.lastInsertRowid, employee_name, `考勤: ${employee_name}, 日期: ${date}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.delete('/api/attendance/:id', async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM attendance WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '考勤记录', parseInt(req.params.id), '', `删除考勤记录 ID: ${req.params.id}`, req.ip);
  res.json({ message: '删除成功' });
});

// 售后维保

router.get('/api/warranties', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM warranties ORDER BY created_at DESC');
  res.json(await stmt.all());
});


router.post('/api/warranties', async (req, res) => {
  const { project_id, project_name, customer_name, customer_phone, type, description, images, status, handle_user, handle_date, result, satisfaction, cost } = req.body;
  const stmt = db.prepare('INSERT INTO warranties (project_id, project_name, customer_name, customer_phone, type, description, images, status, handle_user, handle_date, result, satisfaction, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result2 = await stmt.run(project_id, project_name, customer_name, customer_phone, type, description, JSON.stringify(images || []), status || '待处理', handle_user, handle_date, result, satisfaction, cost || 0);
  await addLog(userId, '', '新增', '售后维保', result2.lastInsertRowid, project_name, `维保项目: ${project_name}, 类型: ${type}`, req.ip);
  res.json({ id: result2.lastInsertRowid, message: '添加成功' });
});


router.put('/api/warranties/:id', async (req, res) => {
  const { status, handle_date, result, satisfaction, cost, remark } = req.body;
  await db.prepare('UPDATE warranties SET status=?, handle_date=?, result=?, satisfaction=?, cost=?, remark=? WHERE id=?')
    .run(status, handle_date, result, satisfaction, cost, remark, req.params.id);
  await addLog(userId, '', '编辑', '售后维保', parseInt(req.params.id), '', `更新维保状态: ${status}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/warranties/:id', async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM warranties WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '售后维保', parseInt(req.params.id), '', `删除维保记录 ID: ${req.params.id}`, req.ip);
  res.json({ message: '删除成功' });
});

// 设计量房

router.get('/api/design-measurements', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM design_measurements ORDER BY created_at DESC');
  res.json(await stmt.all());
});


router.post('/api/design-measurements', async (req, res) => {
  const { customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status, drawings, remark } = req.body;
  const stmt = db.prepare('INSERT INTO design_measurements (customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status, drawings, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status || '待测量', drawings, remark);
  await addLog(userId, '', '新增', '设计量房', result.lastInsertRowid, customer_name, `量房客户: ${customer_name}, 楼盘: ${building_name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/design-measurements/:id', async (req, res) => {
  const { status, drawings, remark } = req.body;
  await db.prepare('UPDATE design_measurements SET status=?, drawings=?, remark=? WHERE id=?')
    .run(status, drawings, remark, req.params.id);
  await addLog(userId, '', '编辑', '设计量房', parseInt(req.params.id), '', `更新量房状态: ${status}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/design-measurements/:id', async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM design_measurements WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '设计量房', parseInt(req.params.id), '', `删除量房记录 ID: ${req.params.id}`, req.ip);
  res.json({ message: '删除成功' });
});

// Boss看板数据

module.exports = router;