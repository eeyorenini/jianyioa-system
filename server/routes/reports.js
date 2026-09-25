'use strict';

const express = require('express');
const router = express.Router();

const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');
const { addLog } = require('../utils/addLog');
const { pool } = require('../db-mysql-async');
const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');

router.get('/api/reports', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM reports ORDER BY created_at DESC');
  res.json(await stmt.all());
});


router.post('/api/reports', async (req, res) => {
    
  const userId = getUserId(req);
  const { title, content, report_type, reporter_id, reporter_name, status } = req.body;
  const stmt = db.prepare('INSERT INTO reports (title, content, report_type, reporter_id, reporter_name, status) VALUES (?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(title, content, report_type, reporter_id, reporter_name, status || '待审核');
  await addLog(userId, '', '新增', '汇报管理', result.lastInsertRowid, title, `汇报标题: ${title}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/reports/:id', async (req, res) => {
    
  const userId = getUserId(req);
  const { title, content, report_type, status, reviewer_id, reviewer_name, review_time } = req.body;
  const stmt = db.prepare('UPDATE reports SET title=?, content=?, report_type=?, status=?, reviewer_id=?, reviewer_name=?, review_time=? WHERE id=?');
  await stmt.run(title, content, report_type, status, reviewer_id, reviewer_name, review_time, req.params.id);
  await addLog(userId, '', '编辑', '汇报管理', req.params.id, title, `更新汇报: ${title}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/reports/:id', async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [r] = await db.prepare('SELECT title FROM reports WHERE id = ?').all(req.params.id);
  const rTitle = r ? r.title : req.params.id;
  const stmt = db.prepare('DELETE FROM reports WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '汇报管理', req.params.id, rTitle, `删除汇报: ${rTitle}`, req.ip);
  res.json({ message: '删除成功' });
});


router.get('/api/inspections', async (req, res) => {
  const { project_id } = req.query;
  let stmt;
  if (project_id) {
    stmt = db.prepare('SELECT * FROM inspections WHERE project_id = ? ORDER BY created_at DESC');
    res.json(await stmt.all(project_id));
  } else {
    stmt = db.prepare('SELECT * FROM inspections ORDER BY created_at DESC');
    res.json(await stmt.all());
  }
});


router.post('/api/inspections', checkPermission('inspection:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { project_id, project_name, inspector_id, inspector_name, score, status, issues, images, result, rectify_status } = req.body;
  const stmt = db.prepare('INSERT INTO inspections (project_id, project_name, inspector_id, inspector_name, score, status, issues, images, result, rectify_status, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
  const result2 = await stmt.run(project_id, project_name, inspector_id, inspector_name, score, status || '待整改', issues, JSON.stringify(images || []), result, rectify_status || '待整改', userId);
  await addLog(userId, '', '新增', '验房管理', result2.lastInsertRowid, project_name, `项目: ${project_name}`, req.ip);

  // 通知：巡检验收提交
  notifyProject(
    'inspection_submit',
    project_id,
    `工地巡检提交：${project_name}`,
    `工地巡检已提交，巡检人：${inspector_name}，得分：${score || '未评分'}。请及时查看。`,
    result2.lastInsertRowid,
    'inspection'
  ).catch(console.error);

  res.json({ id: result2.lastInsertRowid, message: '添加成功' });
});


router.put('/api/inspections/:id', checkPermission('inspection:write'), async (req, res) => {

  const userId = getUserId(req);
  const { score, status, issues, result, rectify_status } = req.body;
  // 权限检查
  const [existing] = await db.prepare('SELECT project_name, creator_id FROM inspections WHERE id = ?').all(req.params.id);
  if (!existing) return res.status(404).json({ error: '验房记录不存在' });
  if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
  const inspName = existing.project_name;
  const stmt = db.prepare('UPDATE inspections SET score=?, status=?, issues=?, result=?, rectify_status=? WHERE id=?');
  await stmt.run(score, status, issues, result, rectify_status, req.params.id);
  await addLog(userId, '', '编辑', '验房管理', req.params.id, inspName, `更新验房: ${inspName}`, req.ip);
  res.json({ message: '更新成功' });
});

// 删除巡检（谁创建谁可以删除）

router.delete('/api/inspections/:id', checkPermission('inspection:delete'), async (req, res) => {
  const userId = getUserId(req);
  const [insp] = await db.prepare('SELECT project_name, creator_id FROM inspections WHERE id = ?').all(req.params.id);
  if (!insp) return res.status(404).json({ error: '记录不存在' });
  if (insp.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
  const inspName = insp.project_name;
  const stmt = db.prepare('DELETE FROM inspections WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '验房管理', req.params.id, inspName, `删除验房: ${inspName}`, req.ip);
  res.json({ message: '删除成功' });
});

// 获取我的巡检（当前用户创建的所有整改问题）

router.get('/api/my/inspections', async (req, res) => {
  const userId = getUserId(req);
  try {
    const stmt = db.prepare(`
      SELECT r.*, p.name as project_name
      FROM rectification_issues r
      LEFT JOIN projects p ON r.project_id = p.id
      WHERE r.creator_id = ? OR r.creator_id IS NULL
      ORDER BY r.created_at DESC
    `);
    res.json(await stmt.all(userId));
  } catch (e) {
    console.error('查询巡检失败:', e.message);
    res.json([]);
  }
});


router.get('/api/acceptance', async (req, res) => {
  const { project_id } = req.query;
  let stmt;
  if (project_id) {
    stmt = db.prepare('SELECT * FROM acceptance WHERE project_id = ? ORDER BY created_at DESC');
    res.json(await stmt.all(project_id));
  } else {
    stmt = db.prepare('SELECT * FROM acceptance ORDER BY created_at DESC');
    res.json(await stmt.all());
  }
});


router.post('/api/acceptance', checkPermission('acceptance:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { project_id, project_name, stage, accept_status, accept_date, quality_score, issues, attachment } = req.body;
  const stmt = db.prepare('INSERT INTO acceptance (project_id, project_name, stage, accept_status, accept_date, quality_score, issues, attachment, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(project_id, project_name, stage, accept_status || '待验收', accept_date, quality_score, issues, attachment, userId);
  await addLog(userId, '', '新增', '验收管理', result.lastInsertRowid, project_name, `项目: ${project_name}`, req.ip);
  notifyProject('acceptance_submit', project_id,
    `验收提交：${project_name}`,
    `项目「${project_name}」验收已提交，阶段：${stage || ''}，状态：${accept_status || '待验收'}。`,
    result.lastInsertRowid, 'acceptance'
  ).catch(console.error);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/acceptance/:id', checkPermission('acceptance:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { accept_status, accept_date, quality_score, issues } = req.body;
  // 权限检查
  const [existing] = await db.prepare('SELECT project_name, creator_id FROM acceptance WHERE id = ?').all(req.params.id);
  if (!existing) return res.status(404).json({ error: '验收记录不存在' });
  if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
  const aName = existing.project_name;
  const stmt = db.prepare('UPDATE acceptance SET accept_status=?, accept_date=?, quality_score=?, issues=? WHERE id=?');
  await stmt.run(accept_status, accept_date, quality_score, issues, req.params.id);
  await addLog(userId, '', '编辑', '验收管理', req.params.id, aName, `更新验收: ${aName}`, req.ip);
  if (existing.accept_status !== accept_status) {
    notifyProject('acceptance_submit', null,
      `验收状态变更：${aName}`,
      `验收「${aName}」状态已变更为「${accept_status}」，请知悉。`,
      parseInt(req.params.id), 'acceptance'
    ).catch(console.error);
  }
  res.json({ message: '更新成功' });
});


router.delete('/api/acceptance/:id', checkPermission('acceptance:delete'), async (req, res) => {
    
  const userId = getUserId(req);
  const [a] = await db.prepare('SELECT project_name, creator_id FROM acceptance WHERE id = ?').all(req.params.id);
  if (!a) return res.status(404).json({ error: '记录不存在' });
  if (a.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
  const aName = a.project_name;
  const stmt = db.prepare('DELETE FROM acceptance WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '验收管理', req.params.id, aName, `删除验收: ${aName}`, req.ip);
  res.json({ message: '删除成功' });
});

// ==================== 派工管理 ====================

router.get('/api/dispatches', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM dispatches ORDER BY created_at DESC');
  res.json(await stmt.all());
});


router.post('/api/dispatches', checkPermission('dispatch:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { project_id, project_name, content, location, worker, fee, start_date, requirement, status } = req.body;
  const stmt = db.prepare('INSERT INTO dispatches (project_id, project_name, content, location, worker, fee, start_date, requirement, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(project_id, project_name || '', content, location || '', worker || '', fee || '', start_date || null, requirement || '', status || '待接单');
  await addLog(userId, '', '新增', '派工管理', result.lastInsertRowid, content, `派工内容: ${content}`, req.ip);
  notifyProject('dispatch_created', project_id,
    `新派工通知：${content}`,
    `派工内容：${content || ''}，工人：${worker || ''}，项目：${project_name || ''}，请及时处理。`,
    result.lastInsertRowid, 'dispatch'
  ).catch(console.error);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/dispatches/:id', checkPermission('dispatch:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { status, content, location, worker, fee, start_date, requirement } = req.body;
  const [d] = await db.prepare('SELECT content FROM dispatches WHERE id = ?').all(req.params.id);
  const dName = d ? d.content : req.params.id;
  const stmt = db.prepare('UPDATE dispatches SET status=?, content=?, location=?, worker=?, fee=?, start_date=?, requirement=? WHERE id=?');
  await stmt.run(status, content, location, worker, fee, start_date, requirement, req.params.id);
  await addLog(userId, '', '编辑', '派工管理', req.params.id, dName, `更新派工: ${dName}`, req.ip);
  if (d && d.status !== status) {
    notifyProject('dispatch_status_changed', null,
      `派工状态变更：${dName}`,
      `派工「${dName}」状态已变更为「${status}」，请知悉。`,
      parseInt(req.params.id), 'dispatch'
    ).catch(console.error);
  }
  res.json({ message: '更新成功' });
});


router.delete('/api/dispatches/:id', checkPermission('dispatch:delete'), async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [d] = await db.prepare('SELECT content FROM dispatches WHERE id = ?').all(req.params.id);
  const dName = d ? d.content : req.params.id;
  await db.prepare('DELETE FROM dispatches WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '派工管理', req.params.id, dName, `删除派工: ${dName}`, req.ip);
  res.json({ message: '删除成功' });
});


router.get('/api/invoices', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM invoices ORDER BY created_at DESC');
  res.json(await stmt.all());
});


router.post('/api/invoices', checkPermission('invoice:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark } = req.body;
  const stmt = db.prepare('INSERT INTO invoices (invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(invoice_no, customer_id, customer_name, amount, tax_rate || 0, tax_amount || 0, total_amount || amount, type, status || '待开具', issue_date, remark);
  await addLog(userId, '', '新增', '发票管理', result.lastInsertRowid, invoice_no, `发票号: ${invoice_no}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/invoices/:id', checkPermission('invoice:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark } = req.body;
  const stmt = db.prepare('UPDATE invoices SET invoice_no=?, customer_id=?, customer_name=?, amount=?, tax_rate=?, tax_amount=?, total_amount=?, type=?, status=?, issue_date=?, remark=? WHERE id=?');
  await stmt.run(invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark, req.params.id);
  await addLog(userId, '', '编辑', '发票管理', req.params.id, invoice_no, `更新发票: ${invoice_no}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/invoices/:id', checkPermission('invoice:delete'), async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [inv] = await db.prepare('SELECT invoice_no FROM invoices WHERE id = ?').all(req.params.id);
  const invNo = inv ? inv.invoice_no : req.params.id;
  const stmt = db.prepare('DELETE FROM invoices WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '发票管理', req.params.id, invNo, `删除发票: ${invNo}`, req.ip);
  res.json({ message: '删除成功' });
});

// ========== 1装ERP扩展API ==========

module.exports = router;