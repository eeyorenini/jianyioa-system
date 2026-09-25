const dotenv = require('./node_modules/dotenv');
dotenv.config({ path: __dirname + '/.env' });

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dbModule = require('./db-mysql-async.js');
const Database = dbModule;
const pool = dbModule.pool;
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const multer = require('multer');
const os = require('os');
const { spawnSync } = require('child_process');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// ================================================================
// 全局系统日志中间件 — 记录所有数据交互（POST/PUT/DELETE）
// ================================================================
async function ensureSystemLogTable() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS system_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      method VARCHAR(10) NOT NULL,
      path VARCHAR(500) NOT NULL,
      query VARCHAR(500),
      body TEXT,
      user_id INT,
      username VARCHAR(100),
      ip_address VARCHAR(50),
      user_agent VARCHAR(500),
      status_code INT,
      response_time INT,
      error_message TEXT,
      success TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at),
      INDEX idx_user_id (user_id),
      INDEX idx_path (path(100)),
      INDEX idx_success (success)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (e) { console.log('system_logs init error:', e.message); }
}

app.use((req, res, next) => {
  // 只记录数据操作
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return next();
  }
  // 排除登录注册（密码不记录）
  if (req.path === '/api/auth/login' || req.path === '/api/auth/register') {
    return next();
  }
  const startTime = Date.now();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userId = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
  const username = req.headers['x-username'] || '';
  const originalBody = req.body ? JSON.stringify(req.body) : '';

  // 捕获响应完成后的状态
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    const success = status >= 200 && status < 400 ? 1 : 0;
    // 隐藏密码字段
    let safeBody = originalBody;
    try {
      const parsed = JSON.parse(originalBody);
      if (parsed.password) parsed.password = '***';
      if (parsed.old_password) parsed.old_password = '***';
      if (parsed.new_password) parsed.new_password = '***';
      safeBody = JSON.stringify(parsed);
    } catch {}

    // 异步写入日志（不阻塞响应）
    (async () => {
      try {
        await ensureSystemLogTable();
      } catch (e) {
        console.log('system_log ensure table error:', e.message);
      }
      // username 为空时，通过 userId 查 employees 表获取真实姓名
      let displayName = username;
      if (!displayName && userId) {
        try {
          const [emps] = await pool.query('SELECT name FROM employees WHERE id = ?', [userId]);
          displayName = emps[0] ? emps[0].name : (username || '');
        } catch (e2) { /* ignore */ }
      }
      try {
        await pool.query(
          `INSERT INTO system_logs (method, path, query, body, user_id, username, ip_address, user_agent, status_code, response_time, error_message, success, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [req.method, req.path, JSON.stringify(req.query), safeBody.slice(0, 2000), userId, displayName, ip, (req.headers['user-agent'] || '').slice(0, 500), status, duration, success === 0 ? (res.errorMessage || '') : '', success]
        );
      } catch (e) {
        console.log('system_log insert error:', e.message);
      }
    })();

    return originalEnd.apply(this, args);
  };
  next();
});

// ================================================================

// ---- 权限与工具 ----
const { getUserId, isAdmin, hasReadAllPermission, checkPermission, getCurrentUser } = require('./middleware/auth');
const { addLog } = require('./utils/addLog');
const { notifyProject, sendApprovalNotification, sendAppNotification, insertInAppNotification } = require('./utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('./utils/sms');

// ---- 路由注册 ----
app.use('/api/employees', require('./routes/auth'));
app.use('/api/customers', require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/contract-templates', require('./routes/contracts'));
app.use('/api/signers', require('./routes/contracts'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/project-stages', require('./routes/projects'));
app.use('/api/project-logs', require('./routes/projects'));
app.use('/api/quotes', require('./routes/projects'));
app.use('/api/progress-', require('./routes/projects'));
app.use('/api/approvals', require('./routes/approvals'));
app.use('/api/budgets', require('./routes/finance'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/dashboard', require('./routes/finance'));
app.use('/api/materials', require('./routes/warehouse'));
app.use('/api/main-materials', require('./routes/warehouse'));
app.use('/api/material-orders', require('./routes/warehouse'));
app.use('/api/departments', require('./routes/employees'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/roles', require('./routes/employees'));
app.use('/api/permissions', require('./routes/employees'));
app.use('/api/user', require('./routes/employees'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/messages', require('./routes/notifications'));
app.use('/api/notices', require('./routes/notifications'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/inspections', require('./routes/reports'));
app.use('/api/acceptance', require('./routes/reports'));
app.use('/api/dispatches', require('./routes/reports'));
app.use('/api/invoices', require('./routes/reports'));
app.use('/api/system-logs', require('./routes/system'));
app.use('/api/operation-logs', require('./routes/system'));
app.use('/api/debug', require('./routes/system'));
app.use('/api/health', require('./routes/system'));
app.use('/api/buildings', require('./routes/erp'));
app.use('/api/channels', require('./routes/erp'));
app.use('/api/marketing-cases', require('./routes/erp'));
app.use('/api/suppliers', require('./routes/erp'));
app.use('/api/purchases', require('./routes/erp'));
app.use('/api/cost-records', require('./routes/erp'));
app.use('/api/rectification-issues', require('./routes/erp'));
app.use('/api/attendance', require('./routes/erp'));
app.use('/api/warranties', require('./routes/erp'));
app.use('/api/design-measurements', require('./routes/erp'));
app.use('/api/upload-image', require('./routes/upload'));
app.use('/api/upload-pdf', require('./routes/upload'));
app.use('/api/delete-images', require('./routes/upload'));


app.listen(PORT, () => {
  console.log(`🚀 装企云ERP系统后端运行在 http://localhost:${PORT}`);
});
