'use strict';

const express = require('express');
const router = express.Router();

const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');
const { addLog } = require('../utils/addLog');
const { pool } = require('../db-mysql-async');
const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');

router.get('/api/debug-notify', async (req, res) => {
  try {
    // 项目5：撒打算
    await notifyProject('inspection_submit', 5,
      '【测试通知】撒打算项目',
      '这是一条测试通知内容',
      999, 'test'
    );
    res.json({ ok: true });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// 获取通知列表（客户通过 phone 查询）

router.get('/api/notifications', async (req, res) => {
  try {
    const { phone, type, is_read, keyword, page = 1, pageSize = 20 } = req.query;
    if (!phone) return res.status(400).json({ error: 'phone 参数必填' });

    let sql = 'SELECT * FROM notifications WHERE receiver_phone = ?';
    const params = [phone];

    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (is_read !== undefined && is_read !== '') { sql += ' AND is_read = ?'; params.push(parseInt(is_read)); }
    if (keyword) { sql += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }

    sql += ' ORDER BY created_at DESC';
    const allStmt = db.prepare(sql);
    const all = await allStmt.all(...params);
    const total = all.length;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const list = all.slice(offset, offset + parseInt(pageSize));

    res.json({ list, total, page: parseInt(page), page_size: parseInt(pageSize) });
  } catch (err) {
    console.error('notifications error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 标记单条通知已读

router.put('/api/notifications/:id/read', async (req, res) => {
  try {
    await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
    res.json({ message: '已标记已读' });
  } catch (err) {
    console.error('mark read error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 标记全部通知已读（按 phone）

router.put('/api/notifications/read-all', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: 'phone 参数必填' });
    await db.prepare('UPDATE notifications SET is_read = 1 WHERE receiver_phone = ?').run(phone);
    res.json({ message: '已全部标记已读' });
  } catch (err) {
    console.error('mark all read error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 获取消息列表（统一查 notifications 表，兼容员工和客户）

router.get('/api/messages', async (req, res) => {
  try {
    const { userId } = getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    
    const { type, is_read, keyword, page = 1, pageSize = 20 } = req.query;
    
    // 客户用 phone 查 notifications，员工用 user_id 查 messages
    let list = [];
    let total = 0;
    
    // 先查客户表，通过 userId 找 phone
    const [customer] = db.prepare('SELECT phone FROM customers WHERE id = ?').all(userId);
    
    if (customer) {
      // 客户：查 notifications 表（按 receiver_phone 匹配）
      let sql = 'SELECT * FROM notifications WHERE receiver_phone = ?';
      const params = [customer.phone];
      
      if (type) { sql += ' AND type = ?'; params.push(type); }
      if (is_read !== undefined && is_read !== '') { sql += ' AND is_read = ?'; params.push(parseInt(is_read)); }
      if (keyword) { sql += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
      
      sql += ' ORDER BY created_at DESC';
      
      const allStmt = db.prepare(sql);
      const all = await allStmt.all(...params);
      total = all.length;
      
      const offset = (parseInt(page) - 1) * parseInt(pageSize);
      list = all.slice(offset, offset + parseInt(pageSize));
    } else {
      // 员工：查 messages 表（原有逻辑）
      let sql = 'SELECT * FROM messages WHERE user_id = ?';
      const params = [userId];
      
      if (type) { sql += ' AND type = ?'; params.push(type); }
      if (is_read !== undefined && is_read !== '') { sql += ' AND is_read = ?'; params.push(parseInt(is_read)); }
      if (keyword) { sql += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
      
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));
      
      const stmt = db.prepare(sql);
      list = await stmt.all(...params);
      total = list.length;
    }
    
    res.json({ list, total, page: parseInt(page), page_size: parseInt(pageSize) });
  } catch (err) {
    console.error('messages error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 获取未读消息数量（统一查 notifications 表，兼容员工和客户）

router.get('/api/messages/unread-count', async (req, res) => {
  try {
    const { userId } = getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    
    // 先查客户表，通过 userId 找 phone
    const [customer] = db.prepare('SELECT phone FROM customers WHERE id = ?').all(userId);
    
    let count = 0;
    if (customer) {
      // 客户：查 notifications 表
      const [row] = await db.prepare('SELECT COUNT(*) as count FROM notifications WHERE receiver_phone = ? AND is_read = 0').all(customer.phone);
      count = row.count;
    } else {
      // 员工：查 messages 表
      const [row] = await db.prepare('SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND is_read = 0').all(userId);
      count = row.count;
    }
    
    res.json({ count });
  } catch (err) {
    console.error('unread-count error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 标记消息已读（统一处理 notifications 和 messages）

router.put('/api/messages/:id/read', async (req, res) => {
  try {
    const { userId } = getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    
    const [customer] = db.prepare('SELECT phone FROM customers WHERE id = ?').all(userId);
    
    if (customer) {
      // 客户：更新 notifications 表
      await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND receiver_phone = ?').run(req.params.id, customer.phone);
    } else {
      // 员工：更新 messages 表
      await db.prepare('UPDATE messages SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    }
    res.json({ message: '已标记已读' });
  } catch (err) {
    console.error('mark read error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 标记全部已读（统一处理 notifications 和 messages）

router.put('/api/messages/read-all', async (req, res) => {
  try {
    const { userId } = getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    
    const [customer] = db.prepare('SELECT phone FROM customers WHERE id = ?').all(userId);
    
    if (customer) {
      // 客户：更新 notifications 表
      await db.prepare('UPDATE notifications SET is_read = 1 WHERE receiver_phone = ?').run(customer.phone);
    } else {
      // 员工：更新 messages 表
      await db.prepare('UPDATE messages SET is_read = 1 WHERE user_id = ?').run(userId);
    }
    res.json({ message: '已全部标记已读' });
  } catch (err) {
    console.error('mark all read error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 获取单条消息

router.get('/api/messages/:id', async (req, res) => {
  try {
    const { userId } = getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    
    const [msg] = await db.prepare('SELECT * FROM messages WHERE id = ? AND user_id = ?').all(req.params.id, userId);
    if (!msg) return res.status(404).json({ error: '消息不存在' });
    res.json(msg);
  } catch (err) {
    console.error('messages/:id error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// ==================== 审批通知推送服务 ====================

router.get('/api/notices', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM notices ORDER BY created_at DESC');
  res.json(await stmt.all());
});


router.post('/api/notices', checkPermission('notice:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { title, content, type, publisher_id, publisher_name, status, publish_time } = req.body;
  const stmt = db.prepare('INSERT INTO notices (title, content, type, publisher_id, publisher_name, status, publish_time) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(title, content, type, publisher_id, publisher_name, status || '草稿', publish_time);
  await addLog(userId, '', '新增', '公告管理', result.lastInsertRowid, title, `公告标题: ${title}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/notices/:id', checkPermission('notice:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { title, content, type, status, publish_time } = req.body;
  const stmt = db.prepare('UPDATE notices SET title=?, content=?, type=?, status=?, publish_time=? WHERE id=?');
  await stmt.run(title, content, type, status, publish_time, req.params.id);
  await addLog(userId, '', '编辑', '公告管理', req.params.id, title, `更新公告: ${title}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/notices/:id', checkPermission('notice:delete'), async (req, res) => {
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [n] = await db.prepare('SELECT title FROM notices WHERE id = ?').all(req.params.id);
  const nTitle = n ? n.title : req.params.id;
  const stmt = db.prepare('DELETE FROM notices WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '公告管理', req.params.id, nTitle, `删除公告: ${nTitle}`, req.ip);
  res.json({ message: '删除成功' });
});


router.get('/api/notifications', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { page = 1, pageSize = 20, is_read, phone: phoneParam } = req.query;

    // 优先用 URL 参数的 phone（客户/移动端），否则通过 userId 查员工手机号
    let phone = phoneParam || null;
    if (!phone && userId > 0) {
      const [emp] = await db.prepare('SELECT phone FROM employees WHERE id = ?').all(userId);
      phone = emp ? emp.phone : null;
    }

    if (!phone) { res.json({ list: [], total: 0, page: 1, pageSize: parseInt(pageSize) }); return; }

    let where = 'WHERE receiver_phone = ?';
    const params = [phone];

    if (is_read !== undefined) {
      where += ' AND is_read = ?';
      params.push(is_read === 'true' ? 1 : 0);
    }

    const [totalRows] = await mysqlPool.query(`SELECT COUNT(*) as cnt FROM notifications ${where}`, params);
    const [list] = await mysqlPool.query(
      `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize)]
    );

    res.json({ list, total: totalRows[0].cnt, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.put('/api/notifications/:id/read', async (req, res) => {
  try {
    await mysqlPool.query('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: '已标记已读' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.put('/api/notifications/read-all', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { phone: phoneParam } = req.query;

    let phone = phoneParam || null;
    if (!phone && userId > 0) {
      const [emp] = await db.prepare('SELECT phone FROM employees WHERE id = ?').all(userId);
      phone = emp ? emp.phone : null;
    }
    if (phone) {
      await mysqlPool.query('UPDATE notifications SET is_read = 1 WHERE receiver_phone = ?', [phone]);
    }
    res.json({ message: '全部已读' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.get('/api/notifications/unread-count', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { phone: phoneParam } = req.query;

    let phone = phoneParam || null;
    if (!phone && userId > 0) {
      const [emp] = await db.prepare('SELECT phone FROM employees WHERE id = ?').all(userId);
      phone = emp ? emp.phone : null;
    }
    if (!phone) { res.json({ count: 0 }); return; }

    const [rows] = await mysqlPool.query('SELECT COUNT(*) as cnt FROM notifications WHERE receiver_phone = ? AND is_read = 0', [phone]);
    res.json({ count: rows[0].cnt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 消息管理 API（后台增删改）====================

router.post('/api/notifications', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可操作' });
    const { title, content, type, receiver_phone, receiver_name, channels } = req.body;
    if (!title || !receiver_phone) return res.status(400).json({ error: '标题和接收人手机号不能为空' });
    await mysqlPool.query(
      'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())',
      [title, content || '', type || 'admin_notice', 0, 'admin', userId, receiver_phone, receiver_name || '', channels || 'inapp', 'pending']
    );
    const [notifId] = await mysqlPool.query('SELECT LAST_INSERT_ID() as id');
    await addLog(userId, '', '新增', '通知消息', notifId[0]?.id || 0, title, `发送通知: ${title}`, req.ip);
    res.json({ message: '消息发送成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE 删除消息

router.delete('/api/notifications/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可操作' });
    const [notif] = await mysqlPool.query('SELECT title FROM notifications WHERE id = ?', [req.params.id]);
    await mysqlPool.query('DELETE FROM notifications WHERE id = ?', [req.params.id]);
    await addLog(userId, '', '删除', '通知消息', parseInt(req.params.id), notif[0]?.title || '', `删除通知: ${notif[0]?.title || req.params.id}`, req.ip);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE 批量删除消息

router.delete('/api/notifications', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可操作' });
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请提供要删除的消息ID列表' });
    const placeholders = ids.map(() => '?').join(',');
    await mysqlPool.query(`DELETE FROM notifications WHERE id IN (${placeholders})`, ids);
    await addLog(userId, '', '删除', '通知消息', 0, '', `批量删除${ids.length}条通知`, req.ip);
    res.json({ message: '批量删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET 后台消息列表（管理员查看所有消息，不受手机号限制）

router.get('/api/notifications/admin-list', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可操作' });
    const { page = 1, pageSize = 20, is_read, keyword } = req.query;
    let where = '1=1';
    const params = [];
    if (is_read !== undefined) {
      where += ' AND is_read = ?';
      params.push(is_read === 'true' ? 1 : 0);
    }
    if (keyword) {
      where += ' AND (title LIKE ? OR content LIKE ? OR receiver_name LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    const [totalRows] = await mysqlPool.query(`SELECT COUNT(*) as cnt FROM notifications WHERE ${where}`, params);
    const [list] = await mysqlPool.query(
      `SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize)]
    );
    res.json({ list, total: totalRows[0].cnt, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 通知规则设置 API ====================

module.exports = router;