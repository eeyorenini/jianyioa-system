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
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

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
      try {
        await pool.query(
          `INSERT INTO system_logs (method, path, query, body, user_id, username, ip_address, user_agent, status_code, response_time, error_message, success, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [req.method, req.path, JSON.stringify(req.query), safeBody.slice(0, 2000), userId, username, ip, (req.headers['user-agent'] || '').slice(0, 500), status, duration, success === 0 ? (res.errorMessage || '') : '', success]
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

      // 字段迁移：确保 rectification_issues 表有新字段（兼容已有数据库）
      const riMigrations = [
        'ALTER TABLE rectification_issues ADD COLUMN title VARCHAR(255) DEFAULT NULL AFTER remark',
        'ALTER TABLE rectification_issues ADD COLUMN category VARCHAR(100) DEFAULT NULL AFTER title',
        'ALTER TABLE rectification_issues ADD COLUMN location VARCHAR(100) DEFAULT NULL AFTER category',
        'ALTER TABLE rectification_issues ADD COLUMN level VARCHAR(50) DEFAULT NULL AFTER location',
        'ALTER TABLE rectification_issues ADD COLUMN description TEXT DEFAULT NULL AFTER level',
      ];
      for (const sql of riMigrations) {
        try { await pool.query(sql); console.log('✅ 迁移成功:', sql.slice(0, 60)); } catch (_) { /* 字段已存在 */ }
      }

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
// 初始化数据库（延迟执行，避免 Node 22 顶层 await 问题）
setTimeout(() => { initDatabase(); }, 100);

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
async function notifyProject(type, projectId, title, content, sourceId, sourceType, templateId) {
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

    // 1. 获取所有订阅了该消息类型的角色
    const [roles] = await db.prepare('SELECT id, name FROM roles WHERE notification_types LIKE ?').all(`%${type}%`);
    if (!roles || roles.length === 0) return;

    const roleIds = roles.map(r => r.id);
    const rolePlaceholders = roleIds.map(() => '?').join(',');

    // 2. 查这些角色的所有员工手机号（去重）
    const [employees] = await db.prepare(
      `SELECT DISTINCT e.phone, e.name FROM employees e WHERE e.role_id IN (${rolePlaceholders}) AND e.phone IS NOT NULL AND e.phone != ''`
    ).all(...roleIds);

    // 3. 如果有 projectId，查项目相关人（设计师/监理/客户）
    let projectTargets = [];
    if (projectId) {
      const [proj] = await db.prepare(`
        SELECT c.phone as customer_phone, c.name as customer_name,
        des.phone as designer_phone, des.name as designer_name,
        sup.phone as supervisor_phone, sup.name as supervisor_name,
        mgr.phone as manager_phone, mgr.name as manager_name
        FROM projects p
        LEFT JOIN customers c ON p.customer_id = c.id
        LEFT JOIN employees des ON p.designer_id = des.id
        LEFT JOIN employees sup ON p.supervisor_id = sup.id
        LEFT JOIN employees mgr ON p.manager_id = mgr.id
        WHERE p.id = ?
      `).all(projectId);

      if (proj && proj[0]) {
        const p = proj[0];
        if (p.designer_phone) projectTargets.push({ phone: p.designer_phone, name: p.designer_name, role: 'designer' });
        if (p.supervisor_phone) projectTargets.push({ phone: p.supervisor_phone, name: p.supervisor_name, role: 'supervisor' });
        if (p.manager_phone) projectTargets.push({ phone: p.manager_phone, name: p.manager_name, role: 'manager' });
        if (p.customer_phone) projectTargets.push({ phone: p.customer_phone, name: p.customer_name, role: 'customer' });
      }
    }

    // 4. 合并去重（按phone去重）
    const phoneSet = new Set();
    const allTargets = [];

    if (employees) {
      for (const e of employees) {
        if (e.phone && !phoneSet.has(e.phone)) {
          phoneSet.add(e.phone);
          allTargets.push({ phone: e.phone, name: e.name || '', role: 'staff' });
        }
      }
    }

    if (projectTargets) {
      for (const t of projectTargets) {
        if (t.phone && !phoneSet.has(t.phone)) {
          phoneSet.add(t.phone);
          allTargets.push(t);
        }
      }
    }

    // 5. 管理员（id=1对应的手机号）永远收到
    const [adminEmp] = await db.prepare('SELECT phone, name FROM employees WHERE id = 1').all();
    if (adminEmp && adminEmp.phone && !phoneSet.has(adminEmp.phone)) {
      allTargets.push({ phone: adminEmp.phone, name: adminEmp.name || '管理员', role: 'admin' });
    }

    // 6. 对每个接收人，按渠道发送
    for (const t of allTargets) {
      // 站内消息（必须）
      if (enabledChannels.includes('inapp')) {
        await mysqlPool.query(
          'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [title, content, type, sourceId || 0, sourceType || '', 0, t.phone, t.name || '', 'inapp', 'pending']
        );
      }

      // 短信渠道
      if (enabledChannels.includes('sms') && templateId) {
        sendSmsFromNotify(t.phone, t.name, title, content, templateId).catch(console.error);
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
          'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
        'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
  if (!phone) return;

  // 读取阿里云短信配置（SQLite system_settings，category='sms'）
  const [smsSettings] = await db.prepare("SELECT setting_value FROM system_settings WHERE category='sms'").all();
  let smsConfig = smsSettings ? JSON.parse(smsSettings.setting_value) : null;
  if (smsConfig && smsConfig.setting_value) smsConfig = smsConfig.setting_value;
  if (!smsConfig || smsConfig.provider !== 'aliyun') return;
  if (!smsConfig.access_key_id || !smsConfig.access_key_secret) return;

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
  if (!templateCode) return;

  // 提取项目名称（title格式：XXX：项目名）
  const projectName = title.replace(/^(工地巡检提交：|项目节点完成：|项目新进展：|项目节点进行中：|项目节点待处理：|项目节点已跳过：)/, '');

  await sendAliyunSms({
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
    const [countRows] = await pool.query('SELECT COUNT(*) as total FROM contracts WHERE created_by = ?', [userId]);
    total = Number(countRows[0]?.total) || 0;
    const [rowsRaw] = await pool.query(`SELECT ${listFields} FROM contracts WHERE created_by = ? ORDER BY id DESC LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`, [userId]);
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

app.delete('/api/contracts/:id', checkPermission('contract:delete'), async (req, res) => {
  const rawUserId = req.headers['x-user-id'];
  const userId = rawUserId ? parseInt(rawUserId) : 0;
  console.log('[DELETE contracts] userId=%s, isAdmin=%s, targetId=%s', userId, await isAdmin(userId), req.params.id);
  const [c] = await db.prepare('SELECT project_name, created_by FROM contracts WHERE id = ?').all(req.params.id);
  if (!c) return res.status(404).json({ error: '记录不存在' });
  if (c.created_by !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
  const cName = c.project_name;
  const stmt = db.prepare('DELETE FROM contracts WHERE id = ?');
  await stmt.run(req.params.id);
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

const uploadDir = path.join(__dirname, 'uploads/');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

app.post('/api/contracts/upload-word', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ error: '未找到文件' });
    }
    
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

// ==================== 图片/PDF 上传接口 ====================
// 图片上传接口
app.post('/api/upload-image', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未找到文件' });
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    if (!allowedExts.includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '仅支持图片格式：jpg/png/gif/webp' });
    }
    const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
    const mime = mimeTypes[ext] || 'image/png';
    const fileData = fs.readFileSync(req.file.path);
    const base64 = fileData.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;
    fs.unlinkSync(req.file.path);
    console.log(`[上传] 图片: ${req.file.originalname} -> base64(${fileData.length} bytes)`);
    res.json({ url: dataUrl, size: fileData.length });
  } catch (error) {
    console.error('图片上传错误:', error);
    res.status(500).json({ error: '图片上传失败' });
  }
});

// PDF 转多页预览图接口（Mac 用 pdftoppm 转所有页，Windows 预留 pdf2pic 接口）
app.post('/api/upload-pdf', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未找到文件' });
    }
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
    // 转所有页面，每页一张 PNG
    const urls = [];
    for (let i = 1; i <= totalPages; i++) {
      const newName = `${Date.now()}_${Math.random().toString(36).slice(2)}_p${i}.png`;
      const outputPath = path.join(uploadDir, newName);
      const result = spawnSync('pdftoppm', [
        '-png', '-singlefile',
        '-f', String(i), '-l', String(i),
        '-r', '150',
        req.file.path, outputPath.replace('.png', '')
      ], { encoding: 'utf8' });
      if (!result.error && fs.existsSync(outputPath)) {
        const fileData = fs.readFileSync(outputPath);
        const base64 = fileData.toString('base64');
        urls.push(`data:image/png;base64,${base64}`);
        fs.unlinkSync(outputPath);
      }
    }
    fs.unlinkSync(req.file.path);
    if (!urls.length) {
      return res.status(500).json({ error: 'PDF 转预览图失败，请确认已安装 poppler（brew install poppler）' });
    }
    console.log(`[上传] PDF: ${req.file.originalname} -> ${urls.length} 页预览图`);
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


const isAdmin = async (userId) => {
  if (!userId) return false;
  try {
    // 获取用户信息和角色
    const user = await db.prepare('SELECT e.*, r.code as role_code FROM employees e LEFT JOIN roles r ON e.role_id = r.id WHERE e.id = ?').get(userId);
    return user && user.role_code === 'admin';
  } catch (e) {
    return false;
  }
};

// 用户权限缓存（30秒），避免频繁查库
const userPermCache = new Map();
const PERM_CACHE_TTL = 30000;

// 获取用户权限数组
async function getUserPermissions(userId) {
  if (!userId) return [];
  const cached = userPermCache.get(userId);
  if (cached && Date.now() - cached.ts < PERM_CACHE_TTL) return cached.perms;
  try {
    const [emp] = await db.prepare('SELECT role_id FROM employees WHERE id = ?').all(userId);
    if (!emp?.role_id) return [];
    const [role] = await db.prepare('SELECT permissions FROM roles WHERE id = ?').all(emp.role_id);
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
  } catch { return []; }
}

// 检查用户是否有指定模块的 read_all 权限
async function hasReadAllPermission(userId, moduleKey) {
  if (!userId) return false;
  const perms = await getUserPermissions(userId);
  return perms.includes(`${moduleKey}:read_all`);
}

// 清除用户权限缓存
function clearUserPermCache(userId) {
  userPermCache.delete(userId);
}

// 检查用户是否有指定权限码
// permission 格式如 "employee:read", "contract:write"
function checkPermission(permission) {
  return async (req, res, next) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    // 管理员跳过权限检查
    if (await isAdmin(userId)) return next();
    
    const perms = await getUserPermissions(userId);
    if (!Array.isArray(perms) || !perms.includes(permission)) {
      return res.status(403).json({ error: '无此操作权限' });
    }
    next();
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

app.get('/api/finance/summary', async (req, res) => {
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
app.get('/api/projects', async (req, res) => {
  console.log('[/api/projects] called, query:', req.query);
  try {
    const { customer_id, status, search } = req.query;
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
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
      // 非客户查询且无权限时，用 creator_id 限制
      conditions.push('p.creator_id = ?');
      params.push(userId);
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
      } else {
        p.progress = 0;
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

    // 如果选了节点模板，从模板复制节点到项目
    if (template_id) {
      const templateNodes = await db.prepare(
        'SELECT node_name, node_key, sort_order, default_sms_template_id FROM progress_node_template_nodes WHERE template_id = ? ORDER BY sort_order'
      ).all([template_id]);
      for (const node of templateNodes) {
        await db.prepare(
          'INSERT INTO project_progress_nodes (project_id, node_name, node_key, sort_order, status, sms_template_id) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(projectId, node.node_name, node.node_key, node.sort_order, 'pending', node.default_sms_template_id || null);
      }
    }

    await addLog(userId, '', '新增', '项目管理', projectId, name, `项目名称: ${name}`, req.ip);
    // 通知：新增项目
    notifyProject('project_created', projectId,
      `新项目创建：${name}`,
      `项目「${name}」已创建，客户ID：${customer_id || ''}，请相关人员及时跟进。`,
      projectId, 'project'
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
        parseInt(req.params.id), 'project'
      ).catch(console.error);
    }
    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', checkPermission('project:delete'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const [proj] = await db.prepare('SELECT name, creator_id FROM projects WHERE id = ?').all(req.params.id);
    if (!proj) return res.status(404).json({ error: '记录不存在' });
    if (proj.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
    const projName = proj.name;
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '项目管理', req.params.id, projName, `删除项目: ${projName}`, req.ip);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    if (after_node_id !== undefined && after_node_id !== null) {
      const [after] = await db.prepare('SELECT sort_order FROM project_progress_nodes WHERE id = ?').all(after_node_id);
      if (after) {
        await db.prepare('UPDATE project_progress_nodes SET sort_order = sort_order + 1 WHERE project_id = ? AND sort_order > ?').run(project_id, after.sort_order);
        const stmt = db.prepare('INSERT INTO project_progress_nodes (project_id, node_name, plan_date, plan_end_date, sort_order, status, note, sms_template_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const result = await stmt.run(project_id, node_name, plan_date, plan_end_date || null, after.sort_order + 1, status || 'pending', note, sms_template_id || null, userId);
        const nodeId = result.lastInsertRowid;
        notifyProject('node_status_changed', project_id,
          `新增项目节点：${node_name}`,
          `项目「ID:${project_id}」新增节点「${node_name}」，请及时跟进。`,
          nodeId, 'node'
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
      `项目「ID:${project_id}」新增节点「${node_name}」，请及时跟进。`,
      nodeId, 'node'
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
    if (row.status !== updated.status) {
      const statusLabel = { pending: '待处理', in_progress: '进行中', completed: '已完成', skipped: '已跳过' };
      const typeMap = { pending: 'node_pending', in_progress: 'node_in_progress', completed: 'node_completed', skipped: 'node_skipped' };
      const type = typeMap[updated.status] || 'node_completed';
      const title = `项目节点${statusLabel[updated.status] || updated.status}：${updated.node_name || row.node_name}`;
      const content = `项目「${row.node_name}」已变更为「${statusLabel[updated.status] || updated.status}」，请知悉。`;
      const smsNotify = parseInt(req.body.sms_notify || 0);
      if (smsNotify) {
        // 用户选择发送短信：用节点绑定的模板发短信
        await notifyProject(type, row.project_id, title, content, row.id, 'node', null, updated.sms_template_id);
      }
      // 无论是否发短信，都写一条应用内消息记录状态变更
      await insertInAppNotification(row.project_id, title, content, row.id, 'node');
    }

    res.json({ message: '更新成功' });
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

app.get('/api/project-logs/:projectId', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM project_logs WHERE project_id = ? ORDER BY created_at DESC');
  res.json(await stmt.all(req.params.projectId));
});

app.post('/api/project-logs', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { project_id, content, operator, images } = req.body;
  const stmt = db.prepare('INSERT INTO project_logs (project_id, content, operator, images, creator_id) VALUES (?, ?, ?, ?, ?)');
  const result = await stmt.run(project_id, content, operator, JSON.stringify(images || []), userId);
  const logId = result.lastInsertRowid;

  // ✅ 新增项目进展时，通知项目成员和客户
  const [proj] = await db.prepare('SELECT name FROM projects WHERE id = ?').all(project_id);
  await addLog(userId, '', '新增', '项目进展', logId, proj?.name || project_id, `项目「${proj?.name || project_id}」添加进展`, req.ip);
  if (proj) {
    await notifyProject('project_progress', project_id,
      `项目新进展`,
      `「${proj.name}」有新进展：${content ? content.substring(0, 50) : ''}...`,
      logId, 'project_log');
  }

  res.json({ id: logId, message: '添加成功' });
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
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'warehouse');
  if (hasAll) {
    const stmt = db.prepare('SELECT * FROM materials ORDER BY created_at DESC');
    return res.json(await stmt.all());
  }
  const stmt = db.prepare('SELECT * FROM materials WHERE creator_id = ? ORDER BY created_at DESC');
  res.json(await stmt.all(userId));
});

app.post('/api/materials', checkPermission('warehouse:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location } = req.body;
  const stmt = db.prepare('INSERT INTO materials (code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(code, name, category, unit, quantity || 0, price || 0, cost_price || 0, supplier, min_stock || 0, location, userId);
  await addLog(userId, '', '新增', '材料管理', result.lastInsertRowid, name, `材料名称: ${name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/materials/:id', checkPermission('warehouse:write'), async (req, res) => {
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

app.delete('/api/materials/:id', checkPermission('warehouse:delete'), async (req, res) => {
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

app.post('/api/materials/in', checkPermission('warehouse:write'), async (req, res) => {
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

app.post('/api/materials/out', checkPermission('warehouse:write'), async (req, res) => {
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
  const { keyword = '', category = '', page = 1, limit = 20 } = req.query;
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'purchase');
  const pageNum = parseInt(page) || 1;
  const pageSize = parseInt(limit) || 20;
  const offset = (pageNum - 1) * pageSize;

  const conditions = [];
  const params = [];
  if (!hasAll) {
    conditions.push('1=0'); // 无 read_all 权限则无数据
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
  const stmt = db.prepare(`
    INSERT INTO main_materials (
      code, name, original_price, cost_price, cost_price2, quote_price, contract_price,
      quote_unit, exchange_rate, purchase_unit, loss_rate, loss_amount, warranty_period, stock_period,
      specification, model, color, spec_alternative, model_alternative, color_alternative, brand,
      sort_order, remark, acceptance_remark, contract_remark, other_remark, position, package_name,
      upgrade_profit_rate, internal_control_price, combo, limit_formula, quote_formula, category,
      is_visible, is_fixed, creator_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    userId
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
  const stmt = db.prepare(`
    UPDATE main_materials SET
      code=?, name=?, original_price=?, cost_price=?, cost_price2=?, quote_price=?, contract_price=?,
      quote_unit=?, exchange_rate=?, purchase_unit=?, loss_rate=?, loss_amount=?, warranty_period=?, stock_period=?,
      specification=?, model=?, color=?, spec_alternative=?, model_alternative=?, color_alternative=?, brand=?,
      sort_order=?, remark=?, acceptance_remark=?, contract_remark=?, other_remark=?, position=?, package_name=?,
      upgrade_profit_rate=?, internal_control_price=?, combo=?, limit_formula=?, quote_formula=?, category=?,
      is_visible=?, is_fixed=?, updated_at=CURRENT_TIMESTAMP
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
  if (!req.file) {
    res.status(400).json({ message: '未上传文件' });
    return;
  }
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
    'INSERT INTO material_orders (project_id, material_name, spec, quantity, unit, supplier, amount, note, status, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = await stmt.run(project_id, material_name, spec || '', quantity, unit || '', supplier || '', amount || 0, remark || '', '待采购', userId);
  const newPurchaseId = result.lastInsertRowid;
  await addLog(userId, '', '新增', '采购申请', newPurchaseId, 0, `采购申请：${material_name}`, req.ip);

  // 发送应用内通知：查项目相关人（设计师/监理/经理）+ 管理员
  try {
    const [proj] = await db.prepare(`
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
    `).all(userId, project_id);

    const targets = [];
    if (proj) {
      if (proj.designer_phone) targets.push({ phone: proj.designer_phone, name: proj.designer_name, user_id: proj.designer_id });
      if (proj.supervisor_phone) targets.push({ phone: proj.supervisor_phone, name: proj.supervisor_name, user_id: proj.supervisor_id });
      if (proj.manager_phone) targets.push({ phone: proj.manager_phone, name: proj.manager_name, user_id: proj.manager_id });
      if (proj.creator_phone) targets.push({ phone: proj.creator_phone, name: proj.creator_name, user_id: userId });
      // 管理员
      const [admin] = await db.prepare('SELECT phone, name, id FROM employees WHERE id = 1').all();
      if (admin && admin.phone) targets.push({ phone: admin.phone, name: admin.name || '管理员', user_id: admin.id });
    }

    const creatorName = proj?.creator_name || '未知';
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

app.get('/api/departments', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'department');
  if (hasAll) {
    const stmt = db.prepare('SELECT * FROM departments ORDER BY id');
    return res.json(await stmt.all());
  }
  // 非 read_all 只能看到自己所属部门，兼容 creator_id 逻辑
  const stmt = db.prepare('SELECT * FROM departments ORDER BY id');
  res.json(await stmt.all());
});

app.get('/api/employees', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'employee');
  if (hasAll) {
    const stmt = db.prepare(`SELECT e.*, d.name as department_name, r.name as role_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN roles r ON e.role_id = r.id ORDER BY e.created_at DESC`);
    return res.json(await stmt.all());
  }
  const stmt = db.prepare(`SELECT e.*, d.name as department_name, r.name as role_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN roles r ON e.role_id = r.id WHERE e.id = ? ORDER BY e.created_at DESC`);
  res.json(await stmt.all(userId));
});

// GET /api/employees/grouped-by-department — 按部门分组的员工列表，供项目编辑页下拉用
app.get('/api/employees/grouped-by-department', async (req, res) => {
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
  const { name, phone, email, department_id, position, role_id, status, entry_date, salary, id_card, emergency_contact, emergency_phone } = req.body;
  if (!phone) return res.status(400).json({ error: '手机号必填' });
  if (!name) return res.status(400).json({ error: '姓名必填' });

  // 用户名=电话，初始密码=电话后6位
  const username = phone;
  const password = passwordFromPhone(phone);

  const stmt = db.prepare(`
    INSERT INTO employees (username, password, name, phone, email, department_id, position, role_id, status, entry_date, salary, id_card, emergency_contact, emergency_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = await stmt.run(username, password, name, phone, email, department_id, position, role_id, status || '在职', entry_date, salary, id_card, emergency_contact, emergency_phone);
  await addLog(userId, '', '新增', '员工管理', result.lastInsertRowid, name, `员工姓名: ${name}，用户名: ${username}，初始密码: ${password}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功', password });
});

app.put('/api/employees/:id', checkPermission('employee:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { name, phone, email, department_id, position, role_id, status, entry_date, salary, id_card, emergency_contact, emergency_phone } = req.body;
  if (!name) return res.status(400).json({ error: '姓名必填' });

  // 不允许通过此接口修改用户名（用户名就是电话）
  const stmt = db.prepare(`
    UPDATE employees SET name=?, phone=?, email=?, department_id=?, position=?, role_id=?, status=?, entry_date=?, salary=?, id_card=?, emergency_contact=?, emergency_phone=?
    WHERE id=?
  `);
  await stmt.run(name, phone, email, department_id, position, role_id, status, entry_date, salary, id_card, emergency_contact, emergency_phone, req.params.id);
  await addLog(userId, '', '编辑', '员工管理', req.params.id, name || '', `更新员工: ${name || req.params.id}`, req.ip);
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
  res.json({ message: '删除成功' });
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
    res.json({ success: true, user });
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
      // 是家庭成员，返回副账户自己的信息，但带上主账户ID用于查项目
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
  const { name, code, description, permissions } = req.body;
  const stmt = db.prepare('INSERT INTO roles (name, code, description, permissions) VALUES (?, ?, ?, ?)');
  const result = await stmt.run(name, code, description, JSON.stringify(permissions || []));
  await addLog(userId, '', '新增', '角色管理', result.lastInsertRowid, name, `角色名称: ${name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/roles/:id', checkPermission('role:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { name, code, description, permissions } = req.body;
  const stmt = db.prepare('UPDATE roles SET name=?, code=?, description=?, permissions=? WHERE id=?');
  await stmt.run(name, code, description, JSON.stringify(permissions || []), req.params.id);
  await addLog(userId, '', '编辑', '角色管理', req.params.id, name, `更新角色: ${name}`, req.ip);
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
  res.json({ message: '删除成功' });
});

app.get('/api/permissions', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM permissions ORDER BY sort_order, id');
  res.json(await stmt.all());
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
function getCurrentUser(req) {
  const userId = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
  const userName = req.headers['x-user-name'] || '';
  return { userId, userName };
}

// 我的申请列表
app.get('/api/approvals/my', async (req, res) => {
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
app.get('/api/approvals/todo', async (req, res) => {
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
app.post('/api/approvals/:id/approve', async (req, res) => {
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
app.post('/api/approvals/:id/reject', async (req, res) => {
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

// ==================== 消息相关 API ====================

// 获取消息列表
app.get('/api/messages', async (req, res) => {
  try {
    const { userId } = getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    
    const { type, is_read, keyword, page = 1, pageSize = 20 } = req.query;
    let sql = 'SELECT * FROM messages WHERE user_id = ?';
    const params = [userId];
    
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (is_read !== undefined && is_read !== '') { sql += ' AND is_read = ?'; params.push(parseInt(is_read)); }
    if (keyword) { sql += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));
    
    const stmt = db.prepare(sql);
    const list = await stmt.all(...params);
    res.json(list);
  } catch (err) {
    console.error('messages error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 获取未读消息数量
app.get('/api/messages/unread-count', async (req, res) => {
  try {
    const { userId } = getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    
    const [row] = await db.prepare('SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND is_read = 0').all(userId);
    res.json({ count: row.count });
  } catch (err) {
    console.error('unread-count error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 标记消息已读
app.put('/api/messages/:id/read', async (req, res) => {
  try {
    const { userId } = getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    
    await db.prepare('UPDATE messages SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    res.json({ message: '已标记已读' });
  } catch (err) {
    console.error('mark read error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 标记全部已读
app.put('/api/messages/read-all', async (req, res) => {
  try {
    const { userId } = getCurrentUser(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    
    await db.prepare('UPDATE messages SET is_read = 1 WHERE user_id = ?').run(userId);
    res.json({ message: '已全部标记已读' });
  } catch (err) {
    console.error('mark all read error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 获取单条消息
app.get('/api/messages/:id', async (req, res) => {
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
  const stmt = db.prepare('SELECT * FROM inspections ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/inspections', checkPermission('inspection:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { project_id, project_name, inspector_id, inspector_name, score, status, issues, images, result, rectify_status } = req.body;
  const stmt = db.prepare('INSERT INTO inspections (project_id, project_name, inspector_id, inspector_name, score, status, issues, images, result, rectify_status, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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

app.get('/api/acceptance', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM acceptance ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/acceptance', checkPermission('acceptance:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
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

app.put('/api/acceptance/:id', checkPermission('acceptance:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
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

app.delete('/api/acceptance/:id', checkPermission('acceptance:delete'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
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
app.get('/api/dispatches', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM dispatches ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/dispatches', checkPermission('dispatch:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
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

app.put('/api/dispatches/:id', checkPermission('dispatch:write'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
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

app.delete('/api/dispatches/:id', checkPermission('dispatch:delete'), async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [d] = await db.prepare('SELECT content FROM dispatches WHERE id = ?').all(req.params.id);
  const dName = d ? d.content : req.params.id;
  await db.prepare('DELETE FROM dispatches WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '派工管理', req.params.id, dName, `删除派工: ${dName}`, req.ip);
  res.json({ message: '删除成功' });
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
app.get('/api/suppliers', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM suppliers ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/suppliers', async (req, res) => {
  const { name, type, contact_person, contact_phone, address, bank_account, tax_number, status, remark } = req.body;
  const stmt = db.prepare('INSERT INTO suppliers (name, type, contact_person, contact_phone, address, bank_account, tax_number, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(name, type, contact_person, contact_phone, address, bank_account, tax_number, status || '合作中', remark);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/suppliers/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  const { name, type, contact_person, contact_phone, address, bank_account, tax_number, status, remark } = req.body;
  await db.prepare('UPDATE suppliers SET name=?, type=?, contact_person=?, contact_phone=?, address=?, bank_account=?, tax_number=?, status=?, remark=? WHERE id=?')
    .run(name, type, contact_person, contact_phone, address, bank_account, tax_number, status, remark, req.params.id);
  await addLog(userId, '', '编辑', '供应商管理', req.params.id, name, `更新供应商: ${name}`, req.ip);
  res.json({ message: '更新成功' });
});

app.delete('/api/suppliers/:id', async (req, res) => {
  const _rawUid = req.headers['x-user-id'];
    
  const userId = getUserId(req);
  if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
  const [s] = await db.prepare('SELECT name FROM suppliers WHERE id = ?').all(req.params.id);
  const sName = s ? s.name : req.params.id;
  await db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
  await addLog(userId, '', '删除', '供应商管理', req.params.id, sName, `删除供应商: ${sName}`, req.ip);
  res.json({ message: '删除成功' });
});

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

// 整改问题
app.get('/api/rectification-issues', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM rectification_issues ORDER BY created_at DESC');
  res.json(await stmt.all());
});

app.post('/api/rectification-issues', async (req, res) => {
  const userId = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
  const { inspection_id, project_id, project_name, issue_desc, priority, status, responsible_id, responsible_name, due_date, images, remark, title, category, location, level, description } = req.body;
  const stmt = db.prepare(`INSERT INTO rectification_issues
    (inspection_id, project_id, project_name, issue_desc, priority, status, responsible_id, responsible_name, due_date, images, remark, title, category, location, level, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const result = await stmt.run(
    inspection_id, project_id, project_name,
    issue_desc || title || '', priority || '普通', status || '待处理',
    responsible_id, responsible_name, due_date,
    JSON.stringify(images || []), remark || description || '',
    title || issue_desc || '', category || '', location || '', level || '', description || ''
  );
  await addLog(userId, '', '新增', '整改问题', result.lastInsertRowid, project_name, `整改问题: ${(title || issue_desc || '').slice(0, 30)}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/rectification-issues/:id', async (req, res) => {
  const { status, finish_date, remark } = req.body;
  await db.prepare('UPDATE rectification_issues SET status=?, finish_date=?, remark=? WHERE id=?')
    .run(status, finish_date, remark, req.params.id);
  await addLog(userId, '', '编辑', '整改问题', parseInt(req.params.id), '', `更新整改状态: ${status}`, req.ip);
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
  const { project_id, project_name, customer_name, customer_phone, type, description, images, status, handle_user, handle_date, result, satisfaction, cost } = req.body;
  const stmt = db.prepare('INSERT INTO warranties (project_id, project_name, customer_name, customer_phone, type, description, images, status, handle_user, handle_date, result, satisfaction, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result2 = await stmt.run(project_id, project_name, customer_name, customer_phone, type, description, JSON.stringify(images || []), status || '待处理', handle_user, handle_date, result, satisfaction, cost || 0);
  await addLog(userId, '', '新增', '售后维保', result2.lastInsertRowid, project_name, `维保项目: ${project_name}, 类型: ${type}`, req.ip);
  res.json({ id: result2.lastInsertRowid, message: '添加成功' });
});

app.put('/api/warranties/:id', async (req, res) => {
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
  const { customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status, drawings, remark } = req.body;
  const stmt = db.prepare('INSERT INTO design_measurements (customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status, drawings, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status || '待测量', drawings, remark);
  await addLog(userId, '', '新增', '设计量房', result.lastInsertRowid, customer_name, `量房客户: ${customer_name}, 楼盘: ${building_name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/design-measurements/:id', async (req, res) => {
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
const PUPPETEER_CONFIG = {
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
};
// Mac 本地开发用指定 Chrome；Windows/Linux 用系统 Chrome 或让 puppeteer 自动找
if (isMac) {
  PUPPETEER_CONFIG.executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
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
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

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
      await page.setContent(html, { waitUntil: 'networkidle0' });
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
    const { template_id } = req.body;
    const userId = getUserId(req);

    // 获取项目信息（用于计算日期范围）
    const [project] = await db.prepare('SELECT * FROM projects WHERE id = ?').all([req.params.projectId]);
    if (!project) return res.status(404).json({ error: '项目不存在' });

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
app.put('/api/sms-templates/:id', checkPermission('sms:write'), async (req, res) => {
  try {
    const { name, content, variables, is_active, sign_name, aliyun_template_code } = req.body;
    await db.prepare(
      'UPDATE sms_templates SET name=?, content=?, variables=?, is_active=?, sign_name=?, aliyun_template_code=?, updated_at=NOW() WHERE id=?'
    ).run([name, content, variables || null, is_active !== undefined ? is_active : 1, sign_name || null, aliyun_template_code || null, req.params.id]);
    await addLog(userId, '', '编辑', '短信模板', parseInt(req.params.id), name, `更新短信模板: ${name}`, req.ip);
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
app.get('/api/system-settings', async (req, res) => {
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
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/system-settings/sms', checkPermission('settings:write'), async (req, res) => {
  try {
    // 前端提交的是扁平对象 {provider, access_key_id, ...}，需要包裹成双重JSON格式
    const value = JSON.stringify({ category: 'sms', setting_value: req.body });
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
    const value = JSON.stringify(req.body);
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

    const [rows] = await mysqlPool.query('SELECT COUNT(*) as cnt FROM notifications WHERE receiver_phone = ? AND is_read = 0', [phone]);
    res.json({ count: rows[0].cnt });
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
      'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
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

// GET /api/wechat/users — 微信用户列表（含关联客户信息）
app.get('/api/wechat/users', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, keyword, type } = req.query;
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'];

    let where = 'WHERE w.status = 1';
    const params = [];

    if (status !== undefined) {
      where += ' AND w.status = ?';
      params.push(status);
    }
    if (keyword) {
      where += ' AND (w.nickname LIKE ? OR w.phone LIKE ? OR c.name LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (type) {
      const field = type === 'mini' ? 'w.mini_openid' : 'w.mp_openid';
      where += ` AND ${field} IS NOT NULL AND ${field} != ''`;
    }

    // 普通员工只能看自己关联的客户，admin 和有 customer_all 权限的看全部
    let customerFilter = '';
    if (userRole !== 'admin') {
      const [empRows] = await pool.query('SELECT permissions FROM employees WHERE id = ?', [userId]);
      const perms = empRows[0] ? JSON.parse(empRows[0].permissions || '[]') : [];
      if (!perms.includes('customer_all')) {
        customerFilter = ' AND c.creator_id = ?';
        params.push(userId);
      }
    }

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const [total] = await pool.query(
      `SELECT COUNT(*) as cnt FROM wechat_users w LEFT JOIN customers c ON w.customer_id = c.id ${where}${customerFilter}`, params);
    const [list] = await pool.query(
      `SELECT w.*, c.name as customer_name, c.phone as customer_phone, c.customer_no
       FROM wechat_users w
       LEFT JOIN customers c ON w.customer_id = c.id
       ${where}${customerFilter}
       ORDER BY w.bind_time DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    res.json({ list, total: total[0].cnt, page: parseInt(page), pageSize: parseInt(pageSize) });
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

// ==================== 静态文件（必须在所有 API 路由之后） ====================
app.use('/uploads', express.static(uploadDir));
const webDistPath = path.join(__dirname, '../web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
}
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads') && !req.path.startsWith('/auth')) {
    res.sendFile(path.join(webDistPath, 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`🚀 装企云ERP系统后端运行在 http://localhost:${PORT}`);
});
