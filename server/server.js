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
// 主材拼音检索：纯本地字表，不引第三方依赖（部署只需拷这一个文件）
const { buildPinyin } = require('./material-pinyin');
// 系统设置敏感字段打码（纯函数，零依赖）—— 2026-10-29 从本文件抽出
const { maskSettingsSecrets, isMaskedOrEmpty, SETTINGS_SECRET_KEYS } = require('./lib/secrets');
// 阿里云短信（纯函数，crypto/https）—— 2026-10-29 从本文件抽出。
// 块外还有两处在调用 sendAliyunSms：通知类短信、业主端验证码短信。
const { sendAliyunSms } = require('./lib/aliyun-sms');
// 手机号归一化/校验 + 初始密码规则（纯函数，零依赖）
const { normalizePhone, isPhone, passwordFromPhone } = require('./lib/phone');
// 外部工具探测：FreeCAD / LibreOffice（自带缓存，缺失不致命）
const { getToolPath } = require('./lib/tools');
// 轻量解析工具（纯函数，零依赖）
const { extractUploadPaths, mmParseIds } = require('./lib/parse');
// 「待整改」唯一口径（首页统计 / 待办计数 / 待办列表共用）
const { RECTIFY_OPEN_SQL } = require('./lib/rectify');
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

// 客户身份识别（业主主账户 / 家庭成员）—— 登录链路唯一入口（v2.5.3）
// ⚠️ 必须在 db 定义之后、所有 api 注册之前创建：
//    db 是 const，提前引用会踩 TDZ，进程启动即崩（Apache 反代表现为全站 503）。
//    改这三行之前的顺序请先跑 scripts/check-stub-order.py。
const customerLogin = require('./lib/customer-login').createResolver({ db });

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
// POST /api/debug/add-type-column（原 347-362 行）已并入 ./api/system-logs.js

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

// ==================== 家庭成员管理（业主端） ====================
// 394 行已抽到 ./api/family-members.js（2026-10-29 渐进拆分第 16 轮，注册顺序不变）
require('./api/family-members')(app, {
  db, pool,
  // 2026-10-29 安全加固：模块内改为由 x-user-id 反查业主身份，需要 permCore
  permCore,
  // v2.5.3：确认加入家庭（confirm-bind）复用登录链路的 bindToken
  customerLogin,
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

// ==================== 通知基础设施（lib） ====================
// 504 行 / 9 个函数已抽到 ./lib/notify.js（2026-10-29 渐进拆分第 19 轮）
// 工厂注入依赖，下面解构出来的名字与原定义完全同名，所有调用点不用改。
const notifyLib = require('./lib/notify')({
  pool, db, mysqlPool, https, sendAliyunSms, permCore,
});
const {
  getDefaultNotificationRules,
  notifyReviewSubmitted, notifySubmitter, notifyProject,
  insertInAppNotification, sendAppNotification, sendSmsFromNotify,
  sendApprovalNotification,
  getUserIdsByPermission, getUserIdsByNotificationType, getProjectRelatedUserIds,
  sendPurchaseNotification, dispatchNotification,
} = notifyLib;

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '简逸ERP系统运行中' });
});

// ==================== 客户管理（含合同编号生成） ====================
// 430 行已抽到 ./api/customers.js（2026-10-29 渐进拆分第 16 轮，注册顺序不变）
require('./api/customers')(app, {
  db, pool, permCore, checkPermission,
  hasReadAllPermission, addLog, notifyProject,
  // ⚠️ getUserId / isAdmin 是 const（定义在本行下方），直接传值会触发 TDZ
  // （Cannot access before initialization）导致启动崩溃。包一层箭头延迟到请求时求值，
  // 注册顺序与拆分前完全一致。同文件下方 require('./api/upload') 同理。
  getUserId: (...a) => getUserId(...a),
  isAdmin: (...a) => isAdmin(...a),
});
// ==================== 合同附件文件清理 ====================
// 60 行已抽到 ./api/contract-attachments.js（2026-10-29 渐进拆分第 20 轮，注册顺序不变）
require('./api/contract-attachments')(app, {
  pool, db, fs, path,
  checkPermission, addLog, extractUploadPaths,
  // isAdmin 是 const（定义在本行下方），传值会 TDZ，包一层延迟求值
  isAdmin: (...a) => isAdmin(...a),
});
// ==================== 签约人管理 ====================
// 78 行已抽到 ./api/signers.js（2026-10-29 渐进拆分第 20 轮，注册顺序不变）
require('./api/signers')(app, {
  db, addLog,
  // getUserId 是 const（定义在本行下方），传值会 TDZ，包一层延迟求值
  getUserId: (...a) => getUserId(...a),
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

// v2.5.3 鉴权加固：上传类接口的前置登录校验。
// 为什么放在 multer 之前：multer 会把请求体落到 uploads/ 目录（单文件上限 50MB），
// 等进了 handler 再校验，匿名请求已经把盘写满了。前置校验连文件都不会落地。
// 只要求「是已登录员工」，不卡具体权限点 —— 上传是多种业务的公共能力（合同/日志/主材/凭证），
// 真正的业务权限在各个业务接口上卡。
const requireLogin = (req, res, next) => {
  if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
  next();
};

// ==================== 合同文件上传（Word / 其他附件） ====================
// 50 行已抽到 ./api/contract-upload.js（2026-10-29 渐进拆分第 22 轮，注册顺序不变）
require('./api/contract-upload')(app, {
  fs, path, upload, fixMojibake, requireLogin,
  uploadDir,
});

// ==================== 图片 / PDF 上传接口（含 pdftoppm 转预览图） ====================
// 145 行已抽到 ./api/upload.js（2026-10-29 渐进拆分第 16 轮，注册顺序不变）
require('./api/upload')(app, {
  fs, path, upload, spawnSync, fixMojibake,
  uploadDir, requireLogin, PORT,
  // getUserId 是 const（在下方才定义），传值会 TDZ，包一层延迟求值
  getUserId: (...a) => getUserId(...a),
});

// ==================== 合同模板 ====================
// 4 条路由（GET 列表原 669-699 行 + POST/PUT/DELETE 原 906-966 行，合计 92 行）
// 已全部并入 ./api/contract-templates.js，在下方统一注册。
// 为什么列表接口的注册点从 669 后移到 906 不影响行为：
// 669-906 之间只有函数/const 定义，没有任何 app.use 或路由注册，
// 且 /api/contract-templates 无同方法重复注册，匹配顺序与之前等价。

// 判断是否为管理员的辅助函数
// 统一解析 userId：**只认 x-user-id header**
//
// ⚠️ v2.5.3 安全修复（这是本轮最严重的一个洞）：
// 原实现会依次 fallback 到 req.body.user_id 和 req.query.user_id。而 checkPermission()、
// checkAnyPermission()、isAdmin() 全部基于这个 id —— 于是任何**完全匿名**的请求，
// 只要在 URL 后面加一个 `?user_id=1`（或 POST body 里塞 `user_id:1`），
// 就会被当成管理员通过全部权限校验。
// 实测（修复前）：`curl /api/system-settings?user_id=1` 不带任何 header 返回 200，
// 响应里带出阿里云 AccessKey 明文。354 个路由里所有挂权限点的接口全部可这样绕过。
//
// 为什么要删而不是"改优先级"：优先级本来就是 header 最高，问题是 header 缺失时的兜底。
// 已确认服务端没有任何代码读 req.query.user_id / req.body.user_id（grep 全库为空），
// 前端也没有把 user_id 拼进 URL 的地方 —— 身份一律由 PC 的 axios 拦截器、
// 移动端的 uni.request 拦截器注入到 header。所以这个兜底没有任何调用方，纯历史遗留。
//
// 注意：x-user-role 这个 header 不可信，server.js 上方的中间件会按 x-user-id 重算并覆盖它。
// 需要「读 URL 里的 user_id」的场景（`<img>`/`<iframe>` 无法自定义 header）请用专门的
// 签名 URL 或 download token，不要重新引入这里。
const getUserId = (req) => {
  if (req.headers['x-user-id']) {
    const v = parseInt(req.headers['x-user-id']);
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

// ==================== 合同模板 ====================
// 4 条路由 92 行已抽到 ./api/contract-templates.js（2026-10-29 渐进拆分第 23 轮）
require('./api/contract-templates')(app, {
  db, getUserId, isAdmin, addLog,
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

// ==================== 操作日志（查看 / 管理员清空） ====================
// 43 行已抽到 ./api/operation-logs.js（2026-10-29 渐进拆分第 22 轮，注册顺序不变）
require('./api/operation-logs')(app, {
  pool, getUserId, isAdmin,
});

// ==================== 系统日志 / 调试建列 ====================
// 50 行已抽到 ./api/system-logs.js（2026-10-29 渐进拆分第 20 轮，注册顺序不变）
// 2026-10-29 安全收口：GET /api/debug/save-contract（纯 echo，可污染服务端日志）已删除；
// GET /api/system-logs 改为仅管理员。本模块只用到 db / getUserId / isAdmin。
require('./api/system-logs')(app, {
  db, getUserId, isAdmin,
});

// ==================== 预算 / 财务记录 ====================
// 99 行已抽到 ./api/budgets-finance.js（2026-10-29 渐进拆分第 20 轮，注册顺序不变）
require('./api/budgets-finance')(app, {
  db, getUserId, checkPermission, addLog, isAdmin,
  hasReadAllPermission,
});
// ==================== 移动端数据报表 / 收支统计与列表 ====================
// 128 行已抽到 ./api/report-mobile.js（2026-10-29 渐进拆分第 20 轮，注册顺序不变）
require('./api/report-mobile')(app, {
  db,
});
// ==================== 项目管理 / 阶段 / 施工日志 / 图库 / 报价 / 材料出入库 ====================
// 760 行已抽到 ./api/projects.js（2026-10-29 渐进拆分第 17 轮，注册顺序不变）
require('./api/projects')(app, {
  db, pool, fs, path, getUserId,
  addLog, notifyProject, isAdmin, checkPermission, checkAnyPermission,
  hasReadAllPermission, permCore, sendAppNotification, insertInAppNotification, buildProjectScopeOrSelfClause,
});
// ==================== 主材库 / 材料分类 / 品牌（含 mm* 查询与写入构造器） ====================
// 997 行已抽到 ./api/main-materials.js（2026-10-29 渐进拆分第 17 轮，注册顺序不变）
require('./api/main-materials')(app, {
  pool, db, fs, path, os,
  spawnSync, upload, getUserId, isAdmin, addLog,
  hasReadAllPermission, buildPinyin, mmParseIds, fixMojibake,
});
// ==================== 商城 / 材料订单（含 mall* 查询构造器） ====================
// 698 行已抽到 ./api/mall.js（2026-10-29 渐进拆分第 17 轮，注册顺序不变）
require('./api/mall')(app, {
  pool, db, getUserId, addLog, permCore,
  isAdmin, hasReadAllPermission, sendAppNotification,
});
// ==================== 数据看板 / 部门 / 员工 / 用户信息 ====================
// 256 行已抽到 ./api/org.js（2026-10-29 渐进拆分第 17 轮，注册顺序不变）
require('./api/org')(app, {
  db, pool, getUserId, addLog, checkPermission,
  isAdmin, passwordFromPhone, clearAuthRoleCache, clearUserPermCache, getUserPermissions,
  hasReadAllPermission, getManagedDepartmentIds, expandDepartmentIds,
});
// ==================== 外部联系人（v2.3.1 新模块 external_contact）====================
// 2026-10-29 已抽到 ./api/external-contacts.js（4 个路由，注册顺序不变）
require('./api/external-contacts')(app, {
  pool, checkPermission, getUserId, addLog, hasReadAllPermission, permCore,
});

// ==================== 登录（员工 / 业主） ====================
// 88 行已抽到 ./api/login.js（2026-10-29 渐进拆分第 18 轮，注册顺序不变）
require('./api/login')(app, {
  db, pool, permCore, getUserId, hasReadAllPermission,
  checkPermission, addLog,
  // v2.5.3：统一「按手机号认身份」到 lib/customer-login.js（customer 优先 / 待绑定两段式）
  customerLogin,
});
// ============================================================
// 身份与授权（角色 / 权限 / 借权 / 我的权限）
// 2026-10-29 已抽到 ./api/identity.js（11 个路由，顺序不变）
// ============================================================
require('./api/identity')(app, {
  db, pool, checkPermission, getUserId, isAdmin,
  getUserPermissions, addLog, clearAuthRoleCache,
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

// ============================================================
// 审批流：我的申请 / 待我审批 / 详情 / 发起 / 同意 / 驳回
// 2026-10-29 已抽到 ./api/approvals.js（6 个路由，顺序不变）
// ============================================================
require('./api/approvals')(app, {
  db, getCurrentUser, getUserId, addLog, sendApprovalNotification,
});

// ==================== 站内通知 / 消息（含 resolveMessageActor、attachProjectInfo） ====================
// 415 行已抽到 ./api/messages.js（2026-10-29 渐进拆分第 18 轮，注册顺序不变）
// 2026-10-29 安全收口：GET /api/debug-notify（零鉴权、会给项目 5 关联人发真通知）已删除，
// 故不再注入 notifyProject —— 本模块只读消息，不发通知。
require('./api/messages')(app, {
  pool, db, getCurrentUser,
  permCore,
});
// ==================== 审批通知推送 / 收件人解析（已并入 lib/notify.js） ====================
// 2026-10-29 第 21 轮：sendApprovalNotification + getUserIdsByPermission /
// getUserIdsByNotificationType / getProjectRelatedUserIds / sendPurchaseNotification /
// dispatchNotification 共 6 个函数、186 行并入 ./lib/notify.js，
// 由上方 notifyLib 解构得到，调用点不用改。

// ============================================================
// 微信集成：配置 / 身份 / 模板 / 订阅 / 通知分发
// 2026-10-29 已抽到 ./api/wechat.js（9 个路由，顺序不变）
// 注意：GET /api/wechat/config 本处为生效版本，另一份在文件后段是死代码
// ============================================================
require('./api/wechat')(app, { pool, dispatchNotification, getUserId, isAdmin });

// GET /api/purchase-requests — 列表（支持 project_id / status / applicant_id 过滤）
// ==================== 采购申请（含报销/财务受理/审批链路） ====================
// 823 行已抽到 ./api/purchase-requests.js（2026-10-29 渐进拆分第 18 轮，注册顺序不变）
require('./api/purchase-requests')(app, {
  pool, getCurrentUser, isAdmin, addLog, getUserId,
  checkPermission, checkAnyPermission, getUserPermissions, upload, path,
  fs, fixMojibake, getProjectRelatedUserIds, getUserIdsByPermission, getUserIdsByNotificationType,
  sendPurchaseNotification,
});
// ==================== 汇报 / 公告 / 巡检 ====================
// 212 行已抽到 ./api/reports-notices.js（2026-10-29 渐进拆分第 18 轮，注册顺序不变）
require('./api/reports-notices')(app, {
  db, pool, permCore, getUserId, addLog,
  checkPermission, isAdmin, buildProjectScopeClause, notifyProject,
});
// ==================== 验收管理 + 主材验收 ====================
// 565 行已抽到 ./api/acceptance.js（2026-10-29 渐进拆分第 15 轮，注册顺序不变）
require('./api/acceptance')(app, {
  permCore, pool, db, getUserId, checkPermission,
  hasReadAllPermission, isAdmin, addLog, notifyProject,
});
// ==================== 通用验收单（验收类型来自《施工服务手册》，与旧 acceptance 并存） ====================
require('./api/acceptance-sheets')(app, {
  pool, db, getUserId, checkPermission, isAdmin, addLog,
});
// ==================== 手写签名库（员工/业主个人中心签名，验收签字调用） ====================
require('./api/signatures')(app, {
  pool, getUserId, addLog,
});
// ==================== 派工管理 ====================
// 239 行已抽到 ./api/dispatches.js（2026-10-29 渐进拆分第 15 轮，注册顺序不变）
require('./api/dispatches')(app, {
  pool, getUserId, addLog, isAdmin, getUserPermissions,
  checkPermission, buildProjectScopeOrSelfClause, notifyReviewSubmitted, notifySubmitter,
});
// ==================== 项目文件 + 预览转换 ====================
// 612 行 / 7 个路由 / 6 个私有符号已抽到 ./api/project-files.js
// （2026-10-29 渐进拆分第 13 轮，注册顺序不变；块内 __dirname 已改为 ROOT = server 根）
require('./api/project-files')(app, {
  path, fs, os, crypto, multer, spawn,
  pool, db,
  getUserId, checkPermission, permCore, addLog, getUserIdsByPermission,
  getToolPath, fixMojibake,
});
// ========== 1装ERP扩展API ==========

// ==================== 公海客户池（v2.5.3 已加登录 + 管理员校验） ====================
// 47 行已抽到 ./api/customer-pool.js（2026-10-29 渐进拆分第 22 轮，注册顺序不变）
require('./api/customer-pool')(app, {
  pool, db, getUserId, isAdmin,
});

// ============================================================
// 营销基础资料：楼盘 / 分销渠道 / 营销案例（标准 CRUD）
// 2026-10-29 已抽到 ./api/marketing-base.js（12 个路由，顺序不变）
// ============================================================
require('./api/marketing-base')(app, { db, getUserId, isAdmin, addLog });

// 供应商管理
// ==================== 1装ERP扩展（采购/成本/整改/考勤/保修/量房/老板看板/合同变量/AI识别） ====================
// 736 行已抽到 ./api/erp-ext.js（2026-10-29 渐进拆分第 14 轮，注册顺序不变）
require('./api/erp-ext')(app, {
  db, https, getUserId, addLog, isAdmin,
  notifyProject,
});
// ==================== PDF 生成服务（Puppeteer + Chrome 渲染 / 合并） ====================
// 187 行已抽到 ./api/pdf-service.js（2026-10-29 渐进拆分第 14 轮，注册顺序不变）
require('./api/pdf-service')(app, {
  puppeteer, fs, PORT, getUserId,
});
// ==================== 进度节点模板 / 模板节点 / 项目节点 ====================
// 232 行已抽到 ./api/project-nodes.js（2026-10-29 渐进拆分第 14 轮，注册顺序不变）
require('./api/project-nodes')(app, {
  db, getUserId, addLog, isAdmin,
});
// ==================== 短信模块 ====================
// 4 段共 349 行 / 7 个路由已抽到 ./api/sms.js（2026-10-29 渐进拆分第 8 轮，注册顺序不变）
// 两个阿里云函数另行抽到 ./lib/aliyun-sms.js —— 「短信发送」和「验证码」两处
// 块外调用仍在用 sendAliyunSms，所以它是 lib 而不是 api 私有函数。
require('./api/sms')(app, { db, checkPermission, getUserId, addLog, isAdmin });

// ==================== 系统设置 + 站内通知 ====================
// 16 个路由已抽到 ./api/system.js（2026-10-29 渐进拆分第 6 轮，329 行）
require('./api/system')(app, {
  db, pool, mysqlPool, checkPermission, getUserId, isAdmin, addLog,
  getDefaultNotificationRules, maskSettingsSecrets, isMaskedOrEmpty,
});

// ==================== 微信接入 API + 小程序登录 ====================
// 22 个符号 / 1247 行已抽到 ./api/wechat-mini.js（2026-10-29 渐进拆分第 12 轮，注册顺序不变）
require('./api/wechat-mini')(app, {
  pool, db, https, crypto,
  getUserId, isAdmin, checkPermission, getUserPermissions, addLog,
  normalizePhone, isPhone,
  maskSettingsSecrets, isMaskedOrEmpty, SETTINGS_SECRET_KEYS,
  sendAliyunSms,
  // v2.5.3：登录链路「按手机号认身份」统一走 lib/customer-login.js
  customerLogin,
});

// ==================== 合同上传 / 审核 / 撤销 / 按项目查询（移动端） ====================
// 213 行已抽到 ./api/contracts-mobile.js（2026-10-29 渐进拆分第 20 轮，注册顺序不变）
require('./api/contracts-mobile')(app, {
  pool, getUserId, isAdmin, getUserPermissions, upload,
  addLog,
});
// ==================== 增减项 API ====================
// 6 个路由 / 207 行已抽到 ./api/contract-changes.js（2026-10-29 渐进拆分第 10 轮，注册顺序不变）
require('./api/contract-changes')(app, {
  pool, getUserId, addLog, buildProjectScopeOrSelfClause,
  notifyReviewSubmitted, notifySubmitter, getUserPermissions, isAdmin,
});

// ==================== 催收记录 + 收支记录 / 财务汇总 ====================
// 催收 109 行 → ./api/collection.js，收支 + 汇总 409 行 → ./api/finance.js
// （2026-10-29 渐进拆分第 9 轮，两段拆成两个文件、注册顺序不变）
// 财务口径注释已随代码搬到 api/finance.js 文件头，改口径前先读那里。
require('./api/collection')(app, {
  pool, getUserId, addLog, buildProjectScopeOrSelfClause,
  notifyReviewSubmitted, notifySubmitter,
});
require('./api/finance')(app, { pool, getUserId, addLog, checkPermission });

// ==================== 派工审核通过 → 自动写入 payment_records ====================
// 该逻辑已直接写在 api/dispatches.js 的 approve 路由里。
// 原先这里还留着一个用于「字符串补丁覆盖」的 OLD_DISPATCH_APPROVE 正则常量，
// 从未被任何代码使用（零引用），2026-10-29 拆分体检时清理。


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
// ==================== 调试权限查询 / 材料订单审批 / 移动端首页统计 ====================
// 256 行已抽到 ./api/mobile-misc.js（2026-10-29 渐进拆分第 22 轮，注册顺序不变）
require('./api/mobile-misc')(app, {
  pool, db, getUserId, isAdmin, getUserPermissions,
  addLog, RECTIFY_OPEN_SQL,
});

// ============================================================
// 统一待办中心（只读聚合）— 2026-10-29 已抽到 ./api/todo.js
// 两个接口：GET /api/todo/count、GET /api/todo/center
// 「待整改」口径统一在 ./lib/rectify.js（首页统计与待办共用）
// ============================================================
require('./api/todo')(app, { pool, permCore, getUserId, isAdmin, getUserPermissions });
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
    console.log(`🚀 简逸ERP系统后端运行在 http://localhost:${PORT}`);
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
