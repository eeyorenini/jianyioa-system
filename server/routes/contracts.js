'use strict';

const express = require('express');
const router = express.Router();

const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');
const { addLog } = require('../utils/addLog');
const { pool } = require('../db-mysql-async');
const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');

router.get('/api/contracts', async (req, res) => {
    
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


router.get('/api/contracts/:id', async (req, res) => {
    
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


router.post('/api/contracts', checkPermission('contract:write'), async (req, res) => {
    
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


router.put('/api/contracts/:id', checkPermission('contract:write'), async (req, res) => {
    
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


router.delete('/api/contracts/:id', checkPermission('contract:delete'), async (req, res) => {
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

router.get('/api/signers', async (req, res) => {
    
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


router.post('/api/signers', async (req, res) => {
    
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


router.put('/api/signers/:id', async (req, res) => {
    
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


router.delete('/api/signers/:id', async (req, res) => {
    
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
const upload = multer({ dest: uploadDir, limits: { fileSize: 50 * 1024 * 1024 } });


router.post('/api/contracts/upload-word', upload.single('file'), async (req, res) => {
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

router.get('/api/contract-templates', async (req, res) => {
  const { template_type } = req.query;
    
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


router.post('/api/contract-templates', async (req, res) => {
    
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


router.put('/api/contract-templates/:id', async (req, res) => {
    
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


router.delete('/api/contract-templates/:id', async (req, res) => {
    
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


module.exports = router;