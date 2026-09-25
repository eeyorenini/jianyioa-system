'use strict';

const express = require('express');
const router = express.Router();

const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');
const { addLog } = require('../utils/addLog');
const { pool } = require('../db-mysql-async');
const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');

router.post('/api/employees/login', async (req, res) => {
  const { username, password } = req.body;
  const stmt = db.prepare(`
    SELECT e.*, r.name as role_name, r.code as role_code, r.permissions as role_permissions 
    FROM employees e 
    LEFT JOIN roles r ON e.role_id = r.id 
    WHERE e.username = ? AND e.password = ?
  `);
  const user = await stmt.get(username, password);
  if (user) {
    res.json({ success: true, user });
  } else {
    res.json({ success: false, message: '用户名或密码错误' });
  }
});

// 客户登录（手机号 + 姓名）

router.post('/api/customers/login', async (req, res) => {
  const { phone, name } = req.body;
  if (!phone) {
    return res.json({ success: false, message: '请输入手机号' });
  }
  try {
    // 【优先】查家庭成员表（副账户可能有和主账户不同的手机号，也可能相同）
    const familyStmt = db.prepare(`SELECT * FROM family_members WHERE phone = ? LIMIT 1`);
    const familyMember = await familyStmt.get(phone);
    
    if (familyMember) {
      // 如果是主账户自己（is_master=1 或 relation='本人'），走主账户逻辑
      if (familyMember.is_master === 1 || familyMember.relation === '本人') {
        const masterStmt = db.prepare(`SELECT * FROM customers WHERE id = ? LIMIT 1`);
        const master = await masterStmt.get(familyMember.customer_id);
        if (master) {
          return res.json({ success: true, customer: master });
        }
      }
      
      // 是家庭成员（副账户），返回副账户自己的信息，但带上主账户ID用于查项目
      const masterStmt = db.prepare(`SELECT * FROM customers WHERE id = ? LIMIT 1`);
      const master = await masterStmt.get(familyMember.customer_id);
      if (master) {
        return res.json({ 
          success: true, 
          // 返回副账户自己的信息
          customer: {
            id: familyMember.id,           // 家庭成员ID
            name: familyMember.name,        // 副账户姓名
            phone: familyMember.phone,      // 副账户手机号
            relation: familyMember.relation,
            is_master: 0
          },
          // 主账户信息（用于借用权限查项目）
          masterCustomer: master,
          masterCustomerId: master.id,
          isFamilyMember: true,
          familyMemberId: familyMember.id,
          relation: familyMember.relation
        });
      }
    }
    
    // 不是家庭成员，查客户表（主账户）
    const stmt = db.prepare(`SELECT * FROM customers WHERE phone = ? LIMIT 1`);
    const customer = await stmt.get(phone);
    
    if (customer) {
      // 姓名匹配则登录
      if (!name || customer.name === name) {
        return res.json({ success: true, customer });
      }
      return res.json({ success: false, message: '姓名与手机号不匹配' });
    }
    
    // 都不存在
    return res.json({ success: false, message: '该手机号未注册' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


module.exports = router;