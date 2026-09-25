'use strict';

const express = require('express');
const router = express.Router();

const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');
const { addLog } = require('../utils/addLog');
const { pool } = require('../db-mysql-async');
const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');

router.get('/api/customers', async (req, res) => {
  try {
    const { search, status } = req.query;
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
    const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'customer');

    let sql = hasAll
      ? 'SELECT * FROM customers WHERE 1=1'
      : 'SELECT * FROM customers WHERE creator_id = ?';
    const params = hasAll ? [] : [userId];

    if (search) {
      sql += ' AND (name LIKE ? OR phone LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const stmt = db.prepare(sql);
    res.json(await stmt.all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post('/api/customers', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { customer_no, name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tags } = req.body;
    
    // 检查手机号是否存在（phone 为空则跳过查重）
    const existing = phone ? await db.prepare('SELECT id, creator_id FROM customers WHERE phone = ?').get(phone) : null;
    if (existing) {
      // 手机号已存在，判断是否可认领（creator_id 为 null 表示无主，可被任何人认领）
      const isSameCreator = existing.creator_id === userId;
      const isUnclaimed = existing.creator_id === null || existing.creator_id === 0;
      if (isSameCreator || isUnclaimed) {
        // 同添加人 或 无主客户 → 前端询问是否覆盖
        return res.status(409).json({ 
          code: 'SAME_CREATOR',
          message: '该手机号已被您添加，是否更新客户信息？',
          existing_id: existing.id
        });
      } else {
        // 不同添加人 → 查出对方姓名返回
        const emp = await db.prepare('SELECT name FROM employees WHERE id = ?').get(existing.creator_id);
        const adderName = emp ? emp.name : '其他员工';
        return res.status(409).json({ 
          code: 'DIFFERENT_CREATOR', 
          message: `此客户已被 ${adderName} 添加`,
          existing_id: existing.id
        });
      }
    }
    
    // 自动生成客户编号
    let finalCustomerNo = customer_no;
    if (!finalCustomerNo || finalCustomerNo.trim() === '') {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const rows = await db.prepare("SELECT customer_no FROM customers WHERE customer_no LIKE ? ORDER BY customer_no DESC LIMIT 1").all('KH' + today + '%');
      const maxRow = rows[0];
      let seq = 1;
      if (maxRow && maxRow.customer_no) {
        const lastSeq = parseInt(maxRow.customer_no.slice(-4));
        seq = lastSeq + 1;
      }
      finalCustomerNo = 'KH' + today + String(seq).padStart(4, '0');
    }
    
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (tags || null);
    const stmt = db.prepare('INSERT INTO customers (customer_no, name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date, creator_id, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(finalCustomerNo, name, phone, source, status || '新客户', level || '普通', follow_user, address, area, budget, demand, next_follow_date, userId, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tagsJson);
    await addLog(userId, '', '新增', '客户管理', result.lastInsertRowid, name, `客户名称: ${name}, 电话: ${phone}`, req.ip);
    res.json({ id: result.lastInsertRowid, customer_no: finalCustomerNo, message: '添加成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 手机号查重（实时检查，blur 时前端调用）

router.get('/api/customers/check-phone', async (req, res) => {
  try {
    const { phone } = req.query;
    const userId = getUserId(req);
    if (!phone) return res.json({ exists: false });

    const existing = await db.prepare('SELECT id, creator_id FROM customers WHERE phone = ?').get(phone);
    if (!existing) return res.json({ exists: false });

    // 无主客户 → 可认领
    if (existing.creator_id === null || existing.creator_id === 0) {
      return res.json({ exists: true, code: 'UNCLAIMED', message: '此号码客户尚无归属，您可以直接认领' });
    }
    // 同添加人
    if (existing.creator_id === userId) {
      return res.json({ exists: true, code: 'SAME_CREATOR', message: '此号码是您添加的客户' });
    }
    // 不同添加人 → 查出对方姓名
    const emp = await db.prepare('SELECT name FROM employees WHERE id = ?').get(existing.creator_id);
    return res.json({ exists: true, code: 'DIFFERENT_CREATOR', message: `此客户已被 ${emp?.name || '其他员工'} 添加` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.put('/api/customers/:id', checkPermission('customer:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { customer_no, name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tags } = req.body;
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (tags || null);
    const stmt = db.prepare('UPDATE customers SET customer_no=?, name=?, phone=?, source=?, status=?, level=?, follow_user=?, address=?, area=?, budget=?, demand=?, next_follow_date=?, gender=?, entry_date=?, contact_name2=?, contact_phone2=?, other_phone=?, email=?, qq=?, provider=?, tags=? WHERE id=?');
    await stmt.run(customer_no, name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tagsJson, req.params.id);
    await addLog(userId, '', '编辑', '客户管理', req.params.id, name, `更新客户: ${name}`, req.ip);
    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 强制覆盖更新（用于手机号冲突时用户确认覆盖）

router.put('/api/customers/:id/overwrite', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tags } = req.body;
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (tags || null);

    // 先查现有客户，判断 creator_id 是否为 NULL（无主客户可认领）
    const existing = await db.prepare('SELECT creator_id FROM customers WHERE id = ?').get(req.params.id);
    const newCreatorId = (existing?.creator_id === null || existing?.creator_id === 0) ? userId : existing?.creator_id;

    const stmt = db.prepare('UPDATE customers SET name=?, phone=?, source=?, status=?, level=?, follow_user=?, address=?, area=?, budget=?, demand=?, next_follow_date=?, gender=?, entry_date=?, contact_name2=?, contact_phone2=?, other_phone=?, email=?, qq=?, provider=?, tags=?, creator_id=? WHERE id=?');
    await stmt.run(name, phone, source, status || '新客户', level || '普通', follow_user, address, area, budget, demand, next_follow_date, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tagsJson, newCreatorId, req.params.id);
    await addLog(userId, '', '覆盖更新', '客户管理', req.params.id, name, `覆盖更新客户: ${name}`, req.ip);
    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.delete('/api/customers/:id', checkPermission('customer:delete'), async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [c] = await db.prepare('SELECT name FROM customers WHERE id = ?').all(req.params.id);
    const cName = c ? c.name : req.params.id;
    const stmt = db.prepare('DELETE FROM customers WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '客户管理', req.params.id, cName, `删除客户: ${cName}`, req.ip);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.get('/api/customer-follow/:customerId', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM customer_follow WHERE customer_id = ? ORDER BY created_at DESC');
  res.json(await stmt.all(req.params.customerId));
});


router.post('/api/customer-follow', async (req, res) => {
    
  const userId = getUserId(req);
  const { customer_id, follow_type, content, follow_date, next_date } = req.body;
  const stmt = db.prepare('INSERT INTO customer_follow (customer_id, follow_type, content, follow_date, next_date, creator_id) VALUES (?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(customer_id, follow_type, content, follow_date, next_date, userId);
  const [cust] = await db.prepare('SELECT name FROM customers WHERE id = ?').all(customer_id);
  await addLog(userId, '', '新增', '客户跟进', result.lastInsertRowid, cust?.name || '', `跟进客户: ${cust?.name || customer_id}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.get('/api/customer-pool', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM customer_pool ORDER BY created_at DESC');
  res.json(await stmt.all());
});


router.post('/api/customer-pool', async (req, res) => {
  const { name, phone, source, area, budget, demand, lost_reason, lost_date } = req.body;
  const stmt = db.prepare('INSERT INTO customer_pool (name, phone, source, area, budget, demand, lost_reason, lost_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(name, phone, source, area, budget, demand, lost_reason, lost_date);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.delete('/api/customer-pool/:id', async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM customer_pool WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 楼盘管理

module.exports = router;