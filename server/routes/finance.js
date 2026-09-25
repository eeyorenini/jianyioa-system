'use strict';

const express = require('express');
const router = express.Router();

const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');
const { addLog } = require('../utils/addLog');
const { pool } = require('../db-mysql-async');
const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');

router.get('/api/budgets', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'budget');
  if (hasAll) {
    const stmt = db.prepare('SELECT * FROM budgets ORDER BY created_at DESC');
    return res.json(await stmt.all());
  }
  const stmt = db.prepare('SELECT * FROM budgets WHERE creator_id = ? ORDER BY created_at DESC');
  res.json(await stmt.all(userId));
});


router.post('/api/budgets', checkPermission('budget:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { customer_id, project_name, house_area, style, total_amount, profit_rate, status, items } = req.body;
  const stmt = db.prepare('INSERT INTO budgets (customer_id, project_name, house_area, style, total_amount, profit_rate, status, items, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(customer_id, project_name, house_area, style, total_amount, profit_rate, status || '草稿', JSON.stringify(items), userId);
  await addLog(userId, '', '新增', '预算管理', result.lastInsertRowid, project_name, `项目名称: ${project_name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.delete('/api/budgets/:id', checkPermission('budget:delete'), async (req, res) => {
    
  const userId = getUserId(req);
  const [b] = await db.prepare('SELECT category, creator_id FROM budgets WHERE id = ?').all(req.params.id);
  if (!b) return res.status(404).json({ error: '记录不存在' });
  if (b.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
  const bCat = b.category;
  const stmt = db.prepare('DELETE FROM budgets WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '预算管理', req.params.id, bCat, `删除预算: ${bCat}`, req.ip);
  res.json({ message: '删除成功' });
});


router.get('/api/finance', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'finance');
  if (hasAll) {
    const stmt = db.prepare('SELECT * FROM finance ORDER BY created_at DESC');
    return res.json(await stmt.all());
  }
  const stmt = db.prepare('SELECT * FROM finance WHERE creator_id = ? ORDER BY created_at DESC');
  res.json(await stmt.all(userId));
});


router.post('/api/finance', checkPermission('finance:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { type, amount, category, description, date, project_id } = req.body;
  const stmt = db.prepare('INSERT INTO finance (type, amount, category, description, date, project_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(type, amount, category, description, date, project_id, userId);
  await addLog(userId, '', '新增', '财务管理', result.lastInsertRowid, category || type, `财务类型: ${type}, 金额: ${amount}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.delete('/api/finance/:id', checkPermission('finance:delete'), async (req, res) => {
    
  const userId = getUserId(req);
  const [f] = await db.prepare('SELECT category, creator_id FROM finance WHERE id = ?').all(req.params.id);
  if (!f) return res.status(404).json({ error: '记录不存在' });
  if (f.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
  const fCat = f.category;
  const stmt = db.prepare('DELETE FROM finance WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '财务管理', req.params.id, fCat, `删除财务记录: ${fCat}`, req.ip);
  res.json({ message: '删除成功' });
});


router.get('/api/finance/summary', async (req, res) => {
  const income = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'income'").get();
  const expense = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'expense'").get();
  const projectIncome = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'income' AND project_id IS NOT NULL").get();
  const projectExpense = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'expense' AND project_id IS NOT NULL").get();
  res.json({
    totalIncome: income.total,
    totalExpense: expense.total,
    balance: income.total - expense.total,
    projectIncome: projectIncome.total,
    projectExpense: projectExpense.total
  });
});

// ==================== 项目管理（增强：关联客户）====================

router.get('/api/dashboard/stats', async (req, res) => {
  const customerCount = await db.prepare("SELECT COUNT(*) as count FROM customers").get();
  const contractCount = await db.prepare("SELECT COUNT(*) as count FROM contracts WHERE status = '已签订'").get();
  const projectCount = await db.prepare("SELECT COUNT(*) as count FROM projects WHERE status != '已竣工'").get();
  const pendingQuote = await db.prepare("SELECT COUNT(*) as count FROM quotes WHERE status = '待确认'").get();
  
  const income = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'income'").get();
  const expense = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'expense'").get();
  
  const lowStock = await db.prepare("SELECT COUNT(*) as count FROM materials WHERE quantity <= min_stock").get();

  res.json({
    customerCount: customerCount.count,
    contractCount: contractCount.count,
    projectCount: projectCount.count,
    pendingQuote: pendingQuote.count,
    totalIncome: income.total,
    totalExpense: expense.total,
    balance: income.total - expense.total,
    lowStock: lowStock.count
  });
});


router.get('/api/boss-dashboard', async (req, res) => {
  // 汇总统计数据
  const today = new Date().toISOString().split('T')[0];
  
  const customerStats = {
    total: (await db.prepare('SELECT COUNT(*) as count FROM customers').get()).count,
    today: (await db.prepare("SELECT COUNT(*) as count FROM customers WHERE DATE(created_at) = ?").get(today))?.count || 0,
    thisMonth: (await db.prepare("SELECT COUNT(*) as count FROM customers WHERE DATE_FORMAT(created_at, '%Y-%m') = ?").get(today.substring(0, 7)))?.count || 0
  };
  
  const contractStats = {
    total: (await db.prepare('SELECT COUNT(*) as count FROM contracts').get()).count,
    signed: (await db.prepare("SELECT COUNT(*) as count FROM contracts WHERE status = '已签订'").get()).count,
    totalAmount: (await db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM contracts WHERE status = '已签订'").get()).total
  };
  
  const projectStats = {
    total: (await db.prepare('SELECT COUNT(*) as count FROM projects').get()).count,
    active: (await db.prepare("SELECT COUNT(*) as count FROM projects WHERE status NOT IN ('已完工', '已终止')").get()).count,
    finished: (await db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = '已完工'").get()).count
  };
  
  const financeStats = {
    income: (await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'income'").get()).total,
    expense: (await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'expense'").get()).total,
    thisMonthIncome: (await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'income' AND DATE_FORMAT(date, '%Y-%m') = ?").get(today.substring(0, 7)))?.total || 0,
    thisMonthExpense: (await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'expense' AND DATE_FORMAT(date, '%Y-%m') = ?").get(today.substring(0, 7)))?.total || 0
  };
  
  const warehouseStats = {
    totalMaterials: (await db.prepare('SELECT COUNT(*) as count FROM materials').get()).count,
    lowStock: (await db.prepare('SELECT COUNT(*) as count FROM materials WHERE quantity <= min_stock').get()).count,
    totalValue: (await db.prepare('SELECT COALESCE(SUM(quantity * cost_price), 0) as total FROM materials').get()).total
  };
  
  const employeeStats = {
    total: (await db.prepare("SELECT COUNT(*) as count FROM employees WHERE status = '在职'").get()).count
  };
  
  res.json({
    customer: customerStats,
    contract: contractStats,
    project: projectStats,
    finance: financeStats,
    warehouse: warehouseStats,
    employee: employeeStats
  });
});

// 项目利润统计

module.exports = router;