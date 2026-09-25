'use strict';

const express = require('express');
const router = express.Router();

const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');
const { addLog } = require('../utils/addLog');
const { pool } = require('../db-mysql-async');
const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');

router.get('/api/approvals/my', async (req, res) => {
  try {
    const { userId } = getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    
    const { status, type, keyword } = req.query;
    let sql = 'SELECT * FROM approvals WHERE applicant_id = ?';
    const params = [userId];
    
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (keyword) { sql += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    
    sql += ' ORDER BY created_at DESC';
    const stmt = db.prepare(sql);
    const list = await stmt.all(...params);
    res.json(list);
  } catch (err) {
    console.error('approvals/my error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 待我审批列表

router.get('/api/approvals/todo', async (req, res) => {
  try {
    const { userId } = getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    
    const { status, type, keyword } = req.query;
    // 查找 approver_ids 包含当前用户ID的记录
    let sql = "SELECT * FROM approvals WHERE status = '待审批' AND FIND_IN_SET(?, approver_ids)";
    const params = [userId.toString()];
    
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (keyword) { sql += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    
    sql += ' ORDER BY created_at DESC';
    const stmt = db.prepare(sql);
    const list = await stmt.all(...params);
    res.json(list);
  } catch (err) {
    console.error('approvals/todo error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 获取审批详情（含审批记录）

router.get('/api/approvals/:id', async (req, res) => {
  try {
    const [approval] = await db.prepare('SELECT * FROM approvals WHERE id = ?').all(req.params.id);
    if (!approval) return res.status(404).json({ error: '审批不存在' });
    
    const records = await db.prepare('SELECT * FROM approval_records WHERE approval_id = ? ORDER BY created_at ASC').all(req.params.id);
    res.json({ ...approval, records });
  } catch (err) {
    console.error('approvals/:id error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 发起审批

router.post('/api/approvals', async (req, res) => {
  const userId = getUserId(req);
  const { userId: uid, userName: uname } = getCurrentUser(req);
  
  const { title, type, content, amount, approver_id, approver_name, approver_ids, approver_names, form_data } = req.body;
  
  if (!title || !approver_id) {
    return res.status(400).json({ error: '标题和审批人不能为空' });
  }
  
  // 支持多审批人（逗号分隔）
  const approverIdStr = approver_ids || approver_id.toString();
  const approverNameStr = approver_names || approver_name;
  
  const stmt = db.prepare(`
    INSERT INTO approvals (title, type, applicant_id, applicant_name, content, amount, 
      status, approver_id, approver_name, approver_ids, approver_names, max_level, form_data)
    VALUES (?, ?, ?, ?, ?, ?, '待审批', ?, ?, ?, ?, 1, ?)
  `);
  const result = await stmt.run(
    title, type || '其他', uid, uname, content, amount,
    approver_id, approver_name, approverIdStr, approverNameStr, 
    form_data ? JSON.stringify(form_data) : null
  );
  
  const approvalId = result.lastInsertRowid;
  await addLog(uid, '', '新增', '审批管理', approvalId, title, `发起审批: ${title}`, req.ip);
  
  // 发送通知给审批人
  const approverIdList = approverIdStr.split(',');
  const approverNameList = approverNameStr.split(',');
  for (let i = 0; i < approverIdList.length; i++) {
    const aId = parseInt(approverIdList[i]);
    if (aId && aId !== uid) {
      await sendApprovalNotification({
        userId: aId,
        userName: approverNameList[i] || '',
        title: '您有新的审批待处理',
        content: `${uname} 提交了审批：${title}`,
        type: '审批',
        relatedId: approvalId,
        relatedType: 'approval'
      });
    }
  }
  
  res.json({ id: approvalId, message: '提交成功' });
});

// 审批操作（同意）

router.post('/api/approvals/:id/approve', async (req, res) => {
  const { userId, userName } = getCurrentUser(req);
  const { comment } = req.body;
  
  const [approval] = await db.prepare('SELECT * FROM approvals WHERE id = ?').all(req.params.id);
  if (!approval) return res.status(404).json({ error: '审批不存在' });
  
  // 检查是否是当前审批人
  const approverIdList = (approval.approver_ids || approval.approver_id.toString()).split(',');
  if (!approverIdList.includes(userId.toString())) {
    return res.status(403).json({ error: '您不是此审批的审批人' });
  }
  
  // 记录审批
  await db.prepare(`
    INSERT INTO approval_records (approval_id, approver_id, approver_name, action, comment)
    VALUES (?, ?, ?, '同意', ?)
  `).run(req.params.id, userId, userName, comment || '');
  
  // 更新审批状态
  await db.prepare(`
    UPDATE approvals SET status = '已通过', approve_time = ?, remark = CONCAT(IFNULL(remark, ''), ?)
    WHERE id = ?
  `).run(new Date().toISOString(), `${userName}同意${comment ? '：' + comment : ''}；`, req.params.id);
  
  await addLog(userId, '', '审批', '审批管理', req.params.id, approval.title, `审批通过: ${approval.title}`, req.ip);
  
  // 通知申请人
  await sendApprovalNotification({
    userId: approval.applicant_id,
    userName: approval.applicant_name,
    title: '审批已通过',
    content: `您的审批「${approval.title}」已通过`,
    type: '审批',
    relatedId: approval.id,
    relatedType: 'approval'
  });
  
  res.json({ message: '审批成功' });
});

// 审批操作（驳回）

router.post('/api/approvals/:id/reject', async (req, res) => {
  const { userId, userName } = getCurrentUser(req);
  const { comment } = req.body;
  
  const [approval] = await db.prepare('SELECT * FROM approvals WHERE id = ?').all(req.params.id);
  if (!approval) return res.status(404).json({ error: '审批不存在' });
  
  const approverIdList = (approval.approver_ids || approval.approver_id.toString()).split(',');
  if (!approverIdList.includes(userId.toString())) {
    return res.status(403).json({ error: '您不是此审批的审批人' });
  }
  
  await db.prepare(`
    INSERT INTO approval_records (approval_id, approver_id, approver_name, action, comment)
    VALUES (?, ?, ?, '驳回', ?)
  `).run(req.params.id, userId, userName, comment || '');
  
  await db.prepare(`
    UPDATE approvals SET status = '已驳回', approve_time = ?, remark = CONCAT(IFNULL(remark, ''), ?)
    WHERE id = ?
  `).run(new Date().toISOString(), `${userName}驳回${comment ? '：' + comment : ''}；`, req.params.id);
  
  await addLog(userId, '', '审批', '审批管理', req.params.id, approval.title, `审批驳回: ${approval.title}`, req.ip);
  
  await sendApprovalNotification({
    userId: approval.applicant_id,
    userName: approval.applicant_name,
    title: '审批已被驳回',
    content: `您的审批「${approval.title}」已被驳回${comment ? '：' + comment : ''}`,
    type: '审批',
    relatedId: approval.id,
    relatedType: 'approval'
  });
  
  res.json({ message: '驳回成功' });
});

// 调试：手动触发一个通知

module.exports = router;