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
const { spawnSync, spawn } = require('child_process');
// puppeteer 懒加载（v2.3.5 PDF 预览用）：缺失时不致命，其他功能照常工作
// 改成 try-catch + 懒加载：避免残缺 puppeteer 包让 server.js 启动崩溃
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.warn('[warn] puppeteer 未安装或包残缺，PDF 预览功能不可用，其他功能不受影响');
}

// 权限核心（v2.3.1 P2）—— 替代旧 checkPermission 实现，
// 提供 canAction / canReadAll / visibleScope / relatedProjectIds / requirePerm
// v2.3.1 P2 加 buildProjectScopeClause / buildProjectScopeOrSelfClause
const permCore = require('./middleware/perm');
const { buildProjectScopeClause, buildProjectScopeOrSelfClause } = permCore;

const app = express();
const PORT = process.env.PORT || 3002;

// CORS 白名单：允许的来源域名
// 可通过 CORS_ORIGINS 环境变量覆盖（多个用逗号分隔）；默认仅允许已知生产域名
const allowedOrigins = (process.env.CORS_ORIGINS || 'https://erp.fujinwanjia.com,http://116.204.19.53:7780').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, callback) => {
    // 允许没有 origin 的请求（如 Postman、curl、本地直接调用）
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // 允许本地开发请求（localhost / 127.0.0.1）
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS policy'));
  },
  credentials: true,
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// ================================================================
// 全局系统日志中间件 — 记录所有数据交互（POST/PUT/DELETE）
// ================================================================
let systemLogStmt = null;
let systemLogTableChecked = false;

async function ensureSystemLogTable() {
  if (systemLogTableChecked) return;
  systemLogTableChecked = true;
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
    systemLogStmt = pool.format('INSERT INTO system_logs (method, path, query, body, user_id, username, ip_address, user_agent, status_code, response_time, error_message, success, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      ['', '', '', '', null, '', '', '', null, null, '', 1]);
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

const db = new Database();
// MySQL 不需要 busy_timeout / journal_mode（适配层已忽略）
// ✅ 直接导出 pool 供外部 MySQL 查询用（如 notifications 表）
const mysqlPool = pool;

// ================================================================
// 安全修复 2026-10-10：不再信任客户端传来的 x-user-role
// 服务端按 x-user-id 解析"真实角色"，覆盖该请求头；客户端伪造一律无效。
// （历史上约 18 处接口用 x-user-role==='admin' 判定管理员，存在越权隐患）
// ================================================================
const _authRoleCache = new Map(); // userId -> { username, role_code, ts }
const _AUTH_ROLE_TTL = 60000;
// 角色「可管理部门」缓存（userId -> 部门 id 数组；角色变更时随 _authRoleCache 统一失效）
const managedDeptCache = new Map();
const MANAGED_DEPT_CACHE_TTL = 30000;
async function resolveAuthRole(userId) {
  const cached = _authRoleCache.get(userId);
  if (cached && Date.now() - cached.ts < _AUTH_ROLE_TTL) return cached;
  const row = await db.prepare(
    'SELECT e.username, r.code AS role_code FROM employees e LEFT JOIN roles r ON e.role_id = r.id WHERE e.id = ?'
  ).get(userId);
  const info = {
    username: row ? (row.username || '') : '',
    role_code: row ? (row.role_code || '') : '',
    ts: Date.now()
  };
  if (row) _authRoleCache.set(userId, info);
  return info;
}
// 判定管理员：角色码为 admin，或登录名为 admin（兼容历史账号）
function isAdminRoleInfo(info) {
  return !!info && (info.role_code === 'admin' || info.username === 'admin');
}
// 角色/员工信息变更后清缓存
function clearAuthRoleCache() {
  _authRoleCache.clear();
  managedDeptCache.clear();
}

app.use(async (req, res, next) => {
  try {
    const uid = parseInt(req.headers['x-user-id']);
    if (uid && !isNaN(uid)) {
      const info = await resolveAuthRole(uid);
      req.headers['x-user-role'] = isAdminRoleInfo(info) ? 'admin' : (info.role_code || '');
    } else if (req.headers['x-user-role']) {
      delete req.headers['x-user-role'];
    }
  } catch (e) {
    delete req.headers['x-user-role'];
  }
  next();
});

// 初始化数据库表结构（从 init.sql 读取）
async function initDatabase() {
  // 先检查表是否已存在，避免重复执行 init.sql
  try {
    const [rows] = await pool.query('SHOW TABLES');
    if (rows.length > 0) {
      console.log('✅ 数据库表已存在，跳过 init.sql');

      // 字段迁移：确保 plan_end_date 存在（兼容已有数据库）
      try {
        await pool.query(`
          ALTER TABLE project_progress_nodes
          ADD COLUMN IF NOT EXISTS plan_end_date DATE DEFAULT NULL AFTER plan_date
        `);
        console.log('✅ 字段迁移：project_progress_nodes.plan_end_date 已存在或添加成功');
      } catch (e) {
        // MySQL 不支持 IF NOT EXISTS，降级处理
        try {
          await pool.query(`
            ALTER TABLE project_progress_nodes ADD COLUMN plan_end_date DATE DEFAULT NULL AFTER plan_date
          `);
        } catch (e2) {
          // 字段已存在，忽略
        }
      }

      // 字段迁移：project_logs.images 从 TEXT 扩大到 LONGTEXT（支持更大的图片base64）
      try {
        await pool.query(`ALTER TABLE project_logs MODIFY COLUMN images LONGTEXT`);
        console.log('✅ 字段迁移：project_logs.images 已扩大为 LONGTEXT');
      } catch (e) {
        console.log('⚠️ project_logs.images 扩大失败:', e.message);
      }

      // 字段迁移：project_logs 添加更多字段
      const projectLogMigrations = [
        'ALTER TABLE project_logs ADD COLUMN worker_count VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE project_logs ADD COLUMN work_type VARCHAR(100) DEFAULT NULL',
        'ALTER TABLE project_logs ADD COLUMN tomorrow_plan TEXT DEFAULT NULL',
        'ALTER TABLE project_logs ADD COLUMN note TEXT DEFAULT NULL',
        'ALTER TABLE project_logs ADD COLUMN category VARCHAR(50) DEFAULT NULL',
      ];
      for (const sql of projectLogMigrations) {
        try { await pool.query(sql); console.log('✅ 迁移成功'); } catch (_) { /* 忽略 */ }
      }

      // 字段迁移：确保 rectification_issues 表有新字段（兼容已有数据库）
      const riMigrations = [
        'ALTER TABLE rectification_issues ADD COLUMN title VARCHAR(255) DEFAULT NULL AFTER remark',
        'ALTER TABLE rectification_issues ADD COLUMN category VARCHAR(100) DEFAULT NULL AFTER title',
        'ALTER TABLE rectification_issues ADD COLUMN location VARCHAR(100) DEFAULT NULL AFTER category',
        'ALTER TABLE rectification_issues ADD COLUMN level VARCHAR(50) DEFAULT NULL AFTER location',
        'ALTER TABLE rectification_issues ADD COLUMN description TEXT DEFAULT NULL AFTER level',
        'ALTER TABLE rectification_issues ADD COLUMN creator_id INT DEFAULT NULL AFTER description',
      ];
      for (const sql of riMigrations) {
        try { await pool.query(sql); console.log('✅ 迁移成功:', sql.slice(0, 60)); } catch (_) { /* 字段已存在 */ }
      }

      // 字段迁移：inspections 表加 due_date（用于首页待办的 urgency 计算）
      try {
        await pool.query(`ALTER TABLE inspections ADD COLUMN due_date DATE DEFAULT NULL AFTER status`);
        console.log('✅ 字段迁移：inspections.due_date 添加成功');
      } catch (_) { /* 字段已存在 */ }
      try {
        await pool.query(`ALTER TABLE inspections ADD COLUMN images TEXT DEFAULT NULL AFTER issues`);
        console.log('✅ 字段迁移：inspections.images 添加成功');
      } catch (_) { /* 字段已存在 */ }

      // 字段迁移：main_materials 加供应商关联字段
      try {
        await pool.query(`ALTER TABLE main_materials ADD COLUMN supplier_id INT DEFAULT NULL`);
        console.log('✅ 字段迁移：main_materials.supplier_id 添加成功');
      } catch (_) { /* 字段已存在 */ }
      try {
        await pool.query(`ALTER TABLE main_materials ADD COLUMN supplier_name VARCHAR(100) DEFAULT ''`);
        console.log('✅ 字段迁移：main_materials.supplier_name 添加成功');
      } catch (_) { /* 字段已存在 */ }

      // 建表迁移：确保 system_logs 表存在（全新建表语句，已存在则忽略）
      const createSystemLogs = `CREATE TABLE IF NOT EXISTS system_logs (
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
        created_at DATETIME DEFAULT '2024-01-01 00:00:00',
        INDEX idx_created_at (created_at),
        INDEX idx_user_id (user_id),
        INDEX idx_path (path(100)),
        INDEX idx_success (success)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
      try {
        await pool.query(createSystemLogs);
        console.log('✅ system_logs 表已创建或已存在');
      } catch (e) {
        console.log('⚠️ system_logs 建表失败（可能已存在）:', e.message);
      }

      return;
    }
  } catch (e) {}

  const sqlPath = path.join(__dirname, 'init.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('❌ init.sql 不存在:', sqlPath);
    return;
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await db.exec(sql);
    console.log('✅ 数据库表结构初始化完成（init.sql）');
  } catch (e) {
    console.error('❌ 数据库初始化失败:', e.message);
  }
}
// PM2 重启后初始化数据库
setTimeout(() => { initDatabase(); }, 100);

// 临时调试接口：添加 type 列
app.post('/api/debug/add-type-column', async (req, res) => {
  try {
    const stmt = db.prepare('ALTER TABLE project_logs ADD COLUMN type VARCHAR(20) DEFAULT "construction" AFTER project_id');
    await stmt.run();
    res.json({ message: 'type 列已添加' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 一次性修正：acceptance.created_at 历史默认值被写死为 2024-01-01，改为无默认值
// （POST /api/acceptance 已显式写入 NOW()；注意 MySQL 5.5 的 DATETIME 不支持 CURRENT_TIMESTAMP 默认值）
setTimeout(async () => {
  try {
    await db.exec('ALTER TABLE acceptance MODIFY COLUMN created_at DATETIME NULL DEFAULT NULL');
    console.log('[migrate] acceptance.created_at default cleared');
  } catch (e) {
    console.error('[migrate] acceptance.created_at 修正失败:', e.message);
  }
}, 2500);

// ==================== 主材验收建表（v2.4.1）====================
// 服务器（Windows 宝塔）覆盖代码后重启即自动建表，不需要单独跑 migration 脚本。
// 注意 MySQL 5.5 的 DATETIME 不支持 CURRENT_TIMESTAMP 默认值，统一 DEFAULT NULL + 代码写 NOW()。
setTimeout(async () => {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS material_acceptances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        accept_no VARCHAR(50) DEFAULT '',
        project_id INT NOT NULL,
        project_name VARCHAR(255) DEFAULT '',
        accept_date VARCHAR(50) DEFAULT '',
        stage VARCHAR(50) DEFAULT '',
        foreman_id INT DEFAULT NULL,
        foreman_name VARCHAR(100) DEFAULT '',
        supplier_id INT DEFAULT NULL,
        supplier_name VARCHAR(255) DEFAULT '',
        delivery_no VARCHAR(100) DEFAULT '',
        docs TEXT,
        storage VARCHAR(50) DEFAULT '',
        result VARCHAR(50) DEFAULT '',
        handling VARCHAR(50) DEFAULT '',
        item_count INT DEFAULT 0,
        pass_count INT DEFAULT 0,
        fail_count INT DEFAULT 0,
        photos TEXT,
        remark TEXT,
        creator_id INT DEFAULT NULL,
        created_at DATETIME NULL DEFAULT NULL,
        updated_at DATETIME NULL DEFAULT NULL,
        KEY idx_ma_project (project_id),
        KEY idx_ma_date (accept_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS material_acceptance_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        accept_id INT NOT NULL,
        material_id INT DEFAULT NULL,
        material_name VARCHAR(255) DEFAULT '',
        spec VARCHAR(255) DEFAULT '',
        brand VARCHAR(255) DEFAULT '',
        unit VARCHAR(50) DEFAULT '',
        plan_qty DECIMAL(12,2) DEFAULT NULL,
        actual_qty DECIMAL(12,2) DEFAULT NULL,
        verdict VARCHAR(20) DEFAULT '合格',
        problem_tags TEXT,
        remark VARCHAR(255) DEFAULT '',
        sort_order INT DEFAULT 0,
        KEY idx_mai_accept (accept_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[migrate] material_acceptances / material_acceptance_items 表已就绪');
  } catch (e) {
    console.error('[migrate] 主材验收建表失败:', e.message);
  }
}, 2600);

// ==================== 家庭成员管理 ====================
// 确保家庭成员表存在
setTimeout(async () => {
  try {
    // 创建家庭成员表（如果不存在）
    await db.exec(`
      CREATE TABLE IF NOT EXISTS family_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL COMMENT '主账户客户ID',
        name VARCHAR(100) NOT NULL COMMENT '成员姓名',
        phone VARCHAR(20) NOT NULL COMMENT '手机号（唯一标识）',
        relation VARCHAR(50) COMMENT '与主账户关系：配偶/父母/子女/其他',
        is_master TINYINT(1) DEFAULT 0 COMMENT '是否主账户：0-否，1-是',
        status TINYINT(1) DEFAULT 1 COMMENT '状态：0-禁用，1-启用',
        created_at DATETIME DEFAULT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_phone (phone),
        INDEX idx_customer_id (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家庭成员表'
    `);
    console.log('✅ family_members 表已创建或已存在');
  } catch (e) {
    console.log('⚠️ family_members 建表失败:', e.message);
  }
}, 200);

// GET /api/family-members - 获取当前客户的家庭成员列表
app.get('/api/family-members', async (req, res) => {
  try {
    // 优先从请求头获取客户ID
    const customerId = parseInt(req.headers['x-customer-id'] || req.query.customer_id || '0');

    if (!customerId) {
      return res.status(400).json({ error: '缺少客户ID' });
    }

    // 先查询该客户是否是某个家庭的主账户
    const masterStmt = db.prepare(
      'SELECT phone FROM family_members WHERE customer_id = ? AND is_master = 1 LIMIT 1'
    );
    const masterRecord = await masterStmt.get(customerId);
    const masterPhone = masterRecord ? masterRecord.phone : null;

    // 获取该客户及其家庭成员的所有记录
    let members = [];
    if (masterPhone) {
      // 获取所有使用相同主账户手机号的成员
      const membersStmt = db.prepare(
        `SELECT id, customer_id, name, phone, relation, is_master, status, created_at
         FROM family_members
         WHERE phone = ?
         ORDER BY is_master DESC, created_at ASC`
      );
      members = await membersStmt.all(masterPhone);
    } else {
      // 还没有家庭，可能是第一次使用，先查自己
      const selfStmt = db.prepare(
        'SELECT * FROM family_members WHERE customer_id = ?'
      );
      members = await selfStmt.all(customerId);
    }

    res.json(members || []);
  } catch (err) {
    console.error('获取家庭成员失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/family-members - 添加家庭成员
app.post('/api/family-members', async (req, res) => {
  try {
    const customerId = parseInt(req.headers['x-customer-id'] || req.body.customer_id || '0');
    const { name, phone, relation } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: '姓名和手机号不能为空' });
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }

    // 检查手机号是否已被注册
    const existingStmt = db.prepare('SELECT id, customer_id, name, is_master FROM family_members WHERE phone = ?');
    const existingRecord = await existingStmt.get(phone);

    if (existingRecord) {
      // 如果该手机号已存在
      // 检查是否属于同一家庭（通过主账户手机号判断）
      const masterStmt = db.prepare(
        'SELECT phone FROM family_members WHERE customer_id = ? AND is_master = 1 LIMIT 1'
      );
      const masterRecord = await masterStmt.get(customerId);
      const masterPhone = masterRecord ? masterRecord.phone : null;

      // 如果新添加的手机号就是主账户本人，设置is_master=1
      if (masterPhone === phone) {
        // 更新为is_master
        const updateStmt = db.prepare(
          'UPDATE family_members SET name = ?, relation = ?, is_master = 1 WHERE phone = ?'
        );
        await updateStmt.run(name, relation || '', phone);
        return res.json({ success: true, id: existingRecord.id, message: '更新成功' });
      }

      // 如果该手机号属于其他家庭，不允许添加
      if (masterPhone && masterPhone !== phone) {
        return res.status(400).json({ error: '该手机号已被其他账户关联' });
      }
    }

    // 获取当前客户的主账户手机号
    const masterCheckStmt = db.prepare(
      'SELECT phone FROM family_members WHERE customer_id = ? AND is_master = 1 LIMIT 1'
    );
    const masterCheck = await masterCheckStmt.get(customerId);
    const isMaster = masterCheck ? (masterCheck.phone === phone ? 1 : 0) : 1;

    // 如果已有记录，更新；否则新增
    if (existingRecord) {
      const updateStmt = db.prepare(
        'UPDATE family_members SET name = ?, relation = ?, is_master = ? WHERE phone = ?'
      );
      await updateStmt.run(name, relation || '', isMaster, phone);
      res.json({ success: true, id: existingRecord.id, message: '更新成功' });
    } else {
      const insertStmt = db.prepare(
        'INSERT INTO family_members (customer_id, name, phone, relation, is_master) VALUES (?, ?, ?, ?, ?)'
      );
      const result = await insertStmt.run(customerId, name, phone, relation || '', isMaster);
      res.json({ success: true, id: result.lastInsertRowid, message: '添加成功' });
    }
  } catch (err) {
    console.error('添加家庭成员失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/family-members/:id - 删除家庭成员（仅主账户可删除自己添加的成员）
app.delete('/api/family-members/:id', async (req, res) => {
  try {
    const customerId = parseInt(req.headers['x-customer-id'] || '0');
    const memberId = parseInt(req.params.id);

    if (!customerId || !memberId) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 查询该成员信息
    const memberStmt = db.prepare('SELECT * FROM family_members WHERE id = ?');
    const member = await memberStmt.get(memberId);

    if (!member) {
      return res.status(404).json({ error: '成员不存在' });
    }

    // 验证权限：必须是同一家庭的成员才能删除
    // 获取当前客户的主账户手机号
    const masterStmt = db.prepare(
      'SELECT phone FROM family_members WHERE customer_id = ? AND is_master = 1 LIMIT 1'
    );
    const masterRecord = await masterStmt.get(customerId);
    const masterPhone = masterRecord ? masterRecord.phone : null;

    // 同一家庭成员的判断：使用相同主账户手机号
    const isSameFamily = masterPhone && masterPhone === member.phone;

    if (!isSameFamily) {
      return res.status(403).json({ error: '无权删除此成员' });
    }

    // 不能删除主账户自己
    if (member.is_master === 1) {
      return res.status(400).json({ error: '不能删除主账户' });
    }

    const deleteStmt = db.prepare('DELETE FROM family_members WHERE id = ?');
    await deleteStmt.run(memberId);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    console.error('删除家庭成员失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/family-members/:id - 更新家庭成员信息
app.put('/api/family-members/:id', async (req, res) => {
  try {
    const customerId = parseInt(req.headers['x-customer-id'] || '0');
    const memberId = parseInt(req.params.id);
    const { name, relation } = req.body;

    if (!name) {
      return res.status(400).json({ error: '姓名不能为空' });
    }

    // 查询该成员信息
    const memberStmt = db.prepare('SELECT * FROM family_members WHERE id = ?');
    const member = await memberStmt.get(memberId);

    if (!member) {
      return res.status(404).json({ error: '成员不存在' });
    }

    // 验证权限：必须是同一家庭的成员才能修改
    const masterStmt = db.prepare(
      'SELECT phone FROM family_members WHERE customer_id = ? AND is_master = 1 LIMIT 1'
    );
    const masterRecord = await masterStmt.get(customerId);
    const masterPhone = masterRecord ? masterRecord.phone : null;
    const isSameFamily = masterPhone && masterPhone === member.phone;

    if (!isSameFamily) {
      return res.status(403).json({ error: '无权修改此成员信息' });
    }

    const updateStmt = db.prepare(
      'UPDATE family_members SET name = ?, relation = ? WHERE id = ?'
    );
    await updateStmt.run(name, relation || '', memberId);
    res.json({ success: true, message: '更新成功' });
  } catch (err) {
    console.error('更新家庭成员失败:', err);
    res.status(500).json({ error: err.message });
  }
});


const defaultPermissions = [
  { name: '数据看板', code: 'dashboard', path: '/dashboard', icon: 'DataAnalysis', sort_order: 1 },
  { name: '客户管理', code: 'customer', path: '/customers', icon: 'User', sort_order: 2 },
  { name: '关联所有客户', code: 'customer_all', path: '', icon: '', sort_order: 2 },
  { name: '合同管理', code: 'contract', path: '/contracts', icon: 'Document', sort_order: 3 },
  { name: '预算报价', code: 'budget', path: '/budgets', icon: 'Money', sort_order: 4 },
  { name: '工程管理', code: 'project', path: '/projects', icon: 'FolderOpened', sort_order: 5 },
  { name: '报价管理', code: 'quote', path: '/quotes', icon: 'Tickets', sort_order: 6 },
  { name: '仓库管理', code: 'warehouse', path: '/warehouse', icon: 'Box', sort_order: 7 },
  { name: '采购订单', code: 'purchase', path: '/material-orders', icon: 'ShoppingCart', sort_order: 8 },
  { name: '财务管理', code: 'finance', path: '/finance', icon: 'Wallet', sort_order: 9 },
  { name: '员工管理', code: 'employee', path: '/employees', icon: 'UserFilled', sort_order: 10 },
  { name: '角色权限', code: 'role', path: '/roles', icon: 'Key', sort_order: 11 },
  { name: '部门管理', code: 'department', path: '/departments', icon: 'OfficeBuilding', sort_order: 12 },
  { name: '审批管理', code: 'approval', path: '/approvals', icon: 'Checked', sort_order: 13 },
  { name: '汇报管理', code: 'report', path: '/reports', icon: 'Notebook', sort_order: 14 },
  { name: '公告管理', code: 'notice', path: '/notices', icon: 'Bell', sort_order: 15 },
  { name: '工地巡检', code: 'inspection', path: '/inspections', icon: 'Search', sort_order: 16 },
  { name: '验收管理', code: 'acceptance', path: '/acceptance', icon: 'CircleCheck', sort_order: 17 },
  { name: '发票管理', code: 'invoice', path: '/invoices', icon: 'Ticket', sort_order: 18 }
];

const defaultRoles = [
  { name: '超级管理员', code: 'admin', description: '拥有所有权限', permissions: JSON.stringify(['dashboard', 'customer', 'customer_all', 'contract', 'budget', 'project', 'quote', 'warehouse', 'purchase', 'finance', 'employee', 'role', 'department', 'approval', 'report', 'notice', 'inspection', 'acceptance', 'invoice']) },
  { name: '项目经理', code: 'manager', description: '项目管理权限', permissions: JSON.stringify(['dashboard', 'customer', 'customer_all', 'project', 'warehouse', 'purchase', 'finance', 'inspection', 'acceptance']) },
  { name: '设计师', code: 'designer', description: '设计和预算权限', permissions: JSON.stringify(['dashboard', 'customer', 'budget', 'quote']) },
  { name: '财务', code: 'finance', description: '财务权限', permissions: JSON.stringify(['dashboard', 'customer', 'customer_all', 'finance', 'contract', 'invoice']) },
  { name: '普通员工', code: 'user', description: '基本权限', permissions: JSON.stringify(['dashboard', 'approval', 'report']) }
];

const checkAndInsertDefaultData = () => {
  return (async () => {
  const permCount = await db.prepare('SELECT COUNT(*) as count FROM permissions').get();
  if (permCount.count === 0) {
    const insertPerm = db.prepare('INSERT INTO permissions (name, code, path, icon, sort_order) VALUES (?, ?, ?, ?, ?)');
    for (const p of defaultPermissions) await insertPerm.run(p.name, p.code, p.path, p.icon, p.sort_order);
    console.log('默认权限数据已添加');
  }
  
  const roleCount = await db.prepare('SELECT COUNT(*) as count FROM roles').get();
  if (roleCount.count === 0) {
    const insertRole = db.prepare('INSERT INTO roles (name, code, description, permissions) VALUES (?, ?, ?, ?)');
    for (const r of defaultRoles) await insertRole.run(r.name, r.code, r.description, r.permissions);
    console.log('默认角色数据已添加');
  }
  
  const empCount = await db.prepare('SELECT COUNT(*) as count FROM employees').get();
  if (empCount.count === 0) {
    const adminRole = await db.prepare("SELECT id FROM roles WHERE code = 'admin'").get();
    const insertEmp = db.prepare("INSERT INTO employees (username, password, name, phone, role_id, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)");
    await insertEmp.run('admin', 'admin123', '系统管理员', '13800000000', adminRole?.id, '在职', '系统管理员');
    console.log('默认管理员账号已添加: admin / admin123');
  }
  
  const tplCount = await db.prepare('SELECT COUNT(*) as count FROM contract_templates').get();
  if (tplCount.count === 0) {
    const insertTpl = db.prepare('INSERT INTO contract_templates (name, category, content, is_default) VALUES (?, ?, ?, ?)');
    await insertTpl.run('装修施工合同', 'decoration', `<h1 style="text-align: center; font-size: 24px;">室内装修工程施工合同</h1>
<p><strong>合同编号：</strong>{{contract_no}}</p>
<p><strong>签订日期：</strong>{{sign_date}}</p>
<h2>第一条 工程概况</h2>
<p><strong>工程名称：</strong>{{project_name}}</p>
<p><strong>工程地点：</strong>{{customer_address}}</p>
<p><strong>施工面积：</strong>{{area}}平方米</p>
<p><strong>装修风格：</strong>{{decoration_style}}</p>
<h2>第二条 合同金额</h2>
<p>本工程合同总价为：人民币 <strong>{{total_amount}} 元</strong></p>
<h2>第三条 工期安排</h2>
<p><strong>计划开工日期：</strong>{{start_date}}</p>
<p><strong>计划竣工日期：</strong>{{end_date}}</p>
<h2>第四条 甲方（发包方）</h2>
<p><strong>名称（姓名）：</strong>{{customer_name}}</p>
<p><strong>联系电话：</strong>{{customer_phone}}</p>
<p><strong>地址：</strong>{{customer_address}}</p>
<h2>第五条 乙方（承包方）</h2>
<p>名称：装企云装饰工程有限公司</p>
<h2>第六条 工程质量标准</h2>
<p>按照国家现行装修工程质量检验规范执行，达到合格标准。</p>
<h2>第七条 付款方式</h2>
<p>1. 合同签订当日，甲方向乙方支付工程款的30%作为预付款</p>
<p>2. 水电改造完成后支付工程款的30%</p>
<p>3. 泥木工程完成后支付工程款的30%</p>
<p>4. 竣工验收合格后支付剩余10%</p>
<h2>第八条 违约责任</h2>
<p>1. 甲方未按约定支付工程款的，每逾期一天按照未付金额的千分之一支付违约金</p>
<p>2. 乙方未按约定工期完工的，每逾期一天按照合同总价的千分之一支付违约金</p>
<h2>第九条 争议解决</h2>
<p>本合同在履行过程中发生争议的，双方协商解决；协商不成的，向工程所在地人民法院提起诉讼。</p>
<h2>第十条 其他约定</h2>
<p>本合同一式两份，甲乙双方各执一份，自双方签字盖章之日起生效。</p>
<table style="width: 100%; margin-top: 50px; border-collapse: collapse;">
<tr><td style="width: 50%; padding: 20px; border: 1px solid #000;"><p><strong>甲方（盖章）：</strong></p><p>签字：</p><p>日期：&nbsp;&nbsp;&nbsp;&nbsp;年&nbsp;&nbsp;&nbsp;&nbsp;月&nbsp;&nbsp;&nbsp;&nbsp;日</p></td>
<td style="width: 50%; padding: 20px; border: 1px solid #000;"><p><strong>乙方（盖章）：</strong></p><p>签字：</p><p>日期：&nbsp;&nbsp;&nbsp;&nbsp;年&nbsp;&nbsp;&nbsp;&nbsp;月&nbsp;&nbsp;&nbsp;&nbsp;日</p></td></tr>
</table>`, 1);
    await insertTpl.run('设计合同', 'design', `<h1 style="text-align: center; font-size: 24px;">室内设计委托合同</h1>
<p><strong>合同编号：</strong>{{contract_no}}</p>
<p><strong>签订日期：</strong>{{sign_date}}</p>
<h2>第一条 设计项目</h2>
<p><strong>项目名称：</strong>{{project_name}}</p>
<p><strong>项目地址：</strong>{{customer_address}}</p>
<p><strong>设计面积：</strong>{{area}}平方米</p>
<h2>第二条 设计费用</h2>
<p>设计费总额：人民币 <strong>{{total_amount}} 元</strong></p>
<h2>第三条 设计周期</h2>
<p><strong>开始日期：</strong>{{start_date}}</p>
<p><strong>完成日期：</strong>{{end_date}}</p>
<h2>第四条 甲方（委托方）</h2>
<p><strong>姓名：</strong>{{customer_name}}</p>
<p><strong>电话：</strong>{{customer_phone}}</p>
<h2>第五条 乙方（设计方）</h2>
<p>公司：装企云装饰设计有限公司</p>`, 0);
    await insertTpl.run('委托代理合同', 'entrust', `<h1 style="text-align: center; font-size: 24px;">装修委托代理合同</h1>
<p><strong>合同编号：</strong>{{contract_no}}</p>
<h2>第一条 委托事项</h2>
<p>甲方委托乙方代理以下装修工程：<strong>{{project_name}}</strong></p>
<h2>第二条 代理费用</h2>
<p>代理费用：人民币 <strong>{{total_amount}} 元</strong></p>
<h2>第三条 代理期限</h2>
<p>{{start_date}} 至 {{end_date}}</p>
<h2>第四条 双方权利义务</h2>
<p>（在此处填写双方权利义务条款）</p>
<h2>第五条 违约责任</h2>
<p>（在此处填写违约责任条款）</p>`, 0);
    console.log('默认合同模板已添加');
  }
  })();
};

// 启动时执行默认数据初始化
setTimeout(() => { checkAndInsertDefaultData(); }, 1000);

// ==================== 通知规则默认配置 ====================
function getDefaultNotificationRules() {
  return {
    node_completed:    { enabled: true, channels: ['inapp', 'sms'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
    node_in_progress:  { enabled: true, channels: ['inapp', 'sms'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
    node_pending:      { enabled: true, channels: ['inapp', 'sms'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
    node_skipped:      { enabled: true, channels: ['inapp', 'sms'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
    project_progress:  { enabled: true, channels: ['inapp'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
    inspection_submit: { enabled: true, channels: ['inapp'], receivers: ['manager', 'supervisor'] },
  };
}

// ==================== 通用通知函数 ====================
// 改造后的 notifyProject：按角色订阅发送，支持多渠道（站内/短信/微信）
// 1. 查所有 notification_types 包含此type的角色
// 2. 查这些角色的所有员工（去重）
// 3. 查项目相关人（设计师/监理/客户）如果他们订阅了该消息类型也通知
// 4. 管理员无论如何都收到
// 5. 消息写入 notifications 表（receiver_phone=员工phone）
// 6. 按通知规则的 channels 决定发送渠道（inapp写库 / sms发短信 / wechat发微信）
// ============ 消息提醒 · 关联判定 helper（v2.3.1 P2） ============
// 返回某项目关联的员工 user_id 集合（含创建人/设计师/监理/工长/项目经理）；
// 客户端（业主）不计 user_id（手机号仍会走 projectTargets 分支）。
async function getProjectRelatedUserIds(projectId) {
  if (!projectId) return new Set();
  try {
    const [rows] = await pool.query(
      `SELECT creator_id, designer_id, supervisor_id, manager_id, foreman_id
       FROM projects WHERE id = ? LIMIT 1`,
      [projectId]
    );
    if (!rows[0]) return new Set();
    const r = rows[0];
    return new Set([r.creator_id, r.designer_id, r.supervisor_id, r.manager_id, r.foreman_id].filter(Boolean));
  } catch (e) {
    console.error('[getProjectRelatedUserIds] failed:', e.message);
    return new Set();
  }
}

// 2026-10-12：按权限码找"该审核的人"（单一真源 roles.permissions JSON，与 permCore 同源；'*' 为 admin 直通）
async function getUserIdsByPermission(code) {
  try {
    const [rows] = await pool.query(
      `SELECT e.id, r.permissions FROM employees e JOIN roles r ON r.id = e.role_id
       WHERE e.status = '在职' AND e.phone IS NOT NULL AND e.phone != ''`
    );
    const ids = [];
    for (const row of (rows || [])) {
      let perms = [];
      try { perms = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : (row.permissions || []); } catch { perms = []; }
      if (Array.isArray(perms) && (perms.includes(code) || perms.includes('*'))) ids.push(row.id);
    }
    return ids;
  } catch (e) {
    console.error(`[getUserIdsByPermission] ${code} 查询失败:`, e.message);
    return [];
  }
}

// 审核提交类通知（陛下批示 2026-10-12）：审批权限人 + 提交人 + 项目经理，客户不收
async function notifyReviewSubmitted(type, projectId, title, content, sourceId, sourceType, submitterId, permCodes) {
  const ids = [submitterId];
  for (const code of (permCodes || [])) ids.push(...await getUserIdsByPermission(code));
  if (projectId) {
    try {
      const [[p]] = await pool.query('SELECT manager_id FROM projects WHERE id = ?', [projectId]);
      if (p && p.manager_id) ids.push(p.manager_id);
    } catch {}
  }
  return notifyProject(type, projectId, title, content, sourceId, sourceType, null, { mode: 'participants', userIds: ids });
}

// 审核结果类通知：仅提交人（谁发起，反馈给谁）
async function notifySubmitter(type, projectId, title, content, sourceId, sourceType, submitterId) {
  return notifyProject(type, projectId, title, content, sourceId, sourceType, null, { mode: 'participants', userIds: [submitterId] });
}

async function notifyProject(type, projectId, title, content, sourceId, sourceType, templateId, opts = {}) {
  // 2026-10-09 修复：收集短信发送结果，函数末尾返回给调用方
  const smsResults = [];
  // 2026-10-12 通知模式（陛下批示）：
  //   'participants' — 事件当事人：仅通知 opts.userIds（+管理员兜底）。
  //                    用于审核提交（审批人+提交人+项目经理）与审核结果（仅提交人）
  //   'subscribers'  — 按 PC「角色消息订阅」设置：客户 + 管理员 + 订阅了该类型的角色∩项目关联人。
  //                    用于项目级事件（项目创建/状态变更/节点状态/进展）
  //   默认 'related' — 全部项目关联人（巡检/整改/验收类维持现状）
  opts = (opts && typeof opts === 'object') ? opts : {};
  const notifyMode = opts.mode || 'related';
  // 事件当事人模式的显式接收人（审核提交/审核结果专用）
  const explicitTargets = [];
  if (notifyMode === 'participants' && Array.isArray(opts.userIds) && opts.userIds.length > 0) {
    const __ids = [...new Set(opts.userIds.filter(Boolean))];
    if (__ids.length > 0) {
      try {
        const [emps] = await pool.query(
          `SELECT id, phone, name FROM employees WHERE id IN (${__ids.map(() => '?').join(',')}) AND phone IS NOT NULL AND phone != ''`,
          __ids
        );
        for (const e of (emps || [])) {
          explicitTargets.push({ phone: e.phone, name: e.name || '', role: 'staff', user_id: e.id });
        }
      } catch (e) {
        console.error('[notifyProject] 当事人查询失败:', e.message);
      }
    }
  }
  try {
    // 0. 读取通知规则
    let notifRules = {};
    try {
      const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE category = 'notifications'");
      if (rows[0]) {
        const parsed = JSON.parse(rows[0].setting_value);
        notifRules = parsed.setting_value || parsed;
      }
    } catch {}

    // 读取微信公众号模板消息ID
    let mpTemplateId = null;
    try {
      const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE category = 'wechat_mp'");
      if (rows[0]) {
        const parsed = JSON.parse(rows[0].setting_value);
        const cfg = parsed.setting_value || parsed;
        mpTemplateId = cfg.template_id || null;
      }
    } catch {}

    // 决定本条消息要走的渠道（兼容旧调用：没传 templateId 则默认只 inapp）
    const rule = notifRules[type];
    const enabledChannels = rule && rule.enabled
      ? (rule.channels || ['inapp'])
      : (templateId ? ['inapp'] : ['inapp']);

    // 1. 获取所有订阅了该消息类型的角色（允许列不存在时报错跳过）
    let roles = [];
    try {
      const [rows] = await db.prepare('SELECT id, name FROM roles WHERE notification_types LIKE ?').all(`%${type}%`);
      roles = rows || [];
    } catch (e) {
      // 列不存在或查询失败，跳过角色订阅（项目相关人和admin仍会收到）
      console.log(`[notifyProject] 角色订阅查询失败（可能notification_types列不存在）: ${e.message}`);
    }

    // 2. 查这些角色的所有员工手机号 —— P2 §8.2 改造：
    //    有 projectId 时，"角色订阅员工" 与 "项目关联人" 取交集（且与 sourceId 提交人取并集）；
    //    无 projectId 时（公告 / 系统通知），仍按角色订阅广播。
    //    P2 §8.3 第 2 步原状：原代码无条件把订阅角色全员加上，改造后按 projectId 分支处理。
    let staffTargets = [];
    if (roles && roles.length > 0 && notifyMode !== 'participants') {
      const roleIds = roles.map(r => r.id);
      const rolePlaceholders = roleIds.map(() => '?').join(',');
      let candidates = [];
      if (!projectId) {
        // 无项目归属：按角色订阅广播
        candidates = roleIds;
      } else {
        // 有项目归属：仅保留与该项目关联的员工
        // 先拿相关人 user_id 集
        const linkedUserIds = await getProjectRelatedUserIds(projectId);
        if (linkedUserIds && linkedUserIds.size > 0) {
          const [employees] = await db.prepare(
            `SELECT DISTINCT e.id as user_id, e.phone, e.name FROM employees e WHERE e.role_id IN (${rolePlaceholders}) AND e.id IN (?) AND e.phone IS NOT NULL AND e.phone != ''`,
            [...roleIds, Array.from(linkedUserIds)]
          ).all();
          candidates = (employees || []).map((e) => e.id);
        }
      }
      if (candidates.length > 0) {
        const [employees] = await db.prepare(
          `SELECT DISTINCT e.id as user_id, e.phone, e.name FROM employees e WHERE e.id IN (${candidates.map(() => '?').join(',')}) AND e.phone IS NOT NULL AND e.phone != ''`
        ).all(...candidates);
        if (employees) {
          for (const e of employees) {
            if (e.phone) staffTargets.push({ phone: e.phone, name: e.name || '', role: 'staff', user_id: e.user_id || null });
          }
        }
      }
    }

    // 3. 如果有 projectId，查项目相关人（设计师/监理/客户/项目经理/工长/创建人）—— P2 §8.3 第 3 步：补 creator + foreman
    //    2026-10-12：participants 模式跳过；subscribers 模式仅保留客户（员工改由角色订阅决定）
    let projectTargets = [];
    if (projectId && notifyMode !== 'participants') {
      try {
        const [proj] = await mysqlPool.query(`
          SELECT c.phone as customer_phone, c.name as customer_name,
          des.phone as designer_phone, des.name as designer_name,
          sup.phone as supervisor_phone, sup.name as supervisor_name,
          mgr.id as manager_user_id, mgr.phone as manager_phone, mgr.name as manager_name,
          des.id as designer_user_id, sup.id as supervisor_user_id,
          cre.id as creator_user_id, cre.phone as creator_phone, cre.name as creator_name,
          fm.id as foreman_user_id, fm.phone as foreman_phone, fm.name as foreman_name
          FROM projects p
          LEFT JOIN customers c ON p.customer_id = c.id
          LEFT JOIN employees des ON p.designer_id = des.id
          LEFT JOIN employees sup ON p.supervisor_id = sup.id
          LEFT JOIN employees mgr ON p.manager_id = mgr.id
          LEFT JOIN employees cre ON p.creator_id = cre.id
          LEFT JOIN employees fm ON p.foreman_id = fm.id
          WHERE p.id = ?
        `, [projectId]);

        console.log(`[notifyProject] 项目${projectId}查询结果:`, JSON.stringify(proj && proj[0] ? proj[0] : '无'));

        if (proj && proj[0]) {
          const p = proj[0];
          // subscribers 模式（项目级事件按 PC 订阅设置走）：员工不再无条件全发，仅客户必达；
          // 员工是否接收由「角色订阅」决定（见 step 2 staffTargets）
          const pushAllStaff = notifyMode !== 'subscribers';
          // 关联人：与 7.3 一致 —— 设计师 / 监理 / 项目经理 / 客户 / 创建人 / 工长
          if (pushAllStaff && p.designer_phone) projectTargets.push({ phone: p.designer_phone, name: p.designer_name, role: 'designer', user_id: p.designer_user_id || null });
          if (pushAllStaff && p.supervisor_phone) projectTargets.push({ phone: p.supervisor_phone, name: p.supervisor_name, role: 'supervisor', user_id: p.supervisor_user_id || null });
          if (pushAllStaff && p.manager_phone) projectTargets.push({ phone: p.manager_phone, name: p.manager_name, role: 'manager', user_id: p.manager_user_id || null });
          if (p.customer_phone) projectTargets.push({ phone: p.customer_phone, name: p.customer_name, role: 'customer', user_id: null });
          if (pushAllStaff && p.creator_phone) projectTargets.push({ phone: p.creator_phone, name: p.creator_name, role: 'creator', user_id: p.creator_user_id || null });
          if (pushAllStaff && p.foreman_phone) projectTargets.push({ phone: p.foreman_phone, name: p.foreman_name, role: 'foreman', user_id: p.foreman_user_id || null });
        }
      } catch(e) {
        console.log(`[notifyProject] 项目相关人查询失败: ${e.message}`);
      }
    }
    console.log(`[notifyProject] 项目相关人:`, projectTargets.map(t => `${t.phone}(${t.role})`));

    // 4. 合并去重（按phone去重）
    const phoneSet = new Set();
    const allTargets = [];
    for (const t of [...explicitTargets, ...staffTargets, ...projectTargets]) {
      if (t.phone && !phoneSet.has(t.phone)) {
        phoneSet.add(t.phone);
        allTargets.push(t);
      }
    }

    // 5. 管理员（id=1对应的手机号）永远收到
    const [adminEmp] = await db.prepare('SELECT phone, name FROM employees WHERE id = 1').all();
    if (adminEmp && adminEmp.phone && !phoneSet.has(adminEmp.phone)) {
      allTargets.push({ phone: adminEmp.phone, name: adminEmp.name || '管理员', role: 'admin' });
    }

    // 如果没有任何接收人，跳过
    if (allTargets.length === 0) {
      console.log(`[notifyProject] 没有接收人，跳过通知 type=${type} projectId=${projectId}`);
      return;
    }

    console.log(`[notifyProject] 准备发送通知 type=${type} to=`, allTargets.map(t => t.phone));

    // 6. 对每个接收人，按渠道发送
    for (const t of allTargets) {
      // 站内消息（必须）
      if (enabledChannels.includes('inapp')) {
        try {
          const [r] = await mysqlPool.query(
            'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [title, content, type, sourceId || 0, sourceType || '', 0, t.phone, t.name || '', 'inapp', 'pending']
          );
          console.log(`[notifyProject] ✅ 通知已写入 id=${r.insertId} phone=${t.phone} name=${t.name}`);

          // 同时写 messages 表（员工消息页面读的是 MySQL messages 表）
          if (t.user_id) {
            try {
              await pool.query(
                'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [t.user_id, t.name || '', title, content, type, sourceId || 0, sourceType || '', 0, 'sent', new Date().toISOString()]
              );
              console.log(`[notifyProject] ✅ messages已写入 MySQL phone=${t.phone} user_id=${t.user_id}`);
            } catch(e2) {
              console.error(`[notifyProject] ❌ messages写入失败 phone=${t.phone} user_id=${t.user_id} error=${e2.message}`);
            }
          }
        } catch(e) {
          console.error(`[notifyProject] ❌ 写入失败 phone=${t.phone} error=${e.message}`);
        }
      }

      // 短信渠道 —— P2 §8.3 渠道规则：仅对客户（业主）发送，员工一律不发短信（陛下四次批示）
      if (enabledChannels.includes('sms') && templateId && t.role === 'customer') {
        try {
          const smsRes = await sendSmsFromNotify(t.phone, t.name, title, content, templateId);
          smsResults.push({ phone: t.phone, name: t.name, ...smsRes });
        } catch (e) {
          smsResults.push({ phone: t.phone, name: t.name, success: false, error: e.message });
        }
      }

      // 微信渠道（调用 push）
      if (enabledChannels.includes('wechat') && mpTemplateId) {
        // 构造微信模板消息数据格式：{ key: { value: 'xxx', color: '#xxx' } }
        const wechatData = {
          first: { value: title, color: '#1890ff' },
          keyword1: { value: t.name || '未知', color: '#333333' },
          keyword2: { value: content.substring(0, 20), color: '#333333' },
          remark: { value: '如有疑问请联系客服', color: '#999999' }
        };
        // 异步推送，不阻塞
        pushWechatByPhone(t.phone, mpTemplateId, wechatData).catch(console.error);
      }
    }
  } catch (err) {
    console.error('notifyProject error:', err);
  }
  return smsResults;
}

// 内部函数：通过手机号推送微信模板消息
async function pushWechatByPhone(phone, templateId, data) {
  try {
    const [users] = await pool.query(
      `SELECT * FROM wechat_users WHERE phone = ? AND status = 1 ORDER BY mp_openid DESC LIMIT 1`,
      [phone]
    );
    if (!users[0]) return { success: false, reason: '未绑定微信' };

    const user = users[0];
    const openid = user.mp_openid || user.mini_openid;
    if (!openid) return { success: false, reason: '无有效OpenID' };

    const [configRows] = await pool.query("SELECT setting_value FROM system_settings WHERE category = 'wechat_mp'");
    if (!configRows[0]) return { success: false, reason: '微信公众号未配置' };
    const parsed = JSON.parse(configRows[0].setting_value);
    const config = parsed.setting_value || parsed;
    if (!config.app_id || !config.app_secret) return { success: false, reason: '微信公众号未完成配置' };

    // 获取全局 access_token
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${config.app_id}&secret=${config.app_secret}`;
    const tokenData = await new Promise((resolve, reject) => {
      https.get(tokenUrl, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      }).on('error', reject);
    });
    if (tokenData.errcode) return { success: false, reason: tokenData.errmsg };

    // 发送模板消息
    const sendUrl = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${tokenData.access_token}`;
    const bodyStr = JSON.stringify({ touser: openid, template_id: templateId, data });
    const result = await new Promise((resolve, reject) => {
      const req = https.request(sendUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      });
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });

    if (result.errcode === 0) {
      console.log(`[WechatPush] 推送成功 phone=${phone} msgid=${result.msgid}`);
      return { success: true, msgid: result.msgid };
    } else {
      console.error(`[WechatPush] 推送失败 phone=${phone} errcode=${result.errcode} errmsg=${result.errmsg}`);
      return { success: false, reason: result.errmsg, errcode: result.errcode };
    }
  } catch (err) {
    console.error(`[WechatPush] 异常 phone=${phone}`, err.message);
    return { success: false, reason: err.message };
  }
}

// 纯应用内通知（不发短信，不走通知规则，直接插入数据库）
async function insertInAppNotification(projectId, title, content, sourceId, sourceType) {
  try {
    const [proj] = await db.prepare(`
      SELECT p.*, c.name as customer_name, c.phone as customer_phone,
      des.name as designer_name, des.phone as designer_phone,
      sup.name as supervisor_name, sup.phone as supervisor_phone,
      mgr.name as manager_name, mgr.phone as manager_phone
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN employees des ON p.designer_id = des.id
      LEFT JOIN employees sup ON p.supervisor_id = sup.id
      LEFT JOIN employees mgr ON p.manager_id = mgr.id
      WHERE p.id = ?`).all(projectId);
    if (!proj) return;

    const roles = [
      { phone: proj.manager_phone, name: proj.manager_name },
      { phone: proj.designer_phone, name: proj.designer_name },
      { phone: proj.supervisor_phone, name: proj.supervisor_name },
      { phone: proj.customer_phone, name: proj.customer_name },
    ];

    for (const t of roles) {
      if (t.phone) {
        await mysqlPool.query(
          'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
          [title, content, 'inapp', sourceId || 0, sourceType || '', 0, t.phone, t.name || '', 'inapp', 'pending']
        );
      }
    }
  } catch (err) { console.error('insertInAppNotification error:', err); }
}

// 统一应用内通知：同时写 notifications 和 messages 表
// type: 'purchase'|'material_in'|'material_out'|'node_status' 等
// targets: 数组，每个元素是 { phone, name, user_id }
// 注意：此函数内部按 phone 去重，避免同一人收到多条通知
async function sendAppNotification(type, title, content, sourceId, sourceType, targets) {
  if (!targets || targets.length === 0) return;
  const channels = 'inapp';
  // 按 phone 去重
  const seen = new Set();
  const uniqueTargets = [];
  for (const t of targets) {
    if (!t.phone || seen.has(t.phone)) continue;
    seen.add(t.phone);
    uniqueTargets.push(t);
  }
  for (const t of uniqueTargets) {
    try {
      // 写 notifications 表
      await mysqlPool.query(
        'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
        [title, content, type, sourceId || 0, sourceType || '', 0, t.phone, t.name || '', channels, 'pending']
      );
      // 写 messages 表（如果能查到 user_id）
      if (t.user_id) {
        await mysqlPool.query(
          'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [t.user_id, t.name || '', title, content, type, sourceId || 0, sourceType || '', 0, 'sent', new Date()]
        );
      }
    } catch (err) {
      console.error('sendAppNotification error:', err);
    }
  }
}

// ==================== 通知短信发送函数（被 notifyProject 调用）====================
// templateId 可选：指定则优先用该模板的 aliyun_template_code，否则用默认模板
async function sendSmsFromNotify(phone, name, title, content, templateId) {
  // 2026-10-09 修复：返回 { success, count, error, reason }，让调用方知道发送结果
  const result = { success: false, count: 0, error: null, reason: null };
  if (!phone) { result.reason = 'no_phone'; return result; }

  // 读取阿里云短信配置（SQLite system_settings，category='sms'）
  const [smsSettings] = await db.prepare("SELECT setting_value FROM system_settings WHERE category='sms'").all();
  let smsConfig = smsSettings ? JSON.parse(smsSettings.setting_value) : null;
  if (smsConfig && smsConfig.setting_value) smsConfig = smsConfig.setting_value;
  if (!smsConfig || smsConfig.provider !== 'aliyun') { result.reason = 'sms_not_configured'; return result; }
  if (!smsConfig.access_key_id || !smsConfig.access_key_secret) { result.reason = 'sms_config_incomplete'; return result; }

  let signName = smsConfig.sign_name || '简逸装饰';
  let templateCode = smsConfig.template_code || '';

  // 优先用节点绑定的模板，其次用默认模板
  if (templateId) {
    const [tmpl] = await db.prepare('SELECT aliyun_template_code, sign_name FROM sms_templates WHERE id=? AND is_active=1').all(templateId);
    if (tmpl && tmpl.aliyun_template_code) {
      templateCode = tmpl.aliyun_template_code;
      signName = tmpl.sign_name || signName;
    }
  }
  if (!templateCode) {
    const [tmpl] = await db.prepare(
      'SELECT aliyun_template_code, sign_name FROM sms_templates WHERE is_active=1 AND aliyun_template_code IS NOT NULL AND aliyun_template_code != "" LIMIT 1'
    ).all();
    if (tmpl) {
      templateCode = tmpl.aliyun_template_code;
      signName = tmpl.sign_name || signName;
    }
  }
  if (!templateCode) { result.reason = 'sms_template_not_found'; return result; }

  // 提取项目名称（title格式：XXX：项目名）
  // 2026-10-23：新文案「项目进度更新「节点」完成」的 title 里没有项目名，从 content 的 项目「xxx」 兜底
  let projectName = title.replace(/^(工地巡检提交：|项目节点完成：|项目新进展：|项目节点进行中：|项目节点待处理：|项目节点已跳过：)/, '');
  if (projectName === title) {
    const pm = String(content || '').match(/项目「([^」]+)」/);
    if (pm) projectName = pm[1];
  }

  try {
    const aliyunResp = await sendAliyunSms({
      accessKeyId: smsConfig.access_key_id,
      accessKeySecret: smsConfig.access_key_secret,
      signName,
      templateCode,
      phone: phone.startsWith('+') ? phone : '+86' + phone,
      templateParam: JSON.stringify({
        name: name || '业主',
        project: projectName,
        content: content.length > 50 ? content.substring(0, 50) + '…' : content,
        date: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
      })
    });
    // 阿里云返回 { Code, Message, RequestId, BizId }
    if (aliyunResp && aliyunResp.Code === 'OK') {
      result.success = true;
      result.count = 1;
      return result;
    } else {
      result.error = (aliyunResp && (aliyunResp.Message || aliyunResp.Code)) || 'unknown';
      return result;
    }
  } catch (e) {
    result.error = e.message || 'send_failed';
    return result;
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '装企云ERP系统运行中' });
});

// ==================== 客户管理 ====================
// GET 客户列表 — 下拉选择用，不受权限限制
app.get('/api/customers', async (req, res) => {
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

app.post('/api/customers', async (req, res) => {
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
app.get('/api/customers/check-phone', async (req, res) => {
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

app.put('/api/customers/:id', checkPermission('customer:write'), async (req, res) => {
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
app.put('/api/customers/:id/overwrite', async (req, res) => {
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

app.delete('/api/customers/:id', checkPermission('customer:delete'), async (req, res) => {
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

app.get('/api/customer-follow/:customerId', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM customer_follow WHERE customer_id = ? ORDER BY created_at DESC');
  res.json(await stmt.all(req.params.customerId));
});

app.post('/api/customer-follow', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { customer_id, follow_type, content, follow_date, next_date } = req.body;
  const stmt = db.prepare('INSERT INTO customer_follow (customer_id, follow_type, content, follow_date, next_date, creator_id) VALUES (?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(customer_id, follow_type, content, follow_date, next_date, userId);
  const [cust] = await db.prepare('SELECT name FROM customers WHERE id = ?').all(customer_id);
  await addLog(userId, '', '新增', '客户跟进', result.lastInsertRowid, cust?.name || '', `跟进客户: ${cust?.name || customer_id}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.get('/api/contracts', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const page = parseInt(req.query.page || 1);
  const pageSize = Math.min(parseInt(req.query.pageSize || 100), 500);
  const offset = (page - 1) * pageSize;

  // 列表接口排除 content 字段（内容太大，按需加载）
  const listFields = 'id, contract_no, category, customer_name, customer_phone, id_card, engineering_address, total_amount, design_fee, manager_fee, tax_amount, area, start_date, end_date, status, sign_date, decoration_style, payment1, payment2, payment3, guarantee_period, dispute_court, attachment, custom_fields, created_by, created_at';

  let rows, total;
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'contract');

  if (hasAll) {
    const [countRows] = await pool.query('SELECT COUNT(*) as total FROM contracts');
    total = Number(countRows[0]?.total) || 0;
    const [rowsRaw] = await pool.query(`SELECT ${listFields} FROM contracts ORDER BY id DESC LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`);
    rows = rowsRaw;
  } else if (userId) {
    // P2 §4.5：合同可见性 = (创建人 ∪ 关联项目)；project_id IS NULL 的历史合同按创建人走
    const relatedIds = Array.from(await permCore.relatedProjectIds(userId));
    const placeholders = relatedIds.length ? relatedIds.map(() => '?').join(',') : '';
    const cond = `(created_by = ? ${relatedIds.length ? ` OR project_id IN (${placeholders})` : ''})`;
    const params = [userId, ...relatedIds];
    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM contracts WHERE ${cond}`, params);
    total = Number(countRows[0]?.total) || 0;
    const [rowsRaw] = await pool.query(`SELECT ${listFields} FROM contracts WHERE ${cond} ORDER BY id DESC LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`, params);
    rows = rowsRaw;
  } else {
    total = 0;
    rows = [];
  }

  // 批量查出创建人名字
  const creatorIds = [...new Set(rows.map(r => r.created_by).filter(Boolean))];
  let creatorMap = {};
  if (creatorIds.length > 0) {
    const placeholders = creatorIds.map(() => '?').join(',');
    const [creatorRows] = await pool.query(`SELECT id, name FROM employees WHERE id IN (${placeholders})`, creatorIds);
    creatorRows.forEach(u => { creatorMap[u.id] = u.name; });
  }

  rows.forEach(row => {
    if (row.custom_fields) {
      try { row.custom_fields = JSON.parse(row.custom_fields); } catch (e) {}
    }
    row.creator_name = creatorMap[row.created_by] || '';
  });

  res.json({ list: rows, total, page, pageSize });
});

app.get('/api/contracts/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const id = parseInt(req.params.id);

  try {
    const row = await db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '合同不存在' });

    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
    const canReadAll = userIsAdmin || await hasReadAllPermission(userId, 'contract');
    if (!canReadAll && row.created_by !== userId) {
      return res.status(403).json({ error: '无权查看此合同' });
    }

    if (row.custom_fields) {
      try { row.custom_fields = JSON.parse(row.custom_fields); } catch (e) {}
    }
    res.json(row);
  } catch (err) {
    console.error('合同详情查询失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function generateContractNo() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // FOR UPDATE 锁定同日期的行，防止并发冲突
    const [rows] = await conn.query(
      "SELECT contract_no FROM contracts WHERE contract_no LIKE ? FOR UPDATE",
      [`HT-${dateStr}%`]
    );
    let maxSeq = 0;
    for (const row of rows) {
      const seq = parseInt(row.contract_no.split('-').pop() || '0', 10);
      if (seq > maxSeq) maxSeq = seq;
    }
    const newNo = `HT-${dateStr}-${String(maxSeq + 1).padStart(3, '0')}`;
    await conn.commit();
    return newNo;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

app.post('/api/contracts', checkPermission('contract:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  console.log('=== POST /api/contracts 收到请求 ===');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Body:', JSON.stringify(req.body));

  // 只提取需要的字段，排除多余字段
  const allowedFields = ['contract_no', 'customer_id', 'project_name', 'customer_name', 'customer_phone', 'customer_address', 'id_card', 'engineering_address', 'total_amount', 'design_fee', 'manager_fee', 'tax_amount', 'area', 'start_date', 'end_date', 'status', 'sign_date', 'decoration_style', 'payment1', 'payment2', 'payment3', 'guarantee_period', 'dispute_court', 'content', 'attachment', 'category', 'custom_fields'];
  const data = {};
  for (const field of allowedFields) {
    if (req.body && req.body[field] !== undefined) {
      data[field] = req.body[field];
    } else {
      data[field] = null;
    }
  }
  
  let { contract_no, customer_id, project_name, customer_name, customer_phone, customer_address, id_card, engineering_address, total_amount, design_fee, manager_fee, tax_amount, area, start_date, end_date, status, sign_date, decoration_style, payment1, payment2, payment3, guarantee_period, dispute_court, content, attachment, category, custom_fields } = data;
  
  console.log('解析后的字段:', { contract_no, project_name, customer_name, total_amount });
  
  customer_id = customer_id || null;
  attachment = attachment || '';
  
  if (!contract_no || !contract_no.trim()) {
    contract_no = await generateContractNo();
  }
  
  if (!project_name || !project_name.trim()) {
    return res.status(400).json({ error: '请填写项目名称' });
  }
  if (!customer_name || !customer_name.trim()) {
    return res.status(400).json({ error: '请填写客户名称' });
  }
  if (!total_amount || total_amount <= 0) {
    return res.status(400).json({ error: '请填写有效的合同金额' });
  }
  
  // 打印参数值用于调试
  console.log('参数: contract_no=%s, customer_id=%s, project_name=%s, total_amount=%s', 
    contract_no, customer_id, project_name, total_amount);
  
  try {
    // 使用参数化 INSERT，lastInsertRowid 来自 mysql2 的 result.insertId
    const customFieldsVal = typeof custom_fields === 'string' ? custom_fields : (custom_fields ? JSON.stringify(custom_fields) : null);
    console.log('INSERT contracts SQL params:', {
      contract_no, customer_id, project_name, customer_name, customer_phone,
      customer_address, id_card, engineering_address, total_amount,
      design_fee: design_fee || 0, manager_fee: manager_fee || 0, tax_amount: tax_amount || 0,
      area, start_date, end_date, status: status || '待签订', sign_date, decoration_style,
      payment1: payment1 || 0, payment2: payment2 || 0, payment3: payment3 || 0,
      guarantee_period, dispute_court, content: content?.slice(0, 50), attachment: attachment?.slice(0, 50),
      category: category || 'decoration', customFieldsVal: customFieldsVal?.slice(0, 50),
      userId: userId || null, userId2: userId || null
    });
    const result = await db.prepare(`
      INSERT INTO contracts (contract_no, customer_id, project_name, customer_name, customer_phone,
        customer_address, id_card, engineering_address, total_amount, design_fee, manager_fee,
        tax_amount, area, start_date, end_date, status, sign_date, decoration_style,
        payment1, payment2, payment3, guarantee_period, dispute_court, content, attachment,
        category, custom_fields, created_by, creator_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contract_no, customer_id, project_name, customer_name, customer_phone,
      customer_address, id_card, engineering_address, total_amount,
      design_fee || 0, manager_fee || 0, tax_amount || 0,
      area, start_date, end_date, status || '待签订', sign_date, decoration_style,
      payment1 || 0, payment2 || 0, payment3 || 0,
      guarantee_period, dispute_court, content, attachment,
      category || 'decoration', customFieldsVal, userId || null, userId || null
    );
    const lastId = result.lastInsertRowid;
    console.log('INSERT contracts 执行成功, lastId:', lastId);
    await addLog(userId, '', '新增', '合同管理', lastId, project_name, `合同编号: ${contract_no}, 金额: ${total_amount}`, req.ip);
    
    // 自动保存签约人
    if (customer_name && customer_name.trim()) {
      try {
        const existingSigner = await db.prepare('SELECT id FROM signers WHERE name = ? AND created_by = ?').get(customer_name.trim(), userId || 0);
        if (existingSigner) {
          await db.prepare('UPDATE signers SET phone=?, id_card=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(customer_phone || '', id_card || '', existingSigner.id);
        } else {
          await db.prepare('INSERT INTO signers (name, phone, id_card, created_by, creator_id) VALUES (?, ?, ?, ?, ?)').run(customer_name.trim(), customer_phone || '', id_card || '', userId || 0, userId || 0);
        }
      } catch(e) { /* 签约人保存失败不影响合同保存 */ }
    }
    
    // 通知：新增合同
    notifyProject('contract_created', null,
      `新合同签订：${customer_name || ''} - ${project_name || ''}`,
      `合同编号：${contract_no}，客户：${customer_name || ''}，项目：${project_name || ''}，金额：${total_amount || ''}`,
      lastId, 'contract'
    ).catch(console.error);

    res.json({ id: lastId, message: '添加成功' });
  } catch (err) {
    console.error('数据库错误:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/contracts/:id', checkPermission('contract:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const editUserId = getUserId(req);
  const { contract_no, customer_id, project_name, customer_name, customer_phone, customer_address, id_card, engineering_address, total_amount, design_fee, manager_fee, tax_amount, area, start_date, end_date, status, sign_date, decoration_style, payment1, payment2, payment3, guarantee_period, dispute_court, content, attachment, category, custom_fields } = req.body;
  
  // 权限检查：非管理员只能修改自己创建的合同
  const [existingContract] = await db.prepare('SELECT created_by FROM contracts WHERE id = ?').all(req.params.id);
  if (!existingContract) return res.status(404).json({ error: '合同不存在' });
  if (existingContract.created_by !== editUserId && !(await isAdmin(editUserId))) return res.status(403).json({ error: '无权修改他人的数据' });

  if (!project_name || !project_name.trim()) {
    return res.status(400).json({ error: '请填写项目名称' });
  }
  if (!customer_name || !customer_name.trim()) {
    return res.status(400).json({ error: '请填写客户名称' });
  }
  if (!total_amount || total_amount <= 0) {
    return res.status(400).json({ error: '请填写有效的合同金额' });
  }
  
  const stmt = db.prepare('UPDATE contracts SET contract_no=?, customer_id=?, project_name=?, customer_name=?, customer_phone=?, customer_address=?, id_card=?, engineering_address=?, total_amount=?, design_fee=?, manager_fee=?, tax_amount=?, area=?, start_date=?, end_date=?, status=?, sign_date=?, decoration_style=?, payment1=?, payment2=?, payment3=?, guarantee_period=?, dispute_court=?, content=?, attachment=?, category=?, custom_fields=? WHERE id=?');
  await stmt.run(contract_no, customer_id, project_name, customer_name, customer_phone, customer_address, id_card, engineering_address, total_amount, design_fee || 0, manager_fee || 0, tax_amount || 0, area, start_date, end_date, status, sign_date, decoration_style, payment1 || 0, payment2 || 0, payment3 || 0, guarantee_period, dispute_court, content, attachment, category, typeof custom_fields === 'string' ? custom_fields : (custom_fields ? JSON.stringify(custom_fields) : null), req.params.id);

  // 自动保存签约人
  if (customer_name && customer_name.trim()) {
    try {
      const existingSigner = await db.prepare('SELECT id FROM signers WHERE name = ? AND created_by = ?').get(customer_name.trim(), editUserId || 0);
      if (existingSigner) {
        await db.prepare('UPDATE signers SET phone=?, id_card=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(customer_phone || '', id_card || '', existingSigner.id);
      } else {
        await db.prepare('INSERT INTO signers (name, phone, id_card, created_by, creator_id) VALUES (?, ?, ?, ?, ?)').run(customer_name.trim(), customer_phone || '', id_card || '', editUserId || 0, editUserId || 0);
      }
    } catch(e) { /* 签约人保存失败不影响合同更新 */ }
  }

  await addLog(editUserId, '', '编辑', '合同管理', req.params.id, project_name, `更新合同: ${project_name}`, req.ip);
  res.json({ message: '更新成功' });
});

// ==================== 合同附件文件清理（v2.4.0）====================
// 背景：删除合同原来只删数据库行。content 里的 base64 图片会随行消失，
//       但 /uploads/ 下的真实文件没有任何清理逻辑，长期会堆成孤儿文件。
// 策略：删合同后，把 content / attachment 里引用到的本地文件逐个检查，
//       确认没有其他合同还在用才删——避免误删多份合同共享的同一张图。
function extractUploadPaths(html) {
  if (!html || typeof html !== 'string') return [];
  const m = html.match(/\/uploads\/[A-Za-z0-9_\-\/\.]+\.(?:jpg|jpeg|png|gif|webp|bmp|pdf|doc|docx)/gi) || [];
  return [...new Set(m)];
}

async function cleanupContractFiles(paths, deletedId) {
  const uploadsRoot = path.join(__dirname, 'uploads');
  for (const p of paths) {
    try {
      const like = `%${p}%`;
      const [rows] = await pool.query(
        'SELECT id FROM contracts WHERE id <> ? AND (content LIKE ? OR attachment LIKE ?) LIMIT 1',
        [deletedId, like, like]
      );
      if (rows.length) continue; // 还有别的合同在用，保留
      const full = path.join(__dirname, p.replace(/^\//, ''));
      // 防路径穿越：必须落在 uploads 目录内
      if (!full.startsWith(uploadsRoot + path.sep)) continue;
      if (fs.existsSync(full)) {
        fs.unlinkSync(full);
        console.log(`[删除合同] 已清理附件: ${p}`);
      }
    } catch (e) {
      console.error('[删除合同] 清理附件失败:', p, e.message);
    }
  }
}

app.delete('/api/contracts/:id', checkPermission('contract:delete'), async (req, res) => {
  const rawUserId = req.headers['x-user-id'];
  const userId = rawUserId ? parseInt(rawUserId) : 0;
  console.log('[DELETE contracts] userId=%s, isAdmin=%s, targetId=%s', userId, await isAdmin(userId), req.params.id);
  const [c] = await db.prepare('SELECT project_name, created_by, content, attachment FROM contracts WHERE id = ?').all(req.params.id);
  if (!c) return res.status(404).json({ error: '记录不存在' });
  if (c.created_by !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
  const cName = c.project_name;
  const stmt = db.prepare('DELETE FROM contracts WHERE id = ?');
  await stmt.run(req.params.id);
  // v2.3.12 修：删合同必须连带清掉它产生的「合同」收入记录，
  // 否则 payment_records 里会留下一条找不到来源合同的孤儿收入
  // （柏林山水 12 万那条就是删了合同 #76 之后残留下来的）。
  try {
    const [orphan] = await pool.query(
      "DELETE FROM payment_records WHERE source_id = ? AND category = 'contract'",
      [req.params.id]
    );
    if (orphan.affectedRows) console.log('[删除合同] 连带清理收支记录 %d 条, contractId=%s', orphan.affectedRows, req.params.id);
  } catch (e) {
    console.error('[删除合同] 清理收支记录失败:', e.message);
  }
  // 异步清理附件文件，不阻塞响应
  const paths = [...extractUploadPaths(c.content), ...extractUploadPaths(c.attachment)];
  if (paths.length) {
    cleanupContractFiles(paths, req.params.id).catch(e => console.error('[删除合同] 附件清理异常:', e.message));
  }
  await addLog(userId, '', '删除', '合同管理', req.params.id, cName, `删除合同: ${cName}`, req.ip);
  res.json({ message: '删除成功' });
});

// ==================== 签约人管理 ====================
app.get('/api/signers', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { keyword } = req.query;
  try {
    let rows;
    if (keyword) {
      rows = await db.prepare('SELECT * FROM signers WHERE created_by = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY updated_at DESC').all(userId, `%${keyword}%`, `%${keyword}%`);
    } else {
      rows = await db.prepare('SELECT * FROM signers WHERE created_by = ? ORDER BY updated_at DESC').all(userId);
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/signers', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { name, phone, id_card, remark } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '请填写签约人姓名' });
  }
  try {
    const existing = await db.prepare('SELECT id FROM signers WHERE name = ? AND created_by = ?').get(name.trim(), userId);
    if (existing) {
      await db.prepare('UPDATE signers SET phone=?, id_card=?, remark=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(phone || '', id_card || '', remark || '', existing.id);
      res.json({ id: existing.id, message: '更新成功' });
    } else {
      const result = await db.prepare('INSERT INTO signers (name, phone, id_card, remark, created_by, creator_id) VALUES (?, ?, ?, ?, ?, ?)').run(name.trim(), phone || '', id_card || '', remark || '', userId, userId);
      await addLog(userId, '', '新增', '签约人管理', result.lastInsertRowid, name.trim(), `签约人: ${name.trim()}`, req.ip);
      res.json({ id: result.lastInsertRowid, message: '添加成功' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/signers/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { name, phone, id_card, remark } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '请填写签约人姓名' });
  }
  try {
    const existing = await db.prepare('SELECT id FROM signers WHERE id = ? AND created_by = ?').get(req.params.id, userId);
    if (!existing) {
      return res.status(403).json({ error: '无权修改此签约人' });
    }
    await db.prepare('UPDATE signers SET name=?, phone=?, id_card=?, remark=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name.trim(), phone || '', id_card || '', remark || '', req.params.id);
    await addLog(userId, '', '编辑', '签约人管理', req.params.id, name, `更新签约人: ${name}`, req.ip);
    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/signers/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  try {
    const [s] = await db.prepare('SELECT name FROM signers WHERE id = ?').all(req.params.id);
    const sName = s ? s.name : req.params.id;
    await db.prepare('DELETE FROM signers WHERE id = ? AND created_by = ?').run(req.params.id, userId);
    await addLog(userId, '', '删除', '签约人管理', req.params.id, sName, `删除签约人: ${sName}`, req.ip);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 上传文件名中文乱码修复 ====================
// 背景：busboy 解析 multipart 的 filename 时按 latin1 解读原始字节，而移动端/浏览器
// 传的是 UTF-8 字节 → 中文被解成「å®8å¥½」这类字符，再存进 utf8mb4 就成了双重编码。
// 例：「合同」正确字节 e59088e5908c，latin1 解读后每字节各占一个字符（Å æ…），
//      最终落库为 c3a5c290c288c3a5c290c28c，前端显示乱码。
// 解法：把字符串按 latin1 还原成原始字节，再按 utf8 解一次。
// 注意：已正常的中文和纯 ASCII 文件名不受影响（不含 latin1 高位区，直接原样返回）。
function fixMojibake(name) {
  if (typeof name !== 'string' || !name) return name;
  // 不含 latin1 高位区（U+0080-U+00FF）的名字直接跳过：
  // 纯 ASCII 文件名和已经显示正常的中文都走这条分支，不会被二次解码
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  try {
    const recovered = Buffer.from(name, 'latin1').toString('utf8');
    // 还原结果含替换字符 U+FFFD，说明原名并非「UTF-8 被误读」，保持原样
    if (recovered.includes('�')) return name;
    return recovered;
  } catch {
    return name;
  }
}

const uploadDir = path.join(__dirname, 'uploads/');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir, limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/api/contracts/upload-word', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ error: '未找到文件' });
    }
    // v2.3.6-hotfix2：修复中文文件名乱码
    req.file.originalname = fixMojibake(req.file.originalname);

    const fileName = req.file.originalname;
    if (!fileName.endsWith('.docx')) {
      fs.unlinkSync(req.file.path);
      return res.json({ error: '仅支持.docx格式' });
    }
    
    const mammoth = require('mammoth');
    const result = await mammoth.convertToHtml({ path: req.file.path });
    fs.unlinkSync(req.file.path);
    res.json({ html: result.value });
  } catch (error) {
    console.error('Word上传错误:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.json({ error: '文件处理失败: ' + error.message });
  }
});

// ==================== 合同文件上传（支持图片/PDF/Word） ====================
app.post('/api/upload-contract-file', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未找到文件' });
    }
    // v2.3.6-hotfix2：修复中文文件名乱码
    req.file.originalname = fixMojibake(req.file.originalname);
    const ext = path.extname(req.file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.pdf', '.doc', '.docx'];
    if (!allowedExts.includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '不支持此文件格式' });
    }
    const newName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    const contractUploadDir = path.join(uploadDir, 'contracts/');
    if (!fs.existsSync(contractUploadDir)) fs.mkdirSync(contractUploadDir, { recursive: true });
    const newPath = path.join(contractUploadDir, newName);
    fs.renameSync(req.file.path, newPath);
    const url = `/uploads/contracts/${newName}`;
    res.json({ url });
  } catch (error) {
    console.error('合同文件上传错误:', error);
    res.status(500).json({ error: '文件上传失败' });
  }
});

// ==================== 图片/PDF 上传接口 ====================
// 图片上传接口（存文件，返回路径，删图片接口）
const logsUploadDir = path.join(uploadDir, 'logs/');
if (!fs.existsSync(logsUploadDir)) {
  fs.mkdirSync(logsUploadDir, { recursive: true });
}

app.post('/api/upload-image', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未找到文件' });
    }
    // v2.3.6-hotfix2：修复中文文件名乱码
    req.file.originalname = fixMojibake(req.file.originalname);
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    let ext = path.extname(req.file.originalname).toLowerCase();

    // v2.3.7：文件名没有扩展名时，按 MIME 类型推断
    // 背景：前端 compressImage() 用 canvas.toBlob() 压缩，产物是**无文件名**的 Blob，
    // 浏览器 FormData 会把它命名成 "blob"（无扩展名）。原来 path.extname('blob') === ''
    // → 不在白名单 → 误报"仅支持图片格式"，而用户上传的确实是 jpg/png。
    // 修复：扩展名缺失时回退到 mimetype 推断。
    if (!ext) {
      const mimeExt = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/bmp': '.bmp',
      }[(req.file.mimetype || '').toLowerCase()];
      if (mimeExt) ext = mimeExt;
    }

    if (!allowedExts.includes(ext)) {
      fs.unlinkSync(req.file.path);
      const reason = `文件名=${req.file.originalname} 类型=${req.file.mimetype}`;
      console.error(`[上传] 非图片格式被拒: ${reason}`);
      res.errorMessage = `非图片格式被拒 (${reason})`;
      return res.status(400).json({ error: '仅支持图片格式：jpg/png/gif/webp' });
    }
    // 重命名为唯一文件名，保留扩展名
    const newName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    const newPath = path.join(logsUploadDir, newName);
    fs.renameSync(req.file.path, newPath);
    const url = `/uploads/logs/${newName}`;
    console.log(`[上传] 图片: ${req.file.originalname} (${req.file.mimetype}) -> ${url}`);
    res.json({ url, size: fs.statSync(newPath).size });
  } catch (error) {
    console.error('图片上传错误:', error);
    // 写入 errorMessage，让全局日志中间件能记录真实原因（原来恒为空）
    res.errorMessage = '图片上传失败: ' + (error && error.message ? error.message : String(error));
    res.status(500).json({ error: '图片上传失败: ' + (error && error.message ? error.message : '未知错误') });
  }
});

// 删除图片文件接口（根据路径数组删除）
app.post('/api/delete-images', (req, res) => {
  try {
    const { paths } = req.body;
    if (!Array.isArray(paths)) return res.status(400).json({ error: 'paths 必须是数组' });
    for (const p of paths) {
      if (typeof p !== 'string' || !p.startsWith('/uploads/')) continue;
      const fullPath = path.join(__dirname, p);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`[删除图片] ${p}`);
      }
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除图片错误:', error);
    res.status(500).json({ error: '删除图片失败' });
  }
});

// PDF 转多页预览图接口（Mac 用 pdftoppm 转所有页，Windows 预留 pdf2pic 接口）
// v2.4.0 性能改造：改为「落地 JPEG 文件 + 返回 URL」，不再把 base64 塞进编辑器 HTML。
// 改造前：每页转 PNG 再 base64 内嵌 → 单份合同 content 达 8MB+（14 页 PDF = 8.67MB），
//         打开编辑页要拉 8MB 大字段、保存又要回传 8MB，实测详情接口 20s+，且拖慢备份。
// 改造后：content 只存 /uploads/contracts/pdf/xxx.jpg 短路径（整份约 20KB），
//         图片走静态服务 + 浏览器缓存，加载/保存快两个数量级。
// 兼容性：导出 PDF 时 withLocalBase() 会注入 <base href="http://127.0.0.1:PORT/">，
//         相对路径图片照样能渲染进 PDF（v2.3.7 已修复），业务呈现完全不变。
// 体积：130dpi JPEG（默认质量 75）约为原 150dpi PNG 的 1/5，合同文字依然清晰。
app.post('/api/upload-pdf', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未找到文件' });
    }
    // v2.3.6-hotfix2：修复中文文件名乱码
    req.file.originalname = fixMojibake(req.file.originalname);
    if (path.extname(req.file.originalname).toLowerCase() !== '.pdf') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '仅支持 PDF 格式' });
    }
    const { spawnSync } = require('child_process');
    // 先获取总页数
    const infoResult = spawnSync('pdfinfo', [req.file.path], { encoding: 'utf8' });
    let totalPages = 1;
    const infoMatch = infoResult.stdout.match(/Pages:\s*(\d+)/);
    if (infoMatch) totalPages = parseInt(infoMatch[1]) || 1;
    // 限制最多转 20 页，防止异常大文件
    if (totalPages > 20) totalPages = 20;
    // 转所有页面，每页一张 JPEG，落到 uploads/contracts/pdf/
    const pdfImgDir = path.join(uploadDir, 'contracts/pdf/');
    if (!fs.existsSync(pdfImgDir)) fs.mkdirSync(pdfImgDir, { recursive: true });
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2);
    const urls = [];
    for (let i = 1; i <= totalPages; i++) {
      const baseName = `${stamp}_${rand}_p${i}`;
      const outputBase = path.join(pdfImgDir, baseName);
      const result = spawnSync('pdftoppm', [
        '-jpeg', '-singlefile',
        '-f', String(i), '-l', String(i),
        '-r', '130',
        req.file.path, outputBase
      ], { encoding: 'utf8' });
      const outputPath = `${outputBase}.jpg`;
      if (!result.error && fs.existsSync(outputPath)) {
        urls.push(`/uploads/contracts/pdf/${baseName}.jpg`);
      }
    }
    fs.unlinkSync(req.file.path);
    if (!urls.length) {
      return res.status(500).json({ error: 'PDF 转预览图失败，请确认已安装 poppler（brew install poppler）' });
    }
    console.log(`[上传] PDF: ${req.file.originalname} -> ${urls.length} 页 JPEG`);
    res.json({ urls, totalPages });
  } catch (error) {
    console.error('PDF 上传错误:', error);
    res.status(500).json({ error: 'PDF 处理失败' });
  }
});

app.get('/api/contract-templates', async (req, res) => {
  const { template_type } = req.query;
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';

  let sql = 'SELECT * FROM contract_templates';
  const params = [];

  if (template_type) {
    // system模板所有人可见；personal模板只看自己创建的
    if (template_type === 'system') {
      sql += ' WHERE template_type = ?';
      params.push('system');
    } else {
      // personal 模板：管理员看全部，非管理员只看自己
      if (userRole === 'admin' || userRole === '超级管理员') {
        sql += ' WHERE template_type = ?';
        params.push('personal');
      } else {
        sql += ' WHERE template_type = ? AND created_by = ?';
        params.push('personal', userId);
      }
    }
  }

  sql += ' ORDER BY created_at DESC';
  const stmt = db.prepare(sql);
  res.json(params.length > 0 ? await stmt.all(...params) : await stmt.all());
});

// 判断是否为管理员的辅助函数
// 统一解析 userId：尝试从 header / body / query 多个来源获取
const getUserId = (req) => {
  // 优先从 x-user-id header 获取（前端 axios 拦截器会自动注入）
  if (req.headers['x-user-id']) {
    const v = parseInt(req.headers['x-user-id']);
    if (!isNaN(v)) return v;
  }
  // 其次从 body.user_id 获取
  if (req.body && req.body.user_id) {
    const v = parseInt(req.body.user_id);
    if (!isNaN(v)) return v;
  }
  // 最后从 query.user_id 获取
  if (req.query && req.query.user_id) {
    const v = parseInt(req.query.user_id);
    if (!isNaN(v)) return v;
  }
  return 0;
};


// Promise 超时辅助函数
const promiseTimeout = (ms, promise) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('查询超时')), ms))]);

const isAdmin = async (userId) => {
  if (!userId) return false;
  try {
    // 复用权威角色解析（带 60s 缓存）；兼容 role_code='admin' 或 username='admin'
    const info = await resolveAuthRole(userId);
    return isAdminRoleInfo(info);
  } catch (e) {
    console.error('isAdmin 查询失败:', e.message);
    return false;
  }
};

// 用户权限缓存（30秒），避免频繁查库
const userPermCache = new Map();
const PERM_CACHE_TTL = 30000;

// 获取用户权限数组（5秒超时，防止数据库慢查询卡死所有接口）
// 2026-10-10 修复：改用 pool (MySQL) 而不是 db (SQLite)，因为权限数据保存在 MySQL
async function getUserPermissions(userId) {
  if (!userId) return [];
  const cached = userPermCache.get(userId);
  if (cached && Date.now() - cached.ts < PERM_CACHE_TTL) return cached.perms;
  try {
    const [emps] = await promiseTimeout(5000, pool.query('SELECT role_id FROM employees WHERE id = ?', [userId]));
    if (!emps || emps.length === 0 || !emps[0].role_id) return [];
    const [roles] = await promiseTimeout(5000, pool.query('SELECT permissions FROM roles WHERE id = ?', [emps[0].role_id]));
    if (!roles || roles.length === 0) return [];
    const role = roles[0];
    let perms = [];
    if (role?.permissions) {
      if (typeof role.permissions === 'string') {
        try { perms = JSON.parse(role.permissions); } catch { perms = []; }
      } else if (Array.isArray(role.permissions)) {
        perms = role.permissions;
      }
    }
    userPermCache.set(userId, { perms, ts: Date.now() });
    return perms;
  } catch (e) {
    console.error('getUserPermissions 查询失败:', e.message);
    return [];
  }
}

// 检查用户是否有指定模块的 read_all 权限
async function hasReadAllPermission(userId, moduleKey) {
  if (!userId) return false;
  const perms = await getUserPermissions(userId);
  return perms.includes(`${moduleKey}:read_all`);
}

// 员工「敏感字段」已移除：工资/身份证/紧急联系/电话 字段不在 employees 表；
// 字段级脱敏 helper 已删除（v2.3.1 清理）。如需此类数据，外部联系人走独立模块。

// ============ 数据范围：角色「可管理部门」(managed_department_ids) ============
// 语义：
//   null / 空数组 → 不启用部门范围，保持原有逻辑（read_all 决定 / 否则仅本人）
//   非空数组      → 该用户可查看这些部门（含所有子部门）的数据（作为 read_all 的增量授权）
async function getManagedDepartmentIds(userId) {
  if (!userId) return null;
  const cached = managedDeptCache.get(userId);
  if (cached && Date.now() - cached.ts < MANAGED_DEPT_CACHE_TTL) return cached.ids;
  try {
    const [rows] = await promiseTimeout(5000, pool.query(
      `SELECT r.managed_department_ids FROM employees e
       LEFT JOIN roles r ON e.role_id = r.id WHERE e.id = ?`, [userId]
    ));
    const raw = rows && rows[0] ? rows[0].managed_department_ids : null;
    let ids = [];
    if (raw) {
      if (typeof raw === 'string') {
        try { ids = JSON.parse(raw); } catch { ids = []; }
      } else if (Array.isArray(raw)) {
        ids = raw;
      }
    }
    ids = (ids || []).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
    const result = ids.length ? ids : null;
    managedDeptCache.set(userId, { ids: result, ts: Date.now() });
    return result;
  } catch (e) {
    console.error('getManagedDepartmentIds 查询失败:', e.message);
    return null;
  }
}

// 递归展开部门（含所有子部门）。部门数量少，全量加载后在内存里展开。
async function expandDepartmentIds(ids) {
  if (!ids || !ids.length) return [];
  try {
    const [rows] = await promiseTimeout(5000, pool.query('SELECT id, parent_id FROM departments'));
    const childrenMap = new Map();
    for (const d of rows) {
      const p = (d.parent_id === null || d.parent_id === undefined) ? '__root__' : String(d.parent_id);
      if (!childrenMap.has(p)) childrenMap.set(p, []);
      childrenMap.get(p).push(d.id);
    }
    const out = new Set(ids);
    const queue = [...ids];
    while (queue.length) {
      const cur = queue.shift();
      const kids = childrenMap.get(String(cur)) || [];
      for (const k of kids) {
        if (!out.has(k)) { out.add(k); queue.push(k); }
      }
    }
    return [...out];
  } catch (e) {
    console.error('expandDepartmentIds 查询失败:', e.message);
    return ids;
  }
}

// 清除用户权限缓存
function clearUserPermCache(userId) {
  userPermCache.delete(userId);
}

// 检查用户是否有指定权限码
// permission 格式如 "employee:read", "contract:write"
function checkPermission(permission) {
  return async (req, res, next) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ error: '未登录' });
      }
      const adminResult = await isAdmin(userId);
      if (adminResult) {
        return next();
      }
      const perms = await getUserPermissions(userId);
      if (!Array.isArray(perms) || !perms.includes(permission)) {
        return res.status(403).json({ error: '无此操作权限' });
      }
      next();
    } catch (err) {
      console.error('[checkPermission] 捕获到异常:', err.message, err.stack);
      if (!res.headersSent) {
        return res.status(500).json({ error: '权限检查异常: ' + err.message });
      }
    }
  };
}

/**
 * 任一权限码命中即放行。
 * 用途：模块归属迁移期的兼容口径（例如「主材」从 warehouse 拆出 material 后，
 * 老角色可能只有 warehouse:*，新角色只有 material:*，两边都要认）。
 */
function checkAnyPermission(permissions) {
  const list = Array.isArray(permissions) ? permissions : [permissions];
  return async (req, res, next) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ error: '未登录' });
      }
      if (await isAdmin(userId)) return next();
      const perms = await getUserPermissions(userId);
      if (!Array.isArray(perms) || !list.some((p) => perms.includes(p))) {
        return res.status(403).json({ error: '无此操作权限', need: list });
      }
      next();
    } catch (err) {
      console.error('[checkAnyPermission] 捕获到异常:', err.message);
      if (!res.headersSent) {
        return res.status(500).json({ error: '权限检查异常: ' + err.message });
      }
    }
  };
}

app.post('/api/contract-templates', async (req, res) => {
  const _rawUid = req.headers['x-user-id'] || req.body.user_id;
    
  const userId = getUserId(req);
  const { name, category, content, is_default, template_type, template_fields } = req.body;
  
  // 检查权限：只有管理员可以创建系统模板
  if (template_type === 'system' && !(await isAdmin(userId))) {
    return res.status(403).json({ success: false, message: '只有管理员可以创建系统模板' });
  }
  
  const stmt = db.prepare('INSERT INTO contract_templates (name, category, content, is_default, template_type, template_fields, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(name, category, content, is_default || 0, template_type || 'personal', template_fields || '', userId || null);
  await addLog(userId, '', '新增', '合同模板', result.lastInsertRowid, name, `模板名称: ${name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/contract-templates/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'] || req.body.user_id;
    
  const userId = getUserId(req);
  const { name, category, content, is_default, template_type, template_fields } = req.body;
  
  // 检查是否是系统模板
  const template = await db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, message: '模板不存在' });
  }
  
  // 检查权限：系统模板只有管理员可以修改
  if (template.template_type === 'system' && !(await isAdmin(userId))) {
    return res.status(403).json({ success: false, message: '只有管理员可以修改系统模板' });
  }
  
  const stmt = db.prepare('UPDATE contract_templates SET name=?, category=?, content=?, is_default=?, template_type=?, template_fields=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
  await stmt.run(name, category, content, is_default || 0, template_type || 'personal', template_fields || '', req.params.id);
  await addLog(userId, '', '编辑', '合同模板', req.params.id, name, `更新模板: ${name}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/contract-templates/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'] || req.body.user_id;
    
  const userId = getUserId(req);
  
  // 检查是否是系统模板
  const template = await db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, message: '模板不存在' });
  }
  
  // 检查权限：系统模板只有管理员可以删除
  if (template.template_type === 'system' && !(await isAdmin(userId))) {
    return res.status(403).json({ success: false, message: '只有管理员可以删除系统模板' });
  }
  
  const stmt = db.prepare('DELETE FROM contract_templates WHERE id = ?');
  await await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '合同模板', req.params.id, template.name, `删除模板: ${template.name}`, req.ip);
  res.json({ message: '删除成功' });
});

async function addLog(userId, username, action, module, targetId, targetName, details, ipAddress) {
  try {
    // username 为空时，自动通过 userId 查 employees 表获取真实姓名
    let displayName = username;
    if (!displayName && userId) {
      const [emps] = await pool.query('SELECT name FROM employees WHERE id = ?', [userId]);
      displayName = emps[0] ? emps[0].name : (username || '');
    }
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await pool.query(
      'INSERT INTO operation_logs (user_id, username, action, module, target_id, target_name, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, displayName, action, module, targetId, targetName, details, ipAddress, nowStr]
    );
  } catch (e) {
    console.error('记录日志失败:', e.message);
  }
}

app.get('/api/operation-logs', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const { page, limit, module, action } = req.query;
  const p = parseInt(page) || 1;
  const l = parseInt(limit) || 50;
  const offset = (p - 1) * l;
  let countSql = 'SELECT COUNT(*) as total FROM operation_logs';
  let sql = 'SELECT * FROM operation_logs';
  const params = [];
  const conditions = [];
  if (module) {
    conditions.push('module = ?');
    params.push(module);
  }
  if (action) {
    conditions.push('action = ?');
    params.push(action);
  }
  if (conditions.length > 0) {
    countSql += ' WHERE ' + conditions.join(' AND ');
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  const [countResult] = await pool.query(countSql, params);
  const [rows] = await pool.query(sql, [...params, l, offset]);
  res.json({ logs: rows, total: countResult[0].total, page: p, limit: l });
});

// 清空操作日志
app.delete('/api/operation-logs', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE operation_logs');
    res.json({ success: true, message: '操作日志已清空' });
  } catch (e) {
    res.status(500).json({ success: false, message: '清空失败: ' + e.message });
  }
});

// ================================================================
// 系统日志（记录所有 API 请求）
// ================================================================
app.get('/api/system-logs', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const { page = 1, limit = 50, path, method, success, user_id, start_date, end_date } = req.query;
  let sql = 'SELECT * FROM system_logs WHERE 1=1';
  const params = [];
  if (path) { sql += ' AND path LIKE ?'; params.push(`%${path}%`); }
  if (method) { sql += ' AND method = ?'; params.push(method); }
  if (success !== undefined && success !== '') { sql += ' AND success = ?'; params.push(parseInt(success)); }
  if (user_id) { sql += ' AND user_id = ?'; params.push(parseInt(user_id)); }
  if (start_date) { sql += ' AND created_at >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND created_at <= ?'; params.push(end_date); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  const countSql = 'SELECT COUNT(*) as total FROM system_logs WHERE 1=1' + sql.split('WHERE 1=1')[1].split('ORDER BY')[0];
  const stmt = db.prepare(sql);
  const countStmt = db.prepare(countSql);
  try {
    const logs = await stmt.all(...params);
    const countResult = await countStmt.all(...params.slice(0, -2));
    const total = countResult[0] ? countResult[0].total : 0;
    res.json({ logs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) {
    res.json({ logs: [], total: 0, page: parseInt(page), limit: parseInt(limit) });
  }
});

// 清空系统日志
app.delete('/api/system-logs', async (req, res) => {
  await db.prepare('TRUNCATE TABLE system_logs').run();
  res.json({ success: true, message: '系统日志已清空' });
});

app.get('/api/debug/save-contract', (req, res) => {
  console.log('收到请求:', req.method);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  res.json({ 
    received: true, 
    body: req.body,
    headers: req.headers['content-type']
  });
});

app.get('/api/budgets', async (req, res) => {
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

app.post('/api/budgets', checkPermission('budget:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { customer_id, project_name, house_area, style, total_amount, profit_rate, status, items } = req.body;
  const stmt = db.prepare('INSERT INTO budgets (customer_id, project_name, house_area, style, total_amount, profit_rate, status, items, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(customer_id, project_name, house_area, style, total_amount, profit_rate, status || '草稿', JSON.stringify(items), userId);
  await addLog(userId, '', '新增', '预算管理', result.lastInsertRowid, project_name, `项目名称: ${project_name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.delete('/api/budgets/:id', checkPermission('budget:delete'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
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

app.get('/api/finance', async (req, res) => {
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

app.post('/api/finance', checkPermission('finance:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { type, amount, category, description, date, project_id } = req.body;
  const stmt = db.prepare('INSERT INTO finance (type, amount, category, description, date, project_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(type, amount, category, description, date, project_id, userId);
  await addLog(userId, '', '新增', '财务管理', result.lastInsertRowid, category || type, `财务类型: ${type}, 金额: ${amount}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

// POST /api/finance/add —— 移动端「收支记录」新增（pages/finance/add.vue）
// 移动端表单字段为 { type, amount, category, payee, remark, date, project_id }，
// 且以 res.data.code === 0 判定成功；这里做字段映射并统一返回 code:0。
app.post('/api/finance/add', checkPermission('finance:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ code: 1, error: '未登录' });
    const { type, amount, category, date, project_id } = req.body;
    const description = req.body.description || req.body.remark || req.body.payee || '';
    if (!type) return res.status(400).json({ code: 1, error: '缺少收支类型' });
    if (amount === undefined || amount === null || amount === '') return res.status(400).json({ code: 1, error: '缺少金额' });

    const result = await db.prepare(
      'INSERT INTO finance (type, amount, category, description, date, project_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(type, amount, category || '', description, date || null, project_id || null, userId);
    await addLog(userId, '', '新增', '财务管理', result.lastInsertRowid, category || type, `财务类型: ${type}, 金额: ${amount}`, req.ip);
    res.json({ code: 0, id: result.lastInsertRowid, message: '添加成功' });
  } catch (err) {
    console.error('finance/add error:', err);
    res.status(500).json({ code: 1, error: err.message });
  }
});

app.delete('/api/finance/:id', checkPermission('finance:delete'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
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

// ==================== 移动端：数据报表 / 收支统计与列表（补齐缺失接口）====================
// 移动端 pages/report/index.vue 请求 /api/report/stats，
// pages/finance/list.vue 请求 /api/finance/stats + /api/finance/list，
// 后端此前没有这三个路由 → 控制台 404、页面空白。此处补齐。
// 统一返回 { code: 0, data: {...} } 以匹配移动端 res.data.code === 0 的判断。

// GET /api/report/stats —— 数据报表页
app.get('/api/report/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const notDone = "(status IS NULL OR (status NOT LIKE '%完工%' AND status NOT LIKE '%完成%' AND status NOT LIKE '%竣工%' AND status NOT LIKE '%验收%'))";
    const isDone = "(status LIKE '%完工%' OR status LIKE '%完成%' OR status LIKE '%竣工%' OR status LIKE '%验收%')";

    const pTotal = await db.prepare('SELECT COUNT(*) AS n FROM projects').get();
    const pActive = await db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE ${notDone}`).get();
    const pDone = await db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE ${isDone}`).get();
    const pOverdue = await db.prepare(
      `SELECT COUNT(*) AS n FROM projects
       WHERE end_date IS NOT NULL AND end_date <> '' AND end_date < ? AND ${notDone}`
    ).get(today);

    const iTotal = await db.prepare('SELECT COUNT(*) AS n FROM rectification_issues').get();
    const iPending = await db.prepare(`SELECT COUNT(*) AS n FROM rectification_issues WHERE (status IS NULL OR status NOT IN ('已整改','已完成'))`).get();
    const iFixed = await db.prepare(`SELECT COUNT(*) AS n FROM rectification_issues WHERE status IN ('已整改','已完成')`).get();
    const iOverdue = await db.prepare(
      `SELECT COUNT(*) AS n FROM rectification_issues
       WHERE due_date IS NOT NULL AND due_date <> '' AND due_date < ? AND (status IS NULL OR status NOT IN ('已整改','已完成'))`
    ).get(today);

    const incRow = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM finance WHERE type='income'`).get();
    const expRow = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM finance WHERE type='expense'`).get();

    const projects = await db.prepare(
      `SELECT id, name, customer AS customer_name, COALESCE(progress,0) AS progress
       FROM projects ORDER BY progress DESC, id DESC LIMIT 10`
    ).all();

    res.json({
      code: 0,
      data: {
        stats: {
          project_total: Number(pTotal && pTotal.n || 0),
          project_active: Number(pActive && pActive.n || 0),
          project_overdue: Number(pOverdue && pOverdue.n || 0),
          project_completed: Number(pDone && pDone.n || 0),
          inspection_total: Number(iTotal && iTotal.n || 0),
          inspection_pending: Number(iPending && iPending.n || 0),
          inspection_fixed: Number(iFixed && iFixed.n || 0),
          inspection_overdue: Number(iOverdue && iOverdue.n || 0),
          income: Number(incRow && incRow.s || 0),
          expense: Number(expRow && expRow.s || 0),
        },
        projects: projects || [],
      },
    });
  } catch (err) {
    console.error('report/stats error:', err);
    res.status(500).json({ code: 1, error: err.message });
  }
});

// GET /api/finance/stats —— 收支统计卡片
app.get('/api/finance/stats', async (req, res) => {
  try {
    const inc = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM finance WHERE type='income'`).get();
    const exp = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM finance WHERE type='expense'`).get();
    const income = Number(inc && inc.s || 0);
    const expense = Number(exp && exp.s || 0);
    res.json({ code: 0, data: { income, expense, balance: income - expense } });
  } catch (err) {
    console.error('finance/stats error:', err);
    res.status(500).json({ code: 1, error: err.message });
  }
});

// GET /api/finance/list —— 收支分页列表
app.get('/api/finance/list', async (req, res) => {
  try {
    const type = req.query.type || '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size) || 20));
    const offset = (page - 1) * pageSize;

    const where = [];
    const params = [];
    if (type === 'income' || type === 'expense') { where.push('f.type = ?'); params.push(type); }
    const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

    const rows = await db.prepare(
      `SELECT f.id, f.type, f.amount, f.category, f.description, f.date, f.project_id, f.created_at,
              p.name AS project_name
       FROM finance f LEFT JOIN projects p ON f.project_id = p.id
       ${whereSql}
       ORDER BY f.created_at DESC, f.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`
    ).all(...params);

    const list = (rows || []).map(r => ({
      id: r.id,
      type: r.type === 'income' ? 'income' : 'expense',
      amount: r.amount,
      category: r.category,
      project_name: r.project_name || '',
      payee: r.description || r.category || '',
      created_at: r.created_at,
    }));

    res.json({ code: 0, data: { list, page, page_size: pageSize } });
  } catch (err) {
    console.error('finance/list error:', err);
    res.status(500).json({ code: 1, error: err.message });
  }
});

// ==================== 项目管理（增强：关联客户）====================
app.get('/api/projects', async (req, res) => {
  console.log('[/api/projects] called, query:', req.query);
  try {
    const { customer_id, status, search } = req.query;
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '管理员' || userRole === '超级管理员' || userRole === '系统管理员';
    const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'project');

    let sql = `SELECT p.*, 
               c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
               des.name as designer_name, des.phone as designer_phone,
               sup.name as supervisor_name, sup.phone as supervisor_phone,
               mgr.name as manager_name, mgr.phone as manager_phone
               FROM projects p
               LEFT JOIN customers c ON p.customer_id = c.id
               LEFT JOIN employees des ON p.designer_id = des.id
               LEFT JOIN employees sup ON p.supervisor_id = sup.id
               LEFT JOIN employees mgr ON p.manager_id = mgr.id`;
    const params = [];
    const conditions = [];

    // 客户查询：通过 customer_id 参数直接查询，忽略 creator_id 限制
    if (customer_id) {
      conditions.push('p.customer_id = ?');
      params.push(customer_id);
    } else if (!hasAll) {
      // P2 §4.2：仅关联项目（创建人/设计师/监理/工长/项目经理/客户）
      // 客户表通过 phone 关联
      const ids = Array.from(await permCore.relatedProjectIds(userId));
      if (!ids.length) {
        // 无任何关联项目：返回空（不返回 null project）
        return res.json([]);
      }
      conditions.push(`p.id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }

    if (status) {
      conditions.push('p.status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(p.name LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY p.created_at DESC';
    const stmt = db.prepare(sql);
    const projects = await stmt.all(...params);

    // 附加每个项目的节点列表
    const nodeStmt = db.prepare(`SELECT ps.*, s.name as sms_template_name
      FROM project_progress_nodes ps
      LEFT JOIN sms_templates s ON s.id = ps.sms_template_id
      WHERE ps.project_id = ?
      ORDER BY ps.sort_order ASC, ps.id ASC`);
    for (const p of projects) {
      p.nodes = await nodeStmt.all(p.id);
      // 计算进度百分比
      if (p.nodes && p.nodes.length > 0) {
        const completedNodes = p.nodes.filter(n => n.status === 'completed').length;
        p.progress = Math.round((completedNodes / p.nodes.length) * 100);
        // 当前节点名称：第一个未完成的节点，全部完成则显示最后一个
        const pendingNodes = p.nodes.filter(n => n.status !== 'completed');
        p.current_node_name = pendingNodes.length > 0 ? pendingNodes[0].node_name : p.nodes[p.nodes.length - 1].node_name;
      } else {
        p.progress = 0;
        p.current_node_name = '';
      }
    }

    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const stmt = db.prepare(`SELECT p.*,
      c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
      des.name as designer_name, des.phone as designer_phone,
      sup.name as supervisor_name, sup.phone as supervisor_phone,
      mgr.name as manager_name, mgr.phone as manager_phone
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN employees des ON p.designer_id = des.id
      LEFT JOIN employees sup ON p.supervisor_id = sup.id
      LEFT JOIN employees mgr ON p.manager_id = mgr.id
      WHERE p.id = ?`);
    const project = await stmt.get(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', checkPermission('project:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, customer_id, status, start_date, end_date, budget, description, designer_id, supervisor_id, manager_id, template_id } = req.body;
    const stmt = db.prepare('INSERT INTO projects (name, customer_id, status, start_date, end_date, budget, description, designer_id, supervisor_id, manager_id, template_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(name, customer_id || null, status || '开工准备', start_date || null, end_date || null, budget || null, description || null, designer_id || null, supervisor_id || null, manager_id || null, template_id || null, userId);
    const projectId = result.lastInsertRowid;

    // 注意：节点模板的初始化由前端在 handleSave 里调 /api/progress-nodes/init/:projectId 完成
    // 这里不再 INSERT 节点，避免双重插入导致节点重复（2026-10-09 修复）

    await addLog(userId, '', '新增', '项目管理', projectId, name, `项目名称: ${name}`, req.ip);
    // 通知：新增项目
    notifyProject('project_created', projectId,
      `新项目创建：${name}`,
      `项目「${name}」已创建，客户ID：${customer_id || ''}，请相关人员及时跟进。`,
      projectId, 'project', null, { mode: 'subscribers' }
    ).catch(console.error);
    res.json({ id: projectId, message: '添加成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/projects/:id', checkPermission('project:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, customer_id, status, start_date, end_date, budget, description, designer_id, supervisor_id, manager_id, template_id } = req.body;
    // 权限检查
    const [existing] = await db.prepare('SELECT creator_id FROM projects WHERE id = ?').all(req.params.id);
    if (!existing) return res.status(404).json({ error: '项目不存在' });
    if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
    const stmt = db.prepare('UPDATE projects SET name=?, customer_id=?, status=?, start_date=?, end_date=?, budget=?, description=?, designer_id=?, supervisor_id=?, manager_id=?, template_id=? WHERE id=?');
    await stmt.run(name, customer_id || null, status, start_date || null, end_date || null, budget || null, description || null, designer_id || null, supervisor_id || null, manager_id || null, template_id || null, req.params.id);
    await addLog(userId, '', '编辑', '项目管理', req.params.id, name, `更新项目: ${name}`, req.ip);
    // 通知：项目状态变更
    if (existing.status !== status) {
      notifyProject('project_status_changed', parseInt(req.params.id),
        `项目状态变更：${name}`,
        `项目「${name}」状态已变更为「${status}」，请知悉。`,
        parseInt(req.params.id), 'project', null, { mode: 'subscribers' }
      ).catch(console.error);
    }
    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', checkPermission('project:delete'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const userId = getUserId(req);
    const [proj] = await conn.query('SELECT name, creator_id FROM projects WHERE id = ?', [req.params.id]);
    if (!proj.length) return res.status(404).json({ error: '记录不存在' });
    if (proj[0].creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
    const projName = proj[0].name;
    const pid = req.params.id;

    await conn.beginTransaction();

    const tablesWithProjectId = [
      'contract_changes',
      'contracts',
      'project_logs',
      'inspections',
      'rectification_issues',
      'dispatches',
      'material_orders',
      'project_progress_nodes',
      'collection_records',
      'payment_records',
      'project_stages',
      'purchase_requests',
      'sms_send_logs',
      'acceptance',
      'cost_records',
      'finance',
      'material_out',
      'purchases',
      'warranties',
    ];
    for (const tbl of tablesWithProjectId) {
      await conn.query(`DELETE FROM ${tbl} WHERE project_id = ?`, [pid]);
    }
    await conn.query('DELETE FROM projects WHERE id = ?', [pid]);
    await conn.commit();

    await addLog(userId, '', '删除', '项目管理', pid, projName, `删除项目: ${projName}`, req.ip);
    res.json({ message: '删除成功' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

app.get('/api/project-stages', async (req, res) => {
  const stmt = db.prepare(`SELECT ps.*, s.name as sms_template_name
    FROM project_progress_nodes ps
    LEFT JOIN sms_templates s ON s.id = ps.sms_template_id
    WHERE ps.project_id = ?
    ORDER BY ps.sort_order, ps.id`);
  res.json(await stmt.all(req.query.project_id));
});

app.post('/api/project-stages', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { project_id, node_name, plan_date, plan_end_date, status, progress, note, sms_template_id, after_node_id } = req.body;
  try {
    // 2026-10-23：通知里用真项目名（原来写「项目「ID:15」」把 ID 当项目名）
    const [projForNotify] = await db.prepare('SELECT name FROM projects WHERE id = ?').all(project_id);
    const projLabel = (projForNotify && projForNotify.name) || `项目${project_id}`;
    if (after_node_id !== undefined && after_node_id !== null) {
      const [after] = await db.prepare('SELECT sort_order FROM project_progress_nodes WHERE id = ?').all(after_node_id);
      if (after) {
        await db.prepare('UPDATE project_progress_nodes SET sort_order = sort_order + 1 WHERE project_id = ? AND sort_order > ?').run(project_id, after.sort_order);
        const stmt = db.prepare('INSERT INTO project_progress_nodes (project_id, node_name, plan_date, plan_end_date, sort_order, status, note, sms_template_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const result = await stmt.run(project_id, node_name, plan_date, plan_end_date || null, after.sort_order + 1, status || 'pending', note, sms_template_id || null, userId);
        const nodeId = result.lastInsertRowid;
        notifyProject('node_status_changed', project_id,
          `新增项目节点：${node_name}`,
          `项目「${projLabel}」新增节点「${node_name}」，请及时跟进。`,
          nodeId, 'node', null, { mode: 'subscribers' }
        ).catch(console.error);
        await addLog(userId, '', '新增', '项目节点', nodeId, node_name, `新增节点: ${node_name}`, req.ip);
        return res.json({ id: nodeId, message: '添加成功' });
      }
    }
    const [max] = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM project_progress_nodes WHERE project_id = ?').all(project_id);
    const stmt = db.prepare('INSERT INTO project_progress_nodes (project_id, node_name, plan_date, plan_end_date, sort_order, status, note, sms_template_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(project_id, node_name, plan_date, plan_end_date || null, max.m + 1, status || 'pending', note, sms_template_id || null, userId);
    const nodeId = result.lastInsertRowid;
    await addLog(userId, '', '新增', '项目节点', nodeId, node_name, `新增节点: ${node_name}`, req.ip);
    notifyProject('node_status_changed', project_id,
      `新增项目节点：${node_name}`,
      `项目「${projLabel}」新增节点「${node_name}」，请及时跟进。`,
      nodeId, 'node', null, { mode: 'subscribers' }
    ).catch(console.error);
    res.json({ id: nodeId, message: '添加成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/project-stages/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const [row] = await db.prepare('SELECT * FROM project_progress_nodes WHERE id = ?').all(req.params.id);
    if (!row) return res.status(404).json({ error: '节点不存在' });
    if (row.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
    const { node_name, plan_date, plan_end_date, actual_date, status, note, sms_template_id, sort_order } = req.body;
    const updated = {
      node_name: node_name !== undefined ? node_name : row.node_name,
      plan_date: plan_date !== undefined ? plan_date : row.plan_date,
      plan_end_date: plan_end_date !== undefined ? plan_end_date : row.plan_end_date,
      actual_date: actual_date !== undefined ? actual_date : row.actual_date,
      status: status !== undefined ? status : row.status,
      note: note !== undefined ? note : row.note,
      sms_template_id: sms_template_id !== undefined ? (sms_template_id || null) : row.sms_template_id,
      sort_order: sort_order !== undefined ? sort_order : row.sort_order
    };
    const stmt = db.prepare('UPDATE project_progress_nodes SET node_name=?, plan_date=?, plan_end_date=?, actual_date=?, status=?, note=?, sms_template_id=?, sort_order=? WHERE id=?');
    await stmt.run(updated.node_name, updated.plan_date, updated.plan_end_date, updated.actual_date, updated.status, updated.note, updated.sms_template_id, updated.sort_order, req.params.id);

    await addLog(userId, '', '编辑', '项目节点', parseInt(req.params.id), updated.node_name || row.node_name, `更新节点: ${updated.node_name || row.node_name}`, req.ip);

    // ✅ 节点状态变化时，通知项目成员和客户（任意状态变化都通知）
    let smsResults = null;  // 2026-10-09：把短信结果返回给前端
    if (row.status !== updated.status) {
      // 2026-10-23：文案统一为「项目进度更新「节点名」完成」（大王指定）
      //   旧文案「项目节点已完成：xxx」不含项目名；content 里还把节点名当项目名写（bug）
      const statusLabel = { pending: '待处理', in_progress: '进行中', completed: '完成', skipped: '已跳过' };
      const typeMap = { pending: 'node_pending', in_progress: 'node_in_progress', completed: 'node_completed', skipped: 'node_skipped' };
      const type = typeMap[updated.status] || 'node_completed';
      const nodeName = updated.node_name || row.node_name;
      const label = statusLabel[updated.status] || updated.status;
      // content 里要带真项目名；短信的项目名也从这里兜底提取
      const [projRow] = await db.prepare('SELECT name FROM projects WHERE id = ?').all(row.project_id);
      const projectName = (projRow && projRow.name) || `项目${row.project_id}`;
      const title = `项目进度更新「${nodeName}」${label}`;
      const content = `项目「${projectName}」的节点「${nodeName}」${label}，请知悉。`;
      const smsNotify = parseInt(req.body.sms_notify || 0);
      // 2026-10-23 统一接收人口径（原来两条路径不一致，还重复）：
      //   旧实现：勾短信 → notifyProject（订阅角色+关联人+管理员），不勾 → insertInAppNotification（仅经理/设计师/监理/客户4人）
      //   后果 ① 操作者（管理员）自己收不到；② 勾短信时会写两遍。
      //   现在统一走 notifyProject(subscribers)：订阅角色 + 项目关联人 + 管理员(id=1)；
      //   短信仍只在勾选 + 客户身份时才真发（notifyProject 内部判定）。
      smsResults = await notifyProject(
        type, row.project_id, title, content, row.id, 'node',
        smsNotify ? updated.sms_template_id : null,
        { mode: 'subscribers' }
      );
    }

    // 2026-10-09：返回短信结果（数组），前端可显示每条的成功/失败
    res.json({ message: '更新成功', sms: smsResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/project-stages/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const [row] = await db.prepare('SELECT id, creator_id FROM project_progress_nodes WHERE id = ?').all(req.params.id);
    if (!row) return res.status(404).json({ error: '记录不存在' });
    if (row.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
    const stmt = db.prepare('DELETE FROM project_progress_nodes WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '项目节点', parseInt(req.params.id), row.id, `删除节点 ID: ${row.id}`, req.ip);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 通用施工/巡检日志列表（支持 type/page/project_id 过滤）
app.get('/api/project-logs', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const { type, project_id, page = 1, page_size = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);

    let where = [];
    let params = [];

    if (type && type !== 'all') {
      where.push('l.type = ?');
      params.push(type);
    }
    if (project_id) {
      // 即使传 project_id 也要校验它在可见范围内
      const ids = Array.from(await permCore.relatedProjectIds(userId));
      const admin = await permCore.canReadAll(userId, 'project_log');
      if (!admin && !ids.includes(Number(project_id))) return res.status(403).json({ error: '该项目不在可见范围内' });
      where.push('l.project_id = ?');
      params.push(project_id);
    } else {
      // P2 §4.4：施工日志的可见性继承 project 模块
      const scope = await buildProjectScopeOrSelfClause(userId, 'project_log', 'l', 'project_id', 'creator_id');
      if (scope.sql) {
        where.push(scope.sql.replace(/^ AND/, ''));
        params.push(...scope.params);
      } else if (!(await permCore.canReadAll(userId, 'project_log'))) {
        // 既非 read_all 又无关联项目：返回空
        return res.json({ list: [], total: 0, page: 1, page_size: parseInt(page_size) });
      }
    }

    const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM project_logs l ${whereSql}`);
    const [{ total }] = await countStmt.all(...params);

    const listStmt = db.prepare(`
      SELECT l.*, p.name as project_name
      FROM project_logs l
      LEFT JOIN projects p ON l.project_id = p.id
      ${whereSql}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `);
    const list = await listStmt.all(...params, parseInt(page_size), offset);

    res.json({ list, total, page: parseInt(page), page_size: parseInt(page_size) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/project-logs/:projectId', async (req, res) => {
  const stmt = db.prepare(`
    SELECT l.*, p.name as project_name
    FROM project_logs l
    LEFT JOIN projects p ON l.project_id = p.id
    WHERE l.project_id = ?
    ORDER BY l.created_at DESC
  `);
  res.json(await stmt.all(req.params.projectId));
});

// 按分类获取项目图库（从 project_logs.images 聚合）
app.get('/api/project-gallery', async (req, res) => {
  const { project_id, category } = req.query;
  const cats = ['开工', '水电', '防水', '泥瓦', '木工', '油漆', '安装', '验收'];

  if (project_id) {
    // 指定项目：单个或全部分类
    let sql = `SELECT id, category, content, images, created_at FROM project_logs WHERE project_id = ? AND images IS NOT NULL AND images != '' AND images != '[]'`;
    const params = [project_id];
    if (category && category !== '全部') {
      sql += ` AND category = ?`;
      params.push(category);
    }
    sql += ` ORDER BY created_at DESC`;
    const logs = await db.prepare(sql).all(...params);

    const photos = [];
    for (const log of logs) {
      let imgs = [];
      try {
        const raw = log.images || '[]';
        const first = JSON.parse(raw);
        imgs = typeof first === 'string' ? JSON.parse(first) : first;
      } catch (_) {}
      for (const url of imgs) {
        photos.push({ url, category: log.category, date: log.created_at?.split('T')[0], desc: log.content?.substring(0, 30) });
      }
    }
    return res.json({ list: photos });
  }

  // 全项目聚合：按分类统计
  const allCats = cats.map(c => ({ category: c, count: 0 }));
  const logs = await db.prepare(`
    SELECT category, COUNT(*) as cnt
    FROM project_logs
    WHERE images IS NOT NULL AND images != '' AND images != '[]'
    GROUP BY category
  `).all();
  for (const row of logs) {
    const idx = allCats.findIndex(c => c.category === row.category);
    if (idx !== -1) allCats[idx].count = row.cnt;
  }
  res.json({ list: allCats });
});

app.post('/api/project-logs', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { project_id, content, operator, images, worker_count, work_type, tomorrow_plan, note, category } = req.body;
  const stmt = db.prepare('INSERT INTO project_logs (project_id, content, operator, images, worker_count, work_type, tomorrow_plan, note, category, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
  const result = await stmt.run(project_id, content, operator, JSON.stringify(images || []), worker_count || null, work_type || null, tomorrow_plan || null, note || null, category || null, userId);
  const logId = result.lastInsertRowid;

  // ✅ 新增项目进展时，通知项目成员和客户
  const [proj] = await db.prepare('SELECT name FROM projects WHERE id = ?').all(project_id);
  await addLog(userId, '', '新增', '项目进展', logId, proj?.name || project_id, `项目「${proj?.name || project_id}」添加进展`, req.ip);
  // 2026-10-23：两类日志不再推「项目新进展」
  //   ① 节点状态变更（action_type=node_* 或带 stage_id）—— 节点变更已有专门的
  //      「项目进度更新「节点名」完成」通知（PUT /api/project-stages/:id），再推一条就重复了，
  //      而且点进去是施工日志，跟用户做的操作对不上。
  //   ② 内容为空 —— 推出去是「有新进展：...」，纯噪音。
  const isNodeAction = String(req.body.action_type || '').startsWith('node_') || !!req.body.stage_id;
  const hasContent = String(content || '').trim().length > 0;
  if (proj && !isNodeAction && hasContent) {
    await notifyProject('project_progress', project_id,
      `项目新进展`,
      `「${proj.name}」有新进展：${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
      logId, 'project_log', null, { mode: 'subscribers' });
  }

  res.json({ id: logId, message: '添加成功' });
});

// 删除日志（谁创建谁可以删除）
app.delete('/api/project-logs/:id', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';

  const [log] = await db.prepare('SELECT * FROM project_logs WHERE id = ?').all(req.params.id);
  if (!log) return res.status(404).json({ error: '日志不存在' });

  // 检查权限：创建者本人或管理员可以删除
  if (log.creator_id !== userId && !userIsAdmin) {
    return res.status(403).json({ error: '无权删除他人的日志' });
  }

  // 删除日志关联的图片文件（兼容新旧数据：路径格式 vs base64格式）
  try {
    let paths = [];
    if (log.images) {
      let parsed = JSON.parse(log.images);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (Array.isArray(parsed)) {
        paths = parsed.filter(p => p && typeof p === 'string');
      }
    }
    for (const p of paths) {
      if (!p.startsWith('/uploads/')) continue;
      const fullPath = path.join(__dirname, p);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`[删除日志图片] ${p}`);
      }
    }
  } catch (e) {
    console.error('删除日志图片失败:', e);
  }

  await db.prepare('DELETE FROM project_logs WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 更新日志
app.put('/api/project-logs/:id', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';

  const [log] = await db.prepare('SELECT * FROM project_logs WHERE id = ?').all(req.params.id);
  if (!log) return res.status(404).json({ error: '日志不存在' });

  // 检查权限：创建者本人或管理员可以编辑
  if (log.creator_id !== userId && !userIsAdmin) {
    return res.status(403).json({ error: '无权编辑他人的日志' });
  }

  const { content, operator, images } = req.body;
  const stmt = db.prepare('UPDATE project_logs SET content = ?, operator = ?, images = ? WHERE id = ?');
  await stmt.run(content, operator, JSON.stringify(images || []), req.params.id);
  res.json({ message: '更新成功' });
});

// 获取单个日志详情
app.get('/api/project-log/:id', async (req, res) => {
  const [log] = await db.prepare('SELECT * FROM project_logs WHERE id = ?').all(req.params.id);
  if (!log) return res.status(404).json({ error: '日志不存在' });
  res.json(log);
});

// 获取我的日志（当前用户创建的所有日志）
app.get('/api/my/logs', async (req, res) => {
  const userId = getUserId(req);
  const stmt = db.prepare(`
    SELECT l.*, p.name as project_name 
    FROM project_logs l 
    LEFT JOIN projects p ON l.project_id = p.id 
    WHERE l.creator_id = ? 
    ORDER BY l.created_at DESC
  `);
  res.json(await stmt.all(userId));
});

app.get('/api/quotes', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'quote');
  if (hasAll) {
    const stmt = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC');
    return res.json(await stmt.all());
  }
  const stmt = db.prepare('SELECT * FROM quotes WHERE creator_id = ? ORDER BY created_at DESC');
  res.json(await stmt.all(userId));
});

app.post('/api/quotes', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { customer_name, project_name, total_amount, status, items, valid_date } = req.body;
  const stmt = db.prepare('INSERT INTO quotes (customer_name, project_name, total_amount, status, items, valid_date, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(customer_name, project_name, total_amount, status || '待确认', JSON.stringify(items), valid_date, userId);
  await addLog(userId, '', '新增', '报价管理', result.lastInsertRowid, project_name, `项目: ${project_name}, 客户: ${customer_name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.delete('/api/quotes/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const [q] = await db.prepare('SELECT project_name, creator_id FROM quotes WHERE id = ?').all(req.params.id);
  if (!q) return res.status(404).json({ error: '记录不存在' });
  if (q.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
  const qName = q.project_name;
  const stmt = db.prepare('DELETE FROM quotes WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '报价管理', req.params.id, qName, `删除报价: ${qName}`, req.ip);
  res.json({ message: '删除成功' });
});

app.get('/api/materials', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  // v2.3.12：主材模块（material）正式生效。原判定只看 warehouse，
  //   导致角色管理里勾「主材管理」毫无作用。现在两个模块都认（迁移期兼容）。
  const hasAll = userIsAdmin
    || await hasReadAllPermission(userId, 'material')
    || await hasReadAllPermission(userId, 'warehouse');
  if (hasAll) {
    const stmt = db.prepare('SELECT * FROM materials ORDER BY created_at DESC');
    return res.json(await stmt.all());
  }
  const stmt = db.prepare('SELECT * FROM materials WHERE creator_id = ? ORDER BY created_at DESC');
  res.json(await stmt.all(userId));
});

app.post('/api/materials', checkAnyPermission(['material:write', 'warehouse:write']), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location } = req.body;
  const stmt = db.prepare('INSERT INTO materials (code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(code, name, category, unit, quantity || 0, price || 0, cost_price || 0, supplier, min_stock || 0, location, userId);
  await addLog(userId, '', '新增', '材料管理', result.lastInsertRowid, name, `材料名称: ${name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/materials/:id', checkAnyPermission(['material:write', 'warehouse:write']), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location } = req.body;
  // 权限检查
  const [existing] = await db.prepare('SELECT creator_id FROM materials WHERE id = ?').all(req.params.id);
  if (!existing) return res.status(404).json({ error: '材料不存在' });
  if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
  const stmt = db.prepare('UPDATE materials SET code=?, name=?, category=?, unit=?, quantity=?, price=?, cost_price=?, supplier=?, min_stock=?, location=? WHERE id=?');
  await stmt.run(code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location, req.params.id);
  await addLog(userId, '', '编辑', '材料管理', req.params.id, name, `更新材料: ${name}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/materials/:id', checkAnyPermission(['material:delete', 'warehouse:delete']), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const [m] = await db.prepare('SELECT name, creator_id FROM materials WHERE id = ?').all(req.params.id);
  if (!m) return res.status(404).json({ error: '记录不存在' });
  if (m.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
  const mName = m.name;
  const stmt = db.prepare('DELETE FROM materials WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '材料管理', req.params.id, mName, `删除材料: ${mName}`, req.ip);
  res.json({ message: '删除成功' });
});

app.post('/api/materials/in', checkAnyPermission(['material:write', 'warehouse:write']), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { material_id, quantity, unit_price, supplier, operator, note, date } = req.body;
  const stmt = db.prepare('INSERT INTO material_in (material_id, quantity, unit_price, supplier, operator, note, date, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(material_id, quantity, unit_price || 0, supplier, operator, note, date, userId);
  await db.prepare('UPDATE materials SET quantity = quantity + ? WHERE id = ?').run(quantity, material_id);
  const [matIn] = await db.prepare('SELECT name FROM materials WHERE id = ?').all(material_id);
  const inId = result.lastInsertRowid;
  await addLog(userId, '', '新增', '材料入库', inId, matIn?.name || material_id, `材料入库: ${matIn?.name || material_id}, 数量: ${quantity}`, req.ip);

  // 发送应用内通知：查找使用了该材料的在建项目，通知相关人
  try {
    const [recentOut] = await db.prepare('SELECT project_id FROM material_out WHERE material_id = ? ORDER BY id DESC LIMIT 1').all(material_id);
    if (recentOut && recentOut.project_id) {
      const [proj] = await db.prepare(`
        SELECT p.*,
          des.phone as designer_phone, des.name as designer_name, des.id as designer_id,
          sup.phone as supervisor_phone, sup.name as supervisor_name, sup.id as supervisor_id,
          mgr.phone as manager_phone, mgr.name as manager_name, mgr.id as manager_id
        FROM projects p
        LEFT JOIN employees des ON p.designer_id = des.id
        LEFT JOIN employees sup ON p.supervisor_id = sup.id
        LEFT JOIN employees mgr ON p.manager_id = mgr.id
        WHERE p.id = ?
      `).all(recentOut.project_id);

      const targets = [];
      if (proj) {
        if (proj.designer_phone) targets.push({ phone: proj.designer_phone, name: proj.designer_name, user_id: proj.designer_id });
        if (proj.supervisor_phone) targets.push({ phone: proj.supervisor_phone, name: proj.supervisor_name, user_id: proj.supervisor_id });
        if (proj.manager_phone) targets.push({ phone: proj.manager_phone, name: proj.manager_name, user_id: proj.manager_id });
      }
      const [admin] = await db.prepare('SELECT phone, name, id FROM employees WHERE id = 1').all();
      if (admin && admin.phone) targets.push({ phone: admin.phone, name: admin.name || '管理员', user_id: admin.id });

      if (targets.length > 0) {
        const content = `【${matIn?.name || '材料'}】已入库，数量：${quantity}，供应商：${supplier || '未知'}`;
        sendAppNotification('material_in', '材料已入库', content, inId, 'material_in', targets).catch(console.error);
      }
    }
  } catch (err) {
    console.error('material_in notification error:', err);
  }

  res.json({ message: '入库成功' });
});

app.post('/api/materials/out', checkAnyPermission(['material:write', 'warehouse:write']), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
  const userId = getUserId(req);
  const { material_id, quantity, project_id, operator, note, date } = req.body;

  // 库存校验：出库数量不能超过当前库存
  const [material] = await db.prepare('SELECT quantity FROM materials WHERE id = ?').all(material_id);
  if (!material) {
    return res.status(404).json({ error: '材料不存在' });
  }
  if (material.quantity < quantity) {
    return res.status(400).json({ error: `库存不足，当前库存 ${material.quantity}，申请出库 ${quantity}` });
  }

  const stmt = db.prepare('INSERT INTO material_out (material_id, quantity, project_id, operator, note, date) VALUES (?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(material_id, quantity, project_id, operator, note, date);
  await db.prepare('UPDATE materials SET quantity = quantity - ? WHERE id = ?').run(quantity, material_id);
  const [matOut] = await db.prepare('SELECT name FROM materials WHERE id = ?').all(material_id);
  const outId = result.lastInsertRowid;
  await addLog(userId, '', '新增', '材料出库', outId, matOut?.name || material_id, `材料出库: ${matOut?.name || material_id}, 数量: ${quantity}`, req.ip);

  // 发送应用内通知：通知项目相关人
  if (project_id) {
    try {
      const [proj] = await db.prepare(`
        SELECT p.*,
          des.phone as designer_phone, des.name as designer_name, des.id as designer_id,
          sup.phone as supervisor_phone, sup.name as supervisor_name, sup.id as supervisor_id,
          mgr.phone as manager_phone, mgr.name as manager_name, mgr.id as manager_id
        FROM projects p
        LEFT JOIN employees des ON p.designer_id = des.id
        LEFT JOIN employees sup ON p.supervisor_id = sup.id
        LEFT JOIN employees mgr ON p.manager_id = mgr.id
        WHERE p.id = ?
      `).all(project_id);

      const targets = [];
      if (proj) {
        if (proj.designer_phone) targets.push({ phone: proj.designer_phone, name: proj.designer_name, user_id: proj.designer_id });
        if (proj.supervisor_phone) targets.push({ phone: proj.supervisor_phone, name: proj.supervisor_name, user_id: proj.supervisor_id });
        if (proj.manager_phone) targets.push({ phone: proj.manager_phone, name: proj.manager_name, user_id: proj.manager_id });
      }
      const [admin] = await db.prepare('SELECT phone, name, id FROM employees WHERE id = 1').all();
      if (admin && admin.phone) targets.push({ phone: admin.phone, name: admin.name || '管理员', user_id: admin.id });

      if (targets.length > 0) {
        const content = `【${matOut?.name || '材料'}】已出库，数量：${quantity}，用于项目ID：${project_id}`;
        sendAppNotification('material_out', '材料已出库', content, outId, 'material_out', targets).catch(console.error);
      }
    } catch (err) {
      console.error('material_out notification error:', err);
    }
  }

  res.json({ message: '出库成功' });
});

app.get('/api/main-materials', async (req, res) => {
  const { keyword = '', category = '', page = 1, limit = 20, project_id = '' } = req.query;
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'purchase');
  const pageNum = parseInt(page) || 1;
  const pageSize = parseInt(limit) || 20;
  const offset = (pageNum - 1) * pageSize;

  const conditions = [];
  const params = [];

  // project_id 模式下：查某项目使用的主材及用量（不限制权限，普通员工也能查）
  if (project_id) {
    // 直接返回所有主材（采购目录），带上该项目已用量
    let sql = `
      SELECT m.*,
        COALESCE(mo.used_qty, 0) as used,
        (m.quantity - COALESCE(mo.used_qty, 0)) as left
      FROM main_materials m
      LEFT JOIN (
        SELECT material_id, SUM(quantity) as used_qty
        FROM material_out
        WHERE project_id = ?
        GROUP BY material_id
      ) mo ON m.id = mo.material_id
    `;
    const allParams = [project_id];
    if (keyword) {
      conditions.push('(m.code LIKE ? OR m.name LIKE ? OR m.brand LIKE ? OR m.model LIKE ?)');
      const k = `%${keyword}%`;
      allParams.push(k, k, k, k);
    }
    if (category) {
      conditions.push('m.category = ?');
      allParams.push(category);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY m.sort_order ASC, m.id DESC';
    const list = await db.prepare(sql).all(...allParams);
    res.json({ list, total: list.length, page: 1, limit: list.length });
    return;
  }

  // 非 project_id 模式：原逻辑（受限权限）
  if (!hasAll) {
    conditions.push('1=0');
  }
  if (keyword) {
    conditions.push('(code LIKE ? OR name LIKE ? OR brand LIKE ? OR model LIKE ?)');
    const k = `%${keyword}%`;
    params.push(k, k, k, k);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }

  const whereSql = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM main_materials' + whereSql);
  const total = (await countStmt.get(...params))?.total || 0;

  let sql = 'SELECT * FROM main_materials' + whereSql + ' ORDER BY sort_order ASC, id DESC LIMIT ? OFFSET ?';
  const stmt = db.prepare(sql);
  const list = await stmt.all(...params, pageSize, offset);

  res.json({ list, total, page: pageNum, limit: pageSize });
});

app.get('/api/main-materials/categories', async (req, res) => {
  try {
    const rows = await db.prepare('SELECT category FROM main_materials').all();
    const categories = [...new Set(rows.map(r => r.category).filter(c => c && c.trim()))];
    categories.sort();
    res.json(categories);
  } catch(e) {
    console.log('categories error:', e.message, e.stack);
    res.json([]);
  }
});

app.post('/api/main-materials', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];

  const userId = getUserId(req);
  const data = req.body || {};

  // 自动补全 supplier_name
  let supplierId = data.supplier_id || null;
  let supplierName = data.supplier_name || '';
  if (supplierId && !supplierName) {
    const [sup] = await db.prepare('SELECT name FROM suppliers WHERE id = ?').all(supplierId);
    if (sup) supplierName = sup.name;
  }

  const stmt = db.prepare(`
    INSERT INTO main_materials (
      code, name, original_price, cost_price, cost_price2, quote_price, contract_price,
      quote_unit, exchange_rate, purchase_unit, loss_rate, loss_amount, warranty_period, stock_period,
      specification, model, color, spec_alternative, model_alternative, color_alternative, brand,
      sort_order, remark, acceptance_remark, contract_remark, other_remark, position, package_name,
      upgrade_profit_rate, internal_control_price, combo, limit_formula, quote_formula, category,
      is_visible, is_fixed, creator_id, supplier_id, supplier_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = await stmt.run(
    data.code || '',
    data.name || '',
    Number(data.original_price || 0),
    Number(data.cost_price || 0),
    Number(data.cost_price2 || 0),
    Number(data.quote_price || 0),
    Number(data.contract_price || 0),
    data.quote_unit || '片',
    Number(data.exchange_rate || 1),
    data.purchase_unit || '',
    Number(data.loss_rate || 0),
    Number(data.loss_amount || 0),
    data.warranty_period || '',
    data.stock_period || '',
    data.specification || '',
    data.model || '',
    data.color || '',
    data.spec_alternative || '',
    data.model_alternative || '',
    data.color_alternative || '',
    data.brand || '',
    Number(data.sort_order || 0),
    data.remark || '',
    data.acceptance_remark || '',
    data.contract_remark || '',
    data.other_remark || '',
    data.position || '',
    data.package_name || '',
    Number(data.upgrade_profit_rate || 0),
    Number(data.internal_control_price || 0),
    data.combo || '',
    data.limit_formula || '',
    data.quote_formula || '',
    data.category || '',
    Number(data.is_visible ?? 1),
    Number(data.is_fixed ?? 0),
    userId,
    supplierId,
    supplierName
  );
  await addLog(userId, '', '新增', '主材管理', result.lastInsertRowid, data.name || '', `主材: ${data.name || result.lastInsertRowid}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/main-materials/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];

  const userId = getUserId(req);
  // 权限检查
  const [existing] = await db.prepare('SELECT creator_id FROM main_materials WHERE id = ?').all(req.params.id);
  if (!existing) return res.status(404).json({ error: '主材不存在' });
  if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
  const data = req.body || {};

  // 自动补全 supplier_name
  let supplierId = data.supplier_id || null;
  let supplierName = data.supplier_name || '';
  if (supplierId && !supplierName) {
    const [sup] = await db.prepare('SELECT name FROM suppliers WHERE id = ?').all(supplierId);
    if (sup) supplierName = sup.name;
  }

  const stmt = db.prepare(`
    UPDATE main_materials SET
      code=?, name=?, original_price=?, cost_price=?, cost_price2=?, quote_price=?, contract_price=?,
      quote_unit=?, exchange_rate=?, purchase_unit=?, loss_rate=?, loss_amount=?, warranty_period=?, stock_period=?,
      specification=?, model=?, color=?, spec_alternative=?, model_alternative=?, color_alternative=?, brand=?,
      sort_order=?, remark=?, acceptance_remark=?, contract_remark=?, other_remark=?, position=?, package_name=?,
      upgrade_profit_rate=?, internal_control_price=?, combo=?, limit_formula=?, quote_formula=?, category=?,
      is_visible=?, is_fixed=?, updated_at=CURRENT_TIMESTAMP, supplier_id=?, supplier_name=?
    WHERE id=?
  `);
  await stmt.run(
    data.code || '',
    data.name || '',
    Number(data.original_price || 0),
    Number(data.cost_price || 0),
    Number(data.cost_price2 || 0),
    Number(data.quote_price || 0),
    Number(data.contract_price || 0),
    data.quote_unit || '片',
    Number(data.exchange_rate || 1),
    data.purchase_unit || '',
    Number(data.loss_rate || 0),
    Number(data.loss_amount || 0),
    data.warranty_period || '',
    data.stock_period || '',
    data.specification || '',
    data.model || '',
    data.color || '',
    data.spec_alternative || '',
    data.model_alternative || '',
    data.color_alternative || '',
    data.brand || '',
    Number(data.sort_order || 0),
    data.remark || '',
    data.acceptance_remark || '',
    data.contract_remark || '',
    data.other_remark || '',
    data.position || '',
    data.package_name || '',
    Number(data.upgrade_profit_rate || 0),
    Number(data.internal_control_price || 0),
    data.combo || '',
    data.limit_formula || '',
    data.quote_formula || '',
    data.category || '',
    Number(data.is_visible ?? 1),
    Number(data.is_fixed ?? 0),
    supplierId,
    supplierName,
    req.params.id
  );
  await addLog(userId, '', '编辑', '主材管理', req.params.id, data.name || '', `更新主材: ${data.name || req.params.id}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/main-materials/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const [m] = await db.prepare('SELECT name, creator_id FROM main_materials WHERE id = ?').all(req.params.id);
  if (!m) return res.status(404).json({ error: '记录不存在' });
  if (m.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
  const mName = m.name;
  const stmt = db.prepare('DELETE FROM main_materials WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '主材管理', req.params.id, mName, `删除主材: ${mName}`, req.ip);
  res.json({ message: '删除成功' });
});

app.post('/api/main-materials/batch-upsert', async (req, res) => {
  const userId = getUserId(req);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const insertStmt = db.prepare(`
    INSERT INTO main_materials (
      code, name, original_price, cost_price, cost_price2, quote_price, contract_price,
      quote_unit, exchange_rate, purchase_unit, loss_rate, loss_amount, warranty_period, stock_period,
      specification, model, color, spec_alternative, model_alternative, color_alternative, brand,
      sort_order, remark, acceptance_remark, contract_remark, other_remark, position, package_name,
      upgrade_profit_rate, internal_control_price, combo, limit_formula, quote_formula, category,
      is_visible, is_fixed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    if (!row.name) continue;
    await insertStmt.run(
      row.code || '',
      row.name || '',
      Number(row.original_price || 0),
      Number(row.cost_price || 0),
      Number(row.cost_price2 || 0),
      Number(row.quote_price || 0),
      Number(row.contract_price || 0),
      row.quote_unit || '片',
      Number(row.exchange_rate || 1),
      row.purchase_unit || '',
      Number(row.loss_rate || 0),
      Number(row.loss_amount || 0),
      row.warranty_period || '',
      row.stock_period || '',
      row.specification || '',
      row.model || '',
      row.color || '',
      row.spec_alternative || '',
      row.model_alternative || '',
      row.color_alternative || '',
      row.brand || '',
      Number(row.sort_order || 0),
      row.remark || '',
      row.acceptance_remark || '',
      row.contract_remark || '',
      row.other_remark || '',
      row.position || '',
      row.package_name || '',
      Number(row.upgrade_profit_rate || 0),
      Number(row.internal_control_price || 0),
      row.combo || '',
      row.limit_formula || '',
      row.quote_formula || '',
      row.category || '',
      Number(row.is_visible ?? 1),
      Number(row.is_fixed ?? 0)
    );
  }
  await addLog(userId, '', '新增', '主材管理', null, '批量导入', `批量导入主材 ${rows.length} 条`, req.ip);
  res.json({ message: '导入成功', count: rows.length });
});

app.post('/api/main-materials/import', upload.single('file'), async (req, res) => {
  // 2026-10-23 修复：本路由原先引用未声明的 userId，导入成功时抛 ReferenceError 并崩进程
  const userId = getUserId(req);
  if (!req.file) {
    res.status(400).json({ message: '未上传文件' });
    return;
  }
  // v2.3.6-hotfix2：修复中文文件名乱码
  req.file.originalname = fixMojibake(req.file.originalname);
  const originalExt = path.extname(req.file.originalname || '').toLowerCase();
  if (!['.xlsx', '.xlsm', '.xltx', '.xltm', '.xls'].includes(originalExt)) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
    }
    res.status(400).json({ message: '仅支持Excel文件导入' });
    return;
  }
  if (originalExt === '.xls') {
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
    }
    res.status(400).json({ message: '当前仅支持xlsx格式，请将xls另存为xlsx后再导入' });
    return;
  }
  const parseFilePath = `${req.file.path}${originalExt || '.xlsx'}`;
  fs.copyFileSync(req.file.path, parseFilePath);
  const script = `
import json,sys,pandas as pd
file_path=sys.argv[1]
try:
    df=pd.read_excel(file_path,sheet_name=0,engine='openpyxl')
except:
    try:
        df=pd.read_excel(file_path,sheet_name=0,engine='xlrd')
    except:
        df=pd.read_excel(file_path,sheet_name=0,engine='openpyxl')
df=df.fillna('')
headers=[str(c).strip() if pd.notna(c) else '' for c in df.columns]
mapping={
  '名称':'name','原价':'original_price','核算价':'cost_price','成本价':'cost_price2','报价':'quote_price','发包价':'contract_price',
  '报价单位':'quote_unit','兑换比例':'exchange_rate','采购单位':'purchase_unit','损耗比例':'loss_rate','损耗金额':'loss_amount',
  '保修时长':'warranty_period','备货周期':'stock_period','规格':'specification','型号':'model','颜色':'color',
  '规格备选':'spec_alternative','型号备选':'model_alternative','颜色备选':'color_alternative','品牌':'brand','排序':'sort_order',
  '备注说明':'remark','验收说明':'acceptance_remark','发包备注':'contract_remark','其他备注':'other_remark',
  '位置':'position','套系':'package_name','升级利润率':'upgrade_profit_rate','内控单价':'internal_control_price',
  '组合':'combo','限量公式':'limit_formula','报价量公式':'quote_formula','系统编号':'code','类别':'category'
}
rows=[]
for idx,row in df.iterrows():
  item={}
  for i,h in enumerate(headers):
    key=mapping.get(h)
    if not key:
      continue
    v=row.iloc[i] if i < len(row) else ''
    item[key]='' if pd.isna(v) else str(v).strip()
  if item.get('name'):
    rows.append(item)
print(json.dumps(rows,ensure_ascii=False))
`;
  const result = spawnSync('python3', ['-c', script, parseFilePath], { encoding: 'utf8' });
  try {
    fs.unlinkSync(req.file.path);
  } catch (e) {
  }
  try {
    fs.unlinkSync(parseFilePath);
  } catch (e) {
  }
  if (result.status !== 0) {
    const detail = result.stderr || '';
    console.log('Excel解析错误:', detail);
    if (detail.includes('BadZipFile') || detail.includes('File is not a zip file')) {
      res.status(400).json({ message: 'Excel文件格式无效或已损坏（文件大小异常：262144字节，可能是填充文件）。请重新从系统导出Excel文件后再导入。' });
      return;
    }
    res.status(500).json({ message: 'Excel解析失败: ' + detail.substring(0, 200), detail: result.stderr || '' });
    return;
  }
  let rows = [];
  try {
    rows = JSON.parse(result.stdout || '[]');
    console.log('导入数据行数:', rows.length, '首行字段:', rows[0] ? Object.keys(rows[0]) : '无', '字段数量:', rows[0] ? Object.keys(rows[0]).length : 0);
  } catch (e) {
    res.status(500).json({ message: 'Excel解析失败' });
    return;
  }
  const insertStmt = db.prepare(`
    INSERT INTO main_materials (
      code, name, original_price, cost_price, cost_price2, quote_price, contract_price,
      quote_unit, exchange_rate, purchase_unit, loss_rate, loss_amount, warranty_period, stock_period,
      specification, model, color, spec_alternative, model_alternative, color_alternative, brand,
      sort_order, remark, acceptance_remark, contract_remark, other_remark, position, package_name,
      upgrade_profit_rate, internal_control_price, combo, limit_formula, quote_formula, category,
      is_visible, is_fixed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    await insertStmt.run(
      row.code || '',
      row.name || '',
      Number(row.original_price || 0),
      Number(row.cost_price || 0),
      Number(row.cost_price2 || 0),
      Number(row.quote_price || 0),
      Number(row.contract_price || 0),
      row.quote_unit || '片',
      Number(row.exchange_rate || 1),
      row.purchase_unit || '',
      Number(row.loss_rate || 0),
      Number(row.loss_amount || 0),
      row.warranty_period || '',
      row.stock_period || '',
      row.specification || '',
      row.model || '',
      row.color || '',
      row.spec_alternative || '',
      row.model_alternative || '',
      row.color_alternative || '',
      row.brand || '',
      Number(row.sort_order || 0),
      row.remark || '',
      row.acceptance_remark || '',
      row.contract_remark || '',
      row.other_remark || '',
      row.position || '',
      row.package_name || '',
      Number(row.upgrade_profit_rate || 0),
      Number(row.internal_control_price || 0),
      row.combo || '',
      row.limit_formula || '',
      row.quote_formula || '',
      row.category || '',
      Number(row.is_visible ?? 1),
      Number(row.is_fixed ?? 0)
    );
  }
  await addLog(userId, '', '新增', '主材管理', null, '批量导入', `Excel导入主材 ${rows.length} 条`, req.ip);
  res.json({ message: '导入成功', count: rows.length });
});

app.get('/api/main-materials/export', async (req, res) => {
  const rows = await db.prepare('SELECT * FROM main_materials ORDER BY sort_order ASC, id DESC').all();
  const payloadPath = path.join(os.tmpdir(), `main_material_payload_${Date.now()}.json`);
  const outputPath = path.join(os.tmpdir(), `main_material_export_${Date.now()}.xlsx`);
  fs.writeFileSync(payloadPath, JSON.stringify(rows), 'utf8');
  const script = `
import json,sys,openpyxl
payload_path=sys.argv[1]
output_path=sys.argv[2]
with open(payload_path,'r',encoding='utf-8') as f:
  rows=json.load(f)
headers=['编号','名称','原价','核算价','成本价','报价','发包价','报价单位','兑换比例','采购单位','损耗比例','损耗金额','保修时长','备货周期','规格','型号','颜色','规格备选','型号备选','颜色备选','品牌','排序','备注说明','验收说明','发包备注','其他备注','位置','套系','升级利润率','内控单价','组合','限量公式','报价量公式','系统编号','类别']
fields=['id','name','original_price','cost_price','cost_price2','quote_price','contract_price','quote_unit','exchange_rate','purchase_unit','loss_rate','loss_amount','warranty_period','stock_period','specification','model','color','spec_alternative','model_alternative','color_alternative','brand','sort_order','remark','acceptance_remark','contract_remark','other_remark','position','package_name','upgrade_profit_rate','internal_control_price','combo','limit_formula','quote_formula','code','category']
wb=openpyxl.Workbook()
ws=wb.active
ws.title='主材管理'
ws.append(headers)
for r in rows:
  ws.append([r.get(f,'') for f in fields])
wb.save(output_path)
`;
  const result = spawnSync('python3', ['-c', script, payloadPath, outputPath], { encoding: 'utf8' });
  try {
    fs.unlinkSync(payloadPath);
  } catch (e) {
  }
  if (result.status !== 0) {
    res.status(500).json({ message: '导出失败', detail: result.stderr || '' });
    return;
  }
  res.download(outputPath, '主材管理导出.xlsx', () => {
    try {
      fs.unlinkSync(outputPath);
    } catch (e) {
    }
  });
});

app.get('/api/material-orders', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'purchase');
  if (hasAll) {
    const stmt = db.prepare('SELECT * FROM material_orders ORDER BY created_at DESC');
    return res.json(await stmt.all());
  }
  const stmt = db.prepare('SELECT * FROM material_orders WHERE creator_id = ? ORDER BY created_at DESC');
  res.json(await stmt.all(userId));
});

app.post('/api/material-orders', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { material_id, quantity, status, order_date, expected_date, supplier, operator, note } = req.body;
  const stmt = db.prepare('INSERT INTO material_orders (material_id, quantity, status, order_date, expected_date, supplier, operator, note, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(material_id, quantity, status || '待采购', order_date, expected_date, supplier, operator, note, userId);
  await addLog(userId, '', '新增', '材料订单', result.lastInsertRowid, material_id, `材料订单 ID: ${material_id}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

// 采购申请（移动端专用）
app.post('/api/material/purchase', async (req, res) => {
  const userId = getUserId(req);
  const { project_id, material_name, spec, quantity, unit, supplier, amount, remark } = req.body;
  if (!project_id) return res.status(400).json({ code: 1, msg: '请选择项目' });
  if (!material_name) return res.status(400).json({ code: 1, msg: '请填写材料名称' });
  if (!quantity) return res.status(400).json({ code: 1, msg: '请填写数量' });
  const stmt = db.prepare(
    'INSERT INTO material_orders (project_id, applicant_id, material_name, spec, quantity, unit, supplier, amount, note, status, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  // 2026-10-10：申请单状态统一改为 'pending'（待审核），审核通过后改 'approved'（进行中）
  const result = await stmt.run(project_id, userId, material_name, spec || '', quantity, unit || '', supplier || '', amount || 0, remark || '', 'pending', userId);
  const newPurchaseId = result.lastInsertRowid;
  await addLog(userId, '', '新增', '采购申请', newPurchaseId, 0, `采购申请：${material_name}`, req.ip);

  // 发送应用内通知：查项目相关人（设计师/监理/经理）+ 管理员（改用 MySQL）
  try {
    const [proj] = await pool.query(`
      SELECT p.*,
        des.phone as designer_phone, des.name as designer_name, des.id as designer_id,
        sup.phone as supervisor_phone, sup.name as supervisor_name, sup.id as supervisor_id,
        mgr.phone as manager_phone, mgr.name as manager_name, mgr.id as manager_id,
        creator.phone as creator_phone, creator.name as creator_name
      FROM projects p
      LEFT JOIN employees des ON p.designer_id = des.id
      LEFT JOIN employees sup ON p.supervisor_id = sup.id
      LEFT JOIN employees mgr ON p.manager_id = mgr.id
      LEFT JOIN employees creator ON creator.id = ?
      WHERE p.id = ?
    `, [userId, project_id]);

    const targets = [];
    if (proj) {
      if (proj.designer_phone) targets.push({ phone: proj.designer_phone, name: proj.designer_name, user_id: proj.designer_id });
      if (proj.supervisor_phone) targets.push({ phone: proj.supervisor_phone, name: proj.supervisor_name, user_id: proj.supervisor_id });
      if (proj.manager_phone) targets.push({ phone: proj.manager_phone, name: proj.manager_name, user_id: proj.manager_id });
      if (proj.creator_phone) targets.push({ phone: proj.creator_phone, name: proj.creator_name, user_id: userId });
      // 管理员
      const [admins] = await pool.query('SELECT phone, name, id FROM employees WHERE id = 1');
      if (admins[0] && admins[0].phone) targets.push({ phone: admins[0].phone, name: admins[0].name || '管理员', user_id: admins[0].id });
    }

    const creatorName = proj[0]?.creator_name || '未知';
    const content = `【${material_name}】采购申请，数量：${quantity}${unit || ''}，金额：¥${amount || 0}，申请人：${creatorName}`;
    sendAppNotification('purchase', '新采购申请', content, newPurchaseId, 'purchase', targets).catch(console.error);
  } catch (err) {
    console.error('purchase notification error:', err);
  }

  res.json({ code: 0, msg: '提交成功', id: newPurchaseId });
});

app.put('/api/material-orders/:id', async (req, res) => {
  const userId = getUserId(req);
  const { project_id, material_id, material_name, spec, quantity, unit, supplier, amount, status, order_date, expected_date, operator, note } = req.body;
  // 权限检查
  const [existing] = await db.prepare('SELECT creator_id FROM material_orders WHERE id = ?').all(req.params.id);
  if (!existing) return res.status(404).json({ error: '订单不存在' });
  if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });

  // 查旧状态，用于判断是否变为"已到货"
  const [oldOrder] = await db.prepare('SELECT status, project_id, material_name FROM material_orders WHERE id = ?').all(req.params.id);
  const oldStatus = oldOrder?.status;

  const stmt = db.prepare('UPDATE material_orders SET project_id=?, material_id=?, material_name=?, spec=?, quantity=?, unit=?, supplier=?, amount=?, status=?, order_date=?, expected_date=?, operator=?, note=? WHERE id=?');
  await stmt.run(project_id || null, material_id || null, material_name || '', spec || '', quantity || '', unit || '', supplier || '', amount || 0, status, order_date || '', expected_date || '', operator || '', note || '', req.params.id);
  await addLog(userId, '', '编辑', '材料订单', req.params.id, material_name || material_id || '', `更新材料订单：${material_name || material_id}`, req.ip);

  // 状态变为"已到货"时，通知创建人
  if (oldStatus !== '已到货' && status === '已到货') {
    try {
      const [order] = await db.prepare('SELECT creator_id, project_id, material_name FROM material_orders WHERE id = ?').all(req.params.id);
      if (order) {
        const [creator] = await db.prepare('SELECT phone, name, id FROM employees WHERE id = ?').all(order.creator_id);
        if (creator && creator.phone) {
          const content = `【${order.material_name}】采购材料已到货，请注意验收`;
          sendAppNotification('purchase_status', '采购材料已到货', content, parseInt(req.params.id), 'purchase', [{ phone: creator.phone, name: creator.name, user_id: creator.id }]).catch(console.error);
        }
      }
    } catch (err) {
      console.error('purchase_status notification error:', err);
    }
  }

  res.json({ message: '更新成功' });
});

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

// 生成6位随机数字密码
function generateRandomPassword() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 密码取电话后6位
function passwordFromPhone(phone) {
  return phone ? phone.slice(-6) : '123456';
}

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

// ==================== 外部联系人（v2.3.1 新模块 external_contact）====================
// 独立表 external_contacts：管理外部工人/供应商/设计师等不参与登录系统的联系人。
// 权限码：external_contact:read / write / delete / read_all（语义同其它模块）。
app.get('/api/external-contacts', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
    const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'external_contact');
    const { category, search, is_active } = req.query;
    const where = [];
    const params = [];
    if (hasAll) {
      // 看全部
    } else if (await permCore.canAction(userId, 'external_contact', 'read')) {
      // read 权限可看全部（外部联系人不分关联，按模块整体权限）
    } else {
      return res.status(403).json({ error: '无权限查看外部联系人' });
    }
    if (category) { where.push('category = ?'); params.push(category); }
    if (is_active != null && is_active !== '') {
      where.push('is_active = ?'); params.push(Number(is_active) === 0 ? 0 : 1);
    }
    if (search) {
      where.push('(name LIKE ? OR phone LIKE ? OR company LIKE ? OR role LIKE ? OR remark LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    const sql = `SELECT * FROM external_contacts
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY is_active DESC, id DESC`;
    const [rows] = await pool.query(sql, params);
    res.json({ list: rows, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/external-contacts', checkPermission('external_contact:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, phone, category, company, role, remark } = req.body;
    if (!name) return res.status(400).json({ error: '姓名必填' });
    const [r] = await pool.query(
      `INSERT INTO external_contacts (name, phone, category, company, role, remark, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
      [name, phone || null, category || '工人', company || null, role || null, remark || null, userId]
    );
    await addLog(userId, '', '新增', '外部联系人', r.insertId, name, `分类: ${category || '工人'}，姓名: ${name}`, req.ip);
    res.json({ id: r.insertId, message: '添加成功' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/external-contacts/:id', checkPermission('external_contact:write'), async (req, res) => {
  try {
    const { name, phone, category, company, role, remark, is_active } = req.body;
    if (!name) return res.status(400).json({ error: '姓名必填' });
    const fields = [];
    const params = [];
    for (const key of ['name','phone','category','company','role','remark']) {
      if (req.body[key] !== undefined) {
        fields.push(`${key}=?`);
        params.push(req.body[key] || null);
      }
    }
    if (is_active !== undefined) {
      fields.push('is_active=?');
      params.push(Number(is_active) === 0 ? 0 : 1);
    }
    if (!fields.length) return res.json({ message: '无更新字段' });
    fields.push('updated_at=NOW()');
    params.push(req.params.id);
    await pool.query(`UPDATE external_contacts SET ${fields.join(', ')} WHERE id=?`, params);
    const userId = getUserId(req);
    await addLog(userId, '', '编辑', '外部联系人', parseInt(req.params.id), name || '', `更新外部联系人: ${name || req.params.id}`, req.ip);
    res.json({ message: '更新成功' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/external-contacts/:id', checkPermission('external_contact:delete'), async (req, res) => {
  try {
    const [c] = await pool.query('SELECT name FROM external_contacts WHERE id=?', [req.params.id]);
    const cName = c && c[0] ? c[0].name : req.params.id;
    await pool.query('DELETE FROM external_contacts WHERE id=?', [req.params.id]);
    const userId = getUserId(req);
    await addLog(userId, '', '删除', '外部联系人', parseInt(req.params.id), cName, `删除外部联系人: ${cName}`, req.ip);
    res.json({ message: '删除成功' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employees/login', async (req, res) => {
  const { username, password } = req.body;
  const stmt = db.prepare(`
    SELECT e.*, r.name as role_name, r.code as role_code, r.permissions as role_permissions 
    FROM employees e 
    LEFT JOIN roles r ON e.role_id = r.id 
    WHERE e.username = ? AND e.password = ?
  `);
  const user = await stmt.get(username, password);
  if (user) {
    // 剔除 password 字段，防止登录响应泄露明文密码
    const { password: _, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  } else {
    res.json({ success: false, message: '用户名或密码错误' });
  }
});

// 客户登录（手机号 + 姓名）
app.post('/api/customers/login', async (req, res) => {
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

app.get('/api/roles', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM roles ORDER BY id');
  res.json(await stmt.all());
});

app.post('/api/roles', checkPermission('role:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];

  const userId = getUserId(req);
  const { name, code, description, permissions, notification_types, managed_department_ids } = req.body;
  const stmt = db.prepare('INSERT INTO roles (name, code, description, permissions, notification_types, managed_department_ids) VALUES (?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(
    name, code, description,
    JSON.stringify(permissions || []),
    JSON.stringify(notification_types || []),
    managed_department_ids ? JSON.stringify(managed_department_ids) : null
  );
  await addLog(userId, '', '新增', '角色管理', result.lastInsertRowid, name, `角色名称: ${name}`, req.ip);
  clearAuthRoleCache();
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/roles/:id', checkPermission('role:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];

  const userId = getUserId(req);
  const { name, code, description, permissions, notification_types, managed_department_ids } = req.body;
  // 注意：这里使用 pool 而不是 db（db 是 better-sqlite3，pool 是 mysql2）
  // 2026-10-10 修复：只更新"本次传入"的字段，避免只改消息订阅时把 name/code 等写成空
  // （历史事故：配置 notification_types 导致 admin 角色的 name/code 被清空 → isAdmin 失效）
  const sets = [];
  const vals = [];
  if (name !== undefined) { sets.push('name=?'); vals.push(name); }
  if (code !== undefined) { sets.push('code=?'); vals.push(code); }
  if (description !== undefined) { sets.push('description=?'); vals.push(description); }
  if (permissions !== undefined) { sets.push('permissions=?'); vals.push(JSON.stringify(permissions || [])); }
  if (notification_types !== undefined) { sets.push('notification_types=?'); vals.push(JSON.stringify(notification_types || [])); }
  if (managed_department_ids !== undefined) { sets.push('managed_department_ids=?'); vals.push(managed_department_ids ? JSON.stringify(managed_department_ids) : null); }
  if (sets.length === 0) return res.json({ message: '无更新字段' });
  vals.push(req.params.id);
  await pool.query(`UPDATE roles SET ${sets.join(', ')} WHERE id=?`, vals);
  await addLog(userId, '', '编辑', '角色管理', req.params.id, name || '', `更新角色: ${name || req.params.id}`, req.ip);
  clearAuthRoleCache();
  res.json({ message: '更新成功' });
});

app.delete('/api/roles/:id', checkPermission('role:delete'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [role] = await db.prepare('SELECT name FROM roles WHERE id = ?').all(req.params.id);
  const roleName = role ? role.name : req.params.id;
  const stmt = db.prepare('DELETE FROM roles WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '角色管理', req.params.id, roleName, `删除角色: ${roleName}`, req.ip);
  clearAuthRoleCache();
  res.json({ message: '删除成功' });
});

// ==================== 管理员借权（模拟身份，仅用于测试业务流程） 2026-10-10 ====================
// 当前身份（含是否管理员）——客户端据此决定是否展示"借权"入口
app.get('/api/me', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const emp = await db.prepare(`
      SELECT e.id, e.username, e.name, e.phone, e.position,
             r.name AS role_name, r.code AS role_code
      FROM employees e LEFT JOIN roles r ON e.role_id = r.id WHERE e.id = ?
    `).get(userId);
    if (!emp) return res.status(404).json({ error: '用户不存在' });
    const permissions = await getUserPermissions(userId);
    res.json({ ...emp, is_admin: await isAdmin(userId), permissions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 可借权目标列表（在职员工）——仅管理员
app.get('/api/admin/impersonate-targets', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '仅管理员可使用借权功能' });
    const rows = await db.prepare(`
      SELECT e.id, e.username, e.name, e.position, e.status,
             r.name AS role_name, r.code AS role_code
      FROM employees e LEFT JOIN roles r ON e.role_id = r.id
      WHERE e.status = '在职'
      ORDER BY r.name, e.name
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 借权：以指定员工身份进入系统——仅管理员，且会写入操作日志
app.post('/api/admin/impersonate', async (req, res) => {
  try {
    const adminId = getUserId(req);
    if (!(await isAdmin(adminId))) return res.status(403).json({ error: '仅管理员可使用借权功能' });
    const targetId = parseInt(req.body.target_employee_id);
    if (!targetId || isNaN(targetId)) return res.status(400).json({ error: '缺少 target_employee_id' });
    const target = await db.prepare(`
      SELECT e.id, e.username, e.name, e.phone, e.position, e.role_id, e.status,
             r.name AS role_name, r.code AS role_code, r.permissions AS role_permissions
      FROM employees e LEFT JOIN roles r ON e.role_id = r.id
      WHERE e.id = ?
    `).get(targetId);
    if (!target) return res.status(404).json({ error: '目标员工不存在' });
    await addLog(adminId, '', '借权登录', '身份借用', targetId, target.name,
      `管理员借权为 ${target.name}(${target.username}/${target.role_name || '-'})`, req.ip);
    res.json({
      success: true,
      impersonate_by: adminId,
      user: { ...target, permissions: target.role_permissions || '[]' }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 结束借权（仅记录审计）
app.post('/api/admin/impersonate/stop', async (req, res) => {
  try {
    const adminId = getUserId(req);
    const targetId = parseInt(req.body.target_employee_id) || 0;
    if (adminId && await isAdmin(adminId)) {
      await addLog(adminId, '', '结束借权', '身份借用', targetId, '', '管理员结束借权', req.ip);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/permissions', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM permissions ORDER BY sort_order, id');
  res.json(await stmt.all());
});

// 获取当前用户的权限列表（供移动端使用）
app.get('/api/my-permissions', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await getUserPermissions(userId);
    res.json({ permissions: perms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/permissions', async (req, res) => {
  const { name, code, parent_id, type, path, icon, sort_order } = req.body;
  const stmt = db.prepare('INSERT INTO permissions (name, code, parent_id, type, path, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(name, code, parent_id, type || 'menu', path, icon, sort_order || 0);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

// 旧版审批 CRUD 已移除（见下方新版审批 API）

// ==================== 审批相关 API ====================

// 获取当前用户信息（从请求头）
async function getCurrentUser(req) {
  const userId = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
  const headerName = req.headers['x-user-name'] || '';
  if (!userId) return { userId: null, userName: '' };
  // 如果 header 没带姓名，查数据库
  if (headerName) return { userId, userName: headerName };
  try {
    const [rows] = await pool.query('SELECT name FROM employees WHERE id = ?', [userId]);
    return { userId, userName: rows[0]?.name || '' };
  } catch {
    return { userId, userName: '' };
  }
}

// 我的申请列表
app.get('/api/approvals/my', async (req, res) => {
  try {
    const { userId } = await getCurrentUser(req);
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
app.get('/api/approvals/todo', async (req, res) => {
  try {
    const { userId } = await getCurrentUser(req);
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
app.get('/api/approvals/:id', async (req, res) => {
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
app.post('/api/approvals', async (req, res) => {
  const userId = getUserId(req);
  const { userId: uid, userName: uname } = await getCurrentUser(req);
  
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
app.post('/api/approvals/:id/approve', async (req, res) => {
  const { userId, userName } = await getCurrentUser(req);
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
app.post('/api/approvals/:id/reject', async (req, res) => {
  const { userId, userName } = await getCurrentUser(req);
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
app.get('/api/debug-notify', async (req, res) => {
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
app.get('/api/notifications', async (req, res) => {
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
app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
    res.json({ message: '已标记已读' });
  } catch (err) {
    console.error('mark read error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 标记全部通知已读（按 phone）
app.put('/api/notifications/read-all', async (req, res) => {
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

// ============================================================
// 消息/通知的"当前身份"解析（2026-10-21 修复）
//
// 背景：原代码一律用 `SELECT phone FROM customers WHERE id = ?` 判断"是不是客户"，
// 但 x-user-id 传的其实是**员工 id**（getCurrentUser 也是查 employees）。
// employees.id 和 customers.id 是两套独立自增序列，撞号时（如员工 6 田翔 / 客户 6 郑大）
// 员工会被当成客户 → 消息列表查到别人的数据、未读角标永远清不掉、全部已读清错人。
//
// 判定顺序：
//   1) x-user-id 命中 employees → 员工（主路径）
//   2) 显式 ?phone= / body.phone → 客户（客户 H5 走这个）
//   3) x-user-id 命中 customers → 客户（兼容旧调用）
// ============================================================
async function resolveMessageActor(req) {
  const rawId = req.headers['x-user-id'] || req.query.user_id || req.body?.user_id;
  const userId = rawId ? parseInt(rawId) : 0;

  if (userId > 0) {
    try {
      const [emp] = await pool.query('SELECT id, phone FROM employees WHERE id = ?', [userId]);
      if (emp.length) return { type: 'employee', userId, phone: emp[0].phone || null };
    } catch (e) { /* 忽略，继续往下判 */ }
  }

  const phoneParam = req.query.phone || req.body?.phone;
  if (phoneParam) return { type: 'customer', userId: userId || null, phone: String(phoneParam) };

  if (userId > 0) {
    try {
      const [cust] = await pool.query('SELECT id, phone FROM customers WHERE id = ?', [userId]);
      if (cust.length) return { type: 'customer', userId, phone: cust[0].phone || null };
    } catch (e) { /* 忽略 */ }
  }

  return { type: 'unknown', userId: userId || null, phone: null };
}

/* ------------------------------------------------------------------
 * 消息 → 项目信息补全（2026-10-23 新增）
 *
 * 背景：messages / notifications 两张表**都没有 project_id 列**，只有
 * related_id / related_type（对外 alias 成 source_id / source_type）。
 * 前端的「查看应收」按钮跳到 /pages/finance/finance-receivable 时需要
 * projectId 才能核算，拿不到就只能显示 ¥0.00（实测就是这个现象）。
 *
 * 这里按实体类型把 project_id 反查回来，并补 project_name：
 *   collection（催收记录）→ collection_records.project_id
 *   project（项目）        → source_id 本身就是 project_id
 * 查不到就保持 null，让前端自己降级，绝不猜。
 * ------------------------------------------------------------------ */
async function attachProjectInfo(list) {
  if (!Array.isArray(list) || list.length === 0) return list;
  const sourceOf = (m) => String(m.source_type || m.related_type || '');
  const idOf = (m) => parseInt(m.source_id != null ? m.source_id : m.related_id) || 0;

  const collectIds = [];
  for (const m of list) {
    const sid = idOf(m);
    if (!sid) continue;
    if (sourceOf(m) === 'collection') collectIds.push(sid);
    else if (sourceOf(m) === 'project') m.project_id = sid;
  }

  if (collectIds.length) {
    try {
      const ids = [...new Set(collectIds)];
      const [rows] = await pool.query(
        `SELECT id, project_id FROM collection_records WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      const map = {};
      for (const r of rows) map[r.id] = r.project_id;
      for (const m of list) {
        if (sourceOf(m) === 'collection') {
          const pid = map[idOf(m)];
          if (pid) m.project_id = pid;
        }
      }
    } catch (e) {
      console.error('[attachProjectInfo] 催收记录反查项目失败:', e.message);
    }
  }

  const pids = [...new Set(list.map((m) => parseInt(m.project_id) || 0).filter(Boolean))];
  if (pids.length) {
    try {
      const [pros] = await pool.query(
        `SELECT id, name FROM projects WHERE id IN (${pids.map(() => '?').join(',')})`,
        pids
      );
      const pm = {};
      for (const p of pros) pm[p.id] = p.name;
      for (const m of list) if (m.project_id && pm[m.project_id]) m.project_name = pm[m.project_id];
    } catch (e) {
      console.error('[attachProjectInfo] 项目名查询失败:', e.message);
    }
  }

  return list;
}

// 获取消息列表（统一查 notifications 表，兼容员工和客户）
app.get('/api/messages', async (req, res) => {
  try {
    const actor = await resolveMessageActor(req);
    if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

    const { type, is_read, keyword, page = 1, pageSize = 20 } = req.query;

    // 客户用 phone 查 notifications，员工用 user_id 查 messages
    let list = [];
    let total = 0;

    if (actor.type === 'customer') {
      // 客户：查 notifications 表（按 receiver_phone 匹配）
      let sql = 'SELECT * FROM notifications WHERE receiver_phone = ?';
      const params = [actor.phone];
      
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
      // 员工：合并查 messages + notifications 两表（修复：notifyProject 等同时写两表，
      // 列表只查 messages 导致 notifications 表 70+ 条永远不可见；unread-count 端点又算两表所以红点一直在）
      // 1) 员工 phone 由 resolveMessageActor 一并取回（用于 notifications 表 receiver_phone 匹配）
      const userId = actor.userId;
      const empPhone = actor.phone;

      // 2) messages WHERE user_id=?；related_id alias 成 source_id 让前端 getTargetPath 兼容
      let msgSql = `SELECT id, user_id, user_name, title, content, type, related_id AS source_id, related_type AS source_type, is_read, push_status, created_at, 'messages' AS src FROM messages WHERE user_id = ?`;
      const msgParams = [userId];

      if (type) { msgSql += ' AND type = ?'; msgParams.push(type); }
      if (is_read !== undefined && is_read !== '') { msgSql += ' AND is_read = ?'; msgParams.push(parseInt(is_read)); }
      if (keyword) { msgSql += ' AND (title LIKE ? OR content LIKE ?)'; msgParams.push(`%${keyword}%`, `%${keyword}%`); }

      // 3) notifications WHERE receiver_phone=?（与 unread-count 端点口径一致）
      let notifSql = '';
      let notifParams = [];
      if (empPhone) {
        notifSql = `SELECT id, NULL AS user_id, receiver_name AS user_name, title, content, type, source_id, source_type, is_read, channels AS push_status, created_at, 'notifications' AS src FROM notifications WHERE receiver_phone = ?`;
        notifParams = [empPhone];
        if (type) { notifSql += ' AND type = ?'; notifParams.push(type); }
        if (is_read !== undefined && is_read !== '') { notifSql += ' AND is_read = ?'; notifParams.push(parseInt(is_read)); }
        if (keyword) { notifSql += ' AND (title LIKE ? OR content LIKE ?)'; notifParams.push(`%${keyword}%`, `%${keyword}%`); }
      }

      // 4) UNION + 排序 + 分页（注意 MySQL 不支持在 UNION 外 LIMIT 子查询里的 ORDER BY，
      //    所以 LIMIT 放在最外层；ORDER BY created_at DESC 用括号包住子查询）
      const offset = (parseInt(page) - 1) * parseInt(pageSize);
      let unionSql, unionParams;
      if (notifSql) {
        unionSql = `SELECT * FROM ((${msgSql}) UNION ALL (${notifSql})) t ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        unionParams = [...msgParams, ...notifParams, parseInt(pageSize), offset];
      } else {
        unionSql = `SELECT * FROM (${msgSql}) t ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        unionParams = [...msgParams, parseInt(pageSize), offset];
      }
      const [rows] = await pool.query(unionSql, unionParams);
      list = rows;

      // 5) 总数（两表分别 COUNT 后相加）
      const [c1] = await pool.query(`SELECT COUNT(*) AS total FROM (${msgSql}) t`, msgParams);
      let totalAll = c1[0].total;
      if (notifSql) {
        const [c2] = await pool.query(`SELECT COUNT(*) AS total FROM (${notifSql}) t`, notifParams);
        totalAll += c2[0].total;
      }
      total = totalAll;
    }

    // 补 project_id / project_name（「查看应收」等按钮要靠它定位项目）
    await attachProjectInfo(list);

    res.json({ list, total, page: parseInt(page), page_size: parseInt(pageSize) });
  } catch (err) {
    console.error('messages error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 获取未读消息数量（统一查 notifications 表，兼容员工和客户）
app.get('/api/messages/unread-count', async (req, res) => {
  try {
    const actor = await resolveMessageActor(req);
    if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

    let count = 0;
    if (actor.type === 'customer') {
      // 客户：查 notifications 表
      const [row] = await pool.query('SELECT COUNT(*) as count FROM notifications WHERE receiver_phone = ? AND is_read = 0', [actor.phone]);
      count = Number(row[0].count || 0);
    } else {
      // 员工：合并查 messages + notifications 两表（与 /api/notifications/unread-count 端点口径一致）
      const [mRow] = await pool.query('SELECT COUNT(*) AS cnt FROM messages WHERE user_id = ? AND is_read = 0', [actor.userId]);
      let total = Number(mRow[0].cnt || 0);
      if (actor.phone) {
        const [nRow] = await pool.query('SELECT COUNT(*) AS cnt FROM notifications WHERE receiver_phone = ? AND is_read = 0', [actor.phone]);
        total += Number(nRow[0].cnt || 0);
      }
      count = total;
    }

    res.json({ count });
  } catch (err) {
    console.error('unread-count error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 标记消息已读（统一处理 notifications 和 messages）
app.put('/api/messages/:id/read', async (req, res) => {
  try {
    const actor = await resolveMessageActor(req);
    if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

    if (actor.type === 'customer') {
      // 客户：更新 notifications 表
      await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND receiver_phone = ?', [req.params.id, actor.phone]);
    } else {
      // 员工：两表都尝试 UPDATE（哪张表有改哪张；前端不需要知道）
      await pool.query('UPDATE messages SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, actor.userId]);
      if (actor.phone) {
        await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND receiver_phone = ?', [req.params.id, actor.phone]);
      }
    }
    res.json({ message: '已标记已读' });
  } catch (err) {
    console.error('mark read error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 标记全部已读（统一处理 notifications 和 messages）
app.put('/api/messages/read-all', async (req, res) => {
  try {
    const actor = await resolveMessageActor(req);
    if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

    if (actor.type === 'customer') {
      // 客户：更新 notifications 表
      await pool.query('UPDATE notifications SET is_read = 1 WHERE receiver_phone = ?', [actor.phone]);
    } else {
      // 员工：同时更新 messages + notifications 两表（修复：原来只改 messages，notifications 表的 is_read 永远不变，
      // 导致首页 unread-count 红点永远显示，因为 unread-count 端点合并查两表）
      await pool.query('UPDATE messages SET is_read = 1 WHERE user_id = ?', [actor.userId]);
      if (actor.phone) {
        await pool.query('UPDATE notifications SET is_read = 1 WHERE receiver_phone = ?', [actor.phone]);
      }
    }
    res.json({ message: '已全部标记已读' });
  } catch (err) {
    console.error('mark all read error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 获取单条消息
// 2026-10-22 修复：/api/messages 列表是 messages + notifications 两表 UNION 的，
// 两表 id 各自自增、必然撞号；而这里原来只查 messages 且用 getCurrentUser，
// 导致 notifications 来的消息（实测占未读大头：inapp/node 168 条、project_log 145 条…）
// 点进详情永远「消息不存在」。
// 现在按前端回传的 src 精确查对应表，缺省时两表依次兜底；
// 返回字段统一 alias 成 source_id / source_type，与列表口径一致。
app.get('/api/messages/:id', async (req, res) => {
  try {
    const actor = await resolveMessageActor(req);
    if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

    const id = parseInt(req.params.id) || 0;
    if (!id) return res.status(400).json({ error: '参数错误' });
    const src = String(req.query.src || '');

    const MSG_COLS = `id, user_id, user_name, title, content, type, related_id AS source_id, related_type AS source_type, is_read, push_status, created_at, 'messages' AS src`;
    const NOTIF_COLS = `id, NULL AS user_id, receiver_name AS user_name, title, content, type, source_id, source_type, is_read, channels AS push_status, created_at, 'notifications' AS src`;

    const findMessages = async () => {
      if (!actor.userId) return null;
      const [rows] = await pool.query(`SELECT ${MSG_COLS} FROM messages WHERE id = ? AND user_id = ?`, [id, actor.userId]);
      return rows[0] || null;
    };
    const findNotification = async () => {
      if (!actor.phone) return null;
      const [rows] = await pool.query(`SELECT ${NOTIF_COLS} FROM notifications WHERE id = ? AND receiver_phone = ?`, [id, actor.phone]);
      return rows[0] || null;
    };

    let msg = null;
    if (src === 'notifications') msg = await findNotification();
    else if (src === 'messages') msg = await findMessages();
    else msg = (await findMessages()) || (await findNotification());

    if (!msg) return res.status(404).json({ error: '消息不存在' });

    // 补 project_id / project_name（详情页「查看应收」按钮要用）
    await attachProjectInfo([msg]);

    res.json(msg);
  } catch (err) {
    console.error('messages/:id error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 删除单条消息（本人删自己的）
// 2026-10-22 新增：移动端左滑删除原来调的是 DELETE /api/notifications/:id，
// 那个接口 ① 只允许管理员 → 普通员工 403 ② 只删 notifications 表，
// 而列表是两表 UNION，messages 来的消息根本删不掉；
// 前端 success 回调不校验 statusCode，于是「看着删掉了，下拉刷新又回来」。
app.delete('/api/messages/:id', async (req, res) => {
  try {
    const actor = await resolveMessageActor(req);
    if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

    const id = parseInt(req.params.id) || 0;
    if (!id) return res.status(400).json({ error: '参数错误' });
    const src = String(req.query.src || '');

    const delMessages = async () => {
      if (!actor.userId) return 0;
      const [r] = await pool.query('DELETE FROM messages WHERE id = ? AND user_id = ?', [id, actor.userId]);
      return r.affectedRows || 0;
    };
    const delNotification = async () => {
      if (!actor.phone) return 0;
      const [r] = await pool.query('DELETE FROM notifications WHERE id = ? AND receiver_phone = ?', [id, actor.phone]);
      return r.affectedRows || 0;
    };

    let affected = 0;
    if (src === 'notifications') affected = await delNotification();
    else if (src === 'messages') affected = await delMessages();
    else affected = (await delMessages()) || (await delNotification());

    if (!affected) return res.status(404).json({ error: '消息不存在或无权删除' });
    res.json({ message: '已删除' });
  } catch (err) {
    console.error('messages delete error:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// ==================== 审批通知推送服务 ====================

// 发送审批通知（站内消息 + 短信）
async function sendApprovalNotification({ userId, userName, title, content, type, relatedId, relatedType }) {
  try {
    // 1. 写入站内消息
    await db.prepare(`
      INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW())
    `).run(userId, userName, title, content, type, relatedId, relatedType);
    
    // 2. 查询用户手机号，准备短信通知
    const [emp] = await db.prepare('SELECT phone FROM employees WHERE id = ?').all(userId);
    if (emp && emp.phone) {
      // 短信通知（异步，不阻塞）
      sendSmsFromNotify(emp.phone, userName, title, content).catch(err => console.error('短信发送失败:', err));
    }
    
  } catch (err) {
    console.error('sendApprovalNotification error:', err);
  }
}

// ==================== 主材采购申请 API ====================

// 查询具有指定权限的用户ID列表
async function getUserIdsByPermission(permCode) {
  try {
    // 2026-10-10 修复：MySQL 5.5 没有 JSON_SEARCH，改在 Node 层解析 JSON
    const [rows] = await pool.query(`
      SELECT DISTINCT e.id, r.permissions FROM employees e
      LEFT JOIN roles r ON e.role_id = r.id
      WHERE r.permissions IS NOT NULL AND r.permissions != '' AND r.permissions != '[]'
    `);
    const matched = [];
    for (const row of rows) {
      let arr = [];
      try { arr = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions; } catch {}
      if (Array.isArray(arr) && arr.includes(permCode)) matched.push(row.id);
    }
    return matched;
  } catch (e) {
    console.error('getUserIdsByPermission error:', e.message);
    return [];
  }
}

// 查询订阅了指定消息类型的用户ID列表
async function getUserIdsByNotificationType(notifType) {
  try {
    // 2026-10-10 修复：MySQL 5.5 没有 JSON_SEARCH，改在 Node 层解析 JSON
    const [rows] = await pool.query(`
      SELECT DISTINCT e.id, r.notification_types FROM employees e
      LEFT JOIN roles r ON e.role_id = r.id
      WHERE r.notification_types IS NOT NULL AND r.notification_types != '' AND r.notification_types != '[]'
    `);
    const matched = [];
    for (const row of rows) {
      let arr = [];
      try { arr = typeof row.notification_types === 'string' ? JSON.parse(row.notification_types) : row.notification_types; } catch {}
      if (Array.isArray(arr) && arr.includes(notifType)) matched.push(row.id);
    }
    return matched;
  } catch (e) {
    console.error('getUserIdsByNotificationType error:', e.message);
    return [];
  }
}

// 2026-10-10 新增：获取项目相关人员（项目经理/设计师/监理/创建人/客户）
// 只返回 employees 表里实际存在的 id（客户在 customers 表不在 employees，过滤掉）
async function getProjectRelatedUserIds(projectId) {
  if (!projectId) return [];
  try {
    const [rows] = await pool.query(
      `SELECT manager_id, designer_id, supervisor_id, creator_id, customer_id FROM projects WHERE id = ?`,
      [projectId]
    );
    if (!rows[0]) return [];
    const r = rows[0];
    const candidates = [...new Set([r.manager_id, r.designer_id, r.supervisor_id, r.creator_id, r.customer_id].filter(Boolean))];
    if (candidates.length === 0) return [];
    // 过滤：只在 employees 表里存在
    const [emps] = await pool.query(
      `SELECT id FROM employees WHERE id IN (${candidates.map(() => '?').join(',')})`,
      candidates
    );
    return emps.map(e => e.id);
  } catch (e) {
    console.error('getProjectRelatedUserIds error:', e.message);
    return [];
  }
}

// 发送采购通知（站内消息）
async function sendPurchaseNotification({ userId, userName, title, content, type, relatedId, relatedType }) {
  try {
    // 写 MySQL messages 表（移动端读的就是这个表）
    await pool.query(
      'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, NOW())',
      [userId, userName || '', title, content, type, relatedId || 0, relatedType || '', 'pending']
    );
    // 短信通知
    const [emps] = await pool.query('SELECT phone FROM employees WHERE id = ?', [userId]);
    const emp = emps[0];
    if (emp && emp.phone) {
      sendSmsFromNotify(emp.phone, userName, title, content).catch(err => console.error('短信发送失败:', err));
    }
  } catch (err) {
    console.error('sendPurchaseNotification error:', err);
  }
}

// 2026-10-10 新增：多通道通知分发器（站内 / 短信 / 微信小程序订阅消息 / 企业微信）
// 调用方式：await dispatchNotification({ userId, channels: ['inapp','sms','mini_subscribe'], type:'purchase_approved', title, content, data:{thing1, time2}, relatedId, relatedType })
// channels 可选：inapp / sms / mini_subscribe / mp_template / wecom / email
async function dispatchNotification({ userId, channels = ['inapp', 'sms'], type, title, content, data = {}, relatedId, relatedType }) {
  if (!userId) return [];
  const results = [];
  // 1. 站内消息 (inapp)
  if (channels.includes('inapp')) {
    try {
      const [r] = await pool.query(
        `INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, channel, push_status, created_at)
         VALUES (?, '', ?, ?, ?, ?, ?, 'inapp', 'sent', NOW())`,
        [userId, title, content, type, relatedId || 0, relatedType || '']
      );
      results.push({ channel: 'inapp', success: true, message_id: r.insertId });
    } catch (e) {
      results.push({ channel: 'inapp', success: false, error: e.message });
    }
  }
  // 2. 短信 (sms)
  if (channels.includes('sms')) {
    try {
      const [emps] = await pool.query('SELECT phone FROM employees WHERE id = ?', [userId]);
      if (emps[0] && emps[0].phone) {
        await sendSmsFromNotify(emps[0].phone, '', title, content);
        results.push({ channel: 'sms', success: true });
      } else {
        results.push({ channel: 'sms', success: false, error: 'no_phone' });
      }
    } catch (e) {
      results.push({ channel: 'sms', success: false, error: e.message });
    }
  }
  // 3. 微信小程序订阅消息（stub — 待小程序上线后接入 SDK）
  if (channels.includes('mini_subscribe')) {
    try {
      const [ids] = await pool.query(
        `SELECT openid FROM wechat_identities WHERE employee_id = ? AND wechat_type = 'mini' LIMIT 1`,
        [userId]
      );
      if (!ids[0] || !ids[0].openid) {
        results.push({ channel: 'mini_subscribe', success: false, error: 'no_openid' });
      } else {
        // TODO: 接入微信 subscribeMessage.send
        // 1) 查 wechat_templates 拿 template_id (按 type)
        const [tpl] = await pool.query(
          `SELECT template_id, data_keys FROM wechat_templates WHERE template_code = ? AND wechat_type = 'mini' AND status='active' LIMIT 1`,
          [type]
        );
        if (!tpl[0] || !tpl[0].template_id) {
          results.push({ channel: 'mini_subscribe', success: false, error: 'no_template', template_code: type });
        } else {
          // 2) 查 user 是否授权过这个 template_id
          const [auth] = await pool.query(
            `SELECT id, expires_at FROM subscribe_records WHERE employee_id = ? AND template_id = ? AND status='authorized' LIMIT 1`,
            [userId, tpl[0].template_id]
          );
          if (!auth[0]) {
            results.push({ channel: 'mini_subscribe', success: false, error: 'not_authorized', template_id: tpl[0].template_id });
          } else {
            // 3) 调微信 API (stub - 待实现)
            // const apiRes = await callWechatSubscribeMsgAPI({ openid, template_id, data, ... });
            // results.push({ channel: 'mini_subscribe', success: apiRes.errcode === 0, external_id: apiRes.msgid });
            results.push({ channel: 'mini_subscribe', success: true, stub: true, template_id: tpl[0].template_id });
          }
        }
      }
    } catch (e) {
      results.push({ channel: 'mini_subscribe', success: false, error: e.message });
    }
  }
  return results;
}

// 2026-10-10 新增：access_token 缓存（微信 API 调用前置）
const _wechatTokenCache = new Map();
async function getWechatAccessToken(wechatType) {
  // TODO: 实际接入时从 wechat_config 读 appid/secret，调用微信 API
  // const [rows] = await pool.query('SELECT appid, app_secret FROM wechat_config WHERE wechat_type = ? AND is_default = 1', [wechatType]);
  // if (cached && !expired) return cached;
  // const res = await axios.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`);
  // cache.set(wechatType, { token: res.access_token, expires: Date.now() + 7000*1000 });
  return { token: null, stub: true, wechatType };
}

// =================== 微信小程序/公众号 配置 + 身份 + 模板 + 订阅 ===================
// 1. 微信配置 CRUD
app.get('/api/wechat/config', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, wechat_type, appid, is_default, created_at FROM wechat_config ORDER BY id');
    res.json({ list: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/wechat/config', async (req, res) => {
  try {
    const { wechat_type, appid, app_secret, is_default } = req.body;
    if (!wechat_type || !['mp', 'mini'].includes(wechat_type)) return res.status(400).json({ error: 'wechat_type 必须为 mp 或 mini' });
    if (is_default) await pool.query('UPDATE wechat_config SET is_default = 0');
    const [r] = await pool.query(
      'INSERT INTO wechat_config (wechat_type, appid, app_secret, is_default, created_at) VALUES (?, ?, ?, ?, NOW())',
      [wechat_type, appid || '', app_secret || '', is_default ? 1 : 0]
    );
    res.json({ id: r.insertId, message: '配置已保存（access_token 调用待接入 SDK）' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. 员工微信身份 CRUD
app.get('/api/wechat/identity', async (req, res) => {
  try {
    const { employee_id, wechat_type } = req.query;
    let sql = 'SELECT * FROM wechat_identities WHERE 1=1';
    const params = [];
    if (employee_id) { sql += ' AND employee_id = ?'; params.push(employee_id); }
    if (wechat_type) { sql += ' AND wechat_type = ?'; params.push(wechat_type); }
    const [rows] = await pool.query(sql, params);
    res.json({ list: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/wechat/identity', async (req, res) => {
  try {
    const { employee_id, wechat_type, appid, openid, unionid } = req.body;
    if (!employee_id || !wechat_type) return res.status(400).json({ error: '缺少 employee_id 或 wechat_type' });
    if (!['mp', 'mini'].includes(wechat_type)) return res.status(400).json({ error: 'wechat_type 必须为 mp 或 mini' });
    if (!openid && !unionid) return res.status(400).json({ error: 'openid 和 unionid 至少需要一个' });
    // upsert
    await pool.query(
      `INSERT INTO wechat_identities (employee_id, wechat_type, appid, openid, unionid, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE appid=VALUES(appid), openid=COALESCE(VALUES(openid), openid), unionid=COALESCE(VALUES(unionid), unionid)`,
      [employee_id, wechat_type, appid || '', openid || null, unionid || null]
    );
    res.json({ message: '微信身份已绑定（待小程序上线后实际生效）' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. 微信模板 CRUD（用户在微信后台申请后，把 template_id 录入到这里）
app.get('/api/wechat/templates', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM wechat_templates ORDER BY template_code, wechat_type');
    res.json({ list: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/wechat/templates', async (req, res) => {
  try {
    const { template_code, wechat_type, template_id, title, data_keys, status } = req.body;
    if (!template_code || !wechat_type || !template_id) return res.status(400).json({ error: '缺少必填字段 template_code/wechat_type/template_id' });
    await pool.query(
      `INSERT INTO wechat_templates (template_code, wechat_type, template_id, title, data_keys, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE template_id=VALUES(template_id), title=VALUES(title), data_keys=VALUES(data_keys), status=VALUES(status)`,
      [template_code, wechat_type, template_id, title || '', JSON.stringify(data_keys || []), status || 'active']
    );
    res.json({ message: '模板已注册（实际推送待 SDK 接入）' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. 订阅授权记录（用户在 H5/小程序里点订阅按钮后调用）
app.get('/api/wechat/subscribe', async (req, res) => {
  try {
    const { employee_id } = req.query;
    if (!employee_id) return res.status(400).json({ error: '缺少 employee_id' });
    const [rows] = await pool.query(
      `SELECT * FROM subscribe_records WHERE employee_id = ? AND status='authorized' ORDER BY authorized_at DESC`,
      [employee_id]
    );
    res.json({ list: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/wechat/subscribe', async (req, res) => {
  try {
    const { employee_id, template_id, expires_at } = req.body;
    if (!employee_id || !template_id) return res.status(400).json({ error: '缺少 employee_id 或 template_id' });
    await pool.query(
      `INSERT INTO subscribe_records (employee_id, template_id, authorized_at, expires_at, status)
       VALUES (?, ?, NOW(), ?, 'authorized')
       ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at), status='authorized'`,
      [employee_id, template_id, expires_at || null]
    );
    res.json({ message: '订阅授权已记录' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. 统一通知分发接口（前端/PC 端测试用）
app.post('/api/notify/dispatch', async (req, res) => {
  try {
    const { user_id, channels, type, title, content, data, related_id, related_type } = req.body;
    if (!user_id) return res.status(400).json({ error: '缺少 user_id' });
    if (!title || !content) return res.status(400).json({ error: '缺少 title 或 content' });
    const results = await dispatchNotification({
      userId: user_id,
      channels: channels || ['inapp'],
      type: type || 'custom',
      title, content, data: data || {},
      relatedId: related_id,
      relatedType: related_type
    });
    res.json({ results, message: '通知已分发（外部通道为 stub）' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/purchase-requests — 列表（支持 project_id / status / applicant_id 过滤）
app.get('/api/purchase-requests', async (req, res) => {
  try {
    const { project_id, status, applicant_id, page, limit, keyword } = req.query;
    const { userId } = await getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const perms = await getUserPermissions(userId);
    const isAdminUser = await isAdmin(userId);
    // v2.3.12：purchase:view 在角色管理里没有对应勾选列，永远授不出去；
    //   统一并入 purchase:read_all（「全部数据」），老数据里的 purchase:view 继续兼容。
    const canViewAll = isAdminUser || perms.includes('purchase:read_all') || perms.includes('purchase:view');
    const canApprove = perms.includes('purchase:approve');
    const canFinance = perms.includes('purchase:finance');

    let sql = 'SELECT * FROM purchase_requests WHERE 1=1';
    let countSql = 'SELECT COUNT(*) as total FROM purchase_requests WHERE 1=1';
    const params = [];

    // 权限过滤：非管理员且无全视图权限，只能看自己提交的
    if (!canViewAll) {
      sql += ' AND applicant_id = ?';
      countSql += ' AND applicant_id = ?';
      params.push(userId);
    }

    if (project_id) { sql += ' AND project_id = ?'; countSql += ' AND project_id = ?'; params.push(project_id); }
    if (status) { sql += ' AND status = ?'; countSql += ' AND status = ?'; params.push(status); }
    if (applicant_id) { sql += ' AND applicant_id = ?'; countSql += ' AND applicant_id = ?'; params.push(applicant_id); }
    if (keyword) {
      sql += ' AND (project_name LIKE ? OR applicant_name LIKE ?)';
      countSql += ' AND (project_name LIKE ? OR applicant_name LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const p = parseInt(page) || 1;
    const l = parseInt(limit) || 50;
    const offset = (p - 1) * l;

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const [countResult] = await pool.query(countSql, params);
    const [rows] = await pool.query(sql, [...params, l, offset]);

    // 附上 items
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      const [items] = await pool.query(
        `SELECT * FROM purchase_request_items WHERE request_id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      const [reimbursements] = await pool.query(
        `SELECT * FROM purchase_reimbursements WHERE request_id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      rows.forEach(r => {
        r.items = items.filter(i => i.request_id === r.id);
        r.reimbursement = reimbursements.find(re => re.request_id === r.id) || null;
        // 附上权限标记（admin 跳过权限检查）
        r._canApprove = isAdminUser || canApprove;
        r._canFinance = isAdminUser || canFinance;
        r._isApplicant = r.applicant_id === userId;
        r._isAdmin = isAdminUser;
      });
    }

    res.json({ list: rows, total: countResult[0].total, page: p, limit: l });
  } catch (err) {
    console.error('purchase-requests list error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// POST /api/purchase-requests — 新建申请
app.post('/api/purchase-requests', async (req, res) => {
  try {
    const { userId, userName } = await getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const raw = req.body;
    // 兼容移动端单条格式 vs PC端items数组格式
    let items = raw.items;
    if (!items || !Array.isArray(items) || items.length === 0) {
      // 移动端单字段格式：从顶层字段构造单条item
      if (!raw.project_id) return res.status(400).json({ error: '请选择项目' });
      if (!raw.material_name) return res.status(400).json({ error: '请选择主材' });
      const qty = parseFloat(raw.quantity) || 0;
      const amt = parseFloat(raw.amount) || 0;
      items = [{
        material_id: raw.material_id || null,
        material_name: raw.material_name,
        unit: raw.unit || '',
        quantity: qty,
        unit_price: amt && qty ? (amt / qty) : 0,
        total_price: amt,
      }];
    }

    const supplier_id = raw.supplier_id || null;
    const supplier_name = raw.supplier_name || '';
    const total_amount = items.reduce((sum, i) => sum + (parseFloat(i.total_price) || 0), 0);
    const project_name = raw.project_name || '';
    const remark = raw.remark || '';
    const images = raw.images ? (typeof raw.images === 'string' ? raw.images : JSON.stringify(raw.images)) : '';

    const [result] = await pool.query(
      `INSERT INTO purchase_requests (project_id, project_name, supplier_id, supplier_name, applicant_id, applicant_name, total_amount, status, remark, images, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NOW())`,
      [raw.project_id, project_name, supplier_id, supplier_name, userId, userName, total_amount, remark, images]
    );
    const requestId = result.insertId;

    // 插入 items
    for (const item of items) {
      await pool.query(
        `INSERT INTO purchase_request_items (request_id, material_id, material_name, unit, quantity, unit_price, total_price, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [requestId, item.material_id || null, item.material_name || '', item.unit || '', item.quantity || 0, item.unit_price || 0, item.total_price || 0]
      );
    }

    await addLog(userId, '', '新增', '采购管理', requestId, project_name || '', `提交采购申请，金额：${total_amount}`, req.ip);

    // 通知有 purchase:approve 权限的人 + 订阅了 purchase_submit 的角色成员 + 项目相关人员
    const approverIds = await getUserIdsByPermission('purchase:approve');
    const subscribedIds = await getUserIdsByNotificationType('purchase_submit');
    const projectUserIds = await getProjectRelatedUserIds(raw.project_id);
    const allNotifyIds = [...new Set([...approverIds, ...subscribedIds, ...projectUserIds])];
    for (const uid of allNotifyIds) {
      if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
        const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
        await sendPurchaseNotification({
          userId: uid, userName: emp[0]?.name || '',
          title: '新采购申请待审核',
          content: `${userName} 提交了采购申请，项目：${project_name || ''}，金额：${total_amount}`,
          type: '采购', relatedId: requestId, relatedType: 'purchase_request'
        });
      }
    }

    res.json({ id: requestId, message: '提交成功' });
  } catch (err) {
    console.error('purchase-requests create error:', err);
    res.status(500).json({ error: '提交失败' });
  }
});

// 采购申请列表的项目名快照可能是空串（客户端提交时项目未选/取值失败），
// 按 project_id 反查 projects 补齐。同类"快照字段为空"都按这个思路兜底，不要指望历史数据。
async function attachPurchaseProjectName(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const need = [...new Set(
    rows.filter(r => !r.project_name && r.project_id).map(r => r.project_id)
  )];
  if (need.length === 0) return rows;
  try {
    const [prows] = await pool.query(
      `SELECT id, name FROM projects WHERE id IN (${need.map(() => '?').join(',')})`,
      need
    );
    const map = new Map(prows.map(p => [p.id, p.name]));
    rows.forEach(r => {
      if (!r.project_name && r.project_id && map.get(r.project_id)) {
        r.project_name = map.get(r.project_id);
      }
    });
  } catch (e) {
    console.warn('[purchase] 补项目名失败:', e.message);
  }
  return rows;
}

// GET /api/purchase-requests/my — 我的申请（applicant_id 过滤）
// 权限用 checkAnyPermission：财务角色只有 purchase:read_all（无 purchase:read），
// 而 checkPermission 是精确匹配、不认 read_all 覆盖 read，会导致财务点「我的申请」403。
app.get('/api/purchase-requests/my', checkAnyPermission(['purchase:read', 'purchase:read_all', 'purchase:finance']), async (req, res) => {
  const { applicant_id, page, page_size } = req.query;
  const targetId = applicant_id || getUserId(req);
  const p = parseInt(page) || 1;
  const l = parseInt(page_size) || 50;
  const offset = (p - 1) * l;

  try {
    const [rows] = await pool.query(
      `SELECT pr.*, pri.quantity, pri.unit, pri.material_name
       FROM purchase_requests pr
       LEFT JOIN purchase_request_items pri ON pri.request_id = pr.id
       WHERE pr.applicant_id = ?
       ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`,
      [targetId, l, offset]
    );
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM purchase_requests WHERE applicant_id = ?',
      [targetId]
    );
    // 2026-10-10：附上每条的 reimbursement 记录，让 list 卡片能展示报销凭证
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      const [reim] = await pool.query(
        `SELECT request_id, images, actual_amount, financial_notes, confirmed_by_name, confirmed_at, reject_reason
         FROM purchase_reimbursements WHERE request_id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      const map = new Map(reim.map(r => [r.request_id, r]));
      rows.forEach(r => { r.reimbursement = map.get(r.id) || null; });
    }
    await attachPurchaseProjectName(rows);
    res.json({ list: rows, total: countResult[0].total, page: p, page_size: l });
  } catch (err) {
    console.error('purchase-requests my error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// GET /api/purchase-requests/pending — 待审批列表（status=pending）
app.get('/api/purchase-requests/pending', checkPermission('purchase:approve'), async (req, res) => {
  const { page, page_size } = req.query;
  const p = parseInt(page) || 1;
  const l = parseInt(page_size) || 50;
  const offset = (p - 1) * l;

  try {
    const [rows] = await pool.query(
      `SELECT pr.*, pri.quantity, pri.unit, pri.material_name
       FROM purchase_requests pr
       LEFT JOIN purchase_request_items pri ON pri.request_id = pr.id
       WHERE pr.status = ?
       ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`,
      ['pending', l, offset]
    );
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM purchase_requests WHERE status = ?',
      ['pending']
    );
    await attachPurchaseProjectName(rows);
    res.json({ list: rows, total: countResult[0].total, page: p, page_size: l });
  } catch (err) {
    console.error('purchase-requests pending error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// GET /api/purchase-requests/reimburse — 报销中列表（status=reimbursing）
app.get('/api/purchase-requests/reimburse', checkPermission('purchase:finance'), async (req, res) => {
  const { page, page_size } = req.query;
  const p = parseInt(page) || 1;
  const l = parseInt(page_size) || 50;
  const offset = (p - 1) * l;

  try {
    const [rows] = await pool.query(
      `SELECT pr.*, pri.quantity, pri.unit, pri.material_name
       FROM purchase_requests pr
       LEFT JOIN purchase_request_items pri ON pri.request_id = pr.id
       WHERE pr.status = ?
       ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`,
      ['reimbursing', l, offset]
    );
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM purchase_requests WHERE status = ?',
      ['reimbursing']
    );
    await attachPurchaseProjectName(rows);
    res.json({ list: rows, total: countResult[0].total, page: p, page_size: l });
  } catch (err) {
    console.error('purchase-requests reimburse error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// GET /api/purchase-requests/to-reimburse — 申请人待上传报销列表（status=approved + 未上传报销）
app.get('/api/purchase-requests/to-reimburse', checkPermission('purchase:write'), async (req, res) => {
  const { page, page_size } = req.query;
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const p = parseInt(page) || 1;
  const l = parseInt(page_size) || 50;
  const offset = (p - 1) * l;

  try {
    const [rows] = await pool.query(
      `SELECT pr.*, pri.quantity, pri.unit, pri.material_name
       FROM purchase_requests pr
       LEFT JOIN purchase_request_items pri ON pri.request_id = pr.id
       WHERE pr.applicant_id = ?
         AND pr.status = 'approved'
         AND NOT EXISTS (SELECT 1 FROM purchase_reimbursements WHERE request_id = pr.id)
       ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`,
      [userId, l, offset]
    );
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM purchase_requests pr
       WHERE pr.applicant_id = ?
         AND pr.status = 'approved'
         AND NOT EXISTS (SELECT 1 FROM purchase_reimbursements WHERE request_id = pr.id)`,
      [userId]
    );
    await attachPurchaseProjectName(rows);
    res.json({ list: rows, total: countResult[0].total, page: p, page_size: l });
  } catch (err) {
    console.error('purchase-requests to-reimburse error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// GET /api/purchase-requests/finance — 财务确认列表
// v2.3.12 改：支持 status 筛选，并单独返回 pending_count 供角标使用
//   status=pending（默认）→ finance_confirmed 待上传回执（真正的待办）
//   status=done          → reimbursed 已报销（终态，历史）
//   status=all           → 两者都要
// 角标 pending_count 只算 finance_confirmed。此前前端拿 total（含 reimbursed）当角标，
// 导致已报销完成的记录永远挂在角标上，数字消不掉。
app.get('/api/purchase-requests/finance', checkPermission('purchase:finance'), async (req, res) => {
  const { page, page_size, status } = req.query;
  const p = parseInt(page) || 1;
  const l = parseInt(page_size) || 50;
  const offset = (p - 1) * l;

  let statuses;
  if (status === 'done') statuses = ['reimbursed'];
  else if (status === 'all') statuses = ['finance_confirmed', 'reimbursed'];
  else statuses = ['finance_confirmed'];
  const placeholders = statuses.map(() => '?').join(',');

  try {
    const [rows] = await pool.query(
      `SELECT pr.*, pri.quantity, pri.unit, pri.material_name
       FROM purchase_requests pr
       LEFT JOIN purchase_request_items pri ON pri.request_id = pr.id
       WHERE pr.status IN (${placeholders})
       ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`,
      [...statuses, l, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM purchase_requests WHERE status IN (${placeholders})`,
      statuses
    );
    const [[{ pending_count }]] = await pool.query(
      "SELECT COUNT(*) as pending_count FROM purchase_requests WHERE status = 'finance_confirmed'"
    );
    await attachPurchaseProjectName(rows);
    res.json({ list: rows, total, pending_count, page: p, page_size: l });
  } catch (err) {
    console.error('purchase-requests finance error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// GET /api/purchase-requests/:id — 详情
app.get('/api/purchase-requests/:id', async (req, res) => {
  try {
    const { userId } = await getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '申请不存在' });

    const [items] = await pool.query('SELECT * FROM purchase_request_items WHERE request_id = ?', [req.params.id]);
    const [reimbursements] = await pool.query('SELECT * FROM purchase_reimbursements WHERE request_id = ?', [req.params.id]);

    const perms = await getUserPermissions(userId);
    const isAdminUser = await isAdmin(userId);
    const canApprove = isAdminUser || perms.includes('purchase:approve');
    const canFinance = isAdminUser || perms.includes('purchase:finance');

    const record = rows[0];
    record.items = items;
    record.reimbursement = reimbursements[0] || null;
    // 2026-10-10：权限/身份标记统一用 can_xxx（前端 detail.vue 读的是这个键名）
    record._canApprove = canApprove;  // 兼容两种字段名
    record._canFinance = canFinance;
    record.can_approve = canApprove;
    record.can_finance_confirm = canFinance;
    record.is_admin = await isAdmin(userId);
    record.is_applicant = record.applicant_id === userId;

    res.json(record);
  } catch (err) {
    console.error('purchase-requests get error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// PUT /api/purchase-requests/:id — 修改申请（仅待审核状态）
app.put('/api/purchase-requests/:id', async (req, res) => {
  try {
    const { userId, userName } = await getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
    if (rows[0].status !== 'pending') return res.status(400).json({ error: '只有待审核状态可以修改' });
    if (rows[0].applicant_id !== userId) return res.status(403).json({ error: '只能修改自己的申请' });

    const { project_name, items, remark } = req.body;
    const total_amount = items.reduce((sum, i) => sum + (parseFloat(i.total_price) || 0), 0);

    await pool.query(
      `UPDATE purchase_requests SET project_name=?, total_amount=?, remark=?, updated_at=NOW() WHERE id=?`,
      [project_name || rows[0].project_name, total_amount, remark || '', req.params.id]
    );

    // 删除旧items，插入新items
    await pool.query('DELETE FROM purchase_request_items WHERE request_id = ?', [req.params.id]);
    for (const item of items) {
      await pool.query(
        `INSERT INTO purchase_request_items (request_id, material_id, material_name, unit, quantity, unit_price, total_price, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [req.params.id, item.material_id || null, item.material_name || '', item.unit || '', item.quantity || 0, item.unit_price || 0, item.total_price || 0]
      );
    }

    await addLog(userId, '', '编辑', '采购管理', req.params.id, project_name || '', `修改采购申请，金额：${total_amount}`, req.ip);
    res.json({ message: '修改成功' });
  } catch (err) {
    console.error('purchase-requests update error:', err);
    res.status(500).json({ error: '修改失败' });
  }
});

// DELETE /api/purchase-requests/:id — 删除申请（仅申请人；pending/rejected/未上传报销的 approved 可删）
app.delete('/api/purchase-requests/:id', async (req, res) => {
  try {
    const { userId } = await getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
    if (rows[0].applicant_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除' });

    // 读取报销记录，状态 approved 但已上传报销则禁止删除（避免误删财务凭证）
    const [reimRows] = await pool.query('SELECT id, images FROM purchase_reimbursements WHERE request_id = ?', [req.params.id]);
    const allowedStatuses = ['pending', 'rejected', 'approved'];
    if (!allowedStatuses.includes(rows[0].status)) {
      return res.status(400).json({ error: `当前状态（${rows[0].status}）不可删除` });
    }
    if (rows[0].status === 'approved' && reimRows.length > 0) {
      return res.status(400).json({ error: '已上传报销凭证的申请不可删除' });
    }

    // 删前 unlink 报销凭证物理文件
    for (const r of reimRows) {
      let arr = [];
      try { arr = Array.isArray(r.images) ? r.images : JSON.parse(r.images || '[]'); } catch {}
      for (const p of arr) {
        if (!p) continue;
        const m = String(p).match(/\/uploads\/logs\/([^/?#]+)$/);
        if (m) {
          const abs = path.join(__dirname, 'uploads', 'logs', m[1]);
          fs.unlink(abs, (e) => { if (e && e.code !== 'ENOENT') console.error('unlink fail:', abs, e.message); });
        }
      }
    }

    await pool.query('DELETE FROM purchase_request_items WHERE request_id = ?', [req.params.id]);
    await pool.query('DELETE FROM purchase_reimbursements WHERE request_id = ?', [req.params.id]);
    await pool.query('DELETE FROM purchase_requests WHERE id = ?', [req.params.id]);

    await addLog(userId, '', '删除', '采购管理', req.params.id, rows[0].project_name || '', `删除采购申请`, req.ip);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('purchase-requests delete error:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// PUT /api/purchase-requests/:id/approve — 审核（通过/拒绝）
app.put('/api/purchase-requests/:id/approve', async (req, res) => {
  try {
    const { userId, userName } = await getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const perms = await getUserPermissions(userId);
    if (!perms.includes('purchase:approve') && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无审核权限' });
    }

    const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '申请不存在' });

    const { action, reason } = req.body; // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await pool.query(
      `UPDATE purchase_requests SET status=?, rejection_reason=?, updated_at=NOW() WHERE id=?`,
      [newStatus, action === 'reject' ? (reason || '') : '', req.params.id]
    );

    await addLog(userId, '', action === 'approve' ? '审核通过' : '审核拒绝', '采购管理', req.params.id, rows[0].project_name || '', `采购审核${action === 'approve' ? '通过' : '拒绝'}${reason ? '，原因：' + reason : ''}`, req.ip);

    // 通知申请人 + 订阅了该通知类型的角色成员 + 项目相关人员
    const record = rows[0];
    const subscribedIds = await getUserIdsByNotificationType(action === 'approve' ? 'purchase_approved' : 'purchase_rejected');
    const projectUserIds = await getProjectRelatedUserIds(record.project_id);
    const allNotifyIds = new Set([record.applicant_id, ...subscribedIds, ...projectUserIds]);
    for (const uid of allNotifyIds) {
      if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
        const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
        if (action === 'approve') {
          await sendPurchaseNotification({
            userId: uid, userName: emp[0]?.name || '',
            title: '采购申请已通过',
            content: `您的采购申请（项目：${record.project_name}，金额：${record.total_amount}）已审核通过，请上传报销单`,
            type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
          });
        } else {
          await sendPurchaseNotification({
            userId: uid, userName: emp[0]?.name || '',
            title: '采购申请未通过',
            content: `您的采购申请（项目：${record.project_name}）未通过${reason ? '：' + reason : ''}，可重新提交`,
            type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
          });
        }
      }
    }

    res.json({ message: action === 'approve' ? '审核通过' : '已拒绝' });
  } catch (err) {
    console.error('purchase-requests approve error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// PUT /api/purchase-requests/:id/unapprove — 反审核（仅申请人，状态 approved 且未上传报销时回退到 pending）
app.put('/api/purchase-requests/:id/unapprove', async (req, res) => {
  try {
    const { userId, userName } = await getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
    if (rows[0].applicant_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '只能反审核自己的申请' });
    if (rows[0].status !== 'approved') return res.status(400).json({ error: '只有已通过的申请可以反审核' });

    // 已上传报销凭证则禁止反审核（避免漏单）
    const [reimRows] = await pool.query('SELECT id FROM purchase_reimbursements WHERE request_id = ?', [req.params.id]);
    if (reimRows.length > 0) return res.status(400).json({ error: '已上传报销凭证，不可反审核' });

    await pool.query(
      `UPDATE purchase_requests SET status='pending', rejection_reason=NULL, updated_at=NOW() WHERE id=?`,
      [req.params.id]
    );

    await addLog(userId, '', '反审核', '采购管理', req.params.id, rows[0].project_name || '', `反审核，状态从 approved 回退到 pending`, req.ip);

    // 通知有 purchase:approve 权限的人 + 项目相关人员
    const approverIds = await getUserIdsByPermission('purchase:approve');
    const projectUserIds = await getProjectRelatedUserIds(rows[0].project_id);
    const allUnapproveIds = [...new Set([...approverIds, ...projectUserIds])];
    for (const uid of allUnapproveIds) {
      if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
        const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
        await sendPurchaseNotification({
          userId: uid, userName: emp[0]?.name || '',
          title: '采购申请反审核待重审',
          content: `${userName} 撤回了项目：${rows[0].project_name} 的采购申请（已通过），已退回待审核队列`,
          type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
        });
      }
    }

    res.json({ message: '已反审核，状态回到待审核' });
  } catch (err) {
    console.error('purchase-requests unapprove error:', err);
    res.status(500).json({ error: '反审核失败' });
  }
});

// POST /api/purchase-requests/:id/reimburse — 上传报销单（申请人）
// 支持两种方式：1) multipart/form-data（files字段）2) JSON body { images: ["url1","url2"] }
app.post('/api/purchase-requests/:id/reimburse', upload.array('files', 10), async (req, res) => {
  try {
    // v2.3.6-hotfix2：修复中文文件名乱码（upload.array 后是 req.files 数组）
    if (Array.isArray(req.files)) {
      req.files.forEach(f => { f.originalname = fixMojibake(f.originalname); });
    }
    const { userId, userName } = await getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
    if (rows[0].applicant_id !== userId) return res.status(403).json({ error: '只能上传自己的报销单' });
    if (rows[0].status !== 'approved') return res.status(400).json({ error: '只有在审核通过后才能上传报销单' });

    const { actual_amount, financial_notes, images: imagesJson } = req.body;

    // 处理图片：优先从文件上传获取，其次从 JSON body 解析
    let images = (req.files || []).map(f => `/uploads/logs/${f.filename}`);
    if (images.length === 0 && imagesJson) {
      try { images = JSON.parse(imagesJson); } catch { images = []; }
    }

    // 检查是否已有报销记录
    const [existing] = await pool.query('SELECT id FROM purchase_reimbursements WHERE request_id = ?', [req.params.id]);
    if (existing.length > 0) {
      await pool.query(
        `UPDATE purchase_reimbursements SET images=?, actual_amount=?, financial_notes=?, created_at=NOW() WHERE request_id=?`,
        [JSON.stringify(images), actual_amount || 0, financial_notes || '', req.params.id]
      );
    } else {
      await pool.query(
        `INSERT INTO purchase_reimbursements (request_id, images, actual_amount, financial_notes, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [req.params.id, JSON.stringify(images), actual_amount || 0, financial_notes || '']
      );
    }

    // 更新状态为 reimbursing（报销中）
    await pool.query(`UPDATE purchase_requests SET status='reimbursing', updated_at=NOW() WHERE id=?`, [req.params.id]);

    await addLog(userId, '', '上传报销', '采购管理', req.params.id, rows[0].project_name || '', `上传报销单，实付金额：${actual_amount || 0}`, req.ip);

    // 通知有 purchase:finance 权限的人 + 订阅了 purchase_reimbursing 的角色成员 + 项目相关人员
    const financeIds = await getUserIdsByPermission('purchase:finance');
    const subscribedIds = await getUserIdsByNotificationType('purchase_reimbursing');
    const projectUserIds = await getProjectRelatedUserIds(rows[0].project_id);
    const allNotifyIds = [...new Set([...financeIds, ...subscribedIds, ...projectUserIds])];
    for (const uid of allNotifyIds) {
      if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
        const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
        await sendPurchaseNotification({
          userId: uid, userName: emp[0]?.name || '',
          title: '有报销单待核对',
          content: `${userName} 已上传报销单，项目：${rows[0].project_name}，实付金额：${actual_amount || 0}，请及时核对`,
          type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
        });
      }
    }

    res.json({ message: '上传成功' });
  } catch (err) {
    console.error('purchase-requests reimburse error:', err);
    res.status(500).json({ error: '上传失败' });
  }
});

// PUT /api/purchase-requests/:id/finance-reject — 财务驳回报销（打回给员工重新上传）
app.put('/api/purchase-requests/:id/finance-reject', async (req, res) => {
  try {
    const { userId, userName } = await getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const perms = await getUserPermissions(userId);
    if (!perms.includes('purchase:finance') && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无财务操作权限' });
    }

    const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
    if (rows[0].status !== 'reimbursing') return res.status(400).json({ error: '状态不允许财务驳回' });

    const { reason } = req.body;

    // 更新报销记录填入驳回原因
    await pool.query(
      `UPDATE purchase_reimbursements SET reject_reason=? WHERE request_id=?`,
      [reason || '', req.params.id]
    );

    // 状态打回 approved，员工可重新上传
    await pool.query(`UPDATE purchase_requests SET status='approved', updated_at=NOW() WHERE id=?`, [req.params.id]);

    await addLog(userId, '', '财务驳回', '采购管理', req.params.id, rows[0].project_name || '', `财务驳回报销，原因：${reason || '未填写'}`, req.ip);

    // 通知申请人 + 订阅了 purchase_rejected 的角色成员 + 项目相关人员
    const subscribedIds = await getUserIdsByNotificationType('purchase_rejected');
    const projectUserIds = await getProjectRelatedUserIds(rows[0].project_id);
    const allNotifyIds = new Set([rows[0].applicant_id, ...subscribedIds, ...projectUserIds]);
    for (const uid of allNotifyIds) {
      if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
        const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
        await sendPurchaseNotification({
          userId: uid, userName: emp[0]?.name || '',
          title: '报销单被驳回',
          content: `您的报销单（项目：${rows[0].project_name}）被财务驳回${reason ? '：' + reason : ''}，请重新上传`,
          type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
        });
      }
    }

    res.json({ message: '已驳回' });
  } catch (err) {
    console.error('purchase-requests finance-reject error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// POST /api/purchase-requests/:id/finance-accept — 财务受理（输入金额，进入受理中）
app.post('/api/purchase-requests/:id/finance-accept', async (req, res) => {
  try {
    const { userId, userName } = await getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const perms = await getUserPermissions(userId);
    if (!perms.includes('purchase:finance') && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无财务确认权限' });
    }

    const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
    if (rows[0].status !== 'reimbursing') return res.status(400).json({ error: '状态不允许财务受理' });

    const { actual_amount = 0, financial_notes = '' } = req.body;
    const amount = req.body.finance_amount ?? actual_amount;

    // 更新报销记录
    await pool.query(
      `UPDATE purchase_reimbursements SET actual_amount=?, financial_notes=?, confirmed_by=?, confirmed_by_name=?, confirmed_at=NOW() WHERE request_id=?`,
      [amount, financial_notes, userId, userName, req.params.id]
    );

    // 更新申请状态为财务受理中
    await pool.query(`UPDATE purchase_requests SET status='finance_confirmed', actual_amount=?, updated_at=NOW() WHERE id=?`, [amount, req.params.id]);

    await addLog(userId, '', '财务受理', '采购管理', req.params.id, rows[0].project_name || '', `财务受理报销申请，实付：${amount}`, req.ip);

    // 通知申请人 + 订阅了 purchase_finance_confirmed 的角色成员 + 项目相关人员
    const subscribedIds = await getUserIdsByNotificationType('purchase_finance_confirmed');
    const projectUserIds = await getProjectRelatedUserIds(rows[0].project_id);
    const allNotifyIds = new Set([rows[0].applicant_id, ...subscribedIds, ...projectUserIds]);
    for (const uid of allNotifyIds) {
      if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
        const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
        await sendPurchaseNotification({
          userId: uid, userName: emp[0]?.name || '',
          title: '采购报销已受理',
          content: `采购申请（项目：${rows[0].project_name}）已受理，等待上传报销回执`,
          type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
        });
      }
    }

    res.json({ message: '财务受理成功' });
  } catch (err) {
    console.error('purchase-requests finance-accept error:', err);
    res.status(500).json({ error: '受理失败' });
  }
});

// POST /api/purchase-requests/:id/finance-confirm — 财务最终确认（上传回执，完结）
app.post('/api/purchase-requests/:id/finance-confirm', async (req, res) => {
  try {
    const { userId, userName } = await getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const perms = await getUserPermissions(userId);
    if (!perms.includes('purchase:finance') && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无财务确认权限' });
    }

    const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
    if (rows[0].status !== 'finance_confirmed') return res.status(400).json({ error: '状态不允许财务确认' });

    const { images = '' } = req.body;

    // 更新报销回执图片
    await pool.query(
      `UPDATE purchase_requests SET status='reimbursed', finance_images=?, updated_at=NOW() WHERE id=?`,
      [images, req.params.id]
    );

    await addLog(userId, '', '财务确认', '采购管理', req.params.id, rows[0].project_name || '', `财务确认报销完成，回执图片已上传`, req.ip);

    // 通知申请人 + 原审核人 + 订阅了 purchase_reimbursed 的角色成员 + 项目相关人员
    const subscribedIds = await getUserIdsByNotificationType('purchase_reimbursed');
    const projectUserIds = await getProjectRelatedUserIds(rows[0].project_id);
    const notifyIds = new Set([rows[0].applicant_id, ...await getUserIdsByPermission('purchase:approve'), ...subscribedIds, ...projectUserIds]);
    for (const uid of notifyIds) {
      if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
        const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
        await sendPurchaseNotification({
          userId: uid, userName: emp[0]?.name || '',
          title: '采购已报销完成',
          content: `采购申请（项目：${rows[0].project_name}）已报销完成，实付金额：${rows[0].actual_amount}`,
          type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
        });
      }
    }

    res.json({ message: '财务确认完成' });
  } catch (err) {
    console.error('purchase-requests finance-confirm error:', err);
    res.status(500).json({ error: '确认失败' });
  }
});

// POST /api/purchase-requests/:id/resubmit — 重新提交（驳回后）
app.post('/api/purchase-requests/:id/resubmit', async (req, res) => {
  try {
    const { userId, userName } = await getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const [rows] = await pool.query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '申请不存在' });
    if (rows[0].applicant_id !== userId) return res.status(403).json({ error: '只能重新提交自己的申请' });
    if (rows[0].status !== 'rejected') return res.status(400).json({ error: '只能重新提交被拒绝的申请' });

    await pool.query(`UPDATE purchase_requests SET status='pending', rejection_reason='', updated_at=NOW() WHERE id=?`, [req.params.id]);

    // 通知有 purchase:approve 权限的人 + 项目相关人员
    const approverIds = await getUserIdsByPermission('purchase:approve');
    const projectUserIds = await getProjectRelatedUserIds(rows[0].project_id);
    const allResubmitIds = [...new Set([...approverIds, ...projectUserIds])];
    for (const uid of allResubmitIds) {
      if (true) { // B3 fix: 不再排除操作人自己 (业务上不会自审自付; admin 测自己也想看通知)
        const [emp] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
        await sendPurchaseNotification({
          userId: uid, userName: emp[0]?.name || '',
          title: '采购申请重新提交',
          content: `${userName} 重新提交了采购申请，项目：${rows[0].project_name || ''}，金额：${rows[0].total_amount}`,
          type: '采购', relatedId: parseInt(req.params.id), relatedType: 'purchase_request'
        });
      }
    }

    res.json({ message: '重新提交成功' });
  } catch (err) {
    console.error('purchase-requests resubmit error:', err);
    res.status(500).json({ error: '重新提交失败' });
  }
});

app.get('/api/reports', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM reports ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/reports', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { title, content, report_type, reporter_id, reporter_name, status } = req.body;
  const stmt = db.prepare('INSERT INTO reports (title, content, report_type, reporter_id, reporter_name, status) VALUES (?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(title, content, report_type, reporter_id, reporter_name, status || '待审核');
  await addLog(userId, '', '新增', '汇报管理', result.lastInsertRowid, title, `汇报标题: ${title}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/reports/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { title, content, report_type, status, reviewer_id, reviewer_name, review_time } = req.body;
  const stmt = db.prepare('UPDATE reports SET title=?, content=?, report_type=?, status=?, reviewer_id=?, reviewer_name=?, review_time=? WHERE id=?');
  await stmt.run(title, content, report_type, status, reviewer_id, reviewer_name, review_time, req.params.id);
  await addLog(userId, '', '编辑', '汇报管理', req.params.id, title, `更新汇报: ${title}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/reports/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [r] = await db.prepare('SELECT title FROM reports WHERE id = ?').all(req.params.id);
  const rTitle = r ? r.title : req.params.id;
  const stmt = db.prepare('DELETE FROM reports WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '汇报管理', req.params.id, rTitle, `删除汇报: ${rTitle}`, req.ip);
  res.json({ message: '删除成功' });
});

app.get('/api/notices', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM notices ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/notices', checkPermission('notice:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { title, content, type, publisher_id, publisher_name, status, publish_time } = req.body;
  const stmt = db.prepare('INSERT INTO notices (title, content, type, publisher_id, publisher_name, status, publish_time) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(title, content, type, publisher_id, publisher_name, status || '草稿', publish_time);
  await addLog(userId, '', '新增', '公告管理', result.lastInsertRowid, title, `公告标题: ${title}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/notices/:id', checkPermission('notice:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { title, content, type, status, publish_time } = req.body;
  const stmt = db.prepare('UPDATE notices SET title=?, content=?, type=?, status=?, publish_time=? WHERE id=?');
  await stmt.run(title, content, type, status, publish_time, req.params.id);
  await addLog(userId, '', '编辑', '公告管理', req.params.id, title, `更新公告: ${title}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/notices/:id', checkPermission('notice:delete'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [n] = await db.prepare('SELECT title FROM notices WHERE id = ?').all(req.params.id);
  const nTitle = n ? n.title : req.params.id;
  const stmt = db.prepare('DELETE FROM notices WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '公告管理', req.params.id, nTitle, `删除公告: ${nTitle}`, req.ip);
  res.json({ message: '删除成功' });
});

app.get('/api/inspections', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const { project_id } = req.query;

  // 业主端：x-user-id 是 customers.id / family_members.id，不在 employees 表，
  // 走下面员工 RBAC 必然 403。业主只看自己名下项目的巡检记录。
  const customer = await permCore.resolveCustomerIdentity(userId, req.headers['x-user-type']);
  if (customer) {
    const myIds = await permCore.customerProjectIds(customer);
    if (project_id) {
      if (!myIds.has(Number(project_id))) {
        return res.status(403).json({ error: '该项目不在您的名下' });
      }
      const [rows] = await pool.query(
        `SELECT * FROM inspections WHERE project_id = ? ORDER BY created_at DESC`,
        [project_id]
      );
      return res.json(rows);
    }
    const ids = Array.from(myIds);
    if (!ids.length) return res.json([]);
    const [rows] = await pool.query(
      `SELECT * FROM inspections WHERE project_id IN (?) ORDER BY created_at DESC`,
      [ids]
    );
    return res.json(rows);
  }

  const scope = await buildProjectScopeClause(userId, 'inspection', '', 'project_id');
  // 即使传了 project_id，仍校验它在可见集内
  if (project_id) {
    const ids = Array.from(await permCore.relatedProjectIds(userId));
    const admin = await permCore.canReadAll(userId, 'inspection');
    if (!admin && !ids.includes(Number(project_id))) return res.status(403).json({ error: '该项目不在可见范围内' });
    const [rows] = await pool.query(
      `SELECT * FROM inspections WHERE project_id = ? ORDER BY created_at DESC`,
      [project_id]
    );
    return res.json(rows);
  }
  const [rows] = await pool.query(
    `SELECT * FROM inspections WHERE 1=1${scope.sql} ORDER BY created_at DESC`,
    scope.params
  );
  res.json(rows);
});

app.post('/api/inspections', checkPermission('inspection:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
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

app.put('/api/inspections/:id', checkPermission('inspection:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];

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
app.delete('/api/inspections/:id', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';

  const [insp] = await db.prepare('SELECT * FROM inspections WHERE id = ?').all(req.params.id);
  if (!insp) return res.status(404).json({ error: '巡检记录不存在' });

  // 检查权限：创建者本人或管理员可以删除
  if (insp.creator_id !== userId && !userIsAdmin) {
    return res.status(403).json({ error: '无权删除他人的巡检' });
  }

  await db.prepare('DELETE FROM inspections WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 获取我的巡检（当前用户创建的所有整改问题）
app.get('/api/my/inspections', async (req, res) => {
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

app.delete('/api/inspections/:id', checkPermission('inspection:delete'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
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

// ===== 验收管理（工长类模块：权限粒度与「施工日志 / 巡检」一致）=====
// 说明：GET 暂不强制 checkPermission（与 /api/inspections 现状保持一致），仅要求登录；
//       支持 project_id / status / mine 过滤，并 JOIN 出创建人姓名。
//       服务端强制校验将在权限体系 P2 阶段统一补齐。
// ==================== 验收管理（v2.3.1 P2：严格按动作 + 三档可见性） ====================

// 列表：登录即需；可见性 = read_all(全部) / read(关联项目 + 自己提交) / 无权限→403
app.get('/api/acceptance', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    // 业主端：x-user-id 是 customers.id / family_members.id，不在 employees 表，
    // 走员工 RBAC 会得到 visibleScope='none' 直接 403。业主只看自己名下项目的验收。
    const customer = await permCore.resolveCustomerIdentity(userId, req.headers['x-user-type']);
    let scope;
    if (customer) {
      scope = 'customer';
    } else {
      scope = await permCore.visibleScope(userId, 'acceptance');
      if (scope === 'none') return res.status(403).json({ error: '无权限查看验收' });
    }
    const { project_id, status, mine } = req.query;
    const where = [];
    const params = [];
    if (project_id) {
      if (scope === 'customer') {
        const myIds = await permCore.customerProjectIds(customer);
        if (!myIds.has(Number(project_id))) {
          return res.status(403).json({ error: '该项目不在您的名下' });
        }
      }
      where.push('a.project_id = ?');
      params.push(project_id);
    }
    if (status) { where.push('a.accept_status = ?'); params.push(status); }
    if (String(mine) === '1') { where.push('a.creator_id = ?'); params.push(userId); }
    if (scope === 'related') {
      // 仅关联项目 + 我提交的
      const rel = await permCore.relatedProjectIds(userId);
      if (!rel.size) {
        where.push('(a.project_id IN (?) OR a.creator_id = ?)');
        // 占位（IN 0 用 -1 兼容空集）
        params.push([-1], userId);
      } else {
        where.push('(a.project_id IN (?) OR a.creator_id = ?)');
        params.push(Array.from(rel), userId);
      }
    } else if (scope === 'customer') {
      // 业主：只看自己名下项目
      const ids = Array.from(await permCore.customerProjectIds(customer));
      if (!ids.length) return res.json([]);
      where.push('a.project_id IN (?)');
      params.push(ids);
    }
    const sql = `SELECT a.*, e.name AS creator_name
                 FROM acceptance a
                 LEFT JOIN employees e ON e.id = a.creator_id
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY a.created_at DESC, a.id DESC`;
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('acceptance list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 详情：登录 + (read_all OR 关联项目 OR 我提交) 才允许
app.get('/api/acceptance/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const [rows] = await pool.query(
      `SELECT a.*, e.name AS creator_name
       FROM acceptance a
       LEFT JOIN employees e ON e.id = a.creator_id
       WHERE a.id = ?`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '验收记录不存在' });
    const a = rows[0];
    const scope = await permCore.visibleScope(userId, 'acceptance');
    if (scope === 'none') return res.status(403).json({ error: '无权限查看' });
    if (scope === 'related') {
      const rel = await permCore.relatedProjectIds(userId);
      const ok = (a.project_id && rel.has(a.project_id)) || a.creator_id === userId;
      if (!ok) return res.status(403).json({ error: '无权限查看该验收记录' });
    }
    res.json(a);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/acceptance', checkPermission('acceptance:write'), async (req, res) => {
  const userId = getUserId(req);
  const { project_id, project_name, stage, accept_status, accept_date, quality_score, issues, attachment } = req.body;
  // 写权限校验：要求 acceptance:write；项目必须在我可见范围内（read_all OR 关联 OR 是创建人）
  if (!project_id) return res.status(400).json({ error: '缺少 project_id' });
  const scope = await permCore.visibleScope(userId, 'project');
  if (scope === 'none') return res.status(403).json({ error: '无项目可见权限' });
  if (scope === 'related') {
    const rel = await permCore.relatedProjectIds(userId);
    if (!rel.has(Number(project_id))) return res.status(403).json({ error: '仅可对关联项目提交验收' });
  }
  // 归一化附件：数组 -> JSON 字符串（只 stringify 一次，避免双重编码）
  const attachmentVal = Array.isArray(attachment) ? JSON.stringify(attachment) : (attachment ?? null);
  const stmt = db.prepare('INSERT INTO acceptance (project_id, project_name, stage, accept_status, accept_date, quality_score, issues, attachment, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
  const result = await stmt.run(project_id, project_name, stage, accept_status || '待验收', accept_date, quality_score ?? null, issues, attachmentVal, userId);
  await addLog(userId, '', '新增', '验收管理', result.lastInsertRowid, project_name, `项目: ${project_name}`, req.ip);
  notifyProject('acceptance_submit', project_id,
    `验收提交：${project_name}`,
    `项目「${project_name}」验收已提交，阶段：${stage || ''}，状态：${accept_status || '待验收'}。`,
    result.lastInsertRowid, 'acceptance'
  ).catch(console.error);
  res.json({ code: 0, id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/acceptance/:id', checkPermission('acceptance:write'), async (req, res) => {
  const userId = getUserId(req);
  const { stage, accept_status, accept_date, quality_score, issues, attachment } = req.body;
  // 权限检查
  const [existing] = await db.prepare('SELECT project_id, project_name, creator_id, accept_status FROM acceptance WHERE id = ?').all(req.params.id);
  if (!existing) return res.status(404).json({ error: '验收记录不存在' });
  if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
  const aName = existing.project_name;
  // 动态字段更新：只更新传入的字段，避免 undefined 覆盖
  const fields = [];
  const params = [];
  if (stage !== undefined) { fields.push('stage=?'); params.push(stage); }
  if (accept_status !== undefined) { fields.push('accept_status=?'); params.push(accept_status); }
  if (accept_date !== undefined) { fields.push('accept_date=?'); params.push(accept_date); }
  if (quality_score !== undefined) { fields.push('quality_score=?'); params.push(quality_score); }
  if (issues !== undefined) { fields.push('issues=?'); params.push(issues); }
  if (attachment !== undefined) {
    fields.push('attachment=?');
    params.push(Array.isArray(attachment) ? JSON.stringify(attachment) : attachment);
  }
  if (!fields.length) return res.json({ code: 0, message: '无更新内容' });
  params.push(req.params.id);
  await pool.query(`UPDATE acceptance SET ${fields.join(', ')} WHERE id=?`, params);
  await addLog(userId, '', '编辑', '验收管理', req.params.id, aName, `更新验收: ${aName}`, req.ip);
  if (accept_status !== undefined && existing.accept_status !== accept_status) {
    notifyProject('acceptance_submit', existing.project_id,
      `验收状态变更：${aName}`,
      `验收「${aName}」状态已变更为「${accept_status}」，请知悉。`,
      parseInt(req.params.id), 'acceptance'
    ).catch(console.error);
  }
  res.json({ code: 0, message: '更新成功' });
});

app.delete('/api/acceptance/:id', checkPermission('acceptance:delete'), async (req, res) => {
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

// ==================== 主材验收（v2.4.1）====================
// 业务：工长在材料进场时逐项验收（对不对版 / 数量 / 外观 / 资料），
//   记录可追溯，不合格可作为退换货依据。
// 表：material_acceptances（主单）+ material_acceptance_items（材料明细）
// 权限：material_acceptance:read / read_all / write / delete
// 可见范围与 acceptance 同口径：业主看名下项目，员工按 visibleScope（all / related）

/** 生成验收单号：MA + yyyyMMdd + 3 位当天序号 */
async function genMaterialAcceptNo(runner) {
  const q = runner || pool;
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const prefix = 'MA' + ymd;
  const [rows] = await q.query(
    'SELECT accept_no FROM material_acceptances WHERE accept_no LIKE ? ORDER BY accept_no DESC LIMIT 1',
    [prefix + '%']
  );
  let seq = 1;
  if (rows && rows[0] && rows[0].accept_no) {
    const tail = String(rows[0].accept_no).slice(prefix.length);
    seq = (parseInt(tail, 10) || 0) + 1;
  }
  return prefix + String(seq).padStart(3, '0');
}

/** 写一条材料明细（POST / PUT 共用） */
async function insertMaterialAcceptItems(conn, acceptId, items) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    await conn.query(
      `INSERT INTO material_acceptance_items
       (accept_id, material_id, material_name, spec, brand, unit, plan_qty, actual_qty, verdict, problem_tags, remark, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        acceptId,
        it.material_id || null,
        it.material_name || '',
        it.spec || '',
        it.brand || '',
        it.unit || '',
        it.plan_qty === '' || it.plan_qty == null ? null : Number(it.plan_qty),
        it.actual_qty === '' || it.actual_qty == null ? null : Number(it.actual_qty),
        it.verdict || '合格',
        JSON.stringify(Array.isArray(it.problem_tags) ? it.problem_tags : []),
        it.remark || '',
        i,
      ]
    );
  }
}

/** 统计合格/不合格项数（列表页直接展示"3 项中 1 项不合格"） */
function countMaterialAcceptVerdicts(items = []) {
  let pass = 0, fail = 0;
  for (const it of items) {
    if (!it) continue;
    if (it.verdict === '合格') pass++;
    else if (it.verdict === '不合格') fail++;
  }
  return { item_count: items.length, pass_count: pass, fail_count: fail };
}

// 新增页所需的项目元信息：项目名 + 工长 + 项目关联员工（验收人可选）+ 供应商候选
// ⚠️ 必须注册在 /:id 之前，否则 'meta' 会被当成 id
app.get('/api/material-acceptances/meta', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const projectId = Number(req.query.project_id);
    if (!projectId) return res.status(400).json({ error: '缺少 project_id' });
    const [prows] = await pool.query(
      `SELECT p.id, p.name, p.foreman_id, p.manager_id, p.designer_id, p.supervisor_id, p.creator_id,
              f.name AS foreman_name, c.name AS customer
       FROM projects p
       LEFT JOIN employees f ON f.id = p.foreman_id
       LEFT JOIN customers c ON c.id = p.customer_id
       WHERE p.id = ? LIMIT 1`,
      [projectId]
    );
    const p = prows && prows[0];
    if (!p) return res.status(404).json({ error: '项目不存在' });
    // 项目关联员工（验收人下拉）：工长 / 项目经理 / 设计师 / 监理 / 创建人
    const ids = [...new Set([p.foreman_id, p.manager_id, p.designer_id, p.supervisor_id, p.creator_id].filter(Boolean))];
    let staff = [];
    if (ids.length) {
      const [rows] = await pool.query(
        `SELECT id, name, position FROM employees WHERE id IN (?) AND (status IS NULL OR status <> '离职') ORDER BY FIELD(id, ?)`,
        [ids, ids]
      );
      staff = rows;
    }
    // 供应商候选（外部联系人里 category=supplier 或 role 含供应商的，取前 200 个）
    let suppliers = [];
    try {
      const [rows] = await pool.query(
        `SELECT id, name FROM external_contacts
         WHERE is_active IS NULL OR is_active = 1
         ORDER BY id DESC LIMIT 200`
      );
      suppliers = rows;
    } catch (_) { suppliers = []; }
    res.json({
      project_name: p.name,
      customer: p.customer || '',
      foreman_id: p.foreman_id || null,
      foreman_name: p.foreman_name || '',
      staff,
      suppliers,
    });
  } catch (err) {
    console.error('material-acceptance meta error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 材料选择器用的轻量搜索（登录即可，不要求 purchase:read_all ——
// 工长是普通员工角色，走 /api/main-materials 会被 hasReadAllPermission 挡成空列表）
app.get('/api/material-acceptances/material-search', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const kw = String(req.query.keyword || '').trim();
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    // main_materials 的实际列名是 specification / quote_unit / purchase_unit，没有 spec / unit，
    // 这里直接起别名对齐前端，避免每个端各写一套取值逻辑
    let sql = `SELECT id, name, specification AS spec, model, brand,
                      COALESCE(NULLIF(purchase_unit, ''), quote_unit) AS unit, category
               FROM main_materials`;
    const params = [];
    if (kw) {
      sql += ' WHERE (name LIKE ? OR code LIKE ? OR brand LIKE ? OR model LIKE ?)';
      const k = `%${kw}%`;
      params.push(k, k, k, k);
    }
    sql += ' ORDER BY sort_order ASC, id ASC LIMIT ?';
    params.push(limit);
    const [rows] = await pool.query(sql, params);
    res.json({ list: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/material-acceptances', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const customer = await permCore.resolveCustomerIdentity(userId, req.headers['x-user-type']);
    let scope;
    if (customer) {
      scope = 'customer';
    } else {
      scope = await permCore.visibleScope(userId, 'material_acceptance');
      if (scope === 'none') return res.status(403).json({ error: '无权限查看材料验收' });
    }
    const { project_id, result, keyword, page, limit } = req.query;
    const where = [];
    const params = [];
    if (project_id) {
      if (scope === 'customer') {
        const myIds = await permCore.customerProjectIds(customer);
        if (!myIds.has(Number(project_id))) return res.status(403).json({ error: '该项目不在您的名下' });
      }
      where.push('a.project_id = ?');
      params.push(project_id);
    }
    if (result) { where.push('a.result = ?'); params.push(result); }
    if (keyword) {
      where.push('(a.accept_no LIKE ? OR a.project_name LIKE ? OR a.supplier_name LIKE ?)');
      const k = `%${keyword}%`;
      params.push(k, k, k);
    }
    if (scope === 'related') {
      const rel = await permCore.relatedProjectIds(userId);
      where.push('(a.project_id IN (?) OR a.creator_id = ?)');
      params.push(rel.size ? Array.from(rel) : [-1], userId);
    } else if (scope === 'customer') {
      const ids = Array.from(await permCore.customerProjectIds(customer));
      if (!ids.length) return res.json({ list: [], total: 0 });
      where.push('a.project_id IN (?)');
      params.push(ids);
    }
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [cntRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM material_acceptances a ${whereSql}`, params
    );
    const total = (cntRows && cntRows[0] && cntRows[0].total) || 0;
    const [rows] = await pool.query(
      `SELECT a.*, e.name AS creator_name,
              COALESCE(NULLIF(a.project_name, ''), p.name) AS project_name_display
       FROM material_acceptances a
       LEFT JOIN employees e ON e.id = a.creator_id
       LEFT JOIN projects p ON p.id = a.project_id
       ${whereSql}
       ORDER BY a.accept_date DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (pageNum - 1) * pageSize]
    );
    res.json({ list: rows, total });
  } catch (err) {
    console.error('material-acceptance list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/material-acceptances/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const [rows] = await pool.query(
      `SELECT a.*, e.name AS creator_name,
              COALESCE(NULLIF(a.project_name, ''), p.name) AS project_name_display
       FROM material_acceptances a
       LEFT JOIN employees e ON e.id = a.creator_id
       LEFT JOIN projects p ON p.id = a.project_id
       WHERE a.id = ?`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: '材料验收记录不存在' });
    const a = rows[0];
    const customer = await permCore.resolveCustomerIdentity(userId, req.headers['x-user-type']);
    const scope = customer ? 'customer' : await permCore.visibleScope(userId, 'material_acceptance');
    if (scope === 'none') return res.status(403).json({ error: '无权限查看' });
    if (scope === 'related') {
      const rel = await permCore.relatedProjectIds(userId);
      const ok = (a.project_id && rel.has(a.project_id)) || a.creator_id === userId;
      if (!ok) return res.status(403).json({ error: '无权限查看该记录' });
    }
    if (scope === 'customer') {
      const ids = await permCore.customerProjectIds(customer);
      if (!a.project_id || !ids.has(a.project_id)) return res.status(403).json({ error: '无权限查看该记录' });
    }
    const [items] = await pool.query(
      'SELECT * FROM material_acceptance_items WHERE accept_id = ? ORDER BY sort_order ASC, id ASC',
      [a.id]
    );
    res.json({ ...a, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/material-acceptances', checkPermission('material_acceptance:write'), async (req, res) => {
  const userId = getUserId(req);
  const b = req.body || {};
  if (!b.project_id) return res.status(400).json({ error: '缺少 project_id' });
  const items = Array.isArray(b.items) ? b.items.filter((x) => x && (x.material_name || x.material_id)) : [];
  if (!items.length) return res.status(400).json({ error: '请至少添加一项验收材料' });
  // 项目可见范围校验（同 acceptance：related 只能对自己关联的项目提交）
  const scope = await permCore.visibleScope(userId, 'project');
  if (scope === 'none') return res.status(403).json({ error: '无项目可见权限' });
  if (scope === 'related') {
    const rel = await permCore.relatedProjectIds(userId);
    if (!rel.has(Number(b.project_id))) return res.status(403).json({ error: '仅可对关联项目提交材料验收' });
  }
  // 项目名兜底：前端没传就按 project_id 反查（快照字段不能指望前端）
  let projectName = b.project_name || '';
  let foremanName = b.foreman_name || '';
  if (!projectName || !foremanName) {
    const [prows] = await pool.query(
      `SELECT p.name, f.name AS foreman_name FROM projects p
       LEFT JOIN employees f ON f.id = p.foreman_id WHERE p.id = ? LIMIT 1`,
      [b.project_id]
    );
    const prow = prows && prows[0];
    if (prow) {
      if (!projectName) projectName = prow.name || '';
      if (!foremanName) foremanName = prow.foreman_name || '';
    }
  }
  const stat = countMaterialAcceptVerdicts(items);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const acceptNo = await genMaterialAcceptNo(conn);
    const [r1] = await conn.query(
      `INSERT INTO material_acceptances
       (accept_no, project_id, project_name, accept_date, stage, foreman_id, foreman_name,
        supplier_id, supplier_name, delivery_no, docs, storage, result, handling,
        item_count, pass_count, fail_count, photos, remark, creator_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        acceptNo, b.project_id, projectName, b.accept_date || '', b.stage || '',
        b.foreman_id || null, foremanName,
        b.supplier_id || null, b.supplier_name || '', b.delivery_no || '',
        JSON.stringify(Array.isArray(b.docs) ? b.docs : []),
        b.storage || '', b.result || '', b.handling || '',
        stat.item_count, stat.pass_count, stat.fail_count,
        JSON.stringify(Array.isArray(b.photos) ? b.photos : []),
        b.remark || '', userId,
      ]
    );
    const acceptId = r1.insertId;
    await insertMaterialAcceptItems(conn, acceptId, items);
    await conn.commit();
    await addLog(userId, '', '新增', '主材验收', acceptId, projectName,
      `主材验收提交：${projectName}（${acceptNo}，${stat.item_count} 项，不合格 ${stat.fail_count} 项）`, req.ip);
    notifyProject('material_acceptance_submit', b.project_id,
      `材料验收：${projectName}`,
      `项目「${projectName}」提报材料进场验收 ${acceptNo}，共 ${stat.item_count} 项，合格 ${stat.pass_count} 项、不合格 ${stat.fail_count} 项，结论：${b.result || '未填'}。`,
      acceptId, 'material_acceptance'
    ).catch(console.error);
    res.json({ code: 0, id: acceptId, accept_no: acceptNo, message: '提交成功' });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    console.error('material-acceptance create error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

app.put('/api/material-acceptances/:id', checkPermission('material_acceptance:write'), async (req, res) => {
  const userId = getUserId(req);
  const b = req.body || {};
  const [existRows] = await pool.query(
    'SELECT id, project_id, project_name, creator_id FROM material_acceptances WHERE id = ? LIMIT 1',
    [req.params.id]
  );
  if (!existRows[0]) return res.status(404).json({ error: '记录不存在' });
  const existing = existRows[0];
  if (existing.creator_id !== userId && !(await isAdmin(userId))) {
    return res.status(403).json({ error: '无权修改他人的数据' });
  }
  const items = Array.isArray(b.items) ? b.items.filter((x) => x && (x.material_name || x.material_id)) : null;
  const stat = items ? countMaterialAcceptVerdicts(items) : null;
  const fields = [];
  const params = [];
  const setField = (col, val) => { if (val !== undefined) { fields.push(`${col}=?`); params.push(val); } };
  setField('accept_date', b.accept_date);
  setField('stage', b.stage);
  setField('foreman_id', b.foreman_id);
  setField('foreman_name', b.foreman_name);
  setField('supplier_id', b.supplier_id);
  setField('supplier_name', b.supplier_name);
  setField('delivery_no', b.delivery_no);
  setField('storage', b.storage);
  setField('result', b.result);
  setField('handling', b.handling);
  setField('remark', b.remark);
  if (b.docs !== undefined) { fields.push('docs=?'); params.push(JSON.stringify(Array.isArray(b.docs) ? b.docs : [])); }
  if (b.photos !== undefined) { fields.push('photos=?'); params.push(JSON.stringify(Array.isArray(b.photos) ? b.photos : [])); }
  if (stat) {
    fields.push('item_count=?', 'pass_count=?', 'fail_count=?');
    params.push(stat.item_count, stat.pass_count, stat.fail_count);
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (fields.length) {
      params.push(req.params.id);
      await conn.query(`UPDATE material_acceptances SET ${fields.join(', ')}, updated_at=NOW() WHERE id=?`, params);
    }
    if (items) {
      await conn.query('DELETE FROM material_acceptance_items WHERE accept_id = ?', [req.params.id]);
      await insertMaterialAcceptItems(conn, Number(req.params.id), items);
    }
    await conn.commit();
    await addLog(userId, '', '编辑', '主材验收', req.params.id, existing.project_name,
      `更新主材验收：${existing.project_name}`, req.ip);
    res.json({ code: 0, message: '更新成功' });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    console.error('material-acceptance update error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

app.delete('/api/material-acceptances/:id', checkPermission('material_acceptance:delete'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const [rows] = await pool.query(
      'SELECT project_name, creator_id FROM material_acceptances WHERE id = ? LIMIT 1', [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: '记录不存在' });
    const a = rows[0];
    if (a.creator_id !== userId && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无权删除他人的数据' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM material_acceptance_items WHERE accept_id = ?', [req.params.id]);
      await conn.query('DELETE FROM material_acceptances WHERE id = ?', [req.params.id]);
      await conn.commit();
    } catch (e) {
      try { await conn.rollback(); } catch (_) {}
      throw e;
    } finally {
      conn.release();
    }
    await addLog(userId, '', '删除', '主材验收', req.params.id, a.project_name,
      `删除主材验收：${a.project_name}`, req.ip);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 派工管理 ====================
app.get('/api/dispatches', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { status, project_id } = req.query;
    // P2 §7.3：派工列表按关联项目 + 提交人(申请单) 收窄
    const scope = await buildProjectScopeOrSelfClause(userId, 'dispatch', 'd', 'project_id', 'applicant_id');
    let sql = `SELECT d.*, e.name as applicant_name FROM dispatches d LEFT JOIN employees e ON d.applicant_id = e.id`;
    const params = [];
    const conditions = [];
    if (status) {
      conditions.push('d.status = ?');
      params.push(status);
    }
    if (project_id) {
      conditions.push('d.project_id = ?');
      params.push(project_id);
    }
    // 把 §7.3 条件拼到 WHERE（去掉前缀的 AND，改为直接用 conditions 串接）
    if (scope.sql) {
      conditions.push(scope.sql.replace(/^ AND/, ''));
      params.push(...scope.params);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY d.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('dispatches list error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

app.post('/api/dispatches', checkPermission('dispatch:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { project_id, project_name, content, location, worker, fee, start_date, requirement } = req.body;
    const [result] = await pool.query(
      'INSERT INTO dispatches (project_id, project_name, content, location, worker, fee, start_date, requirement, status, applicant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [project_id, project_name || '', content, location || '', worker || '', fee || '', start_date || null, requirement || '', 'pending', userId || 0]
    );
    await addLog(userId, '', '新增', '派工管理', result.insertId, content, `派工内容: ${content}`, req.ip);
    // 2026-10-12：审核提交类 → 通知派工审批人 + 提交人 + 项目经理（不再广播全部关联人/客户）
    notifyReviewSubmitted('dispatch_created', project_id,
      `新派工通知：${content}`,
      `派工内容：${content || ''}，工人：${worker || ''}，项目：${project_name || ''}，请及时处理。`,
      result.insertId, 'dispatch', userId, ['dispatch:approve']
    ).catch(console.error);
    res.json({ id: result.insertId, message: '添加成功' });
  } catch (err) {
    console.error('dispatches create error:', err);
    res.status(500).json({ error: '添加失败' });
  }
});

// GET /api/dispatches/my — 我的派工单
app.get('/api/dispatches/my', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { page = 1, page_size = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    const [rows] = await pool.query('SELECT d.*, e.name as applicant_name FROM dispatches d LEFT JOIN employees e ON d.applicant_id = e.id WHERE d.applicant_id = ? ORDER BY d.created_at DESC LIMIT ? OFFSET ?', [userId, parseInt(page_size), offset]);
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM dispatches WHERE applicant_id = ?', [userId]);
    res.json({ list: rows, total });
  } catch (err) {
    console.error('dispatches my error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// GET /api/dispatches/pending — 待审核派工单（需 dispatch:approve 权限）
app.get('/api/dispatches/pending', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await getUserPermissions(userId);
    if (!perms.includes('dispatch:approve') && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无审核权限' });
    }
    const { page = 1, page_size = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    const [rows] = await pool.query('SELECT d.*, e.name as applicant_name FROM dispatches d LEFT JOIN employees e ON d.applicant_id = e.id WHERE d.status = ? ORDER BY d.created_at DESC LIMIT ? OFFSET ?', ['pending', parseInt(page_size), offset]);
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM dispatches WHERE status = ?', ['pending']);
    res.json({ list: rows, total });
  } catch (err) {
    console.error('dispatches pending error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// PUT /api/dispatches/:id/approve — 审核通过/驳回
app.put('/api/dispatches/:id/approve', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await getUserPermissions(userId);
    if (!perms.includes('dispatch:approve') && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无审核权限' });
    }
    const [[record]] = await pool.query('SELECT * FROM dispatches WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: '派工单不存在' });
    const { action, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await pool.query('UPDATE dispatches SET status=?, updated_at=NOW() WHERE id=?', [newStatus, req.params.id]);

    // 审核通过 → 自动在 payment_records 插入待确认支出记录
    // v2.3.12 修：加幂等保护。此前同一派工单被重复点「审核通过」（前端连点/重试）会插多条
    // 收支记录，柏林山水派工 #7 就因此重复入账 2 条 200 元。改为先查是否已有记录再插。
    if (action === 'approve' && record.fee && parseFloat(record.fee) > 0) {
      const [[exist]] = await pool.query(
        "SELECT id FROM payment_records WHERE source_id = ? AND category = 'dispatch' LIMIT 1",
        [req.params.id]
      );
      if (!exist) {
        await pool.query(
          `INSERT INTO payment_records (project_id, type, category, amount, source_id, status, created_by, created_at)
           VALUES (?, 'expense', 'dispatch', ?, ?, 'pending', ?, NOW())`,
          [record.project_id, record.fee, req.params.id, userId]
        );
      }
    }

    await addLog(userId, '', action === 'approve' ? '审核通过' : '审核拒绝', '派工管理', req.params.id, record.content || '', `派工审核${action === 'approve' ? '通过' : '拒绝'}${reason ? '，原因：' + reason : ''}`, req.ip);
    const allNotifyIds = new Set([record.applicant_id]);
    for (const uid of allNotifyIds) {
      if (uid && uid !== userId) {
        const [[emp]] = await pool.query('SELECT name FROM employees WHERE id = ?', [uid]);
        const msg = action === 'approve'
          ? `您的派工申请（项目：${record.project_name}）已审核通过，请准备施工。`
          : `您的派工申请（项目：${record.project_name}）未通过${reason ? '：' + reason : ''}，可重新提交。`;
        // v2.3.4 修：用 messages 表（站内通知），不是 notifications 表（外发短信）
        await pool.query(
          'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, \'sent\')',
          [uid, emp ? emp.name : '', action === 'approve' ? '派工申请已通过' : '派工申请未通过', msg, action === 'approve' ? 'dispatch_approved' : 'dispatch_rejected', req.params.id, 'dispatch']
        );
      }
    }
    res.json({ message: action === 'approve' ? '审核通过' : '已拒绝' });
  } catch (err) {
    console.error('dispatches approve error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// PUT /api/dispatches/:id/complete — 确认完工
app.put('/api/dispatches/:id/complete', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const [[record]] = await pool.query('SELECT * FROM dispatches WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: '派工单不存在' });
    await pool.query('UPDATE dispatches SET status=?, updated_at=NOW() WHERE id=?', ['completed', req.params.id]);
    await addLog(userId, '', '确认完工', '派工管理', req.params.id, record.content || '', `派工完工确认`, req.ip);
    res.json({ message: '已确认完工' });
  } catch (err) {
    console.error('dispatches complete error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// POST /api/dispatches/:id/revert — 反审核（2026-10-10 新增）
// 把派工单状态从 approved/rejected/completed 改回 pending（仅限审核员/管理员）
app.post('/api/dispatches/:id/revert', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await getUserPermissions(userId);
    if (!perms.includes('dispatch:approve') && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无审核权限' });
    }
    const [[record]] = await pool.query('SELECT * FROM dispatches WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: '派工单不存在' });
    if (record.status === 'pending') {
      return res.status(400).json({ error: '已经是待审核状态' });
    }
    await pool.query("UPDATE dispatches SET status='pending', updated_at=NOW() WHERE id=?", [req.params.id]);
    // v2.3.12 修：反审核要把该派工产生的「待确认」收支记录一并撤销，
    // 否则重新审核通过时又会插一条，导致重复入账。已确认的记录保留（财务凭证不动）。
    const [revoked] = await pool.query(
      "DELETE FROM payment_records WHERE source_id = ? AND category = 'dispatch' AND status = 'pending'",
      [req.params.id]
    );
    await addLog(userId, '', '反审核', '派工管理', req.params.id, record.content || '', `反审核：派工单从 ${record.status} 改回待审核${revoked.affectedRows ? `，撤销待确认收支 ${revoked.affectedRows} 条` : ''}`, req.ip);
    res.json({ message: '已反审核' });
  } catch (err) {
    console.error('dispatches revert error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

app.put('/api/dispatches/:id', checkPermission('dispatch:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { status, content, location, worker, fee, start_date, requirement } = req.body;
    const [[d]] = await pool.query('SELECT content, status, applicant_id FROM dispatches WHERE id = ?', [req.params.id]);
    const dName = d ? d.content : req.params.id;
    await pool.query('UPDATE dispatches SET status=?, content=?, location=?, worker=?, fee=?, start_date=?, requirement=? WHERE id=?', [status, content, location, worker, fee, start_date, requirement, req.params.id]);
    await addLog(userId, '', '编辑', '派工管理', req.params.id, dName, `更新派工: ${dName}`, req.ip);
    if (d && d.status !== status) {
      // 2026-10-12：审核结果类 → 仅通知派工申请人（谁发起，反馈给谁）
      notifySubmitter('dispatch_status_changed', null,
        `派工状态变更：${dName}`,
        `派工「${dName}」状态已变更为「${status}」，请知悉。`,
        parseInt(req.params.id), 'dispatch', d.applicant_id
      ).catch(console.error);
    }
    res.json({ message: '更新成功' });
  } catch (err) {
    console.error('dispatches update error:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

app.delete('/api/dispatches/:id', checkPermission('dispatch:delete'), async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [[d]] = await pool.query('SELECT content FROM dispatches WHERE id = ?', [req.params.id]);
    const dName = d ? d.content : req.params.id;
    await pool.query('DELETE FROM dispatches WHERE id = ?', [req.params.id]);
    // v2.3.12 修：删除派工单时清掉它产生的收支记录，避免留下找不到来源单据的孤儿记录。
    // 柏林山水派工 #6 被删后，payment_records 里那条 2000 元「派工」支出就一直悬着。
    const [orphan] = await pool.query(
      "DELETE FROM payment_records WHERE source_id = ? AND category = 'dispatch'",
      [req.params.id]
    );
    await addLog(userId, '', '删除', '派工管理', req.params.id, dName, `删除派工: ${dName}${orphan.affectedRows ? `，连带清理收支记录 ${orphan.affectedRows} 条` : ''}`, req.ip);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('dispatches delete error:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// ==================== 项目文件 v2.3.4 ====================
// 业务流程：上传（自动 pending）→ 通知有 approve 权限的人 → 审核 → 通知上传人
// 8 个路由 + 1 个 helper function

// multer 独立配置：100MB，路径 uploads/project_files/{yyyy}/{mm}/{uuid}.{ext}
const projectFilesDir = path.join(__dirname, 'uploads', 'project_files');
fs.mkdirSync(projectFilesDir, { recursive: true });
const projectFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dir = path.join(projectFilesDir, String(yyyy), mm);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // 先修乱码再取扩展名，保证中文名文件的 ext 也正确
    const ext = path.extname(fixMojibake(file.originalname)).toLowerCase();
    cb(null, crypto.randomUUID() + ext);
  },
});
const projectFileUpload = multer({
  storage: projectFileStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp',
                     '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
                     '.dwg', '.dxf', '.zip', '.rar'];
    const ext = path.extname(fixMojibake(file.originalname)).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('不支持的文件类型: ' + ext));
  },
});


// ==================== 文件预览转换（CAD/Office → PDF）====================
// v2.3.6 hotfix 10-15：补全 P1 健壮性 + P2 增强
//   - Linux 路径（之前只写 macOS / Windows，服务器如果是 Linux 直接报错）
//   - 启动探测工具是否安装（缺失返 503，不阻塞上传）
//   - LibreOffice headless 处理 Office 文件（.doc/.docx/.xls/.xlsx/.ppt/.pptx）
//   - 临时脚本 chmod 0o600（防本机其他用户偷看转换脚本）
//   - 转换失败时通过 project_files 表存 preview_error，前端可见

// 探测二进制是否安装（existsSync 比 spawn ENOENT 错误更友好）
function whichBinary(candidates) {
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

// 平台对应的 FreeCAD 路径候选（按优先级排序）
function freecadCandidates() {
  if (process.platform === 'darwin') {
    return [
      '/Applications/FreeCAD.app/Contents/MacOS/FreeCAD',
      '/Applications/FreeCAD.app/Contents/Resources/bin/freecad',
      '/usr/local/bin/freecad',
      '/opt/homebrew/bin/freecad',
    ];
  }
  if (process.platform === 'win32') {
    return [
      'C:\\Program Files\\FreeCAD\\bin\\FreeCAD.exe',
      'C:\\Program Files\\FreeCAD 0.21\\bin\\FreeCAD.exe',
      'C:\\Program Files (x86)\\FreeCAD\\bin\\FreeCAD.exe',
    ];
  }
  // Linux
  return [
    '/usr/bin/freecad',
    '/usr/local/bin/freecad',
    '/opt/freecad/bin/freecad',
    '/snap/bin/freecad',
  ];
}

// 平台对应的 LibreOffice 路径候选
function libreofficeCandidates() {
  if (process.platform === 'darwin') {
    return [
      '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      '/usr/local/bin/soffice',
      '/opt/homebrew/bin/soffice',
    ];
  }
  if (process.platform === 'win32') {
    return [
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    ];
  }
  // Linux
  return [
    '/usr/bin/soffice',
    '/usr/bin/libreoffice',
    '/usr/local/bin/soffice',
    '/opt/libreoffice/program/soffice',
  ];
}

// 启动时探测工具是否安装（缓存结果）
let _freecadPath = null;
let _libreofficePath = null;
let _toolsChecked = false;
function getToolPath(tool) {
  if (!_toolsChecked) {
    _freecadPath = whichBinary(freecadCandidates());
    _libreofficePath = whichBinary(libreofficeCandidates());
    _toolsChecked = true;
    console.log('[tools] FreeCAD:', _freecadPath || '❌ 未安装');
    console.log('[tools] LibreOffice:', _libreofficePath || '❌ 未安装');
  }
  return tool === 'freecad' ? _freecadPath : _libreofficePath;
}
// v2.3.6 hotfix 10-15：server 启动时主动探测一次（让运维第一时间看到工具状态）
// 不在 convertToPdf 里再探测（避免首次转换时才发现问题）
(function probeToolsOnStartup() {
  getToolPath('freecad');
  getToolPath('libreoffice');
  // stdout 被 buffer 时强制 flush（避免日志文件看不到启动探测）
  if (process.stdout.write) process.stdout.write('');
})();

// ==================== CAD (DWG/DXF) 转 PDF 预览 ====================
// 用 FreeCAD headless 模式将 CAD 文件转换为 PDF，供移动端预览
function convertCadToPdf(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    const inputExt = path.extname(inputPath).toLowerCase();
    if (!['.dwg', '.dxf'].includes(inputExt)) {
      return reject(new Error('非 CAD 文件'));
    }
    const freecadBin = getToolPath('freecad');
    if (!freecadBin) {
      return reject(new Error('FreeCAD 未安装：请在服务器安装 FreeCAD（macOS: brew install freecad；Ubuntu: apt install freecad；Windows: 官网下载）'));
    }
    const pdfName = path.basename(inputPath, inputExt) + '.pdf';
    const outputPdf = path.join(outputDir, pdfName);
    if (fs.existsSync(outputPdf)) {
      // 懒加载：PDF 已存在，跳过转换
      console.log('[CAD] PDF 已存在，跳过转换:', outputPdf);
      return resolve(outputPdf);
    }

    // FreeCAD Python 脚本：打开 CAD 文件并导出 PDF
    const pyScript = [
      'import sys',
      'import FreeCAD',
      'import os',
      '',
      'input_file = sys.argv[1]',
      'output_file = sys.argv[2]',
      '',
      'doc = FreeCAD.newDocument()',
      'try:',
      '    # 尝试用 DXF 模块导入',
      '    try:',
      '        import importDXF',
      '        importDXF.insert(input_file, "Doc")',
      '    except:',
      '        # 尝试直接打开',
      '        FreeCAD.open(input_file)',
      '    ',
      '    doc.recompute()',
      '    ',
      '    # 使用 TechDraw 导出 PDF',
      '    import TechDraw',
      '    page = TechDraw.newDrawPage(doc)',
      '    ',
      '    # 遍历所有可见对象添加到页面',
      '    for obj in doc.Objects:',
      '        if hasattr(obj, "Shape") and obj.Shape.Solids:',
      '            try:',
      '                view = TechDraw.View(doc)',
      '                view.Source = obj',
      '                page.addView(view)',
      '                break',
      '            except:',
      '                pass',
      '    ',
      '    page.exportToPDF(output_file)',
      '    print("SUCCESS:" + output_file if os.path.exists(output_file) else "FAILED")',
      'except Exception as e:',
      '    print("ERROR:" + str(e))',
      '    sys.exit(1)',
      'finally:',
      '    FreeCAD.closeDocument("Doc")',
    ].join('\n');

    // 写入临时 Python 脚本（chmod 0o600 防本机其他用户偷看）
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
    const scriptPath = path.join(tmpDir, '_cad_convert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.py');
    fs.writeFileSync(scriptPath, pyScript, { mode: 0o600 });

    console.log('[CAD] 开始转换:', inputPath, '->', outputPdf);

    const proc = spawn(freecadBin, ['--headless', '-c', scriptPath, inputPath, outputPdf], {
      timeout: 90000,  // 90秒超时
      windowsHide: true,
      // 进程资源限制（防 RCE/资源耗尽）
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      try { fs.unlinkSync(scriptPath); } catch {}
      if (code === 0 && fs.existsSync(outputPdf)) {
        console.log('[CAD] 转换成功:', outputPdf);
        resolve(outputPdf);
      } else {
        const errMsg = stderr || stdout || 'Unknown error';
        console.error('[CAD] 转换失败, code:', code, 'stdout:', stdout, 'stderr:', stderr);
        reject(new Error('FreeCAD 转换失败: ' + errMsg.slice(0, 200)));
      }
    });

    proc.on('error', (err) => {
      try { fs.unlinkSync(scriptPath); } catch {}
      console.error('[CAD] FreeCAD 进程错误:', err.message);
      reject(err);
    });

    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      try { fs.unlinkSync(scriptPath); } catch {}
      reject(new Error('FreeCAD 转换超时（90秒）'));
    }, 90000);
  });
}

// ==================== Office 文件转 PDF 预览 ====================
// 用 LibreOffice headless 处理 .doc/.docx/.xls/.xlsx/.ppt/.pptx
function convertOfficeToPdf(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    const inputExt = path.extname(inputPath).toLowerCase();
    if (!['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(inputExt)) {
      return reject(new Error('非 Office 文件'));
    }
    const sofficeBin = getToolPath('libreoffice');
    if (!sofficeBin) {
      return reject(new Error('LibreOffice 未安装：请在服务器安装 LibreOffice（macOS: brew install --cask libreoffice；Ubuntu: apt install libreoffice）'));
    }
    const pdfName = path.basename(inputPath, inputExt) + '.pdf';
    const outputPdf = path.join(outputDir, pdfName);
    if (fs.existsSync(outputPdf)) {
      console.log('[Office] PDF 已存在，跳过转换:', outputPdf);
      return resolve(outputPdf);
    }

    // LibreOffice 转 PDF：soffice --headless --convert-to pdf --outdir <outputDir> <inputPath>
    // 注意：soffice 在 macOS 上必须设置 HOME 避免偏好文件冲突
    const env = { ...process.env };
    if (process.platform === 'darwin') {
      env.HOME = process.env.HOME || '/tmp';
    }

    console.log('[Office] 开始转换:', inputPath, '->', outputPdf);

    const proc = spawn(sofficeBin, [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', outputDir,
      inputPath,
    ], {
      timeout: 120000,  // Office 转 PDF 比较慢，给 2 分钟
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPdf)) {
        console.log('[Office] 转换成功:', outputPdf);
        resolve(outputPdf);
      } else {
        const errMsg = stderr || stdout || 'Unknown error';
        console.error('[Office] 转换失败, code:', code, 'stdout:', stdout, 'stderr:', stderr);
        reject(new Error('LibreOffice 转换失败: ' + errMsg.slice(0, 200)));
      }
    });

    proc.on('error', (err) => {
      console.error('[Office] soffice 进程错误:', err.message);
      reject(err);
    });

    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      reject(new Error('LibreOffice 转换超时（120秒）'));
    }, 120000);
  });
}

// 文件转换路由（统一 CAD/Office → PDF）
async function convertToPdf(inputPath, outputDir) {
  const ext = path.extname(inputPath).toLowerCase();
  if (['.dwg', '.dxf'].includes(ext)) {
    return await convertCadToPdf(inputPath, outputDir);
  }
  if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext)) {
    return await convertOfficeToPdf(inputPath, outputDir);
  }
  throw new Error('不支持的文件类型: ' + ext);
}

// 1. GET 列表
// v2.3.11：PC 端「项目文件」独立页需要跨项目检索 → project_id 改为可选
//   - 不传 project_id：按权限返回全部（read_all）或仅关联项目（read）
//   - keyword：同时匹配 文件名 / 项目名 / 上传备注（PC 的「项目检索」靠它）
//   - page/pageSize：分页，默认 20 条
//   - stats.byCategory / stats.byStatus：分类与状态计数（不受当前分类/状态筛选影响）
//   - 返回结构在原 { list } 基础上新增字段，移动端 pages/files/list.vue 仍读 list，兼容
app.get('/api/project-files', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await permCore.loadUserPermissions(userId);
    const isAdmin = perms.has('*');
    const canReadAll = isAdmin || perms.has('project_file:read_all');
    const canRead = canReadAll || perms.has('project_file:read');
    if (!canRead) return res.status(403).json({ error: '无权限' });

    const projectId = parseInt(req.query.project_id) || 0;
    const keyword = String(req.query.keyword || '').trim();
    const { status, category, mine } = req.query;

    // 基础条件：项目范围 + 关键词（分类/状态计数也基于这一层）
    const baseConds = [];
    const baseArgs = [];
    if (projectId) {
      baseConds.push('f.project_id = ?');
      baseArgs.push(projectId);
    } else if (!canReadAll) {
      // 只有 project_file:read（没有 read_all）：只能看自己关联的项目
      const ids = Array.from(await permCore.relatedProjectIds(userId));
      if (!ids.length) {
        return res.json({ list: [], total: 0, page: 1, pageSize: 20, stats: { byCategory: {}, byStatus: {} } });
      }
      baseConds.push(`f.project_id IN (${ids.map(() => '?').join(',')})`);
      baseArgs.push(...ids);
    }
    if (keyword) {
      baseConds.push('(f.title LIKE ? OR p.name LIKE ? OR IFNULL(f.description, \'\') LIKE ?)');
      const kw = `%${keyword}%`;
      baseArgs.push(kw, kw, kw);
    }

    const conds = [...baseConds];
    const args = [...baseArgs];
    if (status) { conds.push('f.status = ?'); args.push(status); }
    if (category) { conds.push('f.category = ?'); args.push(category); }
    if (mine === '1') { conds.push('f.uploaded_by = ?'); args.push(userId); }

    const whereSql = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
    const baseWhereSql = baseConds.length ? ' WHERE ' + baseConds.join(' AND ') : '';
    const fromSql = 'FROM project_files f LEFT JOIN projects p ON p.id = f.project_id';

    let page = parseInt(req.query.page) || 1;
    let pageSize = parseInt(req.query.pageSize) || 20;
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 20;
    if (pageSize > 200) pageSize = 200;
    const offset = (page - 1) * pageSize;

    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total ${fromSql}${whereSql}`, args);
    const total = Number(countRow && countRow.total) || 0;

    const [rows] = await pool.query(
      `SELECT f.*, e.name AS uploader_name, r.name AS reviewer_name, p.name AS project_name
       FROM project_files f
       LEFT JOIN employees e ON e.id = f.uploaded_by
       LEFT JOIN employees r ON r.id = f.reviewed_by
       LEFT JOIN projects p ON p.id = f.project_id
       ${whereSql}
       ORDER BY f.uploaded_at DESC, f.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      args
    );
    // v2.3.6 hotfix 10-15：自动拼 pdf_preview_url + 透传 preview_error（前端能看见）
    for (const r of rows) {
      r.pdf_preview_url = r.pdf_preview ? `/uploads/${r.pdf_preview}` : null;
    }

    const [catRows] = await pool.query(
      `SELECT f.category, COUNT(*) AS n ${fromSql}${baseWhereSql} GROUP BY f.category`, baseArgs);
    const [stRows] = await pool.query(
      `SELECT f.status, COUNT(*) AS n ${fromSql}${baseWhereSql} GROUP BY f.status`, baseArgs);
    const byCategory = {};
    for (const r of catRows) byCategory[r.category] = Number(r.n) || 0;
    const byStatus = {};
    for (const r of stRows) byStatus[r.status] = Number(r.n) || 0;

    res.json({ list: rows, total, page, pageSize, stats: { byCategory, byStatus } });
  } catch (e) {
    console.error('[project-files list] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 2. GET 详情
app.get('/api/project-files/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    // v2.3.11：补权限校验（原先只校验登录，任何登录用户可遍历 id 读他人项目文件）
    const perms = await permCore.loadUserPermissions(userId);
    if (!perms.has('*') && !perms.has('project_file:read_all') && !perms.has('project_file:read')) {
      return res.status(403).json({ error: '无权限' });
    }
    const [rows] = await pool.query(
      `SELECT f.*, e.name AS uploader_name, r.name AS reviewer_name, p.name AS project_name
       FROM project_files f
       LEFT JOIN employees e ON e.id = f.uploaded_by
       LEFT JOIN employees r ON r.id = f.reviewed_by
       LEFT JOIN projects p ON p.id = f.project_id
       WHERE f.id = ?`,
      [parseInt(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: '文件不存在' });
    const file = rows[0];
    // v2.3.6 hotfix 10-15：自动拼 pdf_preview_url（preview_error 直接透传 DB 字段）
    file.pdf_preview_url = file.pdf_preview ? `/uploads/${file.pdf_preview}` : null;
    res.json(file);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3. POST 上传（自动 pending + 发通知）
app.post('/api/project-files', projectFileUpload.single('file'), async (req, res) => {
  const cleanup = () => { if (req.file) try { fs.unlinkSync(req.file.path); } catch {} };
  try {
    const userId = getUserId(req);
    if (!userId) { cleanup(); return res.status(401).json({ error: '未登录' }); }
    const perms = await permCore.loadUserPermissions(userId);
    if (!perms.has('*') && !perms.has('project_file:write')) {
      cleanup();
      return res.status(403).json({ error: '无上传权限' });
    }
    const { project_id, category, description } = req.body;
    if (!project_id || !category) {
      cleanup();
      return res.status(400).json({ error: '缺少 project_id 或 category' });
    }
    if (!req.file) return res.status(400).json({ error: '请选择文件' });
    // v2.3.6-hotfix2：修复中文文件名乱码（见 fixMojibake 注释）
    req.file.originalname = fixMojibake(req.file.originalname);
    const fileExt = path.extname(req.file.originalname).toLowerCase().slice(1);
    const relPath = path.relative(path.join(__dirname, 'uploads'), req.file.path);
    const [result] = await pool.query(
      `INSERT INTO project_files
       (project_id, category, title, file_path, file_size, file_ext, description, status, uploaded_by, uploaded_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW(), NOW())`,
      [parseInt(project_id), category, req.file.originalname, relPath, req.file.size, fileExt,
       description || null, userId]
    );
    // 通知所有有 project_file:approve 权限的人（跳过自己）
    // 用 messages 表（站内通知），不是 notifications 表（外发短信）
    const approvers = await getUserIdsByPermission('project_file:approve');

    // v2.3.6 hotfix 10-15：CAD/Office 文件异步转 PDF 预览（不阻塞上传响应）
    // 转换失败时把错误信息写入 project_files.preview_error，前端可见
    if (['dwg', 'dxf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt)) {
      const fileId = result.insertId;
      const inputPath = req.file.path;
      const outputDir = path.dirname(inputPath);
      // setImmediate：不阻塞 POST 响应，先返"上传成功"，后台异步转换
      setImmediate(() => {
        convertToPdf(inputPath, outputDir).then(async (pdfPath) => {
          const pdfRelPath = path.relative(path.join(__dirname, 'uploads'), pdfPath);
          await pool.query(
            `UPDATE project_files SET pdf_preview = ?, preview_error = NULL WHERE id = ?`,
            [pdfRelPath, fileId]
          );
          console.log('[preview] PDF 预览生成成功:', pdfRelPath);
        }).catch(async (e) => {
          // 转换失败：写 preview_error（前端能看见），但不影响上传本身
          const errMsg = String(e.message || e).slice(0, 500);
          await pool.query(
            `UPDATE project_files SET preview_error = ? WHERE id = ?`,
            [errMsg, fileId]
          );
          console.error('[preview] PDF 转换失败（不影响上传）:', errMsg);
        });
      });
    }
    for (const aid of approvers) {
      if (aid === userId) continue;
      const [[emp]] = await pool.query('SELECT name FROM employees WHERE id = ?', [aid]);
      await pool.query(
        `INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'sent')`,
        [aid, emp ? emp.name : '', '项目文件待审核', `${req.file.originalname} 等待您审核`, 'project_file_pending', result.insertId, 'project_file']
      );
    }
    await addLog(userId, '', '上传', '项目文件', result.insertId, req.file.originalname,
      `上传项目文件: ${req.file.originalname} (${(req.file.size/1024/1024).toFixed(1)}MB)`, req.ip);
    res.json({ id: result.insertId, message: '上传成功，待审核' });
  } catch (e) {
    cleanup();
    console.error('[project-files upload] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 4. POST 审核
app.post('/api/project-files/:id/review', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await permCore.loadUserPermissions(userId);
    if (!perms.has('*') && !perms.has('project_file:approve')) {
      return res.status(403).json({ error: '无审核权限' });
    }
    const { action, comment } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action 必须是 approve/reject' });
    }
    const id = parseInt(req.params.id);
    const [rows] = await pool.query('SELECT * FROM project_files WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: '文件不存在' });
    const file = rows[0];
    if (file.status !== 'pending') return res.status(400).json({ error: '只能审核待审文件' });
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await pool.query(
      `UPDATE project_files SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_comment = ?, updated_at = NOW() WHERE id = ?`,
      [newStatus, userId, comment || null, id]
    );
    // 通知上传人（用 messages 表站内通知）
    await pool.query(
      `INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'sent')`,
      [file.uploaded_by, '',
       action === 'approve' ? '文件已通过审核' : '文件被拒绝',
       `${file.title}${comment ? ': ' + comment : ''}`,
       action === 'approve' ? 'project_file_approved' : 'project_file_rejected',
       id, 'project_file']
    );
    await addLog(userId, '', action === 'approve' ? '审核通过' : '审核拒绝', '项目文件', id, file.title,
      `${action} project_file: ${file.title}${comment ? ' 意见: ' + comment : ''}`, req.ip);
    res.json({ message: action === 'approve' ? '已通过' : '已拒绝' });
  } catch (e) {
    console.error('[project-files review] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 5. POST 撤销（仅上传人自己，状态=pending）
app.post('/api/project-files/:id/revoke', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const id = parseInt(req.params.id);
    const [rows] = await pool.query('SELECT * FROM project_files WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: '文件不存在' });
    const file = rows[0];
    if (file.uploaded_by !== userId) return res.status(403).json({ error: '只能撤销自己上传的文件' });
    if (file.status !== 'pending') return res.status(400).json({ error: '只能撤销待审文件' });
    await pool.query(`UPDATE project_files SET status = 'revoked', updated_at = NOW() WHERE id = ?`, [id]);
    res.json({ message: '已撤销' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 6. DELETE 删除（上传人未审前 / admin 通杀 / 审过后不能删）
app.delete('/api/project-files/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await permCore.loadUserPermissions(userId);
    const isAdmin = perms.has('*');
    const id = parseInt(req.params.id);
    const [rows] = await pool.query('SELECT * FROM project_files WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: '文件不存在' });
    const file = rows[0];
    // v2.3.11 规则：项目文件一旦审核通过即视为归档凭证，任何角色（含 admin）都不得删除
    if (file.status === 'approved') {
      return res.status(403).json({ error: '该文件已通过审核，不允许删除' });
    }
    if (file.uploaded_by !== userId && !isAdmin) {
      return res.status(403).json({ error: '只能删除自己上传的文件（admin 通杀）' });
    }
    try {
      const fp = path.join(__dirname, 'uploads', file.file_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (e) { console.error('删除物理文件失败:', e.message); }
    await pool.query('DELETE FROM project_files WHERE id = ?', [id]);
    await addLog(userId, '', '删除', '项目文件', id, file.title, `删除项目文件: ${file.title}`, req.ip);
    res.json({ message: '已删除' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 7. GET 下载（流式）
app.get('/api/project-files/:id/download', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await permCore.loadUserPermissions(userId);
    if (!perms.has('*') && !perms.has('project_file:read_all') && !perms.has('project_file:read')) {
      return res.status(403).json({ error: '无权限' });
    }
    const [rows] = await pool.query('SELECT * FROM project_files WHERE id = ?', [parseInt(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: '文件不存在' });
    const file = rows[0];
    const fp = path.join(__dirname, 'uploads', file.file_path);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: '物理文件不存在' });
    // ?inline=1 → 内嵌预览（PDF/图片等），设置 inline 让浏览器直接渲染而非下载
    // 用于移动端审核页/详情页的预览（H5 的 <img>/<iframe> 无法携带自定义请求头，
    // 故鉴权用户 ID 通过 query.user_id 传入，见 getUserId）。
    if (req.query.inline === '1') {
      const ext = (file.file_ext || '').toLowerCase();
      const MIME = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp',
        txt: 'text/plain; charset=utf-8',
      };
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.title)}`);
      return fs.createReadStream(fp).pipe(res);
    }
    res.download(fp, file.title);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/invoices', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM invoices ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/invoices', checkPermission('invoice:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark } = req.body;
  const stmt = db.prepare('INSERT INTO invoices (invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(invoice_no, customer_id, customer_name, amount, tax_rate || 0, tax_amount || 0, total_amount || amount, type, status || '待开具', issue_date, remark);
  await addLog(userId, '', '新增', '发票管理', result.lastInsertRowid, invoice_no, `发票号: ${invoice_no}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/invoices/:id', checkPermission('invoice:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark } = req.body;
  const stmt = db.prepare('UPDATE invoices SET invoice_no=?, customer_id=?, customer_name=?, amount=?, tax_rate=?, tax_amount=?, total_amount=?, type=?, status=?, issue_date=?, remark=? WHERE id=?');
  await stmt.run(invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark, req.params.id);
  await addLog(userId, '', '编辑', '发票管理', req.params.id, invoice_no, `更新发票: ${invoice_no}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/invoices/:id', checkPermission('invoice:delete'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
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

// 公海客户
app.get('/api/customer-pool', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM customer_pool ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/customer-pool', async (req, res) => {
  const { name, phone, source, area, budget, demand, lost_reason, lost_date } = req.body;
  const stmt = db.prepare('INSERT INTO customer_pool (name, phone, source, area, budget, demand, lost_reason, lost_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(name, phone, source, area, budget, demand, lost_reason, lost_date);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.delete('/api/customer-pool/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM customer_pool WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 楼盘管理
app.get('/api/buildings', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM buildings ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/buildings', async (req, res) => {
  const { name, address, area, building_type, total_houses, developer, property_fee, status } = req.body;
  const stmt = db.prepare('INSERT INTO buildings (name, address, area, building_type, total_houses, developer, property_fee, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(name, address, area, building_type, total_houses, developer, property_fee, status || '在售');
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/buildings/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { name, address, area, building_type, total_houses, developer, property_fee, status } = req.body;
  await db.prepare('UPDATE buildings SET name=?, address=?, area=?, building_type=?, total_houses=?, developer=?, property_fee=?, status=? WHERE id=?')
    .run(name, address, area, building_type, total_houses, developer, property_fee, status, req.params.id);
  await addLog(userId, '', '编辑', '楼盘管理', req.params.id, name, `更新楼盘: ${name}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/buildings/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [b] = await db.prepare('SELECT name FROM buildings WHERE id = ?').all(req.params.id);
  const bName = b ? b.name : req.params.id;
  await db.prepare('DELETE FROM buildings WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '楼盘管理', req.params.id, bName, `删除楼盘: ${bName}`, req.ip);
  res.json({ message: '删除成功' });
});

// 渠道管理
app.get('/api/channels', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM channels ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/channels', async (req, res) => {
  const { name, type, contact_person, contact_phone, address, commission_rate, status, remark } = req.body;
  const stmt = db.prepare('INSERT INTO channels (name, type, contact_person, contact_phone, address, commission_rate, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(name, type, contact_person, contact_phone, address, commission_rate || 0, status || '合作中', remark);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/channels/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { name, type, contact_person, contact_phone, address, commission_rate, status, remark } = req.body;
  await db.prepare('UPDATE channels SET name=?, type=?, contact_person=?, contact_phone=?, address=?, commission_rate=?, status=?, remark=? WHERE id=?')
    .run(name, type, contact_person, contact_phone, address, commission_rate, status, remark, req.params.id);
  await addLog(userId, '', '编辑', '渠道管理', req.params.id, name, `更新渠道: ${name}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/channels/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [c] = await db.prepare('SELECT name FROM channels WHERE id = ?').all(req.params.id);
  const cName = c ? c.name : req.params.id;
  await db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '渠道管理', req.params.id, cName, `删除渠道: ${cName}`, req.ip);
  res.json({ message: '删除成功' });
});

// 营销案例
app.get('/api/marketing-cases', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM marketing_cases ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/marketing-cases', async (req, res) => {
  const { title, building_name, area, style, budget, cost, images, description, status, publish_date } = req.body;
  const stmt = db.prepare('INSERT INTO marketing_cases (title, building_name, area, style, budget, cost, images, description, status, publish_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(title, building_name, area, style, budget, cost, JSON.stringify(images || []), description, status || '草稿', publish_date);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/marketing-cases/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { title, building_name, area, style, budget, cost, images, description, status, publish_date } = req.body;
  await db.prepare('UPDATE marketing_cases SET title=?, building_name=?, area=?, style=?, budget=?, cost=?, images=?, description=?, status=?, publish_date=? WHERE id=?')
    .run(title, building_name, area, style, budget, cost, JSON.stringify(images || []), description, status, publish_date, req.params.id);
  await addLog(userId, '', '编辑', '营销案例', req.params.id, title, `更新案例: ${title}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/marketing-cases/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [mc] = await db.prepare('SELECT title FROM marketing_cases WHERE id = ?').all(req.params.id);
  const mcTitle = mc ? mc.title : req.params.id;
  await db.prepare('DELETE FROM marketing_cases WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '营销案例', req.params.id, mcTitle, `删除案例: ${mcTitle}`, req.ip);
  res.json({ message: '删除成功' });
});

// 供应商管理
// ==================== 供应商管理（已合并到外部联系人 v2.3.1）====================
// 原 /api/suppliers/* 路由已废弃；统一走 /api/external-contacts?category=供应商。
// 历史 suppliers 表数据已迁移到 external_contacts（见 migrations/v2_3_1_merge_suppliers.js）。

// 采购单
app.get('/api/purchases', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM purchases ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/purchases', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { purchase_no, supplier_id, supplier_name, project_id, project_name, total_amount, status, purchase_date, expected_date, operator, remark } = req.body;
  const stmt = db.prepare('INSERT INTO purchases (purchase_no, supplier_id, supplier_name, project_id, project_name, total_amount, status, purchase_date, expected_date, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(purchase_no, supplier_id, supplier_name, project_id, project_name, total_amount || 0, status || '待审核', purchase_date, expected_date, operator, remark);
  await addLog(userId, '', '新增', '采购管理', result.lastInsertRowid, project_name || purchase_no, `采购单号: ${purchase_no}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/purchases/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { total_amount, paid_amount, status, remark } = req.body;
  await db.prepare('UPDATE purchases SET total_amount=?, paid_amount=?, status=?, remark=? WHERE id=?')
    .run(total_amount, paid_amount, status, remark, req.params.id);
  await addLog(userId, '', '编辑', '采购管理', req.params.id, '', `更新采购单 ID: ${req.params.id}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/purchases/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM purchases WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '采购管理', req.params.id, '', `删除采购单 ID: ${req.params.id}`, req.ip);
  res.json({ message: '删除成功' });
});

// 成本记录
app.get('/api/cost-records', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM cost_records ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.get('/api/cost-records/project/:projectId', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM cost_records WHERE project_id = ? ORDER BY date DESC');
  res.json(await stmt.all(req.params.projectId));
});

app.post('/api/cost-records', async (req, res) => {
  const userId = getUserId(req);
  const { project_id, project_name, type, category, amount, date, operator, invoice_status, remark } = req.body;
  const stmt = db.prepare('INSERT INTO cost_records (project_id, project_name, type, category, amount, date, operator, invoice_status, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(project_id, project_name, type, category, amount, date, operator, invoice_status || '未开票', remark);
  await addLog(userId, '', '新增', '费用记录', result.lastInsertRowid, project_name, `费用项目: ${project_name}, 金额: ${amount}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.delete('/api/cost-records/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM cost_records WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '费用记录', parseInt(req.params.id), '', `删除费用记录 ID: ${req.params.id}`, req.ip);
  res.json({ message: '删除成功' });
});

// 整改问题列表
app.get('/api/rectification-issues', async (req, res) => {
  const { project_id } = req.query;
  // 2026-10-23：project_name 是提交时快照，历史上存在空串（移动端提交页取不到项目名），
  // 统一用项目表当前名称兜底，避免各端列表/详情显示空白。
  let sql = `SELECT ri.*, COALESCE(NULLIF(ri.project_name, ''), p.name) AS project_name,
    e.name as creator_name
    FROM rectification_issues ri
    LEFT JOIN employees e ON ri.creator_id = e.id
    LEFT JOIN projects p ON p.id = ri.project_id`;
  const params = [];
  if (project_id) {
    sql += ' WHERE ri.project_id = ?';
    params.push(project_id);
  }
  sql += ' ORDER BY ri.created_at DESC';
  const stmt = db.prepare(sql);
  res.json(params.length ? await stmt.all(...params) : await stmt.all());
});

// 整改问题详情（移动端巡检详情页调用）
app.get('/api/rectification-issues/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    // 2026-10-23：同上，project_name 空串时用项目表名称兜底
    const stmt = db.prepare(`SELECT ri.*, COALESCE(NULLIF(ri.project_name, ''), p.name) AS project_name
      FROM rectification_issues ri
      LEFT JOIN projects p ON p.id = ri.project_id
      WHERE ri.id = ?`);
    const row = await stmt.get(req.params.id);
    if (!row) return res.status(404).json({ error: '记录不存在' });
    res.json(row);
  } catch (err) {
    console.error('rectification-issues detail error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

app.post('/api/rectification-issues', async (req, res) => {
  const userId = getUserId(req);
  const { inspection_id, project_id, project_name, issue_desc, priority, status, responsible_id, responsible_name, due_date, images, remark, title, category, location, level, description } = req.body;
  const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
  // 2026-10-23 修复：移动端巡检提交页只带了 project_id，project_name 取不到就是空串，
  // 导致整改表落库后项目名为空 → 待办中心/巡检列表副标题显示空白。
  // 服务端按 project_id 反查项目名兜底，不依赖客户端是否传对。
  let finalProjectName = project_name || '';
  if (!finalProjectName && project_id) {
    try {
      const p = await db.prepare('SELECT name FROM projects WHERE id = ?').get(project_id);
      if (p && p.name) finalProjectName = p.name;
    } catch (_) { /* 项目查不到就保持空，不影响主流程 */ }
  }
  // 2026-10-23 业务流程：监理提交 → 待处理 → 工长受理 → 处理中 → 结案 → 已完成。
  // 提交页不选负责人时，按项目关联的工长（projects.foreman_id）自动指派，
  // 这样待办中心能精确推给工长本人，而不是丢给全体项目关联人。
  let finalResponsibleId = responsible_id || null;
  let finalResponsibleName = responsible_name || '';
  if (!finalResponsibleId && project_id) {
    try {
      const p = await db.prepare('SELECT foreman_id FROM projects WHERE id = ?').get(project_id);
      if (p && p.foreman_id) {
        finalResponsibleId = p.foreman_id;
        const f = await db.prepare('SELECT name FROM employees WHERE id = ?').get(p.foreman_id);
        finalResponsibleName = (f && f.name) || '';
      }
    } catch (_) { /* 查不到工长就保持为空，通知走项目关联人兜底 */ }
  }
  // 关键修复：兼容客户端两种提交方式——
  //   老客户端：images 已是 JSON 字符串（["url1","url2"]），服务端不应再 stringify 一次
  //   新客户端：images 是数组
  // 服务端规范化：无论收到什么，最终存进 DB 的是 JSON 字符串
  let normalizedImages = '[]';
  try {
    let parsed = typeof images === 'string' ? JSON.parse(images) : images;
    if (!Array.isArray(parsed)) parsed = [];
    normalizedImages = JSON.stringify(parsed);
  } catch (_) {
    // 解析失败时当作空数组
    normalizedImages = '[]';
  }
  const stmt = db.prepare(`INSERT INTO rectification_issues
    (inspection_id, project_id, project_name, issue_desc, priority, status, responsible_id, responsible_name, due_date, images, remark, title, category, location, level, description, creator_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const result = await stmt.run(
    inspection_id, project_id, finalProjectName,
    issue_desc || title || '', priority || '普通', status || '待处理',
    finalResponsibleId, finalResponsibleName, due_date,
    normalizedImages, remark || description || '',
    title || issue_desc || '', category || '', location || '', level || '', description || '', userId, nowStr
  );
  await addLog(userId, '', '新增', '整改问题', result.lastInsertRowid, finalProjectName, `整改问题: ${(title || issue_desc || '').slice(0, 30)}`, req.ip);

  // 发送站内通知：有工长时精确通知「工长 + 提交人」；没派到工长才退回全体项目关联人
  const notifyTargets = [finalResponsibleId, userId].filter(Boolean);
  if (notifyTargets.length) {
    await notifyProject('inspection_submit', project_id,
      `【新巡检问题】${finalProjectName || '项目'}`,
      `问题：${(issue_desc || title || '').slice(0, 100)}${finalResponsibleName ? `（负责人：${finalResponsibleName}）` : ''}`,
      result.lastInsertRowid, 'rectification_issue',
      undefined, { mode: 'participants', userIds: notifyTargets }
    );
  } else {
    await notifyProject('inspection_submit', project_id,
      `【新巡检问题】${finalProjectName || '项目'}`,
      `问题：${(issue_desc || title || '').slice(0, 100)}`,
      result.lastInsertRowid, 'rectification_issue'
    );
  }

  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/rectification-issues/:id', async (req, res) => {
  // 2026-10-23 修复：原代码直接引用未声明的 userId，一旦有人更新整改状态就抛
  // ReferenceError 并把整个 Node 进程带崩（Express 4 + Node 22 未捕获 rejection 直接退出）
  const userId = getUserId(req);
  const { status, finish_date, remark, action, new_due_date, delay_reason } = req.body;
  const issueId = parseInt(req.params.id);
  const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // 取当前记录（动作需要做状态机校验 + 通知要用项目/负责人信息）
  const cur = await db.prepare('SELECT * FROM rectification_issues WHERE id = ?').get(issueId);
  if (!cur) return res.status(404).json({ error: '记录不存在' });

  // 操作人姓名（通知/日志用）
  let operatorName = '';
  try {
    const op = await db.prepare('SELECT name FROM employees WHERE id = ?').get(userId);
    operatorName = (op && op.name) || '';
  } catch (_) {}

  const notifyRectify = async (title, content) => {
    // 通知对象：负责人（工长）+ 提交人（监理），去重去空；都没有才退回项目关联人
    const targets = [cur.responsible_id, cur.creator_id, userId].filter(Boolean);
    const uniq = [...new Set(targets)];
    if (uniq.length) {
      await notifyProject('inspection_submit', cur.project_id, title, content,
        issueId, 'rectification_issue', undefined, { mode: 'participants', userIds: uniq });
    } else {
      await notifyProject('inspection_submit', cur.project_id, title, content,
        issueId, 'rectification_issue');
    }
  };

  // ===== 动作分支（业务流程）=====
  if (action === 'accept') {
    // 受理：待处理 → 处理中。可同时修改整改截止时间（工长评估后调整）。
    if (String(cur.status) !== '待处理') {
      return res.status(400).json({ error: `当前状态是「${cur.status}」，不能重复受理` });
    }
    const finalDue = new_due_date || cur.due_date;
    await db.prepare(`UPDATE rectification_issues
      SET status='处理中', accept_date=?, accept_by=?, accept_name=?, due_date=?, remark=? WHERE id=?`)
      .run(nowStr, userId, operatorName, finalDue || null,
        remark || cur.remark, issueId);
    await addLog(userId, '', '受理', '整改问题', issueId, cur.project_name || '',
      `受理整改${new_due_date && new_due_date !== cur.due_date ? `，整改时间调整为 ${new_due_date}` : ''}`, req.ip);
    await notifyRectify(`【整改已受理】${cur.project_name || ''}`,
      `${(cur.title || cur.issue_desc || '').slice(0, 40)} 已由 ${operatorName || '工长'} 受理${new_due_date && new_due_date !== cur.due_date ? `，整改时间调整为 ${new_due_date}` : ''}`);
    return res.json({ message: '已受理', status: '处理中', due_date: finalDue || null, accept_name: operatorName, accept_date: nowStr });
  }

  if (action === 'delay') {
    // 延期：处理中 → 处理中（改 due_date + 记延期历史）。原因必填。
    if (String(cur.status) !== '处理中') {
      return res.status(400).json({ error: `当前状态是「${cur.status}」，只有处理中才能申请延期` });
    }
    if (!new_due_date) return res.status(400).json({ error: '请选择延期后的截止时间' });
    if (!String(delay_reason || '').trim()) return res.status(400).json({ error: '请填写延期原因' });
    let log = [];
    try { log = cur.delay_log ? JSON.parse(cur.delay_log) : []; } catch (_) { log = []; }
    if (!Array.isArray(log)) log = [];
    log.push({
      from: cur.due_date || null,
      to: new_due_date,
      reason: String(delay_reason).trim(),
      by: operatorName || String(userId),
      at: nowStr
    });
    await db.prepare('UPDATE rectification_issues SET due_date=?, delay_log=? WHERE id=?')
      .run(new_due_date, JSON.stringify(log), issueId);
    await addLog(userId, '', '延期', '整改问题', issueId, cur.project_name || '',
      `整改时间 ${cur.due_date || '未设置'} → ${new_due_date}，原因：${String(delay_reason).slice(0, 50)}`, req.ip);
    await notifyRectify(`【整改延期】${cur.project_name || ''}`,
      `${(cur.title || cur.issue_desc || '').slice(0, 40)} 延期至 ${new_due_date}，原因：${String(delay_reason).slice(0, 60)}`);
    return res.json({ message: '已延期', due_date: new_due_date, delay_log: log });
  }

  if (action === 'complete') {
    // 结案：处理中（或历史遗留的待处理）→ 已完成。已完成是终态。
    const st = String(cur.status);
    if (st === '已完成') {
      return res.status(400).json({ error: '该问题已结案，不能重复提交' });
    }
    if (st !== '处理中' && st !== '待处理') {
      return res.status(400).json({ error: `当前状态是「${st}」，不能结案` });
    }
    await db.prepare('UPDATE rectification_issues SET status=?, finish_date=?, remark=? WHERE id=?')
      .run('已完成', finish_date || nowStr, remark || '已整改完成', issueId);
    await addLog(userId, '', '结案', '整改问题', issueId, cur.project_name || '',
      `整改完成结案${cur.due_date ? `（原定 ${cur.due_date}）` : ''}`, req.ip);
    await notifyRectify(`【整改已完成】${cur.project_name || ''}`,
      `${(cur.title || cur.issue_desc || '').slice(0, 40)} 已由 ${operatorName || '负责人'} 完成并结案`);
    return res.json({ message: '已结案', status: '已完成', finish_date: finish_date || nowStr });
  }

  // ===== 兼容旧调用：直接传 status（老客户端/内部工具）=====
  if (!status) return res.status(400).json({ error: '缺少 status' });
  await db.prepare('UPDATE rectification_issues SET status=?, finish_date=?, remark=? WHERE id=?')
    .run(status, finish_date || null, remark || null, req.params.id);
  await addLog(userId, '', '编辑', '整改问题', issueId, '', `更新整改状态: ${status}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/rectification-issues/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM rectification_issues WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '整改问题', parseInt(req.params.id), '', `删除整改问题 ID: ${req.params.id}`, req.ip);
  res.json({ message: '删除成功' });
});

// 考勤管理
app.get('/api/attendance', async (req, res) => {
  const { employee_id, date } = req.query;
  let sql = 'SELECT * FROM attendance WHERE 1=1';
  const params = [];
  if (employee_id) { sql += ' AND employee_id = ?'; params.push(employee_id); }
  if (date) { sql += ' AND date = ?'; params.push(date); }
  sql += ' ORDER BY date DESC, check_in_time DESC';
  const stmt = db.prepare(sql);
  res.json(await stmt.all(...params));
});

app.post('/api/attendance', async (req, res) => {
  const userId = getUserId(req);
  const { employee_id, employee_name, date, check_in_time, check_out_time, work_hours, status, type, remark } = req.body;
  const stmt = db.prepare('INSERT INTO attendance (employee_id, employee_name, date, check_in_time, check_out_time, work_hours, status, type, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(employee_id, employee_name, date, check_in_time, check_out_time, work_hours || 0, status || '正常', type || '上班', remark);
  await addLog(userId, '', '新增', '考勤记录', result.lastInsertRowid, employee_name, `考勤: ${employee_name}, 日期: ${date}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.delete('/api/attendance/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM attendance WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '考勤记录', parseInt(req.params.id), '', `删除考勤记录 ID: ${req.params.id}`, req.ip);
  res.json({ message: '删除成功' });
});

// 售后维保
app.get('/api/warranties', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM warranties ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/warranties', async (req, res) => {
  const userId = getUserId(req);
  const { project_id, project_name, customer_name, customer_phone, type, description, images, status, handle_user, handle_date, result, satisfaction, cost } = req.body;
  const stmt = db.prepare('INSERT INTO warranties (project_id, project_name, customer_name, customer_phone, type, description, images, status, handle_user, handle_date, result, satisfaction, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result2 = await stmt.run(project_id, project_name, customer_name, customer_phone, type, description, JSON.stringify(images || []), status || '待处理', handle_user, handle_date, result, satisfaction, cost || 0);
  await addLog(userId, '', '新增', '售后维保', result2.lastInsertRowid, project_name, `维保项目: ${project_name}, 类型: ${type}`, req.ip);
  res.json({ id: result2.lastInsertRowid, message: '添加成功' });
});

app.put('/api/warranties/:id', async (req, res) => {
  const userId = getUserId(req);
  const { status, handle_date, result, satisfaction, cost, remark } = req.body;
  await db.prepare('UPDATE warranties SET status=?, handle_date=?, result=?, satisfaction=?, cost=?, remark=? WHERE id=?')
    .run(status, handle_date, result, satisfaction, cost, remark, req.params.id);
  await addLog(userId, '', '编辑', '售后维保', parseInt(req.params.id), '', `更新维保状态: ${status}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/warranties/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM warranties WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '售后维保', parseInt(req.params.id), '', `删除维保记录 ID: ${req.params.id}`, req.ip);
  res.json({ message: '删除成功' });
});

// 设计量房
app.get('/api/design-measurements', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM design_measurements ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/design-measurements', async (req, res) => {
  const userId = getUserId(req);
  const { customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status, drawings, remark } = req.body;
  const stmt = db.prepare('INSERT INTO design_measurements (customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status, drawings, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status || '待测量', drawings, remark);
  await addLog(userId, '', '新增', '设计量房', result.lastInsertRowid, customer_name, `量房客户: ${customer_name}, 楼盘: ${building_name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/design-measurements/:id', async (req, res) => {
  const userId = getUserId(req);
  const { status, drawings, remark } = req.body;
  await db.prepare('UPDATE design_measurements SET status=?, drawings=?, remark=? WHERE id=?')
    .run(status, drawings, remark, req.params.id);
  await addLog(userId, '', '编辑', '设计量房', parseInt(req.params.id), '', `更新量房状态: ${status}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/design-measurements/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  await db.prepare('DELETE FROM design_measurements WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '设计量房', parseInt(req.params.id), '', `删除量房记录 ID: ${req.params.id}`, req.ip);
  res.json({ message: '删除成功' });
});

// Boss看板数据
app.get('/api/boss-dashboard', async (req, res) => {
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
app.get('/api/project-profit', (req, res) => {
  const projects = db.prepare(`
    SELECT p.id, p.name, p.budget, p.cost, p.status,
           (p.budget - p.cost) as profit,
           CASE WHEN p.budget > 0 THEN ((p.budget - p.cost) / p.budget * 100) ELSE 0 END as profit_rate
    FROM projects p
    WHERE p.budget > 0
    ORDER BY profit_rate DESC
  `).all();
  res.json(projects);
});

// 每月收入趋势
app.get('/api/monthly-trend', (req, res) => {
  const months = db.prepare(`
    SELECT DATE_FORMAT(date, '%Y-%m') as month,
           SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
           SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
    FROM finance
    WHERE date IS NOT NULL
    GROUP BY DATE_FORMAT(date, '%Y-%m')
    ORDER BY month DESC
    LIMIT 12
  `).all();
  res.json(months.reverse());
});

// 合同变量管理 API
app.get('/api/contract-variables', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM contract_variables ORDER BY id');
  res.json(await stmt.all());
});

app.post('/api/contract-variables', async (req, res) => {
  const userId = getUserId(req);
  const { name, label, description } = req.body;
  if (!name || !label) {
    return res.json({ success: false, message: '变量名和显示名必填' });
  }
  const stmt = db.prepare('INSERT INTO contract_variables (name, label, description) VALUES (?, ?, ?)');
  const result = await stmt.run(name, label, description || '');
  await addLog(userId, '', '新增', '合同变量', result.lastInsertRowid, label, `变量: ${label}`, req.ip);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/contract-variables/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [variable] = await db.prepare('SELECT var_name FROM contract_variables WHERE id = ?').all(req.params.id);
  const stmt = db.prepare('DELETE FROM contract_variables WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '合同变量', parseInt(req.params.id), variable?.var_name || '', `删除变量: ${variable?.var_name || req.params.id}`, req.ip);
  res.json({ success: true, message: '删除成功' });
});

// 创建变量表（如果不存在）
db.exec(`
  CREATE TABLE IF NOT EXISTS contract_variables (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT '2024-01-01 00:00:00'
  )
`);

// 检查并添加默认变量
const defaultVars = [
  { name: 'customer_name', label: '客户姓名' },
  { name: 'phone', label: '联系电话' },
  { name: 'address', label: '施工地址' },
  { name: 'project_name', label: '项目名称' },
  { name: 'amount', label: '合同金额' },
  { name: 'start_date', label: '开工日期' },
  { name: 'end_date', label: '完工日期' },
  { name: 'company_name', label: '公司名称' },
  { name: 'company_address', label: '公司地址' },
  { name: 'contact_person', label: '联系人' },
];

// 初始化合同变量默认数据（异步执行）
(async () => {
  const existingVars = await db.prepare('SELECT name FROM contract_variables').all();
  const existingNames = existingVars.map(v => v.name);
  for (const v of defaultVars) {
    if (!existingNames.includes(v.name)) {
      await db.prepare('INSERT INTO contract_variables (name, label) VALUES (?, ?)').run(v.name, v.label);
    }
  }
})();

// AI识别合同变量API
app.post('/api/ai/recognize-variables', async (req, res) => {
  try {
    const { content, type } = req.body;
    
    if (!content) {
      return res.json({ error: '内容不能为空' });
    }
    
    // 调用MiniMax API识别变量
    const apiKey = process.env.MINIMAX_API_KEY;
    const groupId = process.env.MINIMAX_GROUP_ID;
    
    if (!apiKey || !groupId) {
      console.log('MiniMax API密钥未配置，使用规则匹配');
      const variables = extractVariablesByRules(req.body.content || '');
      return res.json({ variables });
    }
    
    const prompt = `请分析以下合同文档内容，识别出所有需要用户填写的字段。

识别规则：
1. 冒号后面需要填写的内容（如：甲方名称：____、地址：____）
2. 带下划线的内容（如：_______下划线部分）
3. 带方框□需要勾选的内容
4. 常见的合同填写项

请提取所有可识别的字段，返回JSON数组格式。每个元素包含：
- name：变量名（英文驼峰式，如 jiaFangName）
- label：显示名称（中文，如 甲方名称）

只返回JSON数组，不要任何解释文字。

合同内容：
${content.substring(0, 4000)}

返回格式：
[{"name":"jiaFangName","label":"甲方名称"},{"name":"yiFangName","label":"乙方名称"},{"name":"jiaFangPhone","label":"甲方电话"},{"name":"projectAddress","label":"工程地址"},{"name":"contractAmount","label":"合同金额"},...]`;
    
    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'MiniMax-Text-01',
        messages: [
          { role: 'system', content: '你是一个专业的合同变量识别助手。请分析合同内容，提取需要用户填写的字段。只返回JSON数组格式，不要其他解释文字。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1
      })
    });
    
    const data = await response.json();
    
    if (data.choices && data.choices[0] && data.choices[0].messages) {
      const msg = data.choices[0].messages.find(m => m.role === 'assistant');
      if (msg && msg.text) {
        let resultText = msg.text.trim();
        try {
          resultText = resultText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
          const variables = JSON.parse(resultText);
          return res.json({ variables });
        } catch (e) {
          console.log('JSON解析失败，使用规则匹配');
        }
      }
    }
    
    // 出错或解析失败时使用规则匹配
    const variables = extractVariablesByRules(req.body.content || '');
    res.json({ variables });
  } catch (error) {
    console.error('AI识别变量错误:', error);
    // 出错时使用规则匹配
    const variables = extractVariablesByRules(req.body.content || '');
    res.json({ variables });
  }
});

// 规则匹配提取变量（扩展版）
function extractVariablesByRules(content) {
  const variables = [];
  const seen = new Set();
  
  const addVar = (name, label) => {
    if (!seen.has(name)) {
      seen.add(name);
      variables.push({ name, label });
    }
  };
  
  // 1. 甲方相关
  if (/甲方/.test(content)) {
    const patterns1 = [
      { name: 'jiaFangName', label: '甲方名称', regex: /甲方[（(]?[^）)]*?[）)]?[：:]?\s*[\u4e00-\u9fa5]{2,30}/ },
      { name: 'jiaFangContact', label: '甲方联系人', regex: /甲方[\u4e00-\u9fa5]*联系人[：:]?\s*[\u4e00-\u9fa5]{2,10}/ },
      { name: 'jiaFangPhone', label: '甲方电话', regex: /甲方[\u4e00-\u9fa5]*电话[：:]?\s*[0-9\-]{7,20}/ },
      { name: 'jiaFangMobile', label: '甲方手机', regex: /甲方[\u4e00-\u9fa5]*手机[：:]?\s*[0-9]{11}/ },
      { name: 'jiaFangAddress', label: '甲方地址', regex: /甲方[\u4e00-\u9fa5]*地址[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{5,50}/ },
      { name: 'jiaFangIdCard', label: '甲方身份证号', regex: /甲方[\u4e00-\u9fa5]*身份证[：:]?\s*[0-9Xx]{15,18}/ },
    ];
    patterns1.forEach(p => { if (p.regex.test(content)) addVar(p.name, p.label); });
  }
  
  // 2. 乙方相关
  if (/乙方/.test(content)) {
    const patterns2 = [
      { name: 'yiFangName', label: '乙方名称', regex: /乙方[（(]?[^）)]*?[）)]?[：:]?\s*[\u4e00-\u9fa5]{2,30}/ },
      { name: 'yiFangContact', label: '乙方联系人', regex: /乙方[\u4e00-\u9fa5]*联系人[：:]?\s*[\u4e00-\u9fa5]{2,10}/ },
      { name: 'yiFangPhone', label: '乙方电话', regex: /乙方[\u4e00-\u9fa5]*电话[：:]?\s*[0-9\-]{7,20}/ },
      { name: 'yiFangMobile', label: '乙方手机', regex: /乙方[\u4e00-\u9fa5]*手机[：:]?\s*[0-9]{11}/ },
      { name: 'yiFangAddress', label: '乙方地址', regex: /乙方[\u4e00-\u9fa5]*地址[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{5,50}/ },
      { name: 'yiFangIdCard', label: '乙方身份证号', regex: /乙方[\u4e00-\u9fa5]*身份证[：:]?\s*[0-9Xx]{15,18}/ },
      { name: 'yiFangBank', label: '乙方开户行', regex: /乙方[\u4e00-\u9fa5]*开户行[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{5,30}/ },
      { name: 'yiFangAccount', label: '乙方银行账号', regex: /乙方[\u4e00-\u9fa5]*账号[：:]?\s*[0-9]{10,25}/ },
      { name: 'yiFangLicense', label: '乙方营业执照', regex: /乙方[\u4e00-\u9fa5]*营业执照[号：:]?\s*[0-9]{15,20}/ },
    ];
    patterns2.forEach(p => { if (p.regex.test(content)) addVar(p.name, p.label); });
  }
  
  // 3. 工程/项目相关
  const patterns3 = [
    { name: 'projectName', label: '项目名称', regex: /项目名称[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{2,50}/ },
    { name: 'projectAddress', label: '工程地址', regex: /(?:工程|施工|项目)[\u4e00-\u9fa5]*地址[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{5,80}/ },
    { name: 'projectArea', label: '装修面积', regex: /(?:面积|建筑面积|装饰面积)[：:]?\s*[0-9.]{1,10}[平平方米]/ },
    { name: 'projectType', label: '工程类型', regex: /(?:户型|工程类型|装修类型)[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{2,20}/ },
    { name: 'engineeringAddress', label: '施工地址', regex: /施工地址[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{5,80}/ },
  ];
  patterns3.forEach(p => { if (p.regex.test(content)) addVar(p.name, p.label); });
  
  // 4. 日期相关
  const patterns4 = [
    { name: 'signDate', label: '签订日期', regex: /签订日期[：:]?\s*[0-9年\-月日]{8,20}/ },
    { name: 'startDate', label: '开工日期', regex: /开工日期[：:]?\s*[0-9年\-月日]{8,20}/ },
    { name: 'endDate', label: '竣工日期', regex: /竣工(?:日期|时间)?[：:]?\s*[0-9年\-月日]{8,20}/ },
    { name: 'signDate', label: '签署日期', regex: /签署日期[：:]?\s*[0-9年\-月日]{8,20}/ },
  ];
  patterns4.forEach(p => { if (p.regex.test(content)) addVar(p.name, p.label); });
  
  // 5. 金额相关
  const patterns5 = [
    { name: 'contractAmount', label: '合同金额', regex: /合同(?:总价|金额|总款)[：:]?\s*[0-9.,]+[元]?/ },
    { name: 'totalAmount', label: '总金额', regex: /总金额[：:]?\s*[0-9.,]+[元]?/ },
    { name: 'designFee', label: '设计费', regex: /设计费[：:]?\s*[0-9.,]+[元]?/ },
    { name: 'engineeringFee', label: '工程款', regex: /工程款[：:]?\s*[0-9.,]+[元]?/ },
    { name: 'depositAmount', label: '定金金额', regex: /定金[：:]?\s*[0-9.,]+[元]?/ },
    { name: 'premiumAmount', label: '预付款', regex: /预付款[：:]?\s*[0-9.,]+[元]?/ },
  ];
  patterns5.forEach(p => { if (p.regex.test(content)) addVar(p.name, p.label); });
  
  // 6. 通用字段
  const patterns6 = [
    { name: 'customerName', label: '客户姓名', regex: /(?:客户|业主|发包方)[\u4e00-\u9fa5]*姓名[：:]?\s*[\u4e00-\u9fa5]{2,10}/ },
    { name: 'customerPhone', regex: /客户[\u4e00-\u9fa5]*电话[：:]?\s*[0-9\-]{7,20}/ },
    { name: 'customerAddress', label: '客户地址', regex: /客户[\u4e00-\u9fa5]*地址[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{5,80}/ },
    { name: 'agentName', label: '委托代理人', regex: /委托代理人[：:]?\s*[\u4e00-\u9fa5]{2,10}/ },
    { name: 'idCard', label: '身份证号', regex: /身份证[号：:]?\s*[0-9Xx]{15,18}/ },
    { name: 'bankName', label: '开户银行', regex: /开户银行[：:]?\s*[\u4e00-\u9fa5]{4,20}/ },
    { name: 'bankAccount', label: '银行账号', regex: /银行账号?[：:]?\s*[0-9]{10,25}/ },
    { name: 'remark', label: '备注', regex: /备注[：:]?\s*[\u4e00-\u9fa5a-zA-Z0-9]{2,100}/ },
  ];
  patterns6.forEach(p => { if (p.regex.test(content)) addVar(p.name, p.label); });
  
  // 7. 从下划线模式提取（_____ 这种）
  const underlinePattern = /[\u4e00-\u9fa5]{2,10}[：:][\s　]*[_－—\-]{3,}/g;
  const matches = content.match(underlinePattern);
  if (matches) {
    matches.forEach((m, idx) => {
      const label = m.replace(/[：:][\s　]*[_－—\-]+/, '').trim();
      if (label && label.length >= 2 && label.length <= 10) {
        const name = 'field' + (idx + 1);
        if (!seen.has(name)) {
          addVar(name, label);
        }
      }
    });
  }
  
  return variables;
}

// ============================================================
// PDF 生成服务 - 使用 Puppeteer + Chrome 渲染
// ============================================================
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

// 依次探测可用的 Chrome/Edge 可执行文件。
// 背景：服务器（Windows Server 2012 R2 + PM2 跑在 systemprofile 下）执行 npm install 时
// puppeteer 的 postinstall 没把 Chromium 下载到
// C:\Windows\system32\config\systemprofile\.cache\puppeteer，导致 launch 直接抛
// "Could not find Chromium (rev. xxx)"。此时若系统装了 Chrome/Edge，指过去就能救。
function resolveChromePath() {
  // 1) 显式指定优先（部署时可配 CHROME_PATH 环境变量）
  const envPath = process.env.CHROME_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = isMac
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
    : isWindows
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/snap/bin/chromium',
        ];

  for (const p of candidates) {
    try { if (p && fs.existsSync(p)) return p; } catch (e) { /* ignore */ }
  }

  // 2) 退回 puppeteer 自带的 Chromium（若 postinstall 下载成功）
  try {
    const bundled = puppeteer.executablePath();
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch (e) { /* ignore */ }

  return null; // 交给 puppeteer 自己报错，错误信息更完整
}

const PUPPETEER_CONFIG = {
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
};
const _chromePath = resolveChromePath();
if (_chromePath) {
  PUPPETEER_CONFIG.executablePath = _chromePath;
  console.log('[PDF] 使用浏览器:', _chromePath);
} else {
  console.warn('[PDF][warn] 未找到 Chrome/Edge，PDF 导出将失败。请安装 Chrome 或设置 CHROME_PATH 环境变量');
}

// ============================================================
// v2.3.7：修复「导出 PDF 里图片空白」
// 背景：编辑器上传的图片插入的是**相对路径** `/uploads/logs/xxx.png`。
// page.setContent() 渲染在空白页(about:blank)上，相对路径没有 origin 可解析
// → 图片全部加载失败 → 导出的 PDF 里图片位置一片空白。
// 解决：渲染前补一个 <base>，让相对路径指向本机后端（同端口托管的 /uploads）。
// 纯新增，不改动任何原有的 PDF 生成流程。
// v2.4.0 补充：PDF 上传接口已从「base64 内嵌」改为「存 JPEG 文件 + 相对路径」，
//   正是靠这里的 <base> + waitUntil:'networkidle0' 才能正常渲染进导出的 PDF。
//   → 千万别删 withLocalBase()，否则合同里所有 PDF 转图和插入的图片都会在导出时变空白。
const LOCAL_BASE = `http://127.0.0.1:${PORT}/`;
function withLocalBase(html) {
  if (typeof html !== 'string' || !html) return html;
  if (/<base\s/i.test(html)) return html; // 前端已带 base，不重复插
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${LOCAL_BASE}">`);
  }
  return `<base href="${LOCAL_BASE}">` + html;
}

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    console.log('正在启动 Chrome...');
    if (browserInstance) {
      try { await browserInstance.close(); } catch(e) {}
      browserInstance = null;
    }
    browserInstance = await puppeteer.launch(PUPPETEER_CONFIG);
    console.log('Chrome 启动完成');
  }
  return browserInstance;
}

// POST /api/export-pdf
// Body: { html: string, filename: string }
app.post('/api/export-pdf', async (req, res) => {
  const { html, filename = 'export.pdf' } = req.body;
  if (!html) {
    return res.status(400).json({ error: 'html 参数不能为空' });
  }

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    // 设置内容（完整的 HTML 文档）
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: A4; margin: 0; }
          @media print {
            body { -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>${html}</body>
      </html>
    `;
    await page.setContent(withLocalBase(fullHtml), { waitUntil: 'networkidle0' });

    // 生成 PDF（交给 Chrome 根据 @page size:A4 自动处理）
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 10, right: 10, bottom: 10, left: 10 }
    });

    // Uint8Array 转 Buffer，确保二进制传输
    const buffer = Buffer.from(pdfBuffer);

    await page.close();

    // 返回 PDF 文件（直接用 end，避免 Express JSON 序列化）
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (err) {
    console.error('PDF 生成失败:', err);
    res.status(500).json({ error: 'PDF 生成失败: ' + err.message });
  }
});

// POST /api/export-pdf-multi — 多页合并
app.post('/api/export-pdf-multi', async (req, res) => {
  const { pages = [], filename = 'export.pdf' } = req.body;
  if (!pages.length) return res.status(400).json({ error: 'pages 不能为空' });
  try {
    const { PDFDocument } = require('pdf-lib');
    const browser = await getBrowser();
    const mergedPdf = await PDFDocument.create();
    for (const { html } of pages) {
      const page = await browser.newPage();
      // 直接使用前端传来的完整 HTML（已包含 DOCTYPE、<html>、<head>、<body>）
      // 不再二次包装，避免 body 没有高度导致 absolute 定位失效
      await page.setContent(withLocalBase(html), { waitUntil: 'networkidle0' });
      const pdfBytes = await page.pdf({ format:'A4', printBackground:true, margin:{top:0,right:0,bottom:0,left:0} });
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const [copied] = await mergedPdf.copyPages(pdfDoc, [0]);
      mergedPdf.addPage(copied);
      await page.close();
    }
    const buf = Buffer.from(await mergedPdf.save());
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
  } catch(err) {
    console.error('PDF合并失败:', err);
    res.status(500).json({ error:'PDF合并失败: ' + err.message });
  }
});

// ==================== 进度节点模板 API ====================
// GET 所有模板
app.get('/api/progress-node-templates', async (req, res) => {
  try {
    const templates = await db.prepare('SELECT * FROM progress_node_templates ORDER BY id').all();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST 新建模板
app.post('/api/progress-node-templates', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, description } = req.body;
    const result = await db.prepare(
      'INSERT INTO progress_node_templates (name, description, created_at, updated_at) VALUES (?, ?, NOW(), NOW())'
    ).run([name, description || '']);
    await addLog(userId, '', '新增', '节点模板', result.lastInsertRowid, name, `节点模板: ${name}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '模板创建成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT 更新模板
app.put('/api/progress-node-templates/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, description } = req.body;
    await db.prepare(
      'UPDATE progress_node_templates SET name=?, description=?, updated_at=NOW() WHERE id=?'
    ).run([name, description || '', req.params.id]);
    await addLog(userId, '', '编辑', '节点模板', parseInt(req.params.id), name, `更新节点模板: ${name}`, req.ip);
    res.json({ message: '模板更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE 删除模板
app.delete('/api/progress-node-templates/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [tpl] = await db.prepare('SELECT name FROM progress_node_templates WHERE id=?').all([req.params.id]);
    await db.prepare('DELETE FROM progress_node_templates WHERE id=?').run([req.params.id]);
    await addLog(userId, '', '删除', '节点模板', parseInt(req.params.id), tpl?.name || '', `删除节点模板: ${tpl?.name || req.params.id}`, req.ip);
    res.json({ message: '模板删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 模板节点 API ====================
// GET 某模板下的所有节点
app.get('/api/progress-node-template-nodes/:templateId', async (req, res) => {
  try {
    const nodes = await db.prepare(
      'SELECT n.*, t.name as sms_template_name FROM progress_node_template_nodes n LEFT JOIN sms_templates t ON n.default_sms_template_id=t.id WHERE n.template_id=? ORDER BY n.sort_order'
    ).all([req.params.templateId]);
    res.json(nodes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST 新增节点到模板
app.post('/api/progress-node-template-nodes', async (req, res) => {
  try {
    const { template_id, node_name, node_key, sort_order, default_sms_template_id, note } = req.body;
    const result = await db.prepare(
      'INSERT INTO progress_node_template_nodes (template_id, node_name, node_key, sort_order, default_sms_template_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())'
    ).run([template_id, node_name, node_key, sort_order || 0, default_sms_template_id || null, note || null]);
    res.json({ id: result.lastInsertRowid, message: '节点添加成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT 更新模板节点
app.put('/api/progress-node-template-nodes/:id', async (req, res) => {
  try {
    const { node_name, node_key, sort_order, default_sms_template_id, note } = req.body;
    await db.prepare(
      'UPDATE progress_node_template_nodes SET node_name=?, node_key=?, sort_order=?, default_sms_template_id=?, note=? WHERE id=?'
    ).run([node_name, node_key, sort_order || 0, default_sms_template_id || null, note || null, req.params.id]);
    res.json({ message: '节点更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE 删除模板节点
app.delete('/api/progress-node-template-nodes/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    await db.prepare('DELETE FROM progress_node_template_nodes WHERE id=?').run([req.params.id]);
    res.json({ message: '节点删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 项目节点 API ====================
// GET 某项目的所有节点
app.get('/api/progress-nodes/:projectId', async (req, res) => {
  try {
    const nodes = await db.prepare(
      'SELECT n.*, t.name as sms_template_name FROM project_progress_nodes n LEFT JOIN sms_templates t ON n.sms_template_id=t.id WHERE n.project_id=? ORDER BY n.sort_order'
    ).all([req.params.projectId]);
    res.json(nodes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST 用模板初始化项目节点（同时自动分配计划日期）
app.post('/api/progress-nodes/init/:projectId', async (req, res) => {
  try {
    const { template_id, force } = req.body;
    const userId = getUserId(req);

    // 获取项目信息（用于计算日期范围）
    const [project] = await db.prepare('SELECT * FROM projects WHERE id = ?').all([req.params.projectId]);
    if (!project) return res.status(404).json({ error: '项目不存在' });

    // 保护：项目已有节点时拒绝重复初始化（除非显式传 force=true）（2026-10-09 加）
    const existingCount = (await db.prepare(
      'SELECT COUNT(*) as count FROM project_progress_nodes WHERE project_id = ?'
    ).get([req.params.projectId]))?.count || 0;
    if (existingCount > 0 && !force) {
      return res.status(409).json({
        error: '项目已有节点，禁止重复初始化',
        existingCount,
        hint: '如需重新初始化，请传 force=true（会先清空已有节点）'
      });
    }

    const templateNodes = await db.prepare(
      'SELECT * FROM progress_node_template_nodes WHERE template_id=? ORDER BY sort_order'
    ).all([template_id]);
    if (!templateNodes.length) {
      return res.status(400).json({ error: '模板无节点' });
    }

    // 如果项目有起止日期，按工期平均分配节点时间段
    let planStart = null;
    let planEnd = null;
    if (project.start_date && project.end_date) {
      const start = new Date(project.start_date);
      const end = new Date(project.end_date);
      const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
      const nodeCount = templateNodes.length;
      const daysPerNode = Math.ceil(totalDays / nodeCount);
      planStart = start;
      for (let i = 0; i < templateNodes.length; i++) {
        const nodeStart = new Date(start.getTime() + i * daysPerNode * 86400000);
        const nodeEnd = new Date(start.getTime() + (i + 1) * daysPerNode * 86400000 - 86400000);
        templateNodes[i]._plan_start = nodeStart.toISOString().slice(0, 10);
        templateNodes[i]._plan_end = nodeEnd.toISOString().slice(0, 10);
      }
    }

    for (const n of templateNodes) {
      await db.prepare(
        'INSERT INTO project_progress_nodes (project_id, node_name, node_key, sort_order, status, plan_date, plan_end_date, sms_template_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
      ).run([
        req.params.projectId, n.node_name, n.node_key, n.sort_order, 'pending',
        n._plan_start || null, n._plan_end || null, n.default_sms_template_id || null
      ]);
    }
    await addLog(userId, '', '新增', '节点管理', parseInt(req.params.projectId), project.name, `从模板初始化项目节点，共${templateNodes.length}个节点`, req.ip);
    res.json({ message: '项目节点初始化成功', count: templateNodes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST 新增节点到项目
app.post('/api/progress-nodes', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { project_id, node_name, node_key, sort_order, sms_template_id } = req.body;
    const result = await db.prepare(
      'INSERT INTO project_progress_nodes (project_id, node_name, node_key, sort_order, status, sms_template_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())'
    ).run([project_id, node_name, node_key, sort_order || 0, 'pending', sms_template_id || null]);
    await addLog(userId, '', '新增', '节点管理', result.lastInsertRowid, node_name, `新增节点: ${node_name}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '节点添加成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT 更新项目节点
app.put('/api/progress-nodes/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { node_name, node_key, sort_order, status, plan_date, actual_date, sms_template_id, note } = req.body;
    await db.prepare(
      'UPDATE project_progress_nodes SET node_name=?, node_key=?, sort_order=?, status=?, plan_date=?, actual_date=?, sms_template_id=?, note=?, updated_at=NOW() WHERE id=?'
    ).run([node_name, node_key, sort_order || 0, status, plan_date || null, actual_date || null, sms_template_id || null, note || null, req.params.id]);
    await addLog(userId, '', '编辑', '节点管理', req.params.id, node_name, `更新节点: ${node_name}，状态: ${status}`, req.ip);
    res.json({ message: '节点更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE 删除项目节点
app.delete('/api/progress-nodes/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [node] = await db.prepare('SELECT node_name FROM project_progress_nodes WHERE id=?').all([req.params.id]);
    const nodeName = node ? node.node_name : req.params.id;
    await db.prepare('DELETE FROM project_progress_nodes WHERE id=?').run([req.params.id]);
    await addLog(userId, '', '删除', '节点管理', req.params.id, nodeName, `删除节点: ${nodeName}`, req.ip);
    res.json({ message: '节点删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 短信模板 API ====================
// GET 所有短信模板
app.get('/api/sms-templates', async (req, res) => {
  try {
    const templates = await db.prepare('SELECT id, name, content, variables, is_active, sign_name, aliyun_template_code, created_at FROM sms_templates WHERE is_active=1 ORDER BY id').all();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST 新建短信模板
app.post('/api/sms-templates', checkPermission('sms:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, content, variables } = req.body;
    const result = await db.prepare(
      'INSERT INTO sms_templates (name, content, variables, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())'
    ).run([name, content, variables || null]);
    await addLog(userId, '', '新增', '短信模板', result.lastInsertRowid, name, `短信模板: ${name}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '短信模板创建成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT 更新短信模板
// 2026-10-12 修复：
//   1) 之前 `addLog(userId, ...)` 引用外层 userId，无定义 → ReferenceError 500；现补上 const userId = getUserId(req);
//   2) sign_name / aliyun_template_code 不再由本路由更新——这两个字段只由同步接口 /api/sms-templates/sync-aliyun 写，
//      前端编辑表单不带这俩字段（form 只有 name/content/is_active），原实现 `sign_name || null` 会把已同步
//      到阿里云的 sign_name/code 清成 null，造成已同步模板丢失。下次发短信将找不到对应阿里云模板。
app.put('/api/sms-templates/:id', checkPermission('sms:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, content, variables, is_active } = req.body;
    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push('name=?'); params.push(name); }
    if (content !== undefined) { fields.push('content=?'); params.push(content); }
    if (variables !== undefined) { fields.push('variables=?'); params.push(variables); }
    if (is_active !== undefined) { fields.push('is_active=?'); params.push(is_active ? 1 : 0); }
    if (!fields.length) return res.json({ code: 0, message: '无更新内容' });
    fields.push('updated_at=NOW()');
    params.push(req.params.id);
    await db.prepare(`UPDATE sms_templates SET ${fields.join(', ')} WHERE id=?`).run(params);
    await addLog(userId, '', '编辑', '短信模板', parseInt(req.params.id), name || '', `更新短信模板: ${name || ''}`, req.ip);
    res.json({ message: '短信模板更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE 删除短信模板
app.delete('/api/sms-templates/:id', checkPermission('sms:delete'), async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [tpl] = await db.prepare('SELECT name FROM sms_templates WHERE id=?').all([req.params.id]);
    await db.prepare('DELETE FROM sms_templates WHERE id=?').run([req.params.id]);
    await addLog(userId, '', '删除', '短信模板', parseInt(req.params.id), tpl?.name || '', `删除短信模板: ${tpl?.name || req.params.id}`, req.ip);
    res.json({ message: '短信模板删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST 同步模板到阿里云
app.post('/api/sms-templates/sync-aliyun', async (req, res) => {
  try {
    const { template_id, sign_name } = req.body;
    if (!template_id || !sign_name) {
      return res.status(400).json({ error: '缺少template_id或sign_name' });
    }

    // 获取模板内容
    const [tmpl] = await db.prepare('SELECT * FROM sms_templates WHERE id=?').all(template_id);
    if (!tmpl) return res.status(404).json({ error: '模板不存在' });

    // 获取阿里云配置（DB里setting_value是双重JSON：{"category":"sms","setting_value":{...}}）
    const [smsSettings] = await db.prepare("SELECT setting_value FROM system_settings WHERE category='sms'").all();
    let smsConfig = smsSettings ? JSON.parse(smsSettings.setting_value) : null;
    // 取最内层配置
    if (smsConfig && smsConfig.setting_value) smsConfig = smsConfig.setting_value;
    console.log('【DEBUG sync-aliyun】smsConfig:', JSON.stringify(smsConfig), 'provider:', smsConfig?.provider);
    if (!smsConfig || smsConfig.provider !== 'aliyun') {
      return res.status(400).json({ error: '阿里云短信未配置' });
    }

    // 阿里云 CreateSmsTemplate 要求变量格式为 ${code}，$ 在左边
    // 系统模板的 {客户姓名} -> ${name} 映射，供 SendSms 的 templateParam 英文 key 对应
    const varMap = { '客户姓名': 'name', '项目名称': 'project', '节点名称': 'node', '日期': 'date' };
    const varTypeMap = { name: 'name', project: 'user_nick', node: 'user_nick', date: 'time' };
    let aliyunContent = tmpl.content;
    for (const [cn, en] of Object.entries(varMap)) {
      aliyunContent = aliyunContent.split('{' + cn + '}').join('${' + en + '}');
    }
    // 提取模板中的变量，生成 TemplateRule（对象格式，key=变量名，value=阿里云类型枚举中文名）
    const foundVars = [...aliyunContent.matchAll(/\$\{([^}]+)\}/g)].map(m => m[1]);
    const templateRuleObj = {};
    foundVars.forEach(v => {
      templateRuleObj[v] = varTypeMap[v] || '个人姓名';
    });
    const templateRuleStr = JSON.stringify(templateRuleObj);
    console.log('【DEBUG sync-aliyun】原始:', tmpl.content, '| 转换后:', aliyunContent, '| TemplateRule:', templateRuleStr);

    // 调用阿里云 CreateSmsTemplate API
    const result = await addAliyunSmsTemplate({
      accessKeyId: smsConfig.access_key_id,
      accessKeySecret: smsConfig.access_key_secret,
      signName: sign_name,
      templateName: tmpl.name,
      templateContent: aliyunContent,
      templateRule: templateRuleStr,
      remark: '由系统同步'
    });

    if (result.Code === 'OK' || result.TemplateCode) {
      const aliyunTemplateCode = result.TemplateCode;
      console.log('【同步阿里云成功】TemplateCode:', aliyunTemplateCode);
      // 保存到模板记录
      await db.prepare(
        'UPDATE sms_templates SET sign_name=?, aliyun_template_code=?, updated_at=NOW() WHERE id=?'
      ).run(sign_name, aliyunTemplateCode, template_id);
      res.json({ success: true, template_code: aliyunTemplateCode, message: '同步成功' });
    } else {
      console.log('【同步阿里云失败】result:', JSON.stringify(result));
      res.status(400).json({ error: result.Message || '同步失败' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 阿里云添加模板 API ====================
function addAliyunSmsTemplate({ accessKeyId, accessKeySecret, signName, templateName, templateContent, templateRule, remark }) {
  return new Promise((resolve, reject) => {
    const domain = 'dysmsapi.aliyuncs.com';
    const version = '2017-05-25';
    const action = 'CreateSmsTemplate';

    const params = {
      Format: 'JSON',
      Version: version,
      AccessKeyId: accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      Timestamp: new Date().toISOString(),
      SignatureVersion: '1.0',
      SignatureNonce: Math.random().toString(),
      Action: action,
      RelatedSignName: signName,
      TemplateType: '1',
      TemplateName: templateName,
      TemplateContent: templateContent,
      TemplateRule: templateRule, // JSON字符串，如 {"name":"name","project":"other_number2"}
      Remark: remark
    };

    const sortedKeys = Object.keys(params).sort();
    const canonicalized = sortedKeys.map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    // stringToSign：阿里云要求对 canonicalized 做双重编码
    const stringToSign = 'GET&%2F&' + encodeURIComponent(canonicalized);
    const signature = crypto.createHmac('sha1', accessKeySecret + '&').update(stringToSign).digest('base64');
    const queryString = canonicalized + '&Signature=' + encodeURIComponent(signature);

    // 解码展示实际发送的参数（调试用）
    const decodedParams = sortedKeys.map(k => k + '=' + decodeURIComponent(encodeURIComponent(params[k]))).join(' | ');
    console.log('【addAliyunSmsTemplate】实际发送参数:', decodedParams);
    console.log('【addAliyunSmsTemplate】完整QueryString:', queryString.slice(0, 200) + '...');

    const req = https.request({ hostname: domain, method: 'GET', path: '/?' + queryString }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error(data)); } });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('请求超时')); });
    req.end();
  });
}

// ==================== 阿里云短信发送函数 ====================
function sendAliyunSms({ accessKeyId, accessKeySecret, signName, templateCode, phone, templateParam }) {
  return new Promise((resolve, reject) => {
    const domain = 'dysmsapi.aliyuncs.com';
    const version = '2017-05-25';
    const action = 'SendSms';

    const params = {
      Format: 'JSON',
      Version: version,
      AccessKeyId: accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      Timestamp: new Date().toISOString(),
      SignatureVersion: '1.0',
      SignatureNonce: Math.random().toString(),
      Action: action,
      SignName: signName,
      TemplateCode: templateCode,
      PhoneNumbers: phone,
      TemplateParam: templateParam
    };

    // 构造待签名字符串（阿里云要求双重编码）
    const sortedKeys = Object.keys(params).sort();
    const canonicalized = sortedKeys.map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    const stringToSign = 'GET&%2F&' + encodeURIComponent(canonicalized);
    const signature = crypto.createHmac('sha1', accessKeySecret + '&')
      .update(stringToSign).digest('base64');

    const queryString = canonicalized + '&Signature=' + encodeURIComponent(signature);
    const options = {
      hostname: domain,
      method: 'GET',
      path: '/?' + queryString
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error(data)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('请求超时')); });
    req.end();
  });
}

// ==================== 短信发送 API ====================
app.post('/api/sms-send', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { node_id, project_id, customer_phone } = req.body;
    
    // 获取节点、项目、模板信息
    const [node] = await db.prepare('SELECT n.*, p.name as project_name, c.name as customer_name, c.phone as customer_phone FROM project_progress_nodes n LEFT JOIN projects p ON n.project_id=p.id LEFT JOIN customers c ON p.customer_id=c.id WHERE n.id=?').all(node_id);
    if (!node) return res.status(404).json({ error: '节点不存在' });
    
    const templateId = node.sms_template_id;
    let smsContent = '';
    let templateName = '';
    
    if (templateId) {
      const [tmpl] = await db.prepare('SELECT * FROM sms_templates WHERE id=?').all(templateId);
      if (tmpl) {
        templateName = tmpl.name;
        // 替换变量
        smsContent = tmpl.content
          .replace(/\{客户姓名\}/g, node.customer_name || '')
          .replace(/\{项目名称\}/g, node.project_name || '')
          .replace(/\{节点名称\}/g, node.node_name || '')
          .replace(/\{日期\}/g, new Date().toLocaleDateString('zh-CN'));
      }
    }
    
    // 国内手机号加86前缀（阿里云要求）
    const phone = customer_phone || node.customer_phone;
    const phoneWithCode = /^86/.test(phone) ? phone : '86' + phone;
    if (!phone) {
      // 写入失败日志
      await db.prepare(
        'INSERT INTO sms_send_logs (project_id, node_id, customer_name, customer_phone, template_id, template_name, sms_content, send_time, status, fail_reason) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)'
      ).run(project_id, node_id, node.customer_name || '', '', templateId, templateName, smsContent, 'failed', '客户手机号为空');
      return res.status(400).json({ error: '客户手机号为空' });
    }
    
    // 读取阿里云短信配置（DB里setting_value是双重JSON）
    const [smsSettings] = await db.prepare("SELECT setting_value FROM system_settings WHERE category='sms'").all();
    let smsConfig = smsSettings ? JSON.parse(smsSettings.setting_value) : null;
    if (smsConfig && smsConfig.setting_value) smsConfig = smsConfig.setting_value;
    const smsApiConfigured = smsConfig && smsConfig.provider === 'aliyun' && smsConfig.access_key_id && smsConfig.access_key_secret;

    // 优先用模板自己绑定的阿里云模板CODE和签名，否则用全局配置
    let templateCodeForSend = smsConfig ? smsConfig.template_code : '';
    let signNameForSend = smsConfig ? smsConfig.sign_name : '';
    if (templateId) {
      const [tmpl] = await db.prepare('SELECT aliyun_template_code, sign_name FROM sms_templates WHERE id=?').all(templateId);
      if (tmpl && tmpl.aliyun_template_code) {
        templateCodeForSend = tmpl.aliyun_template_code;
        signNameForSend = tmpl.sign_name || smsConfig.sign_name;
      }
    }

    let sendStatus = 'failed';
    let failReason = '';

    if (smsApiConfigured) {
      // 真实发送阿里云短信
      try {
        const result = await sendAliyunSms({
          accessKeyId: smsConfig.access_key_id,
          accessKeySecret: smsConfig.access_key_secret,
          signName: signNameForSend,
          templateCode: templateCodeForSend,
          phone: phoneWithCode,
          templateParam: JSON.stringify({
            name: node.customer_name || '',
            project: node.project_name || '',
            node: node.node_name || '',
            date: new Date().toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric' })
          })
        });
        if (result.Code === 'OK') {
          sendStatus = 'success';
        } else {
          sendStatus = 'failed';
          failReason = result.Message || '发送失败';
        }
      } catch (e) {
        sendStatus = 'failed';
        failReason = e.message;
      }
    } else {
      sendStatus = 'failed';
      failReason = '短信接口未配置（APIKEY/Secret未申请），发送队列等待中';
    }
    
    // 写入发送日志
    await db.prepare(
      'INSERT INTO sms_send_logs (project_id, node_id, customer_name, customer_phone, template_id, template_name, sms_content, send_time, status, fail_reason) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)'
    ).run(project_id, node_id, node.customer_name || '', phone, templateId, templateName, smsContent, sendStatus, failReason);
    
    // 更新节点是否已发送短信标记
    await db.prepare('UPDATE project_progress_nodes SET is_sms_sent=? WHERE id=?').run(sendStatus === 'success' ? 1 : 0, node_id);
    
    res.json({ status: sendStatus, message: failReason || '发送成功', content: smsContent, phone, log_id: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 短信发送日志 API ====================
app.get('/api/sms-send-logs', async (req, res) => {
  try {
    const logs = await db.prepare(`
      SELECT l.*, n.node_name, p.name as project_name, t.name as template_name
      FROM sms_send_logs l
      LEFT JOIN project_progress_nodes n ON l.node_id=n.id
      LEFT JOIN projects p ON l.project_id=p.id
      LEFT JOIN sms_templates t ON l.template_id=t.id
      ORDER BY l.created_at DESC LIMIT 100
    `).all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 系统设置 API ====================
// 敏感字段：读取时一律打码，只回末 4 位；前端留空 = 不修改（保留库中原值）
const SETTINGS_SECRET_KEYS = ['access_key_secret', 'app_secret', 'smtp_password', 'aes_key', 'token', 'secret'];

function maskSecretValue(v) {
  if (typeof v !== 'string' || v === '') return v;
  if (v.length <= 4) return '****';
  return '****' + v.slice(-4);
}

function maskSettingsSecrets(input) {
  if (Array.isArray(input)) return input.map(maskSettingsSecrets);
  if (!input || typeof input !== 'object') return input;
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string' && SETTINGS_SECRET_KEYS.includes(k)) {
      out[k] = maskSecretValue(v);
    } else if (v && typeof v === 'object') {
      out[k] = maskSettingsSecrets(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// 空值或仍是打码串 → 视为「不修改」
function isMaskedOrEmpty(v) {
  return v === undefined || v === null || v === '' ||
    (typeof v === 'string' && v.startsWith('****'));
}

async function getSettingsCategory(category) {
  const row = await db.prepare('SELECT setting_value FROM system_settings WHERE category = ?').get(category);
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.setting_value);
    return parsed.setting_value || parsed || {};
  } catch {
    return {};
  }
}

app.get('/api/system-settings', checkPermission('settings:read'), async (req, res) => {
  try {
    const rows = await db.prepare('SELECT * FROM system_settings').all();
    const settings = {};
    rows.forEach(row => {
      try {
        const parsed = JSON.parse(row.setting_value);
        // SMS 配置是双重JSON格式，取最内层 setting_value；其他保持原样
        settings[row.category] = parsed.setting_value || parsed;
      } catch {
        settings[row.category] = row.setting_value;
      }
    });
    res.json(maskSettingsSecrets(settings));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/system-settings/sms', checkPermission('settings:write'), async (req, res) => {
  try {
    // 前端提交的是扁平对象 {provider, access_key_id, ...}，需要包裹成双重JSON格式
    const body = { ...req.body };
    // 密钥留空/仍是打码串 → 沿用库中原值（防止把 ****abcd 这种打码串写进库）
    if (isMaskedOrEmpty(body.access_key_secret)) {
      const old = await getSettingsCategory('sms');
      body.access_key_secret = old.access_key_secret || '';
    }
    const value = JSON.stringify({ category: 'sms', setting_value: body });
    const existing = await db.prepare('SELECT id FROM system_settings WHERE category = ?').get('sms');
    if (existing) {
      await db.prepare('UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE category = ?')
        .run(value, new Date().toISOString(), 'sms');
    } else {
      await db.prepare('INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('sms', value, new Date().toISOString(), new Date().toISOString());
    }
    res.json({ message: '保存成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/system-settings/wechat', checkPermission('settings:write'), async (req, res) => {
  try {
    const value = JSON.stringify(req.body);
    const existing = await db.prepare('SELECT id FROM system_settings WHERE category = ?').get('wechat');
    if (existing) {
      await db.prepare('UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE category = ?')
        .run(value, new Date().toISOString(), 'wechat');
    } else {
      await db.prepare('INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('wechat', value, new Date().toISOString(), new Date().toISOString());
    }
    res.json({ message: '保存成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/system-settings/email', checkPermission('settings:write'), async (req, res) => {
  try {
    const body = { ...req.body };
    // 邮箱密码留空/仍是打码串 → 沿用库中原值
    if (isMaskedOrEmpty(body.smtp_password)) {
      const old = await getSettingsCategory('email');
      body.smtp_password = old.smtp_password || '';
    }
    const value = JSON.stringify(body);
    const existing = await db.prepare('SELECT id FROM system_settings WHERE category = ?').get('email');
    if (existing) {
      await db.prepare('UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE category = ?')
        .run(value, new Date().toISOString(), 'email');
    } else {
      await db.prepare('INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('email', value, new Date().toISOString(), new Date().toISOString());
    }
    res.json({ message: '保存成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 站内消息通知 API（MySQL: notifications 表）====================
app.get('/api/notifications', async (req, res) => {
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

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    await mysqlPool.query('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: '已标记已读' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/read-all', async (req, res) => {
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

app.get('/api/notifications/unread-count', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { phone: phoneParam } = req.query;

    let phone = phoneParam || null;
    if (!phone && userId > 0) {
      const [emp] = await db.prepare('SELECT phone FROM employees WHERE id = ?').all(userId);
      phone = emp ? emp.phone : null;
    }
    if (!phone) { res.json({ count: 0 }); return; }

    // v2.3.1：合并两表（notifications 按手机号 + messages 按 user_id），与移动端消息页口径一致
    const [r1] = await mysqlPool.query('SELECT COUNT(*) AS cnt FROM notifications WHERE receiver_phone = ? AND is_read = 0', [phone]);
    const [r2] = await mysqlPool.query('SELECT COUNT(*) AS cnt FROM messages WHERE user_id = ? AND is_read = 0', [userId || 0]);
    const count = Number(r1[0].cnt || 0) + Number(r2[0].cnt || 0);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 消息管理 API（后台增删改）====================
// POST 新增消息（管理员手动发消息）
app.post('/api/notifications', async (req, res) => {
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
app.delete('/api/notifications/:id', async (req, res) => {
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
app.delete('/api/notifications', async (req, res) => {
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
app.get('/api/notifications/admin-list', async (req, res) => {
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
app.get('/api/system-settings/notifications', async (req, res) => {
  try {
    const [row] = await mysqlPool.query('SELECT * FROM system_settings WHERE category = ?', ['notifications']);
    if (row[0]) {
      try { res.json(JSON.parse(row[0].setting_value)); } catch { res.json({}); }
    } else { res.json(getDefaultNotificationRules()); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/system-settings/notifications', checkPermission('settings:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const value = JSON.stringify(req.body);
    const [existing] = await mysqlPool.query('SELECT id FROM system_settings WHERE category = ?', ['notifications']);
    if (existing[0]) {
      await mysqlPool.query('UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE category = ?',
        [value, new Date().toISOString(), 'notifications']);
    } else {
      await mysqlPool.query('INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES (?, ?, ?, ?)',
        ['notifications', value, new Date().toISOString(), new Date().toISOString()]);
    }
    await addLog(userId, '', '编辑', '系统设置', null, '通知规则', `更新通知规则设置`, req.ip);
    res.json({ message: '保存成功' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== 客户端可见（业主 8 开关，全局一份）v2.3.1 P3 ====================
const __DEFAULT_CV = () => ({
  project_info: true,
  project_log: true,
  inspection: true,
  acceptance: true,
  rectification: true,
  contract_amount: false,
  family_members: true,
  messages: true,
});

app.get('/api/system-settings/customer_visibility', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE category = 'customer_visibility' LIMIT 1");
    if (rows && rows[0]) {
      try { return res.json(JSON.parse(rows[0].setting_value)); } catch {}
    }
    res.json(__DEFAULT_CV());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/system-settings/customer_visibility', checkPermission('settings:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const incoming = (req.body && req.body.setting_value) || req.body || {};
    // 归并默认值 + 白名单过滤，避免脏数据写入
    const merged = { ...__DEFAULT_CV() };
    const keys = Object.keys(__DEFAULT_CV());
    for (const k of keys) if (k in incoming) merged[k] = !!incoming[k];
    const value = JSON.stringify(merged);
    const [existing] = await pool.query("SELECT id FROM system_settings WHERE category = 'customer_visibility' LIMIT 1");
    if (existing && existing[0]) {
      await pool.query('UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE category = ?',
        [value, new Date().toISOString(), 'customer_visibility']);
    } else {
      await pool.query('INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES (?, ?, ?, ?)',
        ['customer_visibility', value, new Date().toISOString(), new Date().toISOString()]);
    }
    await addLog(userId, '', '编辑', '系统设置', null, '客户端可见', `更新客户端可见配置: ${JSON.stringify(merged)}`, req.ip);
    res.json({ message: '保存成功', data: merged });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== 微信接入 API ====================

// 微信 API 内部函数：通过 code 获取 openid/session_key（小程序用）
async function getWechatSession(code, type, config) {
  const url = type === 'mini'
    ? `https://api.weixin.qq.com/sns/jscode2session?appid=${config.app_id}&secret=${config.app_secret}&js_code=${code}&grant_type=authorization_code`
    : `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${config.app_id}&secret=${config.app_secret}&code=${code}&grant_type=authorization_code`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// 微信 API 内部函数：获取用户信息（公众号/开放平台）
async function getWechatUserInfo(openid, accessToken) {
  const url = `https://api.weixin.qq.com/cgi-bin/user/info?access_token=${accessToken}&openid=${openid}&lang=zh_CN`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// 微信 API 内部函数：获取全局 access_token（用于发送模板消息）
async function getGlobalAccessToken(config) {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${config.app_id}&secret=${config.app_secret}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ==================== 员工微信绑定：小程序码生成 ====================
// access_token 缓存：微信限 2000 次/天，不缓存的话管理员多点几次生成码就会耗尽额度。
// 单进程部署（node server.js）下内存缓存足够；若将来上 pm2 cluster 需换 Redis。
const wxTokenCache = new Map(); // appid → { token, expiresAt }

async function getCachedAccessToken(cfg) {
  const key = cfg.app_id;
  const hit = wxTokenCache.get(key);
  // 提前 5 分钟刷新，避免临界点用到刚过期的 token
  if (hit && hit.expiresAt > Date.now() + 5 * 60 * 1000) return hit.token;
  const r = await getGlobalAccessToken(cfg);
  if (!r || !r.access_token) {
    throw new Error((r && r.errmsg) || '获取 access_token 失败');
  }
  wxTokenCache.set(key, {
    token: r.access_token,
    expiresAt: Date.now() + (Number(r.expires_in) || 7200) * 1000,
  });
  return r.access_token;
}

/**
 * 生成员工绑定用的小程序码（返回 Buffer，失败抛错）
 *
 * ⚠️ check_path 必须 false：实测线上版本未索引页面时传 true 会对所有 page 报
 *    41030 invalid page（连 pages/home/index 都失败）。
 *    代价是微信不校验页面是否存在 —— 所以 pages/bind/scan 必须先随新版发布上线。
 *
 * @param {string} ticket 一次性票据，放 scene（微信限制 32 字符）
 * @param {object} cfg    { app_id, app_secret }
 */
function generateMiniCode(ticket, cfg) {
  return new Promise(async (resolve, reject) => {
    try {
      const token = await getCachedAccessToken(cfg);
      const bodyStr = JSON.stringify({
        scene: String(ticket).slice(0, 32),
        page: 'pages/bind/scan',
        width: 430,
        check_path: false,
      });
      const req = https.request(
        `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${token}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr),
          },
        },
        (resp) => {
          const chunks = [];
          resp.on('data', (c) => chunks.push(c));
          resp.on('end', () => {
            const buf = Buffer.concat(chunks);
            const ct = String(resp.headers['content-type'] || '');
            // 成功返回二进制图片；失败返回 JSON
            if (ct.includes('json') || ct.includes('text')) {
              let msg = buf.toString().slice(0, 200);
              try { msg = JSON.parse(buf.toString()).errmsg || msg; } catch (_) { /* 保留原文 */ }
              return reject(new Error('小程序码生成失败：' + msg));
            }
            resolve(buf);
          });
        }
      );
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/** 库里的 DATETIME 是 UTC 字符串（dateStrings:true），转时间戳要补 Z */
function utcStrToTs(s) {
  if (!s) return 0;
  const str = String(s);
  return new Date(str.includes('T') ? str : str.replace(' ', 'T') + 'Z').getTime();
}

// jscode2session 的 errmsg 是英文 + rid（"invalid code, rid: 6ad9..."），
// 直接甩给用户看不懂。统一翻译成人话，原始信息只进日志。
function friendlyWxErr(errmsg) {
  const m = String(errmsg || '');
  if (/invalid code|code been used|40029|40163/i.test(m)) return '微信登录凭证已失效，请重新进入小程序';
  if (/45011|frequen/i.test(m)) return '操作太频繁，请稍后再试';
  if (/40125|invalid appsecret/i.test(m)) return '小程序密钥配置有误，请联系管理员';
  if (/40013|invalid appid/i.test(m)) return '小程序 AppID 配置有误，请联系管理员';
  return '微信登录失败，请重试';
}

// 微信 API 内部函数：发送模板消息
async function sendWechatTemplateMsg(openid, templateId, data, accessToken) {
  const url = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`;
  const body = {
    touser: openid,
    template_id: templateId,
    data: data
  };
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// 读取 system_settings（兼容双重 JSON）
async function getSetting(category) {
  try {
    const [row] = await pool.query('SELECT setting_value FROM system_settings WHERE category = ?', [category]);
    if (!row[0]) return null;
    const parsed = JSON.parse(row[0].setting_value);
    return parsed.setting_value || parsed;
  } catch { return null; }
}

// 保存 system_settings（兼容双重 JSON）
async function saveSetting(category, data) {
  const value = JSON.stringify({ setting_value: data });
  const [existing] = await pool.query('SELECT id FROM system_settings WHERE category = ?', [category]);
  if (existing[0]) {
    await pool.query('UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE category = ?',
      [value, new Date().toISOString(), category]);
  } else {
    await pool.query('INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [category, value, new Date().toISOString(), new Date().toISOString()]);
  }
}

// GET /api/wechat/config — 获取三个平台配置
app.get('/api/wechat/config', async (req, res) => {
  try {
    const [mp, mini, openplatform] = await Promise.all([
      getSetting('wechat_mp'),
      getSetting('wechat_mini'),
      getSetting('wechat_openplatform')
    ]);
    res.json({ mp: mp || {}, mini: mini || {}, openplatform: openplatform || {} });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/wechat/config — 保存三个平台配置
app.put('/api/wechat/config', checkPermission('settings:write'), async (req, res) => {
  try {
    const { mp, mini, openplatform } = req.body;
    if (mp) await saveSetting('wechat_mp', mp);
    if (mini) await saveSetting('wechat_mini', mini);
    if (openplatform) await saveSetting('wechat_openplatform', openplatform);
    res.json({ message: '保存成功' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/wechat/oauth-url — 获取微信授权链接
// type=mp（公众号）或 type=mini（小程序）
app.get('/api/wechat/oauth-url', async (req, res) => {
  try {
    const { type } = req.query;
    const config = type === 'mini' ? await getSetting('wechat_mini') : await getSetting('wechat_mp');
    if (!config || !config.app_id || !config.app_secret) {
      return res.status(400).json({ error: '微信配置未完成，请在系统设置中配置' });
    }
    const redirectUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/api/wechat/callback?type=${type}`);
    const scope = type === 'mini' ? 'snsapi_userinfo' : 'snsapi_userinfo';
    const state = type; // 标记来源类型
    const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${config.app_id}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}#wechat_redirect`;
    res.json({ url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/wechat/callback — 微信授权回调
app.get('/api/wechat/callback', async (req, res) => {
  try {
    const { code, type, state } = req.query;
    if (!code) return res.status(400).json({ error: '缺少 code' });

    const config = state === 'mini' ? await getSetting('wechat_mini') : await getSetting('wechat_mp');
    if (!config) return res.status(400).json({ error: '微信配置未完成' });

    // 用 code 换 openid + access_token
    const session = await getWechatSession(code, state, config);
    if (session.errcode) {
      return res.status(400).json({ error: session.errmsg || '获取session失败' });
    }

    const openid = session.openid;
    const accessToken = session.access_token;

    // 获取用户基本信息
    let userInfo = { openid, nickname: '', avatar: '', gender: 0, country: '', province: '', city: '' };
    try {
      const info = await getWechatUserInfo(openid, accessToken);
      if (!info.errcode) {
        userInfo = {
          openid,
          nickname: info.nickname || '',
          avatar: info.headimgurl || '',
          gender: info.sex || 0,
          country: info.country || '',
          province: info.province || '',
          city: info.city || ''
        };
      }
    } catch {}

    // 检查是否已存在
    const field = state === 'mini' ? 'mini_openid' : 'mp_openid';
    const [existing] = await pool.query(`SELECT * FROM wechat_users WHERE ${field} = ? AND status = 1`, [openid]);

    const result = {
      openid,
      nickname: userInfo.nickname,
      avatar: userInfo.avatar,
      gender: userInfo.gender,
      country: userInfo.country,
      province: userInfo.province,
      city: userInfo.city,
      type: state,
      already_bound: existing.length > 0,
      wechat_user_id: existing.length > 0 ? existing[0].id : null,
      unionid: existing.length > 0 ? existing[0].unionid : (session.unionid || null)
    };

    // 返回 JSON 而不是跳转，前端处理绑定流程
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/wechat/bind — 绑定手机号 + 微信用户
app.post('/api/wechat/bind', async (req, res) => {
  try {
    const { phone, openid, unionid, nickname, avatar, gender, type } = req.body;
    if (!phone || !openid) return res.status(400).json({ error: '手机号和openid不能为空' });

    const field = type === 'mini' ? 'mini_openid' : 'mp_openid';

    // 查找该 openid 是否已绑定过
    const [existing] = await pool.query(`SELECT id FROM wechat_users WHERE ${field} = ?`, [openid]);

    const now = new Date().toISOString();

    if (existing.length > 0) {
      // 更新已有记录
      await pool.query(
        `UPDATE wechat_users SET phone=?, unionid=COALESCE(?,unionid), nickname=COALESCE(?,nickname), avatar=COALESCE(?,avatar), gender=?, bind_time=?, status=1, unsubscribe_time=NULL WHERE id=?`,
        [phone, unionid, nickname, avatar, gender || 0, now, existing[0].id]
      );
      res.json({ message: '绑定成功', id: existing[0].id });
    } else {
      // 新增记录
      const [result] = await pool.query(
        `INSERT INTO wechat_users (${field}, unionid, phone, nickname, avatar, gender, bind_time, status, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [openid, unionid, phone, nickname, avatar, gender || 0, now, now, now]
      );
      res.json({ message: '绑定成功', id: result.insertId });
    }

    // 同步更新 customers 表的微信字段（按手机号匹配）
    if (unionid) {
      await pool.query(
        `UPDATE customers SET wechat_unionid=?, wechat_nickname=?, wechat_avatar=?, wechat_bind_time=? WHERE phone=? AND (wechat_unionid IS NULL OR wechat_unionid='')`,
        [unionid, nickname, avatar, now, phone]
      );
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/wechat/bind/:id — 解绑
app.delete('/api/wechat/bind/:id', checkPermission('settings:write'), async (req, res) => {
  try {
    const now = new Date().toISOString();
    await pool.query('UPDATE wechat_users SET status=0, unsubscribe_time=? WHERE id=?', [now, req.params.id]);
    res.json({ message: '解绑成功' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/wechat/users — 微信客户列表（含关联客户信息 + 统计）
// 2026-10-19 v2.3.9：支持 linked 筛选、openid 关键字搜索、返回 stats 统计
app.get('/api/wechat/users', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, keyword, type, linked } = req.query;
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'];

    const conds = [];
    const params = [];

    if (status !== undefined && status !== '') {
      conds.push('w.status = ?'); params.push(Number(status));
    } else {
      conds.push('w.status = 1');
    }
    if (keyword) {
      conds.push('(w.nickname LIKE ? OR w.phone LIKE ? OR w.mini_openid LIKE ? OR w.mp_openid LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)');
      const k = `%${keyword}%`;
      params.push(k, k, k, k, k, k);
    }
    if (type === 'mini') conds.push("w.mini_openid IS NOT NULL AND w.mini_openid != ''");
    if (type === 'mp') conds.push("w.mp_openid IS NOT NULL AND w.mp_openid != ''");
    if (linked === '1') conds.push('w.customer_id IS NOT NULL');
    if (linked === '0') conds.push('w.customer_id IS NULL');

    // 普通员工只能看自己名下客户关联的微信用户（未关联客户的不隐藏，避免绑定后"消失"）
    if (userRole !== 'admin') {
      const [empRows] = await pool.query('SELECT permissions FROM employees WHERE id = ?', [userId]);
      const perms = empRows[0] ? JSON.parse(empRows[0].permissions || '[]') : [];
      if (!perms.includes('customer_all')) {
        conds.push('(c.creator_id = ? OR w.customer_id IS NULL)');
        params.push(userId);
      }
    }

    const where = `WHERE ${conds.join(' AND ')}`;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const [total] = await pool.query(
      `SELECT COUNT(*) as cnt FROM wechat_users w LEFT JOIN customers c ON w.customer_id = c.id ${where}`, params);
    const [list] = await pool.query(
      `SELECT w.*, c.name as customer_name, c.phone as customer_phone, c.customer_no,
              e.name as employee_name
       FROM wechat_users w
       LEFT JOIN customers c ON w.customer_id = c.id
       LEFT JOIN employees e ON w.employee_id = e.id
       ${where}
       ORDER BY w.bind_time DESC, w.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    // 统计看全量（不受当前筛选影响）
    // 注意：wechat_users 的时间字段统一用 toISOString() 写入（UTC），
    // 所以「今日」的起点要取本地零点的 UTC 表示，否则会差 8 小时。
    const now = new Date();
    const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayStart = localMidnight.toISOString().slice(0, 19).replace('T', ' ');
    const [[stat]] = await pool.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN mini_openid IS NOT NULL AND mini_openid != '' THEN 1 ELSE 0 END) as mini,
              SUM(CASE WHEN mp_openid IS NOT NULL AND mp_openid != '' THEN 1 ELSE 0 END) as mp,
              SUM(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END) as phoneBound,
              SUM(CASE WHEN customer_id IS NOT NULL THEN 1 ELSE 0 END) as linked,
              SUM(CASE WHEN bind_time >= ? THEN 1 ELSE 0 END) as today
       FROM wechat_users WHERE status = 1`, [todayStart]
    );

    res.json({
      list,
      total: total[0].cnt,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      stats: {
        total: Number(stat.total || 0),
        mini: Number(stat.mini || 0),
        mp: Number(stat.mp || 0),
        phoneBound: Number(stat.phoneBound || 0),
        linked: Number(stat.linked || 0),
        today: Number(stat.today || 0),
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/wechat/users/:id — 单个微信用户详情
app.get('/api/wechat/users/:id', async (req, res) => {
  try {
    const [row] = await pool.query(
      `SELECT w.*, c.name as customer_name, c.phone as customer_phone, c.id as oa_customer_id,
              e.name as employee_name, e.phone as employee_phone, e.id as oa_employee_id
       FROM wechat_users w
       LEFT JOIN customers c ON w.customer_id = c.id
       LEFT JOIN employees e ON w.employee_id = e.id
       WHERE w.id = ?`, [req.params.id]
    );
    if (!row[0]) return res.status(404).json({ error: '用户不存在' });
    res.json(row[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/wechat/push — 推送微信消息（内部接口，供发消息逻辑调用）
// body: { phone, template_id, data: { key: { value, color } } }
app.post('/api/wechat/push', async (req, res) => {
  try {
    const { phone, template_id, data } = req.body;
    if (!phone || !template_id) return res.status(400).json({ error: '手机号和模板ID不能为空' });

    // 查找该手机号绑定的微信用户（优先用公众号）
    const [users] = await pool.query(
      `SELECT * FROM wechat_users WHERE phone = ? AND status = 1 ORDER BY mp_openid DESC LIMIT 1`,
      [phone]
    );

    if (!users[0]) {
      return res.json({ success: false, reason: '该手机号未绑定微信' });
    }

    const user = users[0];
    const openid = user.mp_openid || user.mini_openid;
    if (!openid) return res.json({ success: false, reason: '无有效OpenID' });

    // 获取公众号配置（发送模板消息用公众号）
    const config = await getSetting('wechat_mp');
    if (!config || !config.app_id || !config.app_secret) {
      return res.json({ success: false, reason: '微信公众号配置未完成' });
    }

    // 获取全局 access_token
    const tokenResp = await getGlobalAccessToken(config);
    if (tokenResp.errcode) {
      return res.json({ success: false, reason: tokenResp.errmsg });
    }

    // 发送模板消息
    const result = await sendWechatTemplateMsg(openid, template_id, data, tokenResp.access_token);
    if (result.errcode === 0) {
      res.json({ success: true, msgid: result.msgid });
    } else {
      res.json({ success: false, reason: result.errmsg, errcode: result.errcode });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/wechat/push-by-unionid — 按 UnionID 推送（用于开放平台场景）
app.post('/api/wechat/push-by-unionid', async (req, res) => {
  try {
    const { unionid, template_id, data } = req.body;
    if (!unionid || !template_id) return res.status(400).json({ error: 'UnionID和模板ID不能为空' });

    const [users] = await pool.query(
      `SELECT * FROM wechat_users WHERE unionid = ? AND status = 1 LIMIT 1`,
      [unionid]
    );
    if (!users[0]) return res.json({ success: false, reason: '未找到绑定的微信用户' });

    const user = users[0];
    const openid = user.mp_openid || user.mini_openid;
    if (!openid) return res.json({ success: false, reason: '无有效OpenID' });

    const config = await getSetting('wechat_mp');
    if (!config) return res.json({ success: false, reason: '微信公众号配置未完成' });

    const tokenResp = await getGlobalAccessToken(config);
    if (tokenResp.errcode) return res.json({ success: false, reason: tokenResp.errmsg });

    const result = await sendWechatTemplateMsg(openid, template_id, data, tokenResp.access_token);
    if (result.errcode === 0) {
      res.json({ success: true, msgid: result.msgid });
    } else {
      res.json({ success: false, reason: result.errmsg, errcode: result.errcode });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/wechat/bind-status/:phone — 查询手机号绑定状态
app.get('/api/wechat/bind-status/:phone', async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT id, nickname, avatar, bind_time, status, mp_openid, mini_openid, unionid FROM wechat_users WHERE phone = ?`,
      [req.params.phone]
    );
    if (!users[0]) return res.json({ bound: false });
    const u = users[0];
    res.json({
      bound: u.status === 1,
      boundChannels: {
        mp: !!(u.mp_openid),
        mini: !!(u.mini_openid)
      },
      unionid: u.unionid,
      nickname: u.nickname,
      avatar: u.avatar,
      bindTime: u.bind_time
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== 小程序微信登录（静默 openid + 手机号绑定） ====================
// 设计说明：
//   微信自 2022-10-25 回收 getUserProfile 后，小程序端**拿不到**真实头像昵称，
//   头像昵称只能由用户主动填写（chooseAvatar / input type=nickname），且不能作为身份标识。
//   因此身份链路改为：wx.login 静默拿 openid → 手机号（唯一认证标识）绑定 → 映射到 customers。
//   openid 仅用于"记住这台微信"，不承担认证作用。

/** 读取小程序 appid/secret：优先环境变量，其次 system_settings.wechat_mini */
async function getMiniConfig() {
  const envId = (process.env.WX_MINI_APPID || '').trim();
  const envSecret = (process.env.WX_MINI_SECRET || '').trim();
  if (envId && envSecret) return { app_id: envId, app_secret: envSecret };
  const cfg = await getSetting('wechat_mini');
  if (cfg && cfg.app_id && cfg.app_secret) return { app_id: cfg.app_id, app_secret: cfg.app_secret };
  return null;
}

/**
 * 按手机号解析客户身份（主账户 / 家庭成员）。
 * 返回结构与 /api/customers/login 保持一致，供小程序端直接复用。
 */
async function resolveCustomerByPhone(phone) {
  const fm = await db.prepare('SELECT * FROM family_members WHERE phone = ? LIMIT 1').get(phone);
  if (fm) {
    if (fm.is_master === 1 || fm.relation === '本人') {
      const master = await db.prepare('SELECT * FROM customers WHERE id = ? LIMIT 1').get(fm.customer_id);
      if (master) return { ok: true, customer: master };
    }
    const master = await db.prepare('SELECT * FROM customers WHERE id = ? LIMIT 1').get(fm.customer_id);
    if (master) {
      return {
        ok: true,
        customer: { id: fm.id, name: fm.name, phone: fm.phone, relation: fm.relation, is_master: 0 },
        masterCustomer: master,
        masterCustomerId: master.id,
        isFamilyMember: true,
        familyMemberId: fm.id,
        relation: fm.relation,
      };
    }
  }
  const customer = await db.prepare('SELECT * FROM customers WHERE phone = ? LIMIT 1').get(phone);
  if (customer) return { ok: true, customer };
  return { ok: false, message: '该手机号未登记' };
}

// POST /api/wechat/mini-login — 静默登录：code 换 openid，返回可用身份列表
// v2.5.0：从「只认客户」扩展为「同时认员工 + 业主」，返回 identities 数组。
//         ⚠️ 旧字段（customer / isFamilyMember / masterCustomerId）必须保留，
//            移动端 saveCustomerIdentity() 依赖它们，删了业主登录会挂。
app.post('/api/wechat/mini-login', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ success: false, message: '缺少 code' });

    const cfg = await getMiniConfig();
    if (!cfg) return res.status(500).json({ success: false, message: '微信小程序配置未完成' });

    const session = await getWechatSession(code, 'mini', cfg);
    if (!session || session.errcode) {
      console.warn('[wechat] jscode2session:', session && session.errmsg);
      return res.json({ success: false, message: friendlyWxErr(session && session.errmsg) });
    }
    const openid = session.openid;
    if (!openid) return res.json({ success: false, message: '未获取到 openid' });

    const [rows] = await pool.query(
      'SELECT * FROM wechat_users WHERE mini_openid = ? AND status = 1 LIMIT 1', [openid]
    );
    const wxUser = rows[0];
    const unionid = (wxUser && wxUser.unionid) || session.unionid || null;

    // 完全没有记录：新微信，前端展示绑定引导
    if (!wxUser) {
      return res.json({
        success: true, bound: false, openid, unionid,
        nickname: '', avatar: '', hasProfile: false,
        identities: [], preferred: null,
      });
    }

    const identities = [];
    let customerIdent = null;

    // ---------- 员工身份 ----------
    if (wxUser.employee_id) {
      const emp = await db.prepare(`
        SELECT e.id, e.username, e.name, e.phone, e.position, e.status,
               r.name AS role_name, r.code AS role_code
        FROM employees e LEFT JOIN roles r ON e.role_id = r.id
        WHERE e.id = ?
      `).get(wxUser.employee_id);

      // 离职 / 员工记录被删 → 绑定自动失效，顺手清库（下次要重新扫码绑定）
      if (!emp || emp.status !== '在职') {
        await pool.query(
          'UPDATE wechat_users SET employee_id = NULL, last_identity = NULL, update_time = ? WHERE id = ?',
          [new Date().toISOString(), wxUser.id]
        );
        wxUser.employee_id = null;
      } else {
        identities.push({
          type: 'employee',
          employee_id: emp.id,
          name: emp.name || '',
          username: emp.username || '',
          phone: emp.phone || '',
          position: emp.position || '',
          role_code: emp.role_code || '',
          role_name: emp.role_name || '',
          permissions: await getUserPermissions(emp.id),
          is_admin: await isAdmin(emp.id),
        });
      }
    }

    // ---------- 业主身份 ----------
    if (wxUser.phone) {
      const ident = await resolveCustomerByPhone(wxUser.phone);
      if (ident.ok) {
        customerIdent = ident;
        identities.push({
          type: 'customer',
          customer_id: ident.isFamilyMember
            ? (ident.masterCustomerId || null)
            : ((ident.customer && ident.customer.id) || null),
          name: (ident.customer && ident.customer.name) || '',
          phone: wxUser.phone,
          isFamilyMember: !!ident.isFamilyMember,
        });

        // 兼容历史数据：早期绑定没写 customer_id，这里顺手补上（PC「微信客户」才能显示关联客户）
        if (!wxUser.customer_id) {
          const cid = ident.isFamilyMember ? (ident.masterCustomerId || null) : ((ident.customer && ident.customer.id) || null);
          if (cid) {
            await pool.query('UPDATE wechat_users SET customer_id=?, update_time=? WHERE id=?',
              [cid, new Date().toISOString(), wxUser.id]);
          }
        }
      }
    }

    // 上次选择的身份仍有效就用它；只有一个身份就直接用；否则让前端选
    const validTypes = identities.map((i) => i.type);
    const preferred = (wxUser.last_identity && validTypes.includes(wxUser.last_identity))
      ? wxUser.last_identity
      : (identities.length === 1 ? identities[0].type : null);

    return res.json({
      success: true,
      bound: identities.length > 0,
      openid,
      unionid,
      nickname: wxUser.nickname || '',
      avatar: wxUser.avatar || '',
      phone: wxUser.phone || '',
      hasProfile: !!(wxUser.nickname || wxUser.avatar),
      identities,
      preferred,
      // ↓ 兼容旧逻辑：业主字段原样展开（无业主身份时不带 customer，前端不会误存）
      ...(customerIdent || {}),
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/wechat/mini-bind-by-ticket — 员工扫码绑定（管理员发码版）
// 入参传 code 不传 openid：openid 一律由服务端用 code 换，不信任前端。
app.post('/api/wechat/mini-bind-by-ticket', async (req, res) => {
  try {
    const { code, ticket } = req.body || {};
    if (!code) return res.status(400).json({ success: false, message: '缺少 code' });
    const tk = String(ticket || '').trim();
    if (!tk) return res.status(400).json({ success: false, message: '缺少绑定码' });

    const cfg = await getMiniConfig();
    if (!cfg) return res.status(500).json({ success: false, message: '微信小程序配置未完成' });

    const session = await getWechatSession(code, 'mini', cfg);
    if (!session || session.errcode) {
      console.warn('[wechat] jscode2session:', session && session.errmsg);
      return res.json({ success: false, message: friendlyWxErr(session && session.errmsg) });
    }
    const openid = session.openid;
    if (!openid) return res.json({ success: false, message: '未获取到 openid' });

    const nowIso = new Date().toISOString();

    // 1. 票据校验
    const t = await db.prepare('SELECT * FROM employee_bind_tickets WHERE ticket = ? LIMIT 1').get(tk);
    if (!t) return res.json({ success: false, message: '绑定码无效，请让管理员重新生成' });
    if (t.used_at) return res.json({ success: false, message: '该绑定码已被使用，请让管理员重新生成' });
    if (utcStrToTs(t.expires_at) <= Date.now()) {
      return res.json({ success: false, message: '绑定码已过期，请让管理员重新生成' });
    }

    // 2. 员工校验
    const emp = await db.prepare(`
      SELECT e.id, e.username, e.name, e.phone, e.position, e.status,
             r.name AS role_name, r.code AS role_code
      FROM employees e LEFT JOIN roles r ON e.role_id = r.id
      WHERE e.id = ?
    `).get(t.employee_id);
    if (!emp) return res.json({ success: false, message: '该员工不存在，请联系管理员' });
    if (emp.status !== '在职') return res.json({ success: false, message: '该账号已停用，请联系管理员' });

    // 3. 该员工是否已被别的微信占用
    const occupied = await db.prepare(
      'SELECT id FROM wechat_users WHERE employee_id = ? AND mini_openid <> ? LIMIT 1'
    ).get(emp.id, openid);
    if (occupied) {
      return res.json({ success: false, message: '该账号已绑定其他微信，请先在后台解绑' });
    }

    // 4. 当前微信是否已绑了别的员工
    const self = await db.prepare('SELECT * FROM wechat_users WHERE mini_openid = ? LIMIT 1').get(openid);
    if (self && self.employee_id && Number(self.employee_id) !== Number(emp.id)) {
      return res.json({ success: false, message: '当前微信已绑定其他员工账号，请先在后台解绑' });
    }

    // 5. 事务写入：绑定关系 + 票据标记
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (self) {
        await conn.query(
          `UPDATE wechat_users
             SET employee_id = ?, phone = COALESCE(?, phone), bind_time = ?,
                 last_identity = 'employee', status = 1, update_time = ?
           WHERE id = ?`,
          [emp.id, emp.phone || null, nowIso, nowIso, self.id]
        );
      } else {
        await conn.query(
          `INSERT INTO wechat_users
             (mini_openid, unionid, employee_id, phone, bind_time, last_identity, status, create_time, update_time)
           VALUES (?, ?, ?, ?, ?, 'employee', 1, ?, ?)`,
          [openid, session.unionid || null, emp.id, emp.phone || null, nowIso, nowIso, nowIso]
        );
      }
      await conn.query(
        'UPDATE employee_bind_tickets SET used_at = ?, used_openid = ? WHERE id = ? AND used_at IS NULL',
        [nowIso, openid, t.id]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    return res.json({
      success: true,
      message: '绑定成功',
      employee: {
        id: emp.id,
        name: emp.name || '',
        username: emp.username || '',
        phone: emp.phone || '',
        position: emp.position || '',
        role_code: emp.role_code || '',
        role_name: emp.role_name || '',
        permissions: await getUserPermissions(emp.id),
        is_admin: await isAdmin(emp.id),
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/admin/employees/:id/bind-qrcode — 管理员生成员工微信绑定码
app.post('/api/admin/employees/:id/bind-qrcode', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: '未登录' });
    const perms = await getUserPermissions(userId);
    const canWrite = (await isAdmin(userId)) || perms.includes('employee:write') || perms.includes('*');
    if (!canWrite) return res.status(403).json({ success: false, message: '仅管理员可生成绑定码' });

    const employeeId = parseInt(req.params.id, 10);
    if (!employeeId) return res.status(400).json({ success: false, message: '员工 id 无效' });

    const emp = await db.prepare('SELECT id, name, status FROM employees WHERE id = ?').get(employeeId);
    if (!emp) return res.status(404).json({ success: false, message: '员工不存在' });
    if (emp.status !== '在职') return res.json({ success: false, message: '该员工不是在职状态，无法绑定' });

    const bound = await db.prepare('SELECT id FROM wechat_users WHERE employee_id = ? LIMIT 1').get(employeeId);
    if (bound) return res.json({ success: false, message: '该员工已绑定微信，请先解绑' });

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const expiresIso = new Date(now + 10 * 60 * 1000).toISOString();

    // 作废该员工此前所有未使用的票据，避免同时存在多个有效码
    await pool.query(
      'UPDATE employee_bind_tickets SET expires_at = ? WHERE employee_id = ? AND used_at IS NULL AND expires_at > ?',
      [nowIso, employeeId, nowIso]
    );

    const ticket = crypto.randomBytes(8).toString('hex'); // 16 位十六进制
    await pool.query(
      `INSERT INTO employee_bind_tickets (ticket, employee_id, created_by, expires_at, create_time)
       VALUES (?, ?, ?, ?, ?)`,
      [ticket, employeeId, userId, expiresIso, nowIso]
    );

    // 生成小程序码；失败不阻断，返回 ticket 让 PC 前端降级画普通二维码
    let qrcode = null;
    let warn = '';
    const cfg = await getMiniConfig();
    if (!cfg) {
      warn = '小程序配置缺失';
    } else {
      try {
        const buf = await generateMiniCode(ticket, cfg);
        qrcode = 'data:image/jpeg;base64,' + buf.toString('base64');
      } catch (e) {
        warn = e.message;
        console.warn('[bind-qrcode]', e.message);
      }
    }

    res.json({
      success: true,
      ticket,
      expires_at: expiresIso,
      qrcode,                       // null → 前端降级
      fallback: !qrcode,
      warn: warn || undefined,
      employee: { id: emp.id, name: emp.name },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/admin/wechat/unbind-employee — 管理员解除员工微信绑定
app.post('/api/admin/wechat/unbind-employee', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: '未登录' });
    const perms = await getUserPermissions(userId);
    const canWrite = (await isAdmin(userId)) || perms.includes('employee:write') || perms.includes('*');
    if (!canWrite) return res.status(403).json({ success: false, message: '仅管理员可解绑' });

    const employeeId = parseInt((req.body || {}).employee_id, 10);
    if (!employeeId) return res.status(400).json({ success: false, message: '缺少 employee_id' });

    const row = await db.prepare('SELECT id, customer_id FROM wechat_users WHERE employee_id = ? LIMIT 1').get(employeeId);
    if (!row) return res.json({ success: true, message: '该员工未绑定微信' });

    const nowIso = new Date().toISOString();
    // 没有业主身份 → 整行删掉，不留空壳；否则只清员工字段
    if (!row.customer_id) {
      await pool.query('DELETE FROM wechat_users WHERE id = ?', [row.id]);
    } else {
      await pool.query(
        'UPDATE wechat_users SET employee_id = NULL, last_identity = NULL, update_time = ? WHERE id = ?',
        [nowIso, row.id]
      );
    }
    // 顺手作废该员工未使用的票据
    await pool.query(
      'UPDATE employee_bind_tickets SET expires_at = ? WHERE employee_id = ? AND used_at IS NULL',
      [nowIso, employeeId]
    );

    res.json({ success: true, message: '已解除绑定' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/admin/employees/bind-status — 员工微信绑定状态（PC 列表用）
// ⚠️ 必须注册在 /api/admin/employees/:id 之前，否则 bind-status 会被当成 id
app.get('/api/admin/employees/bind-status', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: '未登录' });
    const perms = await getUserPermissions(userId);
    const canRead = (await isAdmin(userId)) || perms.includes('employee:read') || perms.includes('*');
    if (!canRead) return res.status(403).json({ success: false, message: '无权限' });

    const rows = await db.prepare(
      'SELECT employee_id, mini_openid, bind_time, nickname, avatar FROM wechat_users WHERE employee_id IS NOT NULL'
    ).all();

    const data = {};
    rows.forEach((r) => {
      const oid = r.mini_openid || '';
      data[r.employee_id] = {
        employee_id: r.employee_id,
        bound: true,
        openid_mask: oid ? oid.slice(0, 6) + '***' + oid.slice(-4) : '',
        bind_time: r.bind_time,
        nickname: r.nickname || '',
        avatar: r.avatar || '',
      };
    });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});


// POST /api/wechat/mini-bind — 绑定手机号（手机号是唯一认证标识）
app.post('/api/wechat/mini-bind', async (req, res) => {
  try {
    const { openid, phone, nickname, avatar } = req.body || {};
    if (!openid) return res.status(400).json({ success: false, message: '缺少 openid' });
    const p = String(phone || '').trim();
    if (!/^1\d{10}$/.test(p)) return res.json({ success: false, message: '请输入正确的手机号' });

    const ident = await resolveCustomerByPhone(p);
    if (!ident.ok) {
      return res.json({ success: false, message: '未查询到您的预约记录，请联系您的设计师核对手机号' });
    }

    const now = new Date().toISOString();
    // 关联到 customers 主档：家庭成员也挂到主账户上，PC 端「微信客户」才能显示关联客户
    const linkedCustomerId = ident.isFamilyMember
      ? (ident.masterCustomerId || null)
      : ((ident.customer && ident.customer.id) || null);

    const [existing] = await pool.query('SELECT id FROM wechat_users WHERE mini_openid = ? LIMIT 1', [openid]);
    if (existing.length) {
      await pool.query(
        `UPDATE wechat_users SET phone=?, nickname=COALESCE(?,nickname), avatar=COALESCE(?,avatar),
         customer_id=COALESCE(?,customer_id), bind_time=?, status=1, unsubscribe_time=NULL, update_time=? WHERE id=?`,
        [p, nickname || null, avatar || null, linkedCustomerId, now, now, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO wechat_users (mini_openid, phone, nickname, avatar, customer_id, bind_time, status, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [openid, p, nickname || '', avatar || '', linkedCustomerId, now, now, now]
      );
    }

    return res.json({ success: true, message: '绑定成功', phone: p, customer_id: linkedCustomerId, ...ident });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/wechat/mini-profile — 保存头像昵称（不绑手机号也能存）
// 说明：微信 2022-10-25 回收 getUserProfile 后，头像昵称只能由用户主动填写
//      （button open-type=chooseAvatar / input type=nickname），这里接收前端上传后的地址。
app.post('/api/wechat/mini-profile', async (req, res) => {
  try {
    const { openid, nickname, avatar } = req.body || {};
    if (!openid) return res.status(400).json({ success: false, message: '缺少 openid' });

    const now = new Date().toISOString();
    const [existing] = await pool.query('SELECT id FROM wechat_users WHERE mini_openid = ? LIMIT 1', [openid]);
    if (existing.length) {
      await pool.query(
        `UPDATE wechat_users SET nickname=COALESCE(?,nickname), avatar=COALESCE(?,avatar),
         status=1, update_time=? WHERE id=?`,
        [nickname || null, avatar || null, now, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO wechat_users (mini_openid, nickname, avatar, status, create_time, update_time)
         VALUES (?, ?, ?, 1, ?, ?)`,
        [openid, nickname || '', avatar || '', now, now]
      );
    }
    res.json({ success: true, openid, nickname: nickname || '', avatar: avatar || '' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== 合同上传（移动端） ====================
app.post('/api/contracts/upload', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    let { project_id, contract_amount, remark, attachment } = req.body;
    if (!project_id) return res.status(400).json({ error: '请先选择关联项目' });
    if (!contract_amount || parseFloat(contract_amount) <= 0) return res.status(400).json({ error: '请填写有效的合同金额' });

    // 2026-10-09 修复：附件统一存 JSON 数组（兼容老数据：如果是逗号分隔字符串则转 JSON 数组）
    if (attachment && typeof attachment === 'string' && !attachment.startsWith('[')) {
      attachment = JSON.stringify(attachment.split(',').filter(Boolean));
    } else if (Array.isArray(attachment)) {
      attachment = JSON.stringify(attachment);
    } else if (!attachment) {
      attachment = JSON.stringify([]);
    }

    const [[project]] = await pool.query('SELECT name FROM projects WHERE id = ?', [project_id]);
    const project_name = project?.name || '';

    // 插入合同记录，状态为待审核
    const [result] = await pool.query(
      `INSERT INTO contracts (project_id, contract_amount, review_status, submitted_by, created_by, creator_id, attachment, created_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, NOW())`,
      [project_id, contract_amount, userId, userId, userId, attachment]
    );

    await addLog(userId, '', '上传', '合同管理', result.insertId, project_name, `上传合同金额：${contract_amount}元`, req.ip);
    // 2026-10-12：审核提交类 → 通知合同审批人 + 提交人 + 项目经理
    notifyReviewSubmitted('contract_uploaded', project_id, `项目「${project_name}」上传合同`, `合同金额：${contract_amount}元`, result.insertId, 'contract', userId, ['contract:approve', 'project_contract:approve']).catch(console.error);

    res.json({ code: 0, id: result.insertId, message: '合同已提交，待审核' });
  } catch (err) {
    console.error('contracts upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contract-reviews/pending — 待审核合同列表（移动端审核页用）
// 仅返回真实提交的记录（有项目、有金额），排除历史迁移脏数据。
app.get('/api/contract-reviews/pending', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await getUserPermissions(userId);
    const canApprove = perms.includes('contract:approve') || perms.includes('project_contract:approve') || await isAdmin(userId);
    if (!canApprove) return res.status(403).json({ error: '无合同审核权限' });

    const [rows] = await pool.query(
      `SELECT c.id, c.project_id, c.contract_amount, c.attachment, c.review_status, c.created_at,
              p.name AS project_name, e.name AS submitter_name
       FROM contracts c
       LEFT JOIN projects p ON p.id = c.project_id
       LEFT JOIN employees e ON e.id = c.submitted_by
       WHERE c.review_status = 'pending'
         AND c.project_id IS NOT NULL AND c.contract_amount > 0
       ORDER BY c.created_at DESC LIMIT 200`
    );
    res.json({ code: 0, data: rows });
  } catch (err) {
    console.error('contract-reviews pending error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== 合同审核 ====================
app.put('/api/contracts/:id/review', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await getUserPermissions(userId);
    const canApprove = perms.includes('contract:approve') || perms.includes('project_contract:approve') || await isAdmin(userId);
    if (!canApprove) {
      return res.status(403).json({ error: '无合同审核权限' });
    }
    const [[contract]] = await pool.query('SELECT * FROM contracts WHERE id = ?', [req.params.id]);
    if (!contract) return res.status(404).json({ error: '合同不存在' });
    if (contract.review_status && contract.review_status !== 'pending') {
      return res.status(400).json({ error: '该合同已审核过' });
    }

    const { action, remark } = req.body; // action: approve / reject
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await pool.query(
      'UPDATE contracts SET review_status=?, reviewed_by=?, reviewed_at=NOW(), reviewer_remark=? WHERE id=?',
      [newStatus, userId, remark || '', req.params.id]
    );

    // 审核通过 → 自动在 payment_records 插入收入记录
    // v2.3.12 修：加幂等保护，同一份合同只产生一条收入记录
    if (action === 'approve' && contract.contract_amount) {
      const [[existCt]] = await pool.query(
        "SELECT id FROM payment_records WHERE source_id = ? AND category = 'contract' LIMIT 1",
        [req.params.id]
      );
      if (!existCt) {
        await pool.query(
          `INSERT INTO payment_records (project_id, type, category, amount, source_id, status, created_by, created_at)
           VALUES (?, 'income', 'contract', ?, ?, 'confirmed', ?, NOW())`,
          [contract.project_id, contract.contract_amount, req.params.id, userId]
        );
      }
    }

    const [[proj]] = await pool.query('SELECT name FROM projects WHERE id = ?', [contract.project_id]);
    const project_name = proj?.name || `项目#${contract.project_id}`;
    const [[submitter]] = await pool.query('SELECT name FROM employees WHERE id = ?', [contract.submitted_by]);
    const submitterName = submitter?.name || '';
    await addLog(userId, '', action === 'approve' ? '审核通过' : '审核拒绝', '合同管理', req.params.id, `项目#${contract.project_id}`, `合同审核${action === 'approve' ? '通过' : '拒绝'}${remark ? '：' + remark : ''}`, req.ip);

    // 通知：合同审核结果 —— 2026-10-12 仅通知提交人（谁发起，反馈给谁）
    notifySubmitter(
      action === 'approve' ? 'contract_approved' : 'contract_rejected',
      contract.project_id,
      action === 'approve' ? `合同审核通过` : `合同审核未通过`,
      action === 'approve'
        ? `您上传的合同（项目：${project_name}）已审核通过`
        : `您上传的合同（项目：${project_name}）未通过${remark ? '：' + remark : ''}`,
      req.params.id,
      'contract',
      contract.submitted_by
    ).catch(console.error);

    if (contract.submitted_by && contract.submitted_by !== userId) {
      // v2.3.4 修：用 messages 表（站内通知）
      const [[submitter]] = await pool.query('SELECT name FROM employees WHERE id = ?', [contract.submitted_by]);
      await pool.query(
        'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, \'sent\')',
        [contract.submitted_by, submitter ? submitter.name : '', action === 'approve' ? '合同已通过' : '合同未通过', action === 'approve' ? `您上传的合同已审核通过` : `您上传的合同未通过${remark ? '：' + remark : ''}`, action === 'approve' ? 'contract_approved' : 'contract_rejected', req.params.id, 'contract']
      );
    }
    res.json({ message: action === 'approve' ? '已通过' : '已拒绝' });
  } catch (err) {
    console.error('contract review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 反审核：合同从 approved/rejected 退回 pending，删除对应的 payment_records 收入记录
app.put('/api/contracts/:id/revert', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await getUserPermissions(userId);
    const canApprove = perms.includes('contract:approve') || perms.includes('project_contract:approve') || await isAdmin(userId);
    if (!canApprove) return res.status(403).json({ error: '无合同审核权限' });

    const [[contract]] = await pool.query('SELECT * FROM contracts WHERE id = ?', [req.params.id]);
    if (!contract) return res.status(404).json({ error: '合同不存在' });
    if (contract.review_status === 'pending') return res.status(400).json({ error: '当前就是待审核状态' });

    await pool.query(
      'UPDATE contracts SET review_status=?, reviewed_by=NULL, reviewed_at=NULL, reviewer_remark=NULL WHERE id=?',
      ['pending', req.params.id]
    );
    await pool.query(
      "DELETE FROM payment_records WHERE source_id=? AND type='income' AND category='contract'",
      [req.params.id]
    );
    res.json({ message: '已反审核' });
  } catch (err) {
    console.error('contract revert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== 合同列表（移动端按项目查） ====================
// v2.3.6 hotfix 10-15：contracts 表 project_id 全 NULL 时，从 payment_records.category='contract'.confirmed
// 兜底返回虚拟合同记录（标记 _inferred=true），让前端 contractSummary 能算对合同金额
app.get('/api/contracts/by-project/:projectId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, reviewed.name as reviewed_by_name, submitter.name as submitted_by_name
       FROM contracts c
       LEFT JOIN employees reviewed ON reviewed.id = c.reviewed_by
       LEFT JOIN employees submitter ON submitter.id = c.submitted_by
       WHERE c.project_id = ?
       ORDER BY c.id DESC`,
      [req.params.projectId]
    );

    // 兜底：contracts 表为空时，从 payment_records 查合同金额
    if (rows.length === 0) {
      const [[paymentRow]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total, MAX(created_at) AS latest_at
         FROM payment_records
         WHERE project_id = ? AND category='contract' AND status='confirmed'`,
        [req.params.projectId]
      );
      const inferredAmount = Number(paymentRow?.total || 0);
      if (inferredAmount > 0) {
        rows.push({
          id: -1,
          project_id: Number(req.params.projectId),
          contract_amount: inferredAmount,
          review_status: 'approved',
          created_at: paymentRow?.latest_at || new Date().toISOString(),
          _inferred_from: 'payment_records',
          reviewed_by_name: null,
          submitted_by_name: null,
        });
      }
    }

    res.json({ code: 0, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 增减项 API ====================
// 兼容移动端 /api/change-orders/list（实际映射到 contract_changes）
app.get('/api/change-orders/list', async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `SELECT cc.*, s.name as submitted_by_name, r.name as reviewed_by_name
               FROM contract_changes cc
               LEFT JOIN employees s ON s.id = cc.submitted_by
               LEFT JOIN employees r ON r.id = cc.reviewed_by
               WHERE 1=1`;
    const params = [];
    if (project_id) { sql += ' AND cc.project_id = ?'; params.push(project_id); }
    sql += ' ORDER BY cc.id DESC';
    const [rows] = await pool.query(sql, params);
    // 转换为移动端期望的字段名
    const list = rows.map(r => ({
      id: r.id,
      project_id: r.project_id,
      change_type: r.change_type,
      title: r.title,
      amount: r.amount,
      reason: r.description,
      change_date: r.submitted_at,
      created_at: r.submitted_at,
      status: r.status,
      statusText: r.status === 'approved' ? '已通过' : r.status === 'rejected' ? '已驳回' : r.status === 'pending' ? '待审核' : r.status === 'draft' ? '草稿' : '待审核',
      project_name: null,
      submitted_by_name: r.submitted_by_name
    }));
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PC 端全量列表（含项目名称）
app.get('/api/change-orders', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT cc.*, s.name as submitted_by_name, r.name as reviewed_by_name,
                      p.name as project_name
               FROM contract_changes cc
               LEFT JOIN employees s ON s.id = cc.submitted_by
               LEFT JOIN employees r ON r.id = cc.reviewed_by
               LEFT JOIN projects p ON p.id = cc.project_id
               WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND cc.status = ?'; params.push(status === '待审核' ? 'pending' : status === '已通过' ? 'approved' : status === '已驳回' ? 'rejected' : status); }
    sql += ' ORDER BY cc.id DESC';
    const [rows] = await pool.query(sql, params);
    const list = rows.map(r => ({
      id: r.id,
      project_id: r.project_id,
      project_name: r.project_name,
      change_type: r.change_type,
      title: r.title,
      amount: r.amount,
      reason: r.description || r.reason,
      submitted_at: r.submitted_at,
      reviewed_at: r.reviewed_at,
      reviewed_by_name: r.reviewed_by_name,
      reviewer_remark: r.reviewer_remark,
      status: r.status,
      statusText: r.status === 'approved' ? '已通过' : r.status === 'rejected' ? '已驳回' : r.status === 'pending' ? '待审核' : '待审核',
      submitted_by_name: r.submitted_by_name
    }));
    res.json({ code: 0, data: list });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/contract-changes', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { project_id, contract_id, status } = req.query;
    // 2026-10-11：补 project_name（此前未 join projects，导致移动端审核页「项目」为空）；
    // 同时补 submitter_name 别名（原字段是 submitted_by_name，两处口径统一）。
    // P2 §7.3：增减项按关联项目 ∪ 提交人 收窄
    const scope = await buildProjectScopeOrSelfClause(userId, 'contract_change', 'cc', 'project_id', 'submitted_by');
    let sql = `SELECT cc.*, s.name as submitted_by_name, s.name as submitter_name,
                      r.name as reviewed_by_name, p.name as project_name
               FROM contract_changes cc
               LEFT JOIN employees s ON s.id = cc.submitted_by
               LEFT JOIN employees r ON r.id = cc.reviewed_by
               LEFT JOIN projects p ON p.id = cc.project_id
               WHERE 1=1${scope.sql}`;
    const params = [...scope.params];
    if (project_id) { sql += ' AND cc.project_id = ?'; params.push(project_id); }
    if (contract_id) { sql += ' AND cc.contract_id = ?'; params.push(contract_id); }
    if (status) { sql += ' AND cc.status = ?'; params.push(status); }
    sql += ' ORDER BY cc.id DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ code: 0, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/contract-changes', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { project_id, contract_id, change_type, title, amount, description } = req.body;
    if (!project_id) return res.status(400).json({ error: '项目ID不能为空' });
    if (!change_type || !['increase', 'decrease'].includes(change_type)) return res.status(400).json({ error: '类型必选增或减' });
    if (!title) return res.status(400).json({ error: '标题不能为空' });
    if (amount === undefined || parseFloat(amount) <= 0) return res.status(400).json({ error: '金额必须大于0' });

    const [[project]] = await pool.query('SELECT name FROM projects WHERE id = ?', [project_id]);
    const project_name = project?.name || '';

    const [result] = await pool.query(
      `INSERT INTO contract_changes (project_id, contract_id, change_type, title, amount, description, status, submitted_by, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NOW())`,
      [project_id, contract_id || null, change_type, title, amount, description || '', userId]
    );
    await addLog(userId, '', '新增', '增减项', result.insertId, project_name, `${change_type === 'increase' ? '增加' : '减少'}：${title}（${amount}元）`, req.ip);

    // 通知：新增增减项 —— 2026-10-12 审核提交类 → 增减项审批人 + 提交人 + 项目经理
    notifyReviewSubmitted(
      'contract_change_created',
      project_id,
      `新增减项申请：${change_type === 'increase' ? '增加' : '减少'}¥${amount}`,
      `项目「${project_name}」新增${change_type === 'increase' ? '增加' : '减少'}项「${title}」，金额：${amount}元，请及时审核。`,
      result.insertId,
      'contract_change',
      userId,
      ['contract_change:approve']
    ).catch(console.error);

    res.json({ id: result.insertId, message: '增减项已提交，待审核' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/contract-changes/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const [[record]] = await pool.query('SELECT * FROM contract_changes WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: '记录不存在' });
    const perms = await getUserPermissions(userId);
    if (record.submitted_by !== userId && !perms.includes('contract_change:approve') && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无权删除此记录' });
    }
    await pool.query('DELETE FROM contract_changes WHERE id = ?', [req.params.id]);
    // v2.3.12 修：删增减项要连带清掉它产生的收支占位记录，否则留下孤儿
    const [ccOrphan] = await pool.query(
      "DELETE FROM payment_records WHERE source_id = ? AND category = 'contract_change'",
      [req.params.id]
    );
    await addLog(userId, '', '删除', '增减项', req.params.id, '', `删除增减项: ${record.title}${ccOrphan.affectedRows ? `，连带清理收支记录 ${ccOrphan.affectedRows} 条` : ''}`, req.ip);
    res.json({ message: '删除成功' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/contract-changes/:id/review', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await getUserPermissions(userId);
    if (!perms.includes('contract_change:approve') && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无增减项审核权限' });
    }
    const [[record]] = await pool.query('SELECT * FROM contract_changes WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: '记录不存在' });
    if (record.status !== 'pending') return res.status(400).json({ error: '该记录已审核' });

    const { action, remark } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await pool.query(
      'UPDATE contract_changes SET status=?, reviewed_by=?, reviewed_at=NOW(), reviewer_remark=? WHERE id=?',
      [newStatus, userId, remark || '', req.params.id]
    );

    // 审核通过 → 自动更新 payment_records
    // v2.3.12 修：加幂等保护，同一增减项只产生一条收支占位记录
    if (action === 'approve' && record.amount) {
      const [[existCc]] = await pool.query(
        "SELECT id FROM payment_records WHERE source_id = ? AND category = 'contract_change' LIMIT 1",
        [req.params.id]
      );
      if (!existCc) {
        const pType = record.change_type === 'increase' ? 'income' : 'expense';
        await pool.query(
          `INSERT INTO payment_records (project_id, type, category, amount, source_id, status, created_by, created_at)
           VALUES (?, ?, 'contract_change', ?, ?, 'confirmed', ?, NOW())`,
          [record.project_id, pType, record.amount, req.params.id, userId]
        );
      }
    }

    await addLog(userId, '', action === 'approve' ? '审核通过' : '审核拒绝', '增减项', req.params.id, record.title, `增减项审核${action === 'approve' ? '通过' : '拒绝'}${remark ? '：' + remark : ''}`, req.ip);

    // 通知：增减项审核结果 —— 2026-10-12 仅通知提交人（谁发起，反馈给谁）
    notifySubmitter(
      action === 'approve' ? 'contract_change_approved' : 'contract_change_rejected',
      record.project_id,
      action === 'approve' ? `增减项审核通过` : `增减项审核未通过`,
      action === 'approve'
        ? `您提交的增减项「${record.title}」（${record.change_type === 'increase' ? '增加' : '减少'}¥${record.amount}）已审核通过`
        : `您提交的增减项「${record.title}」未通过${remark ? '：' + remark : ''}`,
      record.project_id,
      'contract_change',
      record.submitted_by
    ).catch(console.error);

    res.json({ message: action === 'approve' ? '已通过' : '已拒绝' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== 催收记录 API ====================
app.get('/api/collection-records', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { project_id } = req.query;
    // P2：催收 = 关联项目 ∪ 提交人
    const scope = await buildProjectScopeOrSelfClause(userId, 'collection', 'cr', 'project_id', 'submitted_by');
    let sql = `SELECT cr.*, s.name as submitted_by_name, c.name as confirmed_by_name
               FROM collection_records cr
               LEFT JOIN employees s ON s.id = cr.submitted_by
               LEFT JOIN employees c ON c.id = cr.confirmed_by
               WHERE 1=1${scope.sql}`;
    const params = [...scope.params];
    if (project_id) { sql += ' AND cr.project_id = ?'; params.push(project_id); }
    sql += ' ORDER BY cr.id DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ list: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/collection-records', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { project_id, amount, collect_date, remark, images } = req.body;
    if (!project_id) return res.status(400).json({ error: '项目ID不能为空' });
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: '催收金额必须大于0' });
    if (!images || (Array.isArray(images) && images.length === 0)) return res.status(400).json({ error: '请上传凭证图片' });

    const [[project]] = await pool.query('SELECT name FROM projects WHERE id = ?', [project_id]);
    const project_name = project?.name || '';
    const imagesStr = Array.isArray(images) ? JSON.stringify(images) : (typeof images === 'string' ? images : '');

    const [result] = await pool.query(
      `INSERT INTO collection_records (project_id, amount, collect_date, remark, images, status, submitted_by, submitted_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, NOW())`,
      [project_id, amount, collect_date || null, remark || '', imagesStr, userId]
    );
    await addLog(userId, '', '新增', '催收记录', result.insertId, project_name, `催收金额：${amount}元`, req.ip);

    // 通知：新增催收记录 —— 2026-10-12 审核提交类 → 财务（purchase:finance）+ 提交人 + 项目经理
    notifyReviewSubmitted(
      'collection_created',
      project_id,
      `催收录入：¥${amount}`,
      `项目「${project_name}」录入催收记录，金额：${amount}元，请财务及时确认收款。`,
      result.insertId,
      'collection',
      userId,
      ['purchase:finance']
    ).catch(console.error);

    res.json({ id: result.insertId, message: '催收记录已录入' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/collection-records/:id/confirm', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const [[record]] = await pool.query('SELECT * FROM collection_records WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: '记录不存在' });
    if (record.status !== 'pending') return res.status(400).json({ error: '该记录已确认' });

    const { confirmed_amount, confirmed_remark, confirmed_images } = req.body;
    const confAmt = confirmed_amount || record.amount;
    const confImages = Array.isArray(confirmed_images) ? JSON.stringify(confirmed_images) : (confirmed_images || '');

    await pool.query(
      `UPDATE collection_records SET status='confirmed', confirmed_by=?, confirmed_at=NOW(),
       confirmed_amount=?, confirmed_remark=?, confirmed_images=? WHERE id=?`,
      [userId, confAmt, confirmed_remark || '', confImages, req.params.id]
    );

    // 确认收款 → 自动在 payment_records 插入收入记录
    // v2.3.12 修：加幂等保护，同一条催收记录只入账一次
    const [[existCol]] = await pool.query(
      "SELECT id FROM payment_records WHERE source_id = ? AND category = 'collection' LIMIT 1",
      [req.params.id]
    );
    if (!existCol) {
      await pool.query(
        `INSERT INTO payment_records (project_id, type, category, amount, source_id, status, created_by, created_at)
         VALUES (?, 'income', 'collection', ?, ?, 'confirmed', ?, NOW())`,
        [record.project_id, confAmt, req.params.id, userId]
      );
    }

    const [[proj]] = await pool.query('SELECT name FROM projects WHERE id = ?', [record.project_id]);
    const project_name = proj?.name || `项目#${record.project_id}`;

    await addLog(userId, '', '确认收款', '催收记录', req.params.id, `项目#${record.project_id}`, `确认收款：${confAmt}元`, req.ip);

    // 通知：催收已确认收款 —— 2026-10-12 仅通知提交人（谁发起，反馈给谁）
    notifySubmitter(
      'collection_confirmed',
      record.project_id,
      `催收已确认收款：¥${confAmt}`,
      `项目「${project_name}」的催收记录已确认收款，金额：${confAmt}元。`,
      req.params.id,
      'collection',
      record.submitted_by
    ).catch(console.error);

    res.json({ message: '已确认收款' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== 收支记录 API ====================
app.get('/api/payment-records', async (req, res) => {
  try {
    const { project_id, type, status } = req.query;
    let sql = `SELECT pr.*, c.name as created_by_name
               FROM payment_records pr
               LEFT JOIN employees c ON c.id = pr.created_by
               WHERE 1=1`;
    const params = [];
    if (project_id) { sql += ' AND pr.project_id = ?'; params.push(project_id); }
    if (type) { sql += ' AND pr.type = ?'; params.push(type); }
    if (status) { sql += ' AND pr.status = ?'; params.push(status); }
    sql += ' ORDER BY pr.id DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ list: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/payment-records', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { project_id, type, category, amount, remark, status } = req.body;
    if (!project_id) return res.status(400).json({ error: '项目ID不能为空' });
    if (!type || !['income', 'expense'].includes(type)) return res.status(400).json({ error: '类型必选收入或支出' });
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: '金额必须大于0' });

    const [result] = await pool.query(
      `INSERT INTO payment_records (project_id, type, category, amount, status, description, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [project_id, type, category || 'manual', amount, status || 'pending', remark || '', userId]
    );
    await addLog(userId, '', '新增', '收支记录', result.insertId, `项目#${project_id}`, `${type === 'income' ? '收入' : '支出'}：${amount}元`, req.ip);
    res.json({ id: result.insertId, message: '记录已添加' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/payment-records/:id/confirm — 确认收支记录（待确认 → 已确认）
// v2.3.12 新增：此前 payment_records 只有「插入」没有「确认」入口，
// 派工审核通过产生的支出永远是「待确认」，财务在 PC 端和移动端都点不到确认按钮。
app.put('/api/payment-records/:id/confirm', checkPermission('finance:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    const [[record]] = await pool.query('SELECT * FROM payment_records WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: '记录不存在' });
    if (record.status === 'confirmed') return res.status(400).json({ error: '该记录已确认，无需重复操作' });
    if (record.status === 'cancelled') return res.status(400).json({ error: '该记录已取消，不能确认' });

    // 带 status='pending' 条件，防止并发重复确认
    const [result] = await pool.query(
      "UPDATE payment_records SET status='confirmed', confirmed_by=?, confirmed_at=NOW() WHERE id=? AND status='pending'",
      [userId, req.params.id]
    );
    if (!result.affectedRows) return res.status(409).json({ error: '状态已变化，请刷新后重试' });

    const label = record.type === 'income' ? '收入' : '支出';
    await addLog(userId, '', '确认', '财务管理', req.params.id, `项目#${record.project_id}`,
      `确认收支：${label} ${record.amount} 元`, req.ip);
    res.json({ message: '已确认', id: record.id, status: 'confirmed' });
  } catch (err) {
    console.error('payment-records confirm error:', err);
    res.status(500).json({ error: '确认失败' });
  }
});

// ==================== 财务汇总 ====================
app.get('/api/finance/summary', async (req, res) => {
  try {
    const { project_id } = req.query;
    let args = [];
    let whereProject = project_id ? ' WHERE project_id = ?' : '';
    if (project_id) args.push(project_id);

    // 合同营收合计（v2.3.6 hotfix 10-15：改读 payment_records.category='contract'.confirmed）
    // 原因：contracts 表的 project_id/customer_id 字段在 v2.2 引入后从未被填充（全 NULL），
    //     真实业务合同金额在 payment_records 的"合同自动入账占位"里
    const [[contractSum]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payment_records ${whereProject ? 'WHERE project_id = ? AND category=\'contract\' AND status=\'confirmed\'' : 'WHERE category=\'contract\' AND status=\'confirmed\''}`,
      project_id ? [project_id] : []
    );

    // 增减项合计（审核通过的）
    const [[changeSum]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN change_type='increase' THEN amount ELSE 0 END), 0) as increase_total,
         COALESCE(SUM(CASE WHEN change_type='decrease' THEN amount ELSE 0 END), 0) as decrease_total
       FROM contract_changes ${whereProject ? 'WHERE project_id = ? AND status = \'approved\'' : 'WHERE status = \'approved\''}`,
      project_id ? [project_id] : []
    );

    // 已确认实收
    // v2.4.6 修正（2026-10-23）：排除"应收占位"记录。
    // payment_records 里 category='contract'（合同应收占位）和 category='contract_change'
    // （增项应收占位 / 减项应付占位）是业务审核通过时自动写入的"金额锚点"，
    // **不是真实到账**。原来的 `type='income'` 把它们一起算进已收，
    // 导致项目 17「云秀花园紫竹院1102」显示已收 80000（50000 占位 + 30000 真实催收），
    // 剩余应收算成 -30000（超收）。口径与 v2.3.6 的 /api/finance/dashboard 对齐。
    // ⚠️ category 可能为 NULL（手工记账），必须用 IS NULL OR NOT IN，否则会漏记录。
    const [[collected]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payment_records ${whereProject ? 'WHERE project_id = ? AND' : 'WHERE'} type='income' AND status='confirmed' AND (category IS NULL OR category NOT IN ('contract','contract_change'))`,
      project_id ? [project_id] : []
    );

    // 已确认支出（同样排除减项应付占位）
    const [[expensed]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payment_records ${whereProject ? 'WHERE project_id = ? AND' : 'WHERE'} type='expense' AND status='confirmed' AND (category IS NULL OR category NOT IN ('contract','contract_change'))`,
      project_id ? [project_id] : []
    );

    // 待确认支出（同样排除占位）
    const [[pendingExpense]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payment_records ${whereProject ? 'WHERE project_id = ? AND' : 'WHERE'} type='expense' AND status='pending' AND (category IS NULL OR category NOT IN ('contract','contract_change'))`,
      project_id ? [project_id] : []
    );

    const contractTotal = parseFloat(contractSum?.total || 0);
    const increaseTotal = parseFloat(changeSum?.increase_total || 0);
    const decreaseTotal = parseFloat(changeSum?.decrease_total || 0);
    const receivable = contractTotal + increaseTotal - decreaseTotal; // 应收 = 合同 + 增 - 减

    res.json({
      contract_amount: contractTotal,
      increase_total: increaseTotal,
      decrease_total: decreaseTotal,
      receivable,           // 应收
      collected: parseFloat(collected?.total || 0),       // 实收
      expensed: parseFloat(expensed?.total || 0),         // 已支出
      pending_expense: parseFloat(pendingExpense?.total || 0), // 待确认支出
      balance: receivable - parseFloat(collected?.total || 0) // 未收
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 按项目汇总应收（Finance.vue 应收统计 Tab 用）
// v2.3.6 hotfix 10-15：合同金额改读 payment_records.category='contract'.confirmed（contracts 表里 project_id 全 NULL）
app.get('/api/finance/receivable-by-project', async (req, res) => {
  try {
    const [projects] = await pool.query(`
      SELECT p.id, p.name as project_name,
        cu.name as customer_name
      FROM projects p
      LEFT JOIN customers cu ON cu.id = p.customer_id
      WHERE p.status != '已删除'
      ORDER BY p.id DESC
    `);

    const result = [];
    for (const p of projects) {
      const [[changeSum]] = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN change_type='increase' THEN amount ELSE 0 END), 0) as increase_total,
           COALESCE(SUM(CASE WHEN change_type='decrease' THEN amount ELSE 0 END), 0) as decrease_total
         FROM contract_changes WHERE project_id = ? AND status = 'approved'`,
        [p.id]
      );
      const [[collected]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM collection_records WHERE project_id = ? AND status = 'confirmed'`,
        [p.id]
      );
      const [[pendingUnconfirmed]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM collection_records WHERE project_id = ? AND status = 'pending'`,
        [p.id]
      );
      // v2.3.6 hotfix 10-15：合同金额改读 payment_records.category='contract'.confirmed
      const [[contractRow]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
         WHERE project_id = ? AND category='contract' AND status='confirmed'`,
        [p.id]
      );
      const contractAmount = parseFloat(contractRow?.total || 0);
      const increaseTotal = parseFloat(changeSum?.increase_total || 0);
      const decreaseTotal = parseFloat(changeSum?.decrease_total || 0);
      const receivable = contractAmount + increaseTotal - decreaseTotal;
      const collectedAmt = parseFloat(collected?.total || 0);
      const pendingAmt = parseFloat(pendingUnconfirmed?.total || 0);
      result.push({
        project_id: p.id,
        project_name: p.project_name,
        customer_name: p.customer_name || '',
        contract_amount: contractAmount,
        increase_total: increaseTotal,
        decrease_total: decreaseTotal,
        receivable,
        collected: collectedAmt,
        pending_unconfirmed: pendingAmt,
        unpaid: receivable - collectedAmt
      });
    }

    // 全局汇总
    const grand = result.reduce((acc, r) => {
      acc.contract_amount += r.contract_amount;
      acc.increase_total += r.increase_total;
      acc.decrease_total += r.decrease_total;
      acc.receivable += r.receivable;
      acc.collected += r.collected;
      acc.unpaid += r.unpaid;
      return acc;
    }, { contract_amount: 0, increase_total: 0, decrease_total: 0, receivable: 0, collected: 0, unpaid: 0 });

    res.json({ list: result, grand });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== 全公司财务大盘（汇总所有项目）====================
// v2.3.6 新增：替代 BossDashboard / Dashboard / 移动端首页 💰 按钮的"死数据"财务卡片
// v2.3.6 hotfix（2026-10-15）：修正口径——"增减项占位"不参与收支计算。
// payment_records 里的 4 类：
//   - income/contract        = 合同应收占位（合同审核通过自动写入，不是真实收入）
//   - income/contract_change = 增项应收占位（同上，不算收入）
//   - expense/contract_change= 减项应付占位（同上，不算支出）
//   - expense/dispatch       = 派工支出（财务受理后才 confirmed，**真实支出**）
//   - expense/purchase       = 采购支出（**真实支出**，未来类别）
//   - income/collection      = 催收确认收款（**真实收入**）
//   - manual                 = 手动记账（兜底）
// 数据源：
//   - contracts WHERE review_status='approved'（业务已审核 = 应收源头）
//   - contract_changes WHERE status='approved'（增/减项，只参与应收计算）
//   - payment_records WHERE category NOT IN ('contract','contract_change')（真实收支）
//   - collection_records（催收流水）
// 替代了：
//   - /api/boss-dashboard 的 financeStats（读老 finance 表）
//   - /api/dashboard/stats（读老 finance 表）
//   - /api/monthly-trend（读老 finance 表）
// 保留兼容：
//   - 老 finance 表 + /api/finance 路由继续保留（PC 端 Finance.vue 还在用）
app.get('/api/finance/dashboard', async (req, res) => {
  try {
    // ===== 1. 公司级合同营收（v2.3.6 hotfix 10-15：改读 payment_records.category='contract'.confirmed）=====
    // 原因：contracts 表 project_id/customer_id 全 NULL（v2.2 引入字段后从未填），真实数据在 payment_records
    const [[contractRow]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records WHERE category='contract' AND status='confirmed'`
    );
    const contractAmount = parseFloat(contractRow?.total || 0);

    // ===== 2. 全公司增减项（增/减项分别汇总，独立显示在数据盘，不参与收支计算）=====
    const [[changeRow]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN change_type='increase' THEN amount ELSE 0 END), 0) AS increase_total,
         COALESCE(SUM(CASE WHEN change_type='decrease' THEN amount ELSE 0 END), 0) AS decrease_total
       FROM contract_changes WHERE status = 'approved'`
    );
    const increaseTotal = parseFloat(changeRow?.increase_total || 0);
    const decreaseTotal = parseFloat(changeRow?.decrease_total || 0);

    // ===== 3. 已确认实收（催收已确认 + 派工到位的收款）=====
    //    注意：payment_records WHERE category='collection' 是催收确认收款写入的"实收"标记
    //    collection_records 是独立的催收流水表（财务录入催收金额 → 待确认 → 确认收款）
    const [[collectedCollectionRow]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM collection_records WHERE status = 'confirmed'`
    );
    const [[collectedPaymentRow]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
       WHERE type='income' AND status='confirmed' AND category='collection'`
    );
    const collected = parseFloat(collectedCollectionRow?.total || 0) + parseFloat(collectedPaymentRow?.total || 0);

    // ===== 4. 待确认催收（collection_records 表的 pending 状态）=====
    const [[unconfirmedRow]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM collection_records WHERE status = 'pending'`
    );
    const unconfirmed = parseFloat(unconfirmedRow?.total || 0);

    // ===== 5. 已确认支出（真实支出：派工/采购/手动，**排除 contract_change 占位**）=====
    const [[expensedRow]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
       WHERE type='expense' AND status='confirmed'
         AND category IN ('dispatch', 'purchase', 'manual')`
    );
    const expensed = parseFloat(expensedRow?.total || 0);

    // ===== 6. 待确认支出（同上，排除 contract_change 占位）=====
    const [[pendingExpenseRow]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
       WHERE type='expense' AND status='pending'
         AND category IN ('dispatch', 'purchase', 'manual')`
    );
    const pendingExpense = parseFloat(pendingExpenseRow?.total || 0);

    // ===== 7. 待确认收入（collection 类型 pending，催收未到账）=====
    const [[incomePendingRow]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
       WHERE type='income' AND status='pending' AND category='collection'`
    );
    const incomePending = parseFloat(incomePendingRow?.total || 0);

    // ===== 8. 计算派生口径（按真实收支）=====
    const receivable = contractAmount + increaseTotal - decreaseTotal;  // 应收 = 合同 + 增 - 减
    const unpaid = receivable - collected;                               // 未收
    const profit = collected - expensed;                                // 利润：实收 - 已支
    const changeNet = increaseTotal - decreaseTotal;                    // 增减项净额（独立显示）

    // ===== 9. 月度真实收支趋势（最近 12 个月，按 payment_records.created_at 汇总）=====
    //    **排除 category='contract' 和 'contract_change'（占位不是真实收支）**
    const [trendRows] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
              SUM(CASE WHEN type='income'  AND category='collection' THEN amount ELSE 0 END) AS income,
              SUM(CASE WHEN type='expense' AND category IN ('dispatch','purchase','manual') THEN amount ELSE 0 END) AS expense
       FROM payment_records
       WHERE created_at IS NOT NULL
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month DESC
       LIMIT 12`
    );
    const monthlyTrend = (trendRows || []).reverse(); // 时间正序：旧 → 新

    // 本月（最后一月 = 最新月）真实收入/支出
    const thisMonth = monthlyTrend.length > 0 ? monthlyTrend[monthlyTrend.length - 1] : { month: '', income: 0, expense: 0 };
    const thisMonthIncome = parseFloat(thisMonth.income || 0);
    const thisMonthExpense = parseFloat(thisMonth.expense || 0);

    // ===== 10. 各项目财务汇总（按项目分行，复用 receivable-by-project 口径 + 真实收支）=====
    const [projectRows] = await pool.query(`
      SELECT p.id, p.name AS project_name,
        cu.name AS customer_name,
        COALESCE(c.contract_amount, 0) AS contract_amount
      FROM projects p
      LEFT JOIN contracts c ON c.project_id = p.id AND c.review_status = 'approved'
      LEFT JOIN customers cu ON cu.id = p.customer_id
      WHERE p.status != '已删除'
      ORDER BY p.id DESC
    `);

    const byProject = [];
    for (const p of projectRows) {
      const [[inc]] = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN change_type='increase' THEN amount ELSE 0 END), 0) AS increase_total,
           COALESCE(SUM(CASE WHEN change_type='decrease' THEN amount ELSE 0 END), 0) AS decrease_total
         FROM contract_changes WHERE project_id = ? AND status = 'approved'`,
        [p.id]
      );
      const [[col]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM collection_records WHERE project_id = ? AND status = 'confirmed'`,
        [p.id]
      );
      const [[realExp]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
         WHERE project_id = ? AND type='expense' AND status='confirmed'
           AND category IN ('dispatch','purchase','manual')`,
        [p.id]
      );
      // v2.3.6 hotfix 10-15：合同金额改读 payment_records.category='contract'.confirmed（不再读 contracts.contract_amount）
      const [[contractRowP]] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_records
         WHERE project_id = ? AND category='contract' AND status='confirmed'`,
        [p.id]
      );
      const contractAmountP = parseFloat(contractRowP?.total || 0);
      const increaseP = parseFloat(inc?.increase_total || 0);
      const decreaseP = parseFloat(inc?.decrease_total || 0);
      const receivableP = contractAmountP + increaseP - decreaseP;
      const collectedP = parseFloat(col?.total || 0);
      const realExpensedP = parseFloat(realExp?.total || 0);
      byProject.push({
        project_id: p.id,
        project_name: p.project_name,
        customer_name: p.customer_name || '',
        contract_amount: contractAmountP,
        change_net: increaseP - decreaseP,            // 增减项净额
        receivable: receivableP,
        collected: collectedP,
        unpaid: receivableP - collectedP,
        real_expensed: realExpensedP,                  // 真实已支出
      });
    }

    // ===== 11. 返回 =====
    res.json({
      code: 0,
      data: {
        // 应收侧（合同 + 增减项 → 应收 → 未收）
        contract_amount: contractAmount,        // 合同营收（已审核）
        increase_total: increaseTotal,          // 增项
        decrease_total: decreaseTotal,          // 减项
        change_net: changeNet,                  // 增减项净额 = 增 - 减
        receivable,                              // 应收 = 合同 + 增 - 减
        collected,                               // 已确认实收（催收+派工到位）
        unconfirmed,                             // 待确认催收
        unpaid,                                  // 未收 = 应收 - 已确认实收

        // 支出侧（真实支出，排除 contract_change 占位）
        expensed,                                // 已确认支出（dispatch/purchase/manual）
        pending_expense: pendingExpense,         // 待确认支出

        // 利润（按真实收支算）
        profit,                                  // 利润 = 实收 - 已支

        // 待确认收入（催收未到账）
        income_pending: incomePending,

        // 本月/趋势
        this_month: thisMonth.month,
        this_month_income: thisMonthIncome,
        this_month_expense: thisMonthExpense,
        monthly_trend: monthlyTrend,
        // 各项目分行
        by_project: byProject,
        // 元数据：服务器当前时间，方便前端显示"截至 YYYY-MM-DD HH:mm"
        server_time: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('finance/dashboard error:', err);
    res.status(500).json({ code: 1, error: err.message });
  }
});

// ==================== 派工审核通过 → 自动写入 payment_records ====================
// 找到派工审核路由，在更新状态后追加 payment_records 写入
// 已在原始 approve 路由（5070行）中添加，这里做补丁覆盖原逻辑
const OLD_DISPATCH_APPROVE = /await pool\.query\('UPDATE dispatches SET status=\?, updated_at=NOW\(\) WHERE id=\?', \[newStatus, req\.params\.id\]\);[\s\S]{1,200}await addLog\(userId, '', action === 'approve' \? '审核通过' : '审核拒绝'/;


// ==================== 静态文件（必须在所有 API 路由之后） ====================
// v2.4.0：上传文件名都是「时间戳_随机串」唯一命名，内容永不改变，
// 所以可以放心让浏览器长期缓存（7天）。合同里 PDF 转图从 base64 改为文件后，
// 这条缓存直接决定第二次打开编辑页的图片加载速度。
const staticUploadOpts = { maxAge: '7d', immutable: true };
app.use('/uploads', express.static(uploadDir, staticUploadOpts));
// 关键修复：uni-h5 在 base=/m/ 下，<image src="/uploads/..."> 实际请求的是 /m/uploads/...
// （base path 自动前缀化）。生产环境如果不配这条路径，所有图片 src 都会拿到 SPA fallback 的
// index.html（Content-Type: text/html），浏览器无法解析为图片。
// dev 模式靠 vite proxy 配了 /m/uploads 重写，但生产没有——这里补上。
app.use('/m/uploads', express.static(uploadDir, staticUploadOpts));
const webDistPath = path.join(__dirname, '../web/dist');
// ⚠️ 2026-10-21：index.html 一律 no-store。
// 重新构建后 chunk hash 会变，index.html 若被缓存/304，页面会继续加载**旧的** index-*.js，
// 表现就是"后端已经返回新字段，页面看起来没生效"。带 hash 的 assets 仍走默认缓存，不受影响。
const noStoreHtmlHeaders = (res, filePath) => {
  if (filePath && filePath.endsWith('index.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
  }
};
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath, { setHeaders: noStoreHtmlHeaders }));
}
// 移动端 H5 生产产物（build:h5 产物；index.html + assets + static）
// 路径前缀 /m：与 PC 前端（/）、API（/api）完全互不干扰；SPA fallback 见下方 app.get('*')。
const mobileDistPath = path.join(__dirname, 'public-mobile-h5');
if (fs.existsSync(mobileDistPath)) {
  app.use('/m', express.static(mobileDistPath, { setHeaders: noStoreHtmlHeaders }));
  // 兜底：uni-h5 tabBar 图标是 pages.json 里写的相对路径 'static/tab-home.png'，
  // getRealPath() 计算时会拼成 '/static/...'（不带 /m 前缀），导致 404 或拉到 PC 同名 png。
  // 这里在 3002 后端直接把 /static/* 指向 mobile/static，让 tabBar 图标总能正确命中。
  // 与 PC web/dist 没有同名 static，零冲突。
  app.use('/static', express.static(path.join(mobileDistPath, 'static')));
}

// 临时调试：查询员工权限
app.get('/api/debug-perms', async (req, res) => {
  const phones = (req.query.phones || '').split(',');
  if (!phones.length) return res.json({ error: '需要 phones 参数' });
  try {
    const placeholders = phones.map(() => '?').join(',');
    const emps = await db.prepare(
      `SELECT e.id, e.name, e.phone, r.name as role_name, r.code as role_code, r.permissions
       FROM employees e LEFT JOIN roles r ON e.role_id = r.id
       WHERE e.phone IN (${placeholders})`
    ).all(...phones);
    const result = emps.map(e => ({
      id: e.id, name: e.name, phone: e.phone,
      role_name: e.role_name, role_code: e.role_code,
      permissions: e.permissions ? (typeof e.permissions === 'string' ? JSON.parse(e.permissions) : e.permissions) : []
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================================================================
// 采购单审核流程（2026-10-10 新增，仿派工审核）
// ================================================================

// GET /api/material-orders/my — 我的采购单（按 applicant_id 过滤）
app.get('/api/material-orders/my', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { page = 1, page_size = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    const [rows] = await pool.query(
      `SELECT m.*, p.name as project_name, e.name as applicant_name
       FROM material_orders m
       LEFT JOIN projects p ON m.project_id = p.id
       LEFT JOIN employees e ON m.applicant_id = e.id
       WHERE m.applicant_id = ?
       ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
      [userId, parseInt(page_size), offset]
    );
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM material_orders WHERE applicant_id = ?', [userId]);
    res.json({ list: rows, total });
  } catch (err) {
    console.error('material-orders my error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// GET /api/material-orders/pending — 待审核采购单（需 purchase:approve 权限）
app.get('/api/material-orders/pending', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await getUserPermissions(userId);
    if (!perms.includes('purchase:approve') && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无审核权限' });
    }
    const { page = 1, page_size = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    const [rows] = await pool.query(
      `SELECT m.*, p.name as project_name, e.name as applicant_name
       FROM material_orders m
       LEFT JOIN projects p ON m.project_id = p.id
       LEFT JOIN employees e ON m.applicant_id = e.id
       WHERE m.status = 'pending'
       ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
      [parseInt(page_size), offset]
    );
    const [[{ total }]] = await pool.query("SELECT COUNT(*) as total FROM material_orders WHERE status = 'pending'");
    res.json({ list: rows, total });
  } catch (err) {
    console.error('material-orders pending error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// GET /api/material-orders/by-status?status=approved — 按状态查询（前端"进行中/已完成"用）
app.get('/api/material-orders/by-status', async (req, res) => {
  try {
    const { status, page = 1, page_size = 20 } = req.query;
    if (!status) return res.status(400).json({ error: '缺少 status 参数' });
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    const [rows] = await pool.query(
      `SELECT m.*, p.name as project_name, e.name as applicant_name
       FROM material_orders m
       LEFT JOIN projects p ON m.project_id = p.id
       LEFT JOIN employees e ON m.applicant_id = e.id
       WHERE m.status = ?
       ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
      [status, parseInt(page_size), offset]
    );
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM material_orders WHERE status = ?', [status]);
    res.json({ list: rows, total });
  } catch (err) {
    console.error('material-orders by-status error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// PUT /api/material-orders/:id/approve — 审核通过/驳回
app.put('/api/material-orders/:id/approve', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await getUserPermissions(userId);
    if (!perms.includes('purchase:approve') && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无审核权限' });
    }
    const [[record]] = await pool.query('SELECT * FROM material_orders WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: '采购单不存在' });
    const { action, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await pool.query(
      'UPDATE material_orders SET status=?, reject_reason=?, updated_at=NOW() WHERE id=?',
      [newStatus, action === 'reject' ? (reason || '') : null, req.params.id]
    );
    await addLog(userId, '', action === 'approve' ? '审核通过' : '审核拒绝', '采购管理', req.params.id, record.material_name || '', `采购审核${action === 'approve' ? '通过' : '拒绝'}${reason ? '，原因：' + reason : ''}`, req.ip);
    // 通知申请人
    if (record.applicant_id && record.applicant_id !== userId) {
      // v2.3.4 修：用 messages 表（站内通知）
      const [[applicant]] = await pool.query('SELECT name FROM employees WHERE id = ?', [record.applicant_id]);
      const msg = action === 'approve'
        ? `您的采购申请（${record.material_name}）已审核通过。`
        : `您的采购申请（${record.material_name}）未通过${reason ? '：' + reason : ''}。`;
      await pool.query(
        'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, \'sent\')',
        [record.applicant_id, applicant ? applicant.name : '', action === 'approve' ? '采购申请已通过' : '采购申请未通过', msg, action === 'approve' ? 'purchase_approved' : 'purchase_rejected', req.params.id, 'purchase']
      );
    }
    res.json({ message: action === 'approve' ? '审核通过' : '已拒绝' });
  } catch (err) {
    console.error('material-orders approve error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// PUT /api/material-orders/:id/complete — 确认到货/完成
app.put('/api/material-orders/:id/complete', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const [[record]] = await pool.query('SELECT * FROM material_orders WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: '采购单不存在' });
    await pool.query("UPDATE material_orders SET status='completed', updated_at=NOW() WHERE id=?", [req.params.id]);
    await addLog(userId, '', '确认到货', '采购管理', req.params.id, record.material_name || '', '采购到货确认', req.ip);
    res.json({ message: '已确认到货' });
  } catch (err) {
    console.error('material-orders complete error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});


app.get('/api/mobile/home-stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. 进行中项目数：所有"非终止态"（开工准备/进行中/施工中/暂停等都算在跑；只排除已收尾/已取消/已交付/已完成）
    const inProgress = Number((await db.prepare(
      "SELECT COUNT(*) as count FROM projects WHERE status NOT IN ('已完成','已交付','已取消','已完工','已结算','作废','archived','completed','cancelled') AND status IS NOT NULL AND status <> ''"
    ).get())?.count) || 0;

    // 2. 逾期节点数（plan_end_date < 今天 且 未完成）
    // ⚠️ 2026-10-23：改读 project_progress_nodes（项目详情/节点管理真正读写的表）。
    //    project_stages 已是废弃历史表，两套数据对不上会导致首页与项目里不一致。
    const overdue = Number((await db.prepare(
      "SELECT COUNT(*) as count FROM project_progress_nodes WHERE plan_end_date IS NOT NULL AND plan_end_date < ? AND (status IS NULL OR status NOT IN ('completed', '已完成'))"
    ).get(today))?.count) || 0;

    // 3. 待整改巡检（rectification_issues 未完成口径，与待办中心/首页统计一致）
    const pendingInspect = Number((await db.prepare(
      `SELECT COUNT(*) as count FROM rectification_issues ri WHERE ${RECTIFY_OPEN_SQL}`
    ).get())?.count) || 0;

    // 4. 待回款金额 = 已签订合同的总金额 - 已收款（payment1+payment2+payment3）
    const payRow = (await db.prepare(
      "SELECT COALESCE(SUM(total_amount - COALESCE(payment1,0) - COALESCE(payment2,0) - COALESCE(payment3,0)), 0) as total FROM contracts WHERE status = '已签订'"
    ).get()) || { total: 0 };
    const pendingPay = Number(payRow.total) || 0;

    // 5. 待办事项（按优先级混合：节点待审核 + 巡检待整改 + 财务待审核，最多 5 条）
    const todos = [];
    // 节点待审核（读 project_progress_nodes）
    try {
      const stages = await db.prepare(
        "SELECT ps.id, ps.node_name AS stage_name, ps.project_id, p.name as project_name FROM project_progress_nodes ps LEFT JOIN projects p ON ps.project_id = p.id WHERE ps.status IN ('pending', 'in_progress') ORDER BY ps.created_at DESC LIMIT 5"
      ).all();
      for (const s of stages.slice(0, 2)) {
        todos.push({
          id: 'stage-' + s.id,
          title: `项目「${s.project_name || '未知'}」${s.stage_name}待审核`,
          project: s.project_name || '',
          time: '待处理',
          priority: 'warning',
          type: 'node',
        });
      }
    } catch (_) {}
    // 巡检待整改（rectification_issues 未完成口径）
    try {
      const inspects = await db.prepare(
        `SELECT ri.id, COALESCE(NULLIF(ri.project_name, ''), p.name) AS project_name, ri.issue_desc AS issues
           FROM rectification_issues ri
           LEFT JOIN projects p ON p.id = ri.project_id
          WHERE ${RECTIFY_OPEN_SQL}
          ORDER BY ri.created_at DESC LIMIT 3`
      ).all();
      for (const i of inspects.slice(0, 2)) {
        todos.push({
          id: 'inspect-' + i.id,
          title: `巡检问题待整改：${(i.issues || '').substring(0, 20) || '需检查'}`,
          project: i.project_name || '',
          time: '今天',
          priority: 'danger',
          type: 'inspect',
        });
      }
    } catch (_) {}

    // 6. 逾期预警（project_progress_nodes 里 plan_end_date < today 的节点 + 项目名 + 逾期天数）
    let warnings = [];
    try {
      const warns = await db.prepare(
        `SELECT ps.id, ps.node_name AS stage_name, p.name as project_name, p.id as project_id,
                DATEDIFF(?, ps.plan_end_date) as days
         FROM project_progress_nodes ps
         LEFT JOIN projects p ON ps.project_id = p.id
         WHERE ps.plan_end_date IS NOT NULL AND ps.plan_end_date < ? AND (ps.status IS NULL OR ps.status NOT IN ('completed', '已完成'))
         ORDER BY ps.plan_end_date ASC LIMIT 5`
      ).all(today, today);
      warnings = warns.map(w => ({
        id: w.project_id,
        name: w.project_name || '未知项目',
        node: w.stage_name || '',
        days: w.days || 0,
      }));
    } catch (_) {}

    res.json({
      stats: {
        inProgress,
        overdue,
        pendingInspect,
        pendingPay: '¥' + (pendingPay >= 10000 ? (pendingPay / 10000).toFixed(1) + '万' : String(Math.round(pendingPay))),
        pendingPayRaw: pendingPay,
      },
      todos: todos.slice(0, 5),
      warnings,
    });
  } catch (err) {
    console.error('[mobile/home-stats] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 统一待办中心（只读聚合）— 2026-10-10
// 目的：把各模块「待我处理」的条目统一收口，按权限过滤后返回；
//       仅做只读聚合，不修改任何现有接口与审批业务逻辑。
// ============================================================
// §7.3 共享作用域（2026-10-12）：待办计数与待办列表必须同一口径 ——
//   未配 read_all 时按"关联项目 ∪ 提交人=我"过滤，否则徽章数字会把
//   用户实际看不到的条目也算进去（徽章 6 列表 4 问题）。

// 「待整改」唯一口径（2026-10-23）：待办列表、待办计数、首页统计卡片三处必须共用。
// 判「未完成」而不是判白名单状态：库里存在 status=NULL 且 finish_date 也为空的历史数据
// （早期版本没写状态机），按 status IN ('待处理',...) 会被漏掉，永远不出现在任何待办里；
// 而只判 status 不过滤的话，已完成的历史整改又会被算进"待整改"卡片（曾出现卡片 6 / 列表 1）。
const RECTIFY_OPEN_SQL = `(ri.status IS NULL OR ri.status NOT IN ('已完成','completed','done','已关闭','已作废'))
   AND (ri.finish_date IS NULL OR ri.finish_date = '')`;

function __todoScope(userId, perms, admin, relatedIds) {
  const fullScope = {
    purchase: admin || perms.includes('purchase:read_all'),
    dispatch: admin || perms.includes('dispatch:read_all'),
    contract: admin || perms.includes('contract:read_all') || perms.includes('project_contract:read_all'),
    contract_change: admin || perms.includes('contract_change:read_all'),
    inspection: admin || perms.includes('inspection:read_all'),
  };
  // 待办子项 SQL 子句：当 fullScope=false 时，project_id 必须在 relatedIds 内，
  // 或"提交人=我"（采购 applicant_name / 派工 applicant_id）。
  // 返回 { sql, params }：sql 已含前导 " AND "；params 是占位符对应的参数数组。
  const buildScope = (mod, extraCol = 'project_id') => {
    if (fullScope[mod]) return { sql: '', params: [] };
    const ids = (relatedIds && relatedIds.length) ? relatedIds : [-1];
    const placeholders = ids.map(() => '?').join(',');
    const submitters = {
      purchase: "`pr`.applicant_name = (SELECT name FROM employees WHERE id = ?)",
      dispatch: "`d`.applicant_id = ?",
      contract: "`c`.submitted_by = ?",
      contract_change: "`cc`.submitted_by = ?",
      // 2026-10-23：巡检整改的三类人要看待办 ——
      //   ① 项目关联人（原有）② 提交问题的监理（原有）③ 被派为整改负责人的工长（新增）
      // 派单在 POST 时按 projects.foreman_id 自动落 responsible_id，这里按它精确推送。
      inspection: "(`ri`.creator_id = ? OR `ri`.responsible_id = ?)",
    }[mod] || null;
    if (submitters) {
      return {
        sql: ` AND (${extraCol} IN (${placeholders}) OR ${submitters})`,
        params: [...ids, userId, userId],
      };
    }
    return {
      sql: ` AND ${extraCol} IN (${placeholders})`,
      params: [...ids],
    };
  };
  return { fullScope, buildScope };
}

async function __todoCounts(userId, perms, admin) {
  const can = (p) => admin || (perms || []).includes(p);
  // 2026-10-12：计数与列表同口径 —— 按"关联项目 ∪ 提交人"过滤
  const relatedIds = admin ? null : Array.from(await permCore.relatedProjectIds(userId));
  const { buildScope } = __todoScope(userId, perms, admin, relatedIds);
  const out = {};
  // 1) 采购待审核（purchase:approve）
  if (can('purchase:approve')) {
    const sc = buildScope('purchase');
    const [[r]] = await pool.query("SELECT COUNT(*) AS c FROM purchase_requests pr WHERE pr.status='pending'" + sc.sql, sc.params);
    out.purchase_approve = { key: 'purchase_approve', label: '采购待审核', icon: '📦', type: 'purchase_approve', count: Number(r.c) || 0 };
  }
  // 2) 报销待确认 / 待上传回执（purchase:finance）
  if (can('purchase:finance')) {
    const scA = buildScope('purchase');
    const [[a]] = await pool.query("SELECT COUNT(*) AS c FROM purchase_requests pr WHERE pr.status='reimbursing'" + scA.sql, scA.params);
    out.purchase_reimburse = { key: 'purchase_reimburse', label: '报销待确认', icon: '🧾', type: 'purchase_reimburse', count: Number(a.c) || 0 };
    const scB = buildScope('purchase');
    const [[b]] = await pool.query("SELECT COUNT(*) AS c FROM purchase_requests pr WHERE pr.status='finance_confirmed'" + scB.sql, scB.params);
    out.purchase_receipt = { key: 'purchase_receipt', label: '待上传回执', icon: '🏦', type: 'purchase_receipt', count: Number(b.c) || 0 };
  }
  // 3) 通用审批（approver_ids 含当前用户，与权限无关，天然同口径）
  {
    const [[r]] = await pool.query("SELECT COUNT(*) AS c FROM approvals WHERE status='待审批' AND FIND_IN_SET(?, approver_ids)", [String(userId)]);
    out.approval = { key: 'approval', label: '通用审批', icon: '📝', type: 'approval', count: Number(r.c) || 0 };
  }
  // 4) 派工待审核（dispatch:approve）
  if (can('dispatch:approve')) {
    const sc = buildScope('dispatch');
    const [[r]] = await pool.query("SELECT COUNT(*) AS c FROM dispatches d WHERE d.status='pending'" + sc.sql, sc.params);
    out.dispatch = { key: 'dispatch', label: '派工待审核', icon: '👷', type: 'dispatch', count: Number(r.c) || 0 };
  }
  // 5) 合同待审核（主合同上传后待审）
  //    注意：contracts 表里有历史迁移产生的脏数据（project_id 为空、金额为 0），
  //    它们不是真实提交，必须过滤掉，否则待办角标会出现几十条虚假数字。
  if (can('contract:approve') || can('project_contract:approve')) {
    const sc = buildScope('contract');
    const [[r]] = await pool.query(
      "SELECT COUNT(*) AS c FROM contracts c WHERE c.review_status='pending' AND c.project_id IS NOT NULL AND c.contract_amount > 0" + sc.sql,
      sc.params
    );
    out.contract_approve = { key: 'contract_approve', label: '合同待审核', icon: '📄', type: 'contract_approve', count: Number(r.c) || 0 };
  }
  // 6) 增减项待审核（contract_change:approve）
  if (can('contract_change:approve')) {
    const sc = buildScope('contract_change');
    const [[r]] = await pool.query("SELECT COUNT(*) AS c FROM contract_changes cc WHERE cc.status='pending'" + sc.sql, sc.params);
    out.change_approve = { key: 'change_approve', label: '增减项待审核', icon: '🧮', type: 'change_approve', count: Number(r.c) || 0 };
  }
  // 7) 催收未确认收款（项目相关人可见，2026-10-23 扩围）
  //    ⚠️ 口径变更：初版只推给提交人（submitted_by=我），业务上不对 ——
  //       "这笔款还没收到"应该让**整个项目组**都知道（项目经理/监理/工长/设计师/创建人），
  //       不能只让提交催收的那个人自己盯着。
  //    新口径：project_id ∈ 我的关联项目 ∪ 我提交的；admin / collection:read_all / finance:read_all 看全部。
  //    财务确认收款（status='confirmed'）后，所有人列表里同时消失。
  {
    const colAllScope = admin || perms.includes('collection:read_all') || perms.includes('finance:read_all');
    let sql = "SELECT COUNT(*) AS c FROM collection_records cr WHERE cr.status='pending'";
    const params = [];
    if (!colAllScope) {
      // relatedIds 为空时不能拼 IN ()（语法错），退回"仅自己提交的"
      if (relatedIds && relatedIds.length) {
        sql += ` AND (cr.project_id IN (${relatedIds.map(() => '?').join(',')}) OR cr.submitted_by = ?)`;
        params.push(...relatedIds, userId);
      } else {
        sql += ' AND cr.submitted_by = ?';
        params.push(userId);
      }
    }
    const [[r]] = await pool.query(sql, params);
    out.collection_pending = { key: 'collection_pending', label: '催收未确认收款', icon: '📞', type: 'collection_pending', count: Number(r.c) || 0 };
  }
  return out;
}

// ============================================================
// 项目相关待办计数（节点即将到期 / 待整改 / 我的派工）
// 2026-10-21 新增：/api/todo/center 的 home.sections 一直有这三类事项，
//   但 /api/todo/count 只统计审批流（采购/报销/合同/增减项/审批/派工审核），
//   导致 PC 侧边栏「待办中心」角标为 0、而首页待办却有条目。
//   这里把 home.sections 的口径单独抽出来，供 count 与 center 共用，保证
//   「角标数字 = 列表条数」。
//   ⚠️ 与 center 里 sections 的查询条件必须保持一字不差（含 LIMIT 之外的 WHERE）。
// ============================================================
async function __todoProjectCounts(userId, perms, admin, relatedIds) {
  const projectAllScope = (admin || perms.includes('project:read_all'))
    && !perms.includes('finance:read_all');
  // ⚠️ 必须与 /api/todo/center 里的 hasRelated/homePh/homeProjectParams 一字不差：
  //    无关联项目时 homePh 用字面量 -1（无占位符），参数列表返回空数组，
  //    否则占位符与参数个数对不上（曾报 `near '?)'`）。
  const hasRelated = !!(relatedIds && relatedIds.length);
  const homePh = hasRelated ? relatedIds.map(() => '?').join(',') : '-1';
  const projectFilter = (col = 'p.id') => projectAllScope ? '' : ` AND ${col} IN (${homePh})`;
  const projectParams = () => (projectAllScope ? [] : (hasRelated ? [...relatedIds] : []));
  const today = new Date().toISOString().split('T')[0];
  const todayPlus3 = new Date(Date.now() + 3 * 86400 * 1000).toISOString().split('T')[0];

  // 1) 节点提前 3 天到期（读 project_progress_nodes，与项目详情/节点管理同源）
  //    2026-10-23 修复：原读 project_stages（废弃表）→ 与列表、与项目里看到的节点全对不上。
  const [[stageDue]] = await pool.query(
    `SELECT COUNT(*) AS c FROM project_progress_nodes ps
     JOIN projects p ON p.id = ps.project_id
     WHERE ps.plan_end_date IS NOT NULL AND ps.plan_end_date != ''
       AND (ps.status IS NULL OR ps.status NOT IN ('completed', '已完成'))
       AND ps.plan_end_date BETWEEN ? AND ?${projectFilter('p.id')}`,
    [today, todayPlus3, ...projectParams()]
  );
  // 2) 待整改巡检（作用域与列表完全一致，口径用模块级 RECTIFY_OPEN_SQL）
  const sc = __todoScope(userId, perms, admin, relatedIds).buildScope('inspection');
  const [[rectify]] = await pool.query(
    `SELECT COUNT(*) AS c FROM rectification_issues ri
     WHERE ${RECTIFY_OPEN_SQL}${sc.sql}`,
    sc.params
  );
  // 3) 我的派工（与 center 同条件）
  const [[myDispatch]] = await pool.query(
    `SELECT COUNT(*) AS c FROM dispatches d
     WHERE (d.applicant_id = ? OR d.worker LIKE ?) AND d.status IN ('pending', 'in_progress', '已派工')`,
    [userId, '%' + userId + '%']
  );
  return {
    stage_due: Number(stageDue.c) || 0,
    inspect_rectify: Number(rectify.c) || 0,
    dispatch_mine: Number(myDispatch.c) || 0,
  };
}

const __fmtTodoTime = (t) => {
  if (!t) return '';
  try { return String(t).replace('T', ' ').substring(0, 16); } catch { return String(t); }
};

// GET /api/todo/count — 待办数量汇总（用于首页角标）
app.get('/api/todo/count', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await getUserPermissions(userId);
    const admin = await isAdmin(userId);
    const map = await __todoCounts(userId, perms, admin);
    // 2026-10-21：补项目相关事项（节点到期/待整改/我的派工），与 /api/todo/center
    // 的 home.sections 同口径 —— 否则 PC 侧边栏角标 0、首页待办却有内容。
    const relatedIds = admin ? null : Array.from(await permCore.relatedProjectIds(userId));
    const project = await __todoProjectCounts(userId, perms, admin, relatedIds);
    const total = Object.values(map).reduce((s, g) => s + (g.count || 0), 0)
      + Object.values(project).reduce((s, n) => s + (Number(n) || 0), 0);
    res.json({ code: 0, total, groups: map, project });
  } catch (e) {
    console.error('[todo/count] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/todo/center — 待办中心列表（按权限分组返回）
// 2026-10-10 扩展：同时返回 home 区块（按角色过滤的统计 + 项目相关事项 + 逾期预警）
// 2026-10-11 P2 §7.3 改造：采购/派工/合同/增减项/巡检整改 5 类按"提交人 ∪ 关联项目 ∪ read_all"过滤。
app.get('/api/todo/center', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const perms = await getUserPermissions(userId);
    const admin = await isAdmin(userId);
    const can = (p) => admin || (perms || []).includes(p);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const counts = await __todoCounts(userId, perms, admin);
    // §7.3：项目关联人（创建人/设计师/监理/工长/项目经理/客户）
    const relatedIds = admin ? null : Array.from(await permCore.relatedProjectIds(userId));
    // 计数与列表共用同一作用域（2026-10-12 抽取为 __todoScope）
    const { fullScope, buildScope } = __todoScope(userId, perms, admin, relatedIds);
    const groups = [];

    // 1) 采购待审核
    if (can('purchase:approve')) {
      const sc = buildScope('purchase');
      const [rows] = await pool.query(
        `SELECT pr.id, pr.project_name, pr.applicant_name, pr.total_amount, pr.created_at,
                (SELECT GROUP_CONCAT(pri.material_name SEPARATOR '、') FROM purchase_request_items pri WHERE pri.request_id = pr.id) AS material_name
         FROM purchase_requests pr WHERE pr.status = 'pending'${sc.sql}
         ORDER BY pr.created_at DESC LIMIT ?`, [...sc.params, limit]);
      groups.push({
        ...counts.purchase_approve,
        items: rows.map(r => ({
          id: r.id, type: 'purchase_approve',
          title: r.material_name || '采购申请',
          subtitle: [r.project_name, r.applicant_name ? ('申请人：' + r.applicant_name) : ''].filter(Boolean).join(' · '),
          amount: r.total_amount != null ? Number(r.total_amount) : null,
          time: __fmtTodoTime(r.created_at),
          url: `/pages/purchase/detail?id=${r.id}`
        }))
      });
    }

    // 2) 报销待确认
    if (can('purchase:finance')) {
      const sc = buildScope('purchase');
      const [rows] = await pool.query(
        `SELECT pr.id, pr.project_name, pr.applicant_name, pr.total_amount, pr.created_at,
                (SELECT GROUP_CONCAT(pri.material_name SEPARATOR '、') FROM purchase_request_items pri WHERE pri.request_id = pr.id) AS material_name
         FROM purchase_requests pr WHERE pr.status = 'reimbursing'${sc.sql}
         ORDER BY pr.created_at DESC LIMIT ?`, [...sc.params, limit]);
      groups.push({
        ...counts.purchase_reimburse,
        items: rows.map(r => ({
          id: r.id, type: 'purchase_reimburse',
          title: r.material_name || '采购报销',
          subtitle: [r.project_name, r.applicant_name ? ('申请人：' + r.applicant_name) : ''].filter(Boolean).join(' · '),
          amount: r.total_amount != null ? Number(r.total_amount) : null,
          time: __fmtTodoTime(r.created_at),
          url: `/pages/purchase/detail?id=${r.id}`
        }))
      });

      // 3) 待上传回执（财务）
      const sc2 = buildScope('purchase');
      const [rows2] = await pool.query(
        `SELECT pr.id, pr.project_name, pr.applicant_name, pr.total_amount, pr.created_at,
                (SELECT GROUP_CONCAT(pri.material_name SEPARATOR '、') FROM purchase_request_items pri WHERE pri.request_id = pr.id) AS material_name
         FROM purchase_requests pr WHERE pr.status = 'finance_confirmed'${sc2.sql}
         ORDER BY pr.created_at DESC LIMIT ?`, [...sc2.params, limit]);
      groups.push({
        ...counts.purchase_receipt,
        items: rows2.map(r => ({
          id: r.id, type: 'purchase_receipt',
          title: r.material_name || '采购回执',
          subtitle: [r.project_name, r.applicant_name ? ('申请人：' + r.applicant_name) : ''].filter(Boolean).join(' · '),
          amount: r.total_amount != null ? Number(r.total_amount) : null,
          time: __fmtTodoTime(r.created_at),
          url: `/pages/purchase/detail?id=${r.id}`
        }))
      });
    }

    // 4) 通用审批
    {
      const [rows] = await pool.query(
        `SELECT id, title, type, applicant_name, amount, created_at
         FROM approvals WHERE status = '待审批' AND FIND_IN_SET(?, approver_ids)
         ORDER BY created_at DESC LIMIT ?`, [String(userId), limit]);
      groups.push({
        ...counts.approval,
        items: rows.map(r => ({
          id: r.id, type: 'approval',
          title: r.title || '审批申请',
          subtitle: [r.type, r.applicant_name ? ('申请人：' + r.applicant_name) : ''].filter(Boolean).join(' · '),
          amount: r.amount != null ? Number(r.amount) : null,
          time: __fmtTodoTime(r.created_at),
          url: `/pages/approval/detail?id=${r.id}&tab=todo`
        }))
      });
    }

    // 5) 派工待审核
    if (can('dispatch:approve')) {
      const sc = buildScope('dispatch');
      const [rows] = await pool.query(
        `SELECT id, project_id, project_name, content, worker, created_at
         FROM dispatches d WHERE d.status = 'pending'${sc.sql}
         ORDER BY d.created_at DESC LIMIT ?`, [...sc.params, limit]);
      groups.push({
        ...counts.dispatch,
        items: rows.map(r => ({
          id: r.id, type: 'dispatch',
          title: r.content || '派工单',
          subtitle: [r.project_name, r.worker].filter(Boolean).join(' · '),
          amount: null,
          time: __fmtTodoTime(r.created_at),
          url: `/pages/dispatch/detail?id=${r.id}`
        }))
      });
    }

    // 6) 合同待审核（主合同上传后待审）—— 过滤历史脏数据 + §7.3 关联过滤
    if (can('contract:approve') || can('project_contract:approve')) {
      const sc = buildScope('contract');
      const [rows] = await pool.query(
        `SELECT c.id, c.project_id, c.contract_amount, c.attachment, c.created_at,
                p.name AS project_name, e.name AS submitter_name
         FROM contracts c
         LEFT JOIN projects p ON p.id = c.project_id
         LEFT JOIN employees e ON e.id = c.submitted_by
         WHERE c.review_status = 'pending'
           AND c.project_id IS NOT NULL AND c.contract_amount > 0${sc.sql}
         ORDER BY c.created_at DESC LIMIT ?`, [...sc.params, limit]);
      groups.push({
        ...counts.contract_approve,
        items: rows.map(r => ({
          id: r.id, type: 'contract_approve',
          title: r.project_name || ('合同#' + r.id),
          subtitle: ['合同审核', r.submitter_name ? ('提交人：' + r.submitter_name) : ''].filter(Boolean).join(' · '),
          amount: r.contract_amount != null ? Number(r.contract_amount) : null,
          time: __fmtTodoTime(r.created_at),
          url: `/pages/contracts/approval?tab=contract&id=${r.id}`
        }))
      });
    }

    // 7) 增减项待审核
    if (can('contract_change:approve')) {
      const sc = buildScope('contract_change');
      const [rows] = await pool.query(
        `SELECT cc.id, cc.project_id, cc.change_type, cc.title, cc.amount, cc.submitted_at,
                p.name AS project_name, e.name AS submitter_name
         FROM contract_changes cc
         LEFT JOIN projects p ON p.id = cc.project_id
         LEFT JOIN employees e ON e.id = cc.submitted_by
         WHERE cc.status = 'pending'${sc.sql}
         ORDER BY cc.id DESC LIMIT ?`, [...sc.params, limit]);
      groups.push({
        ...counts.change_approve,
        items: rows.map(r => ({
          id: r.id, type: 'change_approve',
          title: (r.change_type === 'decrease' ? '减项 · ' : '增项 · ') + (r.title || ''),
          subtitle: [r.project_name, r.submitter_name ? ('提交人：' + r.submitter_name) : ''].filter(Boolean).join(' · '),
          amount: r.amount != null ? Number(r.amount) : null,
          time: __fmtTodoTime(r.submitted_at),
          url: `/pages/contracts/approval?tab=change&id=${r.id}`
        }))
      });
    }

    // 8) 催收未确认收款（项目相关人可见，2026-10-23 扩围）
    //    ⚠️ 口径变更：初版只推给提交人（submitted_by=我），业务上不对 ——
    //       "这笔款还没收到"应该让**整个项目组**都知道（项目经理/监理/工长/设计师/创建人），
    //       不能只让提交催收的那个人自己盯着。
    //    新口径：project_id ∈ 我的关联项目 ∪ 我提交的；admin / collection:read_all / finance:read_all 看全部。
    //    财务确认收款（status='confirmed'）后，所有人列表里同时消失。
    {
      const colAllScope = can('collection:read_all') || can('finance:read_all');
      let sql = `SELECT cr.id, cr.project_id, cr.amount, cr.collect_date, cr.remark, cr.submitted_at,
                        COALESCE(NULLIF(p.name, ''), CONCAT('项目#', cr.project_id)) AS project_name,
                        e.name AS submitter_name
                 FROM collection_records cr
                 LEFT JOIN projects p ON p.id = cr.project_id
                 LEFT JOIN employees e ON e.id = cr.submitted_by
                 WHERE cr.status = 'pending'`;
      const params = [];
      if (!colAllScope) {
        // relatedIds 为空时不能拼 IN ()（语法错），退回"仅自己提交的"
        if (relatedIds && relatedIds.length) {
          sql += ` AND (cr.project_id IN (${relatedIds.map(() => '?').join(',')}) OR cr.submitted_by = ?)`;
          params.push(...relatedIds, userId);
        } else {
          sql += ' AND cr.submitted_by = ?';
          params.push(userId);
        }
      }
      sql += ' ORDER BY cr.id DESC LIMIT ?';
      params.push(limit);
      const [rows] = await pool.query(sql, params);
      groups.push({
        ...counts.collection_pending,
        items: rows.map(r => ({
          id: r.id, type: 'collection_pending',
          project_id: r.project_id,
          title: `催收未确认收款 · ${r.project_name || ''}`.trim(),
          // 扩围后别人也能看到这条，副标题必须写清「谁提交的」，否则不知道找谁问。
          // ⚠️ 不再重复项目名 —— title 里已经有了，重复会把「提交人」挤出可视区被截断。
          subtitle: [
            r.submitter_name ? ('提交人：' + r.submitter_name) : '',
            r.remark || '等待财务确认收款'
          ].filter(Boolean).join(' · '),
          amount: r.amount != null ? Number(r.amount) : null,
          time: __fmtTodoTime(r.submitted_at || r.collect_date),
          // 移动端：项目详情财务 tab（待确认催收列表就在这里）
          url: `/pages/projects/detail?id=${r.project_id}&tab=finance`
        }))
      });
    }

    const total = groups.reduce((s, g) => s + (g.count || 0), 0);

    // ==== home 区块：按角色过滤的统计 + 项目相关事项 + 逾期预警 ====
    const today = new Date().toISOString().split('T')[0];
    const todayPlus3 = new Date(Date.now() + 3 * 86400 * 1000).toISOString().split('T')[0];

    // ⚠️ 2026-10-23：「待整改」的唯一口径见模块级 RECTIFY_OPEN_SQL（待办列表 / 待办计数 / 统计卡片共用）。
    // 这里不再重复定义，避免三处各写一份后再次漂移。

    // v2.3.1 §7.3：home 统计/列表口径严格按"我能看到的项目"
    //   - admin → 看全部（特殊）
    //   - project:read_all 且非财务角色 → 看全部（经理/监理等需要全局项目提醒）
    //   - 财务（finance:read_all）→ 按 relatedIds 过滤（财务只关心金额，不关心项目节点进度；财务员工均无项目关联 → 自然返空）
    //   - 其他 → 仅关联项目集合 relatedIds
    //   - 无 project 权限 → 全空
    // 2026-10-12 修复：原 `|| perms.includes('finance:read_all')` 把财务误豁免 → 财务首页出现与金额业务无关的节点/巡检提醒；现改为反向排除。
    const projectAllScope = (admin || perms.includes('project:read_all'))
      && !perms.includes('finance:read_all');
    // 2026-10-21 修复：原来 homePh 由 homeProjectIds=[-1] 算出 '?'（占位符），
    // 而下面 pendingInspect 那条查询在 relatedIds 为空时只传 1 个参数，
    // 第 2 个 ? 没被替换 → MySQL 报 `near '?)'`，整个 /api/todo/center 500
    // （非 admin、无 project:read_all、且无任何关联项目的员工：待办中心和首页全白）。
    // 与 __todoProjectCounts 对齐：无关联项目时 homePh 用字面量 -1（无占位符），参数列表也 return []。
    const hasRelated = !!(relatedIds && relatedIds.length);
    const homeProjectIds = projectAllScope
      ? null  // null = 不加项目过滤
      : (hasRelated ? relatedIds : [-1]);
    const homePh = hasRelated ? relatedIds.map(() => '?').join(',') : '-1';
    const homeProjectFilter = (col = 'p.id') => projectAllScope ? '' : ` AND ${col} IN (${homePh})`;
    const homeProjectParams = () => (projectAllScope ? [] : (hasRelated ? [...relatedIds] : []));

    // 1) 节点提前 3 天提醒 —— 仅展示我能看到的项目下的节点
    // ⚠️ 2026-10-23 修复：原来查 project_stages（已废弃的历史表，全库只剩 3 条 9 月的脏数据），
    //    而项目详情/节点管理真正读写的都是 project_progress_nodes（连 /api/project-stages 这个
    //    URL 内部也是查 progress_nodes）。两套表数据完全不同 → 首页提醒与项目里看到的节点对不上。
    let stage_alerts = [];
    {
      const [rows] = await pool.query(
        `SELECT ps.id, ps.project_id, ps.node_name AS stage_name, ps.plan_end_date, ps.status, p.name AS project_name
         FROM project_progress_nodes ps
         JOIN projects p ON p.id = ps.project_id
         WHERE ps.plan_end_date IS NOT NULL AND ps.plan_end_date != ''
           AND (ps.status IS NULL OR ps.status NOT IN ('completed', '已完成'))
           AND ps.plan_end_date BETWEEN ? AND ?${homeProjectFilter('p.id')}
         ORDER BY ps.plan_end_date ASC LIMIT 10`,
        [today, todayPlus3, ...homeProjectParams()]
      );
      stage_alerts = rows.map(r => {
        const days = (new Date(r.plan_end_date) - new Date(today)) / 86400;
        return {
          id: r.id, type: 'stage_due',
          title: r.stage_name,
          subtitle: r.project_name,
          time: r.plan_end_date,
          days_left: Math.round(days),
          priority: days <= 0 ? 'danger' : 'warning',
          url: `/pages/projects/detail?id=${r.project_id}`
        };
      });
    }

    // 2) 待整改巡检（整改问题表 rectification_issues，详情页 /api/rectification-issues/:id 读这张表）
    // 原实现查的是 inspections.rectify_status='待整改'，id 与详情接口对不上（不同表）。
    // 2026-10-23：口径统一为 RECTIFY_OPEN（未完成），与首页"待整改"统计卡片完全一致。
    let rectify_alerts = [];
    {
      const sc = buildScope('inspection', 'ri.project_id');
      // 2026-10-23 修复：rectification_issues.project_name 是"提交时快照"，
      // 移动端巡检提交页取不到项目名时会写空串（实测 2026-10-22 的 10 条全是 ''），
      // 待办中心列表的副标题就读成 '—'，看起来像"列表没有信息"。
      // 这里 LEFT JOIN projects 兜底：字段为空时用项目表当前名称。
      const [rows] = await pool.query(
        `SELECT ri.id, ri.project_id,
                COALESCE(NULLIF(ri.project_name, ''), p.name) AS project_name,
                ri.issue_desc, ri.title, ri.created_at, ri.due_date, ri.status,
                ri.responsible_id, ri.responsible_name, ri.accept_date, ri.accept_name
         FROM rectification_issues ri
         LEFT JOIN projects p ON p.id = ri.project_id
         WHERE ${RECTIFY_OPEN_SQL}${sc.sql}
         ORDER BY ri.created_at DESC LIMIT 10`,
        sc.params
      );
      rectify_alerts = rows.map(r => {
        let urgency = 'normal';
        let days_left = null;
        if (r.due_date) {
          const due = new Date(r.due_date);
          // 直接用外层 const today（YYYY-MM-DD 字符串），避免 TDZ/shadowing
          const todayDate = new Date(today);
          const diffMs = due.getTime() - todayDate.getTime();
          const diffDays = Math.ceil(diffMs / 86400000);
          days_left = diffDays;
          if (diffDays < 0) urgency = 'overdue';
          else if (diffDays <= 3) urgency = 'urgent';
        }
        return {
          id: r.id, type: 'inspect_rectify',
          source_type: 'rectification_issue', source_id: r.id,
          title: (r.title || r.issue_desc || '待整改').slice(0, 30),
          subtitle: [r.project_name, r.responsible_name].filter(Boolean).join(' · '),
          time: __fmtTodoTime(r.created_at),
          due_date: r.due_date || null,
          days_left,
          urgency,
          priority: urgency === 'overdue' ? 'danger' : 'warning',
          url: `/pages/inspection/detail?id=${r.id}`
        };
      });
    }

    // 3) 派工待我处理（worker=本人 或 applicant=本人）
    let my_dispatch = [];
    {
      const [rows] = await pool.query(
        `SELECT d.id, d.project_id, d.project_name, d.content, d.worker, d.status, d.created_at
         FROM dispatches d
         WHERE (d.applicant_id = ? OR d.worker LIKE ?) AND d.status IN ('pending', 'in_progress', '已派工')
         ORDER BY d.created_at DESC LIMIT 10`,
        [userId, '%' + userId + '%']
      );
      my_dispatch = rows.map(r => ({
        id: r.id, type: 'dispatch_mine',
        title: r.content || '派工单',
        subtitle: [r.project_name, r.worker].filter(Boolean).join(' · '),
        time: __fmtTodoTime(r.created_at),
        priority: 'normal',
        url: `/pages/dispatch/detail?id=${r.id}`
      }));
    }

    // 4) 逾期节点预警 —— 仅展示我能看到的项目下的逾期节点
    // ⚠️ 2026-10-23 修复：同 1)，改读 project_progress_nodes（真正的节点表）。
    //    原来读 project_stages 导致"首页说水电验收逾期、项目里该节点却还没到计划结束日"。
    let warnings = [];
    {
      const [rows] = await pool.query(
        `SELECT ps.id, ps.project_id, ps.node_name AS stage_name, ps.plan_end_date, p.name AS project_name,
                DATEDIFF(?, ps.plan_end_date) AS days
         FROM project_progress_nodes ps
         JOIN projects p ON p.id = ps.project_id
         WHERE ps.plan_end_date IS NOT NULL AND ps.plan_end_date != ''
           AND ps.plan_end_date < ?
           AND (ps.status IS NULL OR ps.status NOT IN ('completed', '已完成'))
           ${homeProjectFilter('p.id')}
         ORDER BY ps.plan_end_date ASC LIMIT 10`,
        [today, today, ...homeProjectParams()]
      );
      warnings = rows.map(r => ({
        id: r.project_id,
        node_id: r.id,
        name: r.project_name || '未知项目',
        node: r.stage_name || '',
        days: r.days || 0,
        url: `/pages/projects/detail?id=${r.project_id}`
      }));
    }

    // 5) 首页统计卡片 —— 仅我能看到的项目（与 §7.3 一致）
    //    进行中：非终止态
    const inProgress = (await pool.query(
      `SELECT COUNT(*) c FROM projects
       WHERE status IS NOT NULL AND status <> ''
         AND status NOT IN ('已完成','已交付','已取消','已完工','已结算','作废','archived','completed','cancelled')
         ${projectAllScope ? '' : ' AND id IN (' + homePh + ')'}`,
      homeProjectParams()
    ))[0][0].c;
    //    逾期节点：项目进度节点中逾期未完成的（读 project_progress_nodes，与项目详情同源）
    const overdue = (await pool.query(
      `SELECT COUNT(*) c FROM project_progress_nodes ps
       JOIN projects p ON p.id = ps.project_id
       WHERE ps.plan_end_date IS NOT NULL AND ps.plan_end_date <> '' AND ps.plan_end_date < ?
         AND (ps.status IS NULL OR ps.status NOT IN ('completed', '已完成'))
         ${projectAllScope ? '' : ' AND p.id IN (' + homePh + ')'}`,
      [today, ...homeProjectParams()]
    ))[0][0].c;
    //    待整改：整改问题（关联项目要在可见集内，或我是创建人）
    // 注意：relatedIds=[] 时 homePh='-1'（字面量，无占位），参数只有 userId 1 个；
    //       relatedIds=[15] 时 homePh='?'（占位）+ userId 1 个占位 = 2 个参数。
    // ⚠️ 2026-10-23 修复：原来这条 COUNT 完全没有状态过滤，把「已完成」的历史整改也算进来
    //    （实测库里 6 条：3 条已完成、1 条待处理、2 条 status 为 NULL 但 finish_date 也为空）。
    //    卡片显示 6 而下方待办列表只有 1 条 → 用户看到的就是"待整改 6 但实际只有 1 个"。
    //    口径统一为「未完成」：status 不在已完成集合，且没有完成时间。与下方 rectify_alerts 一致。
    const pendingInspect = (await pool.query(
      `SELECT COUNT(*) c FROM rectification_issues ri
       WHERE ${RECTIFY_OPEN_SQL}${projectAllScope ? '' : ' AND (ri.project_id IN (' + homePh + ') OR ri.creator_id = ?)'}`,
      projectAllScope ? [] : [...homeProjectParams(), userId]
    ))[0][0].c;

    // 6) 待收款金额 —— 仅财务（finance:read_all）或 admin 才显示
    //    应收 = 已审核合同金额 + 已通过增项 - 已通过减项
    //    已收 = 催收记录中已确认的金额（collection_records.status='confirmed'）
    //    v2.3.6 hotfix 10-15：合同金额改读 payment_records.category='contract'.confirmed（contracts 表 project_id 全 NULL）
    //    口径与 /api/finance/receivable-by-project / /api/finance/summary 完全一致。
    //    注意：payment_records 里 category='contract' 的收入是「合同审核通过时自动写入」的应收记录，
    //    并非实际到账，不能用于计算已收款。
    const financeScope = admin || perms.includes('finance:read_all');
    let receivableTotal = 0, collectedTotal = 0, pendingReceiveAmount = 0;
    if (financeScope) {
      const [[recvAgg]] = await pool.query(
        `SELECT
           (SELECT COALESCE(SUM(amount),0) FROM payment_records
             WHERE category='contract' AND status='confirmed') AS contract_amount,
           (SELECT COALESCE(SUM(cc.amount),0) FROM contract_changes cc
             WHERE cc.status='approved' AND cc.change_type='increase') AS increase_total,
           (SELECT COALESCE(SUM(cc.amount),0) FROM contract_changes cc
             WHERE cc.status='approved' AND cc.change_type='decrease') AS decrease_total,
           (SELECT COALESCE(SUM(cr.amount),0) FROM collection_records cr WHERE cr.status='confirmed') AS collected`
      );
      receivableTotal = Number(recvAgg.contract_amount || 0) + Number(recvAgg.increase_total || 0) - Number(recvAgg.decrease_total || 0);
      collectedTotal = Number(recvAgg.collected || 0);
      pendingReceiveAmount = receivableTotal - collectedTotal;
    }

    // 7) 财务角色（purchase:finance）关心的金额：报销中总金额（保留字段，兼容旧消费方）
    let pendingPayAmount = null;
    if (can('purchase:finance')) {
      const [[r]] = await pool.query(
        "SELECT COALESCE(SUM(total_amount),0) AS s FROM purchase_requests WHERE status IN ('reimbursing','finance_confirmed')"
      );
      pendingPayAmount = Number(r.s) || 0;
    }

    const projCounts = await __todoProjectCounts(userId, perms, admin, relatedIds);

    const home = {
      stats: {
        inProgress: Number(inProgress) || 0,
        overdue: Number(overdue) || 0,
        pendingInspect: Number(pendingInspect) || 0,
        // 待收款金额（应收 - 已收），所有项目汇总
        pendingReceiveAmount,
        receivableTotal,
        collectedTotal,
        pendingPayAmount,
      },
      // 按角色排序：经理/设计师/监理/工长 先看预警+整改；财务看采购；admin 全见
      // count 为真实总数（items 受 LIMIT 10 限制），前端「角标/汇总」用 count，
      // 列表显示 items.length / count —— 避免"角标 13 列表只有 10"的错觉。
      sections: [
        { key: 'stage_due', label: '节点即将到期（3天内）', icon: '⏰', items: stage_alerts, count: projCounts.stage_due },
        { key: 'inspect_rectify', label: '待整改', icon: '🔧', items: rectify_alerts, count: projCounts.inspect_rectify },
        { key: 'dispatch_mine', label: '我的派工', icon: '👷', items: my_dispatch, count: projCounts.dispatch_mine },
      ].filter(s => s.items.length > 0),
      warnings,
    };

    res.json({ code: 0, total, groups, home, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('[todo/center] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  // 构建产物（/assets/xxx.js|css）必须严格 404，绝不能回退到 index.html。
  // 原因：前端每次重新构建，chunk 文件名 hash 都会变；旧标签页里跑的还是上一版 index-*.js，
  // 点开某个懒加载页面就会去请求已经不存在的旧 chunk。若这里回退 index.html，
  // 浏览器会报 "'text/html' is not a valid JavaScript MIME type"，
  // 把"文件已不存在"这个真实原因完全掩盖掉，看起来像是代码坏了。
  if (req.path.startsWith('/assets/') || req.path.startsWith('/m/assets/')) {
    return res
      .status(404)
      .type('text/plain')
      .send('Asset not found — front-end was rebuilt, please hard refresh (Cmd/Ctrl+Shift+R).')
  }
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads') && !req.path.startsWith('/auth')) {
    // ⚠️ 2026-10-21：index.html 必须 no-store。
    // 背景：每次重新构建后 chunk 名 hash 都会变，而 index.html 若被浏览器缓存（或返回 304），
    // 页面就会继续引用**旧的** index-*.js / Dashboard-*.js，跑的是上一版代码。
    // 表现极具欺骗性：后端接口已返回新字段，页面却"看起来没生效"，用户以为白改了。
    // 这里显式禁用缓存，保证「刷新即拿到最新前端」。
    const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache' };
    // 移动端 SPA：/m/* 命中时返回移动端 index.html
    // ⚠️ 2026-10-21 修复：原来写 startsWith('/m')，把 PC 的 /message-center、/main-materials、
    // /material-orders 全误判成移动端路径 → 直接访问/刷新这几个页面会加载移动端 H5（URL 变成 #/pages/home/index）。
    // 必须按「/m 或 /m/ 开头」判定。
    if (req.path === '/m' || req.path.startsWith('/m/')) {
      const mobileIndex = path.join(mobileDistPath, 'index.html');
      if (fs.existsSync(mobileIndex)) return res.sendFile(mobileIndex, { headers: noStore });
    }
    res.sendFile(path.join(webDistPath, 'index.html'), { headers: noStore });
  } else {
    res.status(404).json({ error: 'Not Found' });
  }
});

// ================================================================
// multer 错误处理中间件（v2.3.7）
// ⚠️ 必须注册在**所有路由之后**（app.listen 之前）。Express 只会在出错位置*之后*的
// 中间件里找错误处理器，注册在路由前面永远不会被命中。
// 背景：upload.single() 抛错（如 File too large / Unexpected field）时，Express 默认处理器
// 返回 **HTML 堆栈 + 500**，前端 axios 只能看到"图片上传失败"，system_logs.error_message 恒为空，
// 排查完全瞎猜（线上就是这样定位了半天）。这里统一转成 JSON + 正确状态码，
// 并把原因写进 res.errorMessage，让全局日志能记录真实错误。
const MULTER_MSG = {
  LIMIT_FILE_SIZE: '文件超过 50MB 上限',
  LIMIT_FILE_COUNT: '文件数量超出限制',
  LIMIT_UNEXPECTED_FILE: '上传字段名不正确（应为 file）',
  LIMIT_PART_COUNT: '表单分段超出限制',
  LIMIT_FIELD_KEY: '字段名过长',
  LIMIT_FIELD_VALUE: '字段值过长',
  LIMIT_FIELD_COUNT: '字段数量超出限制',
};
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    const msg = MULTER_MSG[err.code] || err.message || '文件上传失败';
    console.error(`[上传失败] ${req.path} ${err.code}: ${msg}`);
    res.errorMessage = `MulterError ${err.code}: ${msg}`;
    return res.status(400).json({ error: msg });
  }
  next(err);
});

// v2.4.1 兜底：进程级异常不应让整站下线。
// 背景：2026-10-23 发现 9 个路由引用了未声明的 userId，任意一次调用即抛
// ReferenceError。Express 4 不接管 async 处理函数的 rejection，Node 22 默认
// 直接退出进程 —— 表现就是「某个人点了某个按钮，整个系统 502」。
// 这里把「整站挂掉」降级为「该请求失败 + 日志留痕」，其余用户不受影响。
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection] 未捕获的异步异常（进程已保活）:', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] 未捕获异常（进程已保活）:', err && err.stack ? err.stack : err);
});

// v2.3.6-hotfix2：listen 失败时（端口被 TIME_WAIT/CLOSE_WAIT 占用）重试 3 次，每次间隔 2 秒
// 解决宝塔拉起新进程时 EADDRINUSE 死循环
function startServer(retry = 0) {
  const maxRetry = 3;
  const server = app.listen(PORT, () => {
    console.log(`🚀 装企云ERP系统后端运行在 http://localhost:${PORT}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retry < maxRetry) {
      console.warn(`[port] 3001 端口被占用，${2*(retry+1)} 秒后重试 (${retry+1}/${maxRetry})`);
      setTimeout(() => startServer(retry + 1), 2000);
    } else {
      console.error('[port] listen 失败:', err.message);
    }
  });
}
startServer();

// ============================================================
// 巡检整改到期提醒（2026-10-23 新增）
// 业务流程：监理提交(待处理) → 工长受理(处理中，可改时间) → 到期提醒 → 延期 or 结案(已完成)
// 每天 09:00 扫一遍「整改截止时间 = 今天 且未结案」的问题，给负责人（工长）发消息。
// 与待办中心的逾期/加急徽标互补：徽标是被动展示，这里是主动推送。
// ⚠️ 延期后 due_date 会变，天然按新日期重新排队，不会重复提醒旧日期。
// ============================================================
async function runRectifyDueReminder() {
  const today = new Date().toISOString().split('T')[0];
  try {
    const [rows] = await pool.query(
      `SELECT ri.id, ri.project_id, ri.title, ri.issue_desc, ri.due_date, ri.status,
              ri.responsible_id, ri.responsible_name,
              COALESCE(NULLIF(ri.project_name, ''), p.name) AS project_name
         FROM rectification_issues ri
         LEFT JOIN projects p ON p.id = ri.project_id
        WHERE ri.due_date = ? AND ri.status IN ('待处理', '处理中')`,
      [today]
    );
    if (!rows.length) return;
    console.log(`[rectify-due] ${today} 有 ${rows.length} 条整改到期，发送提醒`);
    for (const r of rows) {
      // 通知对象：负责人（工长）优先；没派负责人则退回项目工长/关联人
      let targets = [];
      if (r.responsible_id) {
        const [emps] = await pool.query(
          'SELECT id, name, phone FROM employees WHERE id = ?', [r.responsible_id]);
        targets = (emps || []).filter(e => e.phone).map(e => ({ phone: e.phone, name: e.name || '', user_id: e.id }));
      }
      if (!targets.length) {
        // 兜底：项目绑定的工长 + 项目经理
        const [emps] = await pool.query(
          `SELECT id, name, phone FROM employees
            WHERE id IN (SELECT foreman_id FROM projects WHERE id = ?
                         UNION SELECT manager_id FROM projects WHERE id = ?)
              AND phone IS NOT NULL AND phone != ''`,
          [r.project_id, r.project_id]);
        targets = (emps || []).map(e => ({ phone: e.phone, name: e.name || '', user_id: e.id }));
      }
      if (!targets.length) continue;
      const stateText = r.status === '待处理' ? '尚未受理' : '处理中';
      await sendAppNotification(
        'inspection_due',
        `【整改今日到期】${r.project_name || ''}`,
        `${(r.title || r.issue_desc || '整改问题').slice(0, 40)}（${stateText}）截止今天，请及时处理或申请延期。`,
        r.id, 'rectification_issue', targets
      );
    }
  } catch (e) {
    console.error('[rectify-due] 到期提醒执行失败:', e.message);
  }
}

// 注册每日定时器：每天 09:00 跑一次（进程启动时先算毫秒差，之后每 24h 一轮）
(function scheduleRectifyDueReminder() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(9, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  const firstDelay = next.getTime() - now.getTime();
  setTimeout(() => {
    runRectifyDueReminder();
    setInterval(runRectifyDueReminder, 24 * 3600 * 1000);
  }, firstDelay);
  console.log(`[rectify-due] 到期提醒已注册，下次执行 ${next.toLocaleString('zh-CN')}`);
})();
