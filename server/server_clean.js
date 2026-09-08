const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Database = require('./db-mysql');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const os = require('os');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');
const puppeteer = require('puppeteer');

// 加载环境变量
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1"; process.env.DB_PORT = process.env.DB_PORT || "3306"; process.env.DB_USER = "jianyioa"; process.env.DB_PASSWORD = "zpfbAsxyA76P2ZHw"; process.env.DB_NAME = "jianyioa"; process.env.PORT = "3001";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

const db = new Database();
// MySQL 不需要 busy_timeout / journal_mode（适配层已忽略）

// 初始化数据库表结构（从 init.sql 读取）
function initDatabase() {
  const sqlPath = path.join(__dirname, 'init.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('❌ init.sql 不存在:', sqlPath);
    return;
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    db.exec(sql);
    console.log('✅ 数据库表结构初始化完成（init.sql）');
  } catch (e) {
    console.error('❌ 数据库初始化失败:', e.message);
  }
}
initDatabase();


const defaultPermissions = [
  { name: '数据看板', code: 'dashboard', path: '/dashboard', icon: 'DataAnalysis', sort_order: 1 },
  { name: '客户管理', code: 'customer', path: '/customers', icon: 'User', sort_order: 2 },
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
  { name: '超级管理员', code: 'admin', description: '拥有所有权限', permissions: JSON.stringify(['dashboard', 'customer', 'contract', 'budget', 'project', 'quote', 'warehouse', 'purchase', 'finance', 'employee', 'role', 'department', 'approval', 'report', 'notice', 'inspection', 'acceptance', 'invoice']) },
  { name: '项目经理', code: 'manager', description: '项目管理权限', permissions: JSON.stringify(['dashboard', 'project', 'warehouse', 'purchase', 'finance', 'inspection', 'acceptance']) },
  { name: '设计师', code: 'designer', description: '设计和预算权限', permissions: JSON.stringify(['dashboard', 'customer', 'budget', 'quote']) },
  { name: '财务', code: 'finance', description: '财务权限', permissions: JSON.stringify(['dashboard', 'finance', 'contract', 'invoice']) },
  { name: '普通员工', code: 'user', description: '基本权限', permissions: JSON.stringify(['dashboard', 'approval', 'report']) }
];

const checkAndInsertDefaultData = () => {
  const permCount = db.prepare('SELECT COUNT(*) as count FROM permissions').get();
  if (permCount.count === 0) {
    const insertPerm = db.prepare('INSERT INTO permissions (name, code, path, icon, sort_order) VALUES (?, ?, ?, ?, ?)');
    defaultPermissions.forEach(p => insertPerm.run(p.name, p.code, p.path, p.icon, p.sort_order));
    console.log('默认权限数据已添加');
  }
  
  const roleCount = db.prepare('SELECT COUNT(*) as count FROM roles').get();
  if (roleCount.count === 0) {
    const insertRole = db.prepare('INSERT INTO roles (name, code, description, permissions) VALUES (?, ?, ?, ?)');
    defaultRoles.forEach(r => insertRole.run(r.name, r.code, r.description, r.permissions));
    console.log('默认角色数据已添加');
  }
  
  const empCount = db.prepare('SELECT COUNT(*) as count FROM employees').get();
  if (empCount.count === 0) {
    const adminRole = db.prepare("SELECT id FROM roles WHERE code = 'admin'").get();
    const insertEmp = db.prepare("INSERT INTO employees (username, password, name, phone, role_id, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)");
    insertEmp.run('admin', 'admin123', '系统管理员', '13800000000', adminRole?.id, '在职', '系统管理员');
    console.log('默认管理员账号已添加: admin / admin123');
  }
  
  const tplCount = db.prepare('SELECT COUNT(*) as count FROM contract_templates').get();
  if (tplCount.count === 0) {
    const insertTpl = db.prepare('INSERT INTO contract_templates (name, category, content, is_default) VALUES (?, ?, ?, ?)');
    insertTpl.run('装修施工合同', 'decoration', `<h1 style="text-align: center; font-size: 24px;">室内装修工程施工合同</h1>
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
    insertTpl.run('设计合同', 'design', `<h1 style="text-align: center; font-size: 24px;">室内设计委托合同</h1>
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
    insertTpl.run('委托代理合同', 'entrust', `<h1 style="text-align: center; font-size: 24px;">装修委托代理合同</h1>
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
};

setTimeout(checkAndInsertDefaultData, 1000);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '装企云ERP系统运行中' });
});

app.get('/api/customers', (req, res) => {
  const stmt = db.prepare('SELECT * FROM customers ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/customers', (req, res) => {
  const { name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date } = req.body;
  const stmt = db.prepare('INSERT INTO customers (name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(name, phone, source, status || '意向客户', level || '普通', follow_user, address, area, budget, demand, next_follow_date);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/customers/:id', (req, res) => {
  const { name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date } = req.body;
  const stmt = db.prepare('UPDATE customers SET name=?, phone=?, source=?, status=?, level=?, follow_user=?, address=?, area=?, budget=?, demand=?, next_follow_date=? WHERE id=?');
  stmt.run(name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/customers/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM customers WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.get('/api/customer-follow/:customerId', (req, res) => {
  const stmt = db.prepare('SELECT * FROM customer_follow WHERE customer_id = ? ORDER BY created_at DESC');
  res.json(stmt.all(req.params.customerId));
});

app.post('/api/customer-follow', (req, res) => {
  const { customer_id, follow_type, content, follow_date, next_date } = req.body;
  const stmt = db.prepare('INSERT INTO customer_follow (customer_id, follow_type, content, follow_date, next_date) VALUES (?, ?, ?, ?, ?)');
  const result = stmt.run(customer_id, follow_type, content, follow_date, next_date);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.get('/api/contracts', (req, res) => {
  const userId = parseInt(req.headers['x-user-id'] || 0);
  const userRole = req.headers['x-user-role'] || '';

  let rows;
  if (userRole === 'admin' || userRole === '超级管理员') {
    // 管理员：看全部
    rows = db.prepare('SELECT * FROM contracts ORDER BY created_at DESC').all();
  } else if (userId) {
    // 普通用户：只看自己创建的
    rows = db.prepare('SELECT * FROM contracts WHERE created_by = ? ORDER BY created_at DESC').all(userId);
  } else {
    rows = [];
  }
  // 避免 custom_fields 双重序列化
  rows.forEach(row => {
    if (row.custom_fields) {
      try { row.custom_fields = JSON.parse(row.custom_fields); } catch (e) {}
    }
  });
  res.json(rows);
});

function generateContractNo() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const countStmt = db.prepare("SELECT COUNT(*) as count FROM contracts WHERE contract_no LIKE ?");
  const count = countStmt.get(`HT-${dateStr}%`)?.count || 0;
  return `HT-${dateStr}-${String(count + 1).padStart(3, '0')}`;
}

app.post('/api/contracts', (req, res) => {
  const userId = parseInt(req.headers['x-user-id'] || 0);
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
    contract_no = generateContractNo();
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
    // 使用 db.exec 直接执行 SQL
    const sql = `INSERT INTO contracts (contract_no, customer_id, project_name, customer_name, customer_phone, customer_address, id_card, engineering_address, total_amount, design_fee, manager_fee, tax_amount, area, start_date, end_date, status, sign_date, decoration_style, payment1, payment2, payment3, guarantee_period, dispute_court, content, attachment, category, custom_fields, created_by) VALUES (${[contract_no, customer_id, project_name, customer_name, customer_phone, customer_address, id_card, engineering_address, total_amount, design_fee || 0, manager_fee || 0, tax_amount || 0, area, start_date, end_date, status || '待签订', sign_date, decoration_style, payment1 || 0, payment2 || 0, payment3 || 0, guarantee_period, dispute_court, content, attachment, category || 'decoration', typeof custom_fields === 'string' ? custom_fields : (custom_fields ? JSON.stringify(custom_fields) : null), userId || null].map(v => v === null || v === undefined ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v).join(', ')})`;
    console.log('SQL:', sql);
    db.exec(sql);
    const lastId = db.prepare('SELECT last_insert_rowid() as id').get();
    console.log('INSERT 执行成功, id:', lastId.id);
    
    addLog(null, '管理员', '新增', '合同管理', lastId.id, project_name, `合同编号: ${contract_no}, 金额: ${total_amount}`, req.ip);
    
    res.json({ id: lastId.id, message: '添加成功' });
  } catch (err) {
    console.error('数据库错误:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/contracts/:id', (req, res) => {
  const { contract_no, customer_id, project_name, customer_name, customer_phone, customer_address, id_card, engineering_address, total_amount, design_fee, manager_fee, tax_amount, area, start_date, end_date, status, sign_date, decoration_style, payment1, payment2, payment3, guarantee_period, dispute_court, content, attachment, category, custom_fields } = req.body;
  
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
  stmt.run(contract_no, customer_id, project_name, customer_name, customer_phone, customer_address, id_card, engineering_address, total_amount, design_fee || 0, manager_fee || 0, tax_amount || 0, area, start_date, end_date, status, sign_date, decoration_style, payment1 || 0, payment2 || 0, payment3 || 0, guarantee_period, dispute_court, content, attachment, category, typeof custom_fields === 'string' ? custom_fields : (custom_fields ? JSON.stringify(custom_fields) : null), req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/contracts/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM contracts WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
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
// 统一文件上传目录（uploads/），通过 express.static 提供访问
app.use('/uploads', express.static(uploadDir));

// 前端静态文件
const webDistPath = path.join(__dirname, '../web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  // SPA fallback
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads') && !req.path.startsWith('/auth')) {
      res.sendFile(path.join(webDistPath, 'index.html'));
    }
  });
}

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

app.get('/api/contract-templates', (req, res) => {
  const { template_type } = req.query;
  const userId = parseInt(req.headers['x-user-id'] || 0);
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
  res.json(params.length > 0 ? stmt.all(...params) : stmt.all());
});

// 判断是否为管理员的辅助函数
const isAdmin = (userId) => {
  if (!userId) return false;
  try {
    // 获取用户信息和角色
    const user = db.prepare('SELECT e.*, r.code as role_code FROM employees e LEFT JOIN roles r ON e.role_id = r.id WHERE e.id = ?').get(userId);
    return user && user.role_code === 'admin';
  } catch (e) {
    return false;
  }
};

app.post('/api/contract-templates', (req, res) => {
  const userId = parseInt(req.headers['x-user-id'] || req.body.user_id || 0);
  const { name, category, content, is_default, template_type, template_fields } = req.body;
  
  // 检查权限：只有管理员可以创建系统模板
  if (template_type === 'system' && !isAdmin(userId)) {
    return res.status(403).json({ success: false, message: '只有管理员可以创建系统模板' });
  }
  
  const stmt = db.prepare('INSERT INTO contract_templates (name, category, content, is_default, template_type, template_fields, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(name, category, content, is_default || 0, template_type || 'personal', template_fields || '', userId || null);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/contract-templates/:id', (req, res) => {
  const userId = parseInt(req.headers['x-user-id'] || req.body.user_id || 0);
  const { name, category, content, is_default, template_type, template_fields } = req.body;
  
  // 检查是否是系统模板
  const template = db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, message: '模板不存在' });
  }
  
  // 检查权限：系统模板只有管理员可以修改
  if (template.template_type === 'system' && !isAdmin(userId)) {
    return res.status(403).json({ success: false, message: '只有管理员可以修改系统模板' });
  }
  
  const stmt = db.prepare('UPDATE contract_templates SET name=?, category=?, content=?, is_default=?, template_type=?, template_fields=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
  stmt.run(name, category, content, is_default || 0, template_type || 'personal', template_fields || '', req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/contract-templates/:id', (req, res) => {
  const userId = parseInt(req.headers['x-user-id'] || req.body.user_id || 0);
  
  // 检查是否是系统模板
  const template = db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, message: '模板不存在' });
  }
  
  // 检查权限：系统模板只有管理员可以删除
  if (template.template_type === 'system' && !isAdmin(userId)) {
    return res.status(403).json({ success: false, message: '只有管理员可以删除系统模板' });
  }
  
  const stmt = db.prepare('DELETE FROM contract_templates WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

function addLog(userId, username, action, module, targetId, targetName, details, ipAddress) {
  try {
    const stmt = db.prepare('INSERT INTO operation_logs (user_id, username, action, module, target_id, target_name, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    stmt.run(userId, username, action, module, targetId, targetName, details, ipAddress);
  } catch (e) {
    console.error('记录日志失败:', e.message);
  }
}

app.get('/api/operation-logs', (req, res) => {
  const { page, limit, module, action } = req.query;
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
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC';
  if (limit) {
    sql += ' LIMIT ' + parseInt(limit);
    if (page) {
      sql += ' OFFSET ' + parseInt((page - 1) * limit);
    }
  }
  const stmt = db.prepare(sql);
  res.json(stmt.all(...params));
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

app.get('/api/budgets', (req, res) => {
  const stmt = db.prepare('SELECT * FROM budgets ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/budgets', (req, res) => {
  const { customer_id, project_name, house_area, style, total_amount, profit_rate, status, items } = req.body;
  const stmt = db.prepare('INSERT INTO budgets (customer_id, project_name, house_area, style, total_amount, profit_rate, status, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(customer_id, project_name, house_area, style, total_amount, profit_rate, status || '草稿', JSON.stringify(items));
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.delete('/api/budgets/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM budgets WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.get('/api/finance', (req, res) => {
  const stmt = db.prepare('SELECT * FROM finance ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/finance', (req, res) => {
  const { type, amount, category, description, date, project_id } = req.body;
  const stmt = db.prepare('INSERT INTO finance (type, amount, category, description, date, project_id) VALUES (?, ?, ?, ?, ?, ?)');
  const result = stmt.run(type, amount, category, description, date, project_id);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.delete('/api/finance/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM finance WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.get('/api/finance/summary', (req, res) => {
  const income = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'income'").get();
  const expense = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'expense'").get();
  const projectIncome = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'income' AND project_id IS NOT NULL").get();
  const projectExpense = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'expense' AND project_id IS NOT NULL").get();
  res.json({
    totalIncome: income.total,
    totalExpense: expense.total,
    balance: income.total - expense.total,
    projectIncome: projectIncome.total,
    projectExpense: projectExpense.total
  });
});

app.get('/api/projects', (req, res) => {
  const stmt = db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/projects', (req, res) => {
  const { name, customer, contract_id, status, progress, start_date, end_date, budget, cost, manager, designer, description, stages } = req.body;
  const stmt = db.prepare('INSERT INTO projects (name, customer, contract_id, status, progress, start_date, end_date, budget, cost, manager, designer, description, stages) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(name, customer, contract_id, status || '开工准备', progress || 0, start_date, end_date, budget, cost || 0, manager, designer, description, JSON.stringify(stages));
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/projects/:id', (req, res) => {
  const { name, customer, contract_id, status, progress, start_date, end_date, budget, cost, manager, designer, description, stages } = req.body;
  const stmt = db.prepare('UPDATE projects SET name=?, customer=?, contract_id=?, status=?, progress=?, start_date=?, end_date=?, budget=?, cost=?, manager=?, designer=?, description=?, stages=? WHERE id=?');
  stmt.run(name, customer, contract_id, status, progress, start_date, end_date, budget, cost, manager, designer, description, JSON.stringify(stages), req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/projects/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.get('/api/project-stages/:projectId', (req, res) => {
  const stmt = db.prepare('SELECT * FROM project_stages WHERE project_id = ? ORDER BY id');
  res.json(stmt.all(req.params.projectId));
});

app.post('/api/project-stages', (req, res) => {
  const { project_id, stage_name, plan_start_date, plan_end_date, actual_start_date, actual_end_date, status, progress, note } = req.body;
  const stmt = db.prepare('INSERT INTO project_stages (project_id, stage_name, plan_start_date, plan_end_date, actual_start_date, actual_end_date, status, progress, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(project_id, stage_name, plan_start_date, plan_end_date, actual_start_date, actual_end_date, status || '待开始', progress || 0, note);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/project-stages/:id', (req, res) => {
  const { stage_name, plan_start_date, plan_end_date, actual_start_date, actual_end_date, status, progress, note } = req.body;
  const stmt = db.prepare('UPDATE project_stages SET stage_name=?, plan_start_date=?, plan_end_date=?, actual_start_date=?, actual_end_date=?, status=?, progress=?, note=? WHERE id=?');
  stmt.run(stage_name, plan_start_date, plan_end_date, actual_start_date, actual_end_date, status, progress, note, req.params.id);
  res.json({ message: '更新成功' });
});

app.get('/api/project-logs/:projectId', (req, res) => {
  const stmt = db.prepare('SELECT * FROM project_logs WHERE project_id = ? ORDER BY created_at DESC');
  res.json(stmt.all(req.params.projectId));
});

app.post('/api/project-logs', (req, res) => {
  const { project_id, content, operator, images } = req.body;
  const stmt = db.prepare('INSERT INTO project_logs (project_id, content, operator, images) VALUES (?, ?, ?, ?)');
  const result = stmt.run(project_id, content, operator, JSON.stringify(images || []));
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.get('/api/quotes', (req, res) => {
  const stmt = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/quotes', (req, res) => {
  const { customer_name, project_name, total_amount, status, items, valid_date } = req.body;
  const stmt = db.prepare('INSERT INTO quotes (customer_name, project_name, total_amount, status, items, valid_date) VALUES (?, ?, ?, ?, ?, ?)');
  const result = stmt.run(customer_name, project_name, total_amount, status || '待确认', JSON.stringify(items), valid_date);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.delete('/api/quotes/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM quotes WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.get('/api/materials', (req, res) => {
  const stmt = db.prepare('SELECT * FROM materials ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/materials', (req, res) => {
  const { code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location } = req.body;
  const stmt = db.prepare('INSERT INTO materials (code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(code, name, category, unit, quantity || 0, price || 0, cost_price || 0, supplier, min_stock || 0, location);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/materials/:id', (req, res) => {
  const { code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location } = req.body;
  const stmt = db.prepare('UPDATE materials SET code=?, name=?, category=?, unit=?, quantity=?, price=?, cost_price=?, supplier=?, min_stock=?, location=? WHERE id=?');
  stmt.run(code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/materials/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM materials WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.post('/api/materials/in', (req, res) => {
  const { material_id, quantity, unit_price, supplier, operator, note, date } = req.body;
  const stmt = db.prepare('INSERT INTO material_in (material_id, quantity, unit_price, supplier, operator, note, date) VALUES (?, ?, ?, ?, ?, ?, ?)');
  stmt.run(material_id, quantity, unit_price || 0, supplier, operator, note, date);
  db.prepare('UPDATE materials SET quantity = quantity + ? WHERE id = ?').run(quantity, material_id);
  res.json({ message: '入库成功' });
});

app.post('/api/materials/out', (req, res) => {
  const { material_id, quantity, project_id, operator, note, date } = req.body;
  const stmt = db.prepare('INSERT INTO material_out (material_id, quantity, project_id, operator, note, date) VALUES (?, ?, ?, ?, ?, ?)');
  stmt.run(material_id, quantity, project_id, operator, note, date);
  db.prepare('UPDATE materials SET quantity = quantity - ? WHERE id = ?').run(quantity, material_id);
  res.json({ message: '出库成功' });
});

app.get('/api/main-materials', (req, res) => {
  const { keyword = '', category = '', page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page) || 1;
  const pageSize = parseInt(limit) || 20;
  const offset = (pageNum - 1) * pageSize;
  
  let whereSql = ' WHERE 1=1';
  const params = [];
  if (keyword) {
    whereSql += ' AND (code LIKE ? OR name LIKE ? OR brand LIKE ? OR model LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (category) {
    whereSql += ' AND category = ?';
    params.push(category);
  }
  
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM main_materials' + whereSql);
  const total = countStmt.get(...params)?.total || 0;
  
  let sql = 'SELECT * FROM main_materials' + whereSql + ' ORDER BY sort_order ASC, id DESC LIMIT ? OFFSET ?';
  const stmt = db.prepare(sql);
  const list = stmt.all(...params, pageSize, offset);
  
  res.json({ list, total, page: pageNum, limit: pageSize });
});

app.get('/api/main-materials/categories', (req, res) => {
  try {
    const rows = db.prepare('SELECT category FROM main_materials').all();
    const categories = [...new Set(rows.map(r => r.category).filter(c => c && c.trim()))];
    categories.sort();
    res.json(categories);
  } catch(e) {
    console.log('categories error:', e.message, e.stack);
    res.json([]);
  }
});

app.post('/api/main-materials', (req, res) => {
  const data = req.body || {};
  const stmt = db.prepare(`
    INSERT INTO main_materials (
      code, name, original_price, cost_price, cost_price2, quote_price, contract_price,
      quote_unit, exchange_rate, purchase_unit, loss_rate, loss_amount, warranty_period, stock_period,
      specification, model, color, spec_alternative, model_alternative, color_alternative, brand,
      sort_order, remark, acceptance_remark, contract_remark, other_remark, position, package_name,
      upgrade_profit_rate, internal_control_price, combo, limit_formula, quote_formula, category,
      is_visible, is_fixed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
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
    Number(data.is_fixed ?? 0)
  );
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/main-materials/:id', (req, res) => {
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
  stmt.run(
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
  res.json({ message: '更新成功' });
});

app.delete('/api/main-materials/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM main_materials WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.post('/api/main-materials/batch-upsert', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const insertStmt = db.prepare(`
    INSERT INTO main_materials (
      code, name, original_price, cost_price, cost_price2, quote_price, contract_price,
      quote_unit, exchange_rate, purchase_unit, loss_rate, loss_amount, warranty_period, stock_period,
      specification, model, color, spec_alternative, model_alternative, color_alternative, brand,
      sort_order, remark, acceptance_remark, contract_remark, other_remark, position, package_name,
      upgrade_profit_rate, internal_control_price, combo, limit_formula, quote_formula, category,
      is_visible, is_fixed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((list) => {
    for (const row of list) {
      if (!row.name) continue;
      insertStmt.run(
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
  });
  tx(rows);
  res.json({ message: '导入成功', count: rows.length });
});

app.post('/api/main-materials/import', upload.single('file'), (req, res) => {
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((list) => {
    for (const row of list) {
      insertStmt.run(
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
  });
  tx(rows);
  res.json({ message: '导入成功', count: rows.length });
});

app.get('/api/main-materials/export', (req, res) => {
  const rows = db.prepare('SELECT * FROM main_materials ORDER BY sort_order ASC, id DESC').all();
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

app.get('/api/material-orders', (req, res) => {
  const stmt = db.prepare('SELECT * FROM material_orders ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/material-orders', (req, res) => {
  const { material_id, quantity, status, order_date, expected_date, supplier, operator, note } = req.body;
  const stmt = db.prepare('INSERT INTO material_orders (material_id, quantity, status, order_date, expected_date, supplier, operator, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(material_id, quantity, status || '待采购', order_date, expected_date, supplier, operator, note);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/material-orders/:id', (req, res) => {
  const { material_id, quantity, status, order_date, expected_date, supplier, operator, note } = req.body;
  const stmt = db.prepare('UPDATE material_orders SET material_id=?, quantity=?, status=?, order_date=?, expected_date=?, supplier=?, operator=?, note=? WHERE id=?');
  stmt.run(material_id, quantity, status, order_date, expected_date, supplier, operator, note, req.params.id);
  res.json({ message: '更新成功' });
});

app.get('/api/dashboard/stats', (req, res) => {
  const customerCount = db.prepare("SELECT COUNT(*) as count FROM customers").get();
  const contractCount = db.prepare("SELECT COUNT(*) as count FROM contracts WHERE status = '已签订'").get();
  const projectCount = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status != '已竣工'").get();
  const pendingQuote = db.prepare("SELECT COUNT(*) as count FROM quotes WHERE status = '待确认'").get();
  
  const income = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'income'").get();
  const expense = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'expense'").get();
  
  const lowStock = db.prepare("SELECT COUNT(*) as count FROM materials WHERE quantity <= min_stock").get();

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

app.get('/api/departments', (req, res) => {
  const stmt = db.prepare('SELECT * FROM departments ORDER BY id');
  res.json(stmt.all());
});

app.post('/api/departments', (req, res) => {
  const { name, parent_id, manager_id, description } = req.body;
  const stmt = db.prepare('INSERT INTO departments (name, parent_id, manager_id, description) VALUES (?, ?, ?, ?)');
  const result = stmt.run(name, parent_id, manager_id, description);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.delete('/api/departments/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM departments WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.get('/api/employees', (req, res) => {
  const stmt = db.prepare(`
    SELECT e.*, d.name as department_name, r.name as role_name 
    FROM employees e 
    LEFT JOIN departments d ON e.department_id = d.id 
    LEFT JOIN roles r ON e.role_id = r.id 
    ORDER BY e.created_at DESC
  `);
  res.json(stmt.all());
});

app.post('/api/employees', (req, res) => {
  const { username, password, name, phone, email, department_id, position, role_id, status, entry_date, salary, id_card, emergency_contact, emergency_phone } = req.body;
  const stmt = db.prepare(`
    INSERT INTO employees (username, password, name, phone, email, department_id, position, role_id, status, entry_date, salary, id_card, emergency_contact, emergency_phone) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(username, password, name, phone, email, department_id, position, role_id, status || '在职', entry_date, salary, id_card, emergency_contact, emergency_phone);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/employees/:id', (req, res) => {
  const { username, name, phone, email, department_id, position, role_id, status, entry_date, salary, id_card, emergency_contact, emergency_phone } = req.body;
  const stmt = db.prepare(`
    UPDATE employees SET username=?, name=?, phone=?, email=?, department_id=?, position=?, role_id=?, status=?, entry_date=?, salary=?, id_card=?, emergency_contact=?, emergency_phone=? 
    WHERE id=?
  `);
  stmt.run(username, name, phone, email, department_id, position, role_id, status, entry_date, salary, id_card, emergency_contact, emergency_phone, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/employees/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM employees WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.post('/api/employees/login', (req, res) => {
  const { username, password } = req.body;
  const stmt = db.prepare(`
    SELECT e.*, r.name as role_name, r.code as role_code, r.permissions as role_permissions 
    FROM employees e 
    LEFT JOIN roles r ON e.role_id = r.id 
    WHERE e.username = ? AND e.password = ?
  `);
  const user = stmt.get(username, password);
  if (user) {
    res.json({ success: true, user });
  } else {
    res.json({ success: false, message: '用户名或密码错误' });
  }
});

app.get('/api/roles', (req, res) => {
  const stmt = db.prepare('SELECT * FROM roles ORDER BY id');
  res.json(stmt.all());
});

app.post('/api/roles', (req, res) => {
  const { name, code, description, permissions } = req.body;
  const stmt = db.prepare('INSERT INTO roles (name, code, description, permissions) VALUES (?, ?, ?, ?)');
  const result = stmt.run(name, code, description, JSON.stringify(permissions || []));
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/roles/:id', (req, res) => {
  const { name, code, description, permissions } = req.body;
  const stmt = db.prepare('UPDATE roles SET name=?, code=?, description=?, permissions=? WHERE id=?');
  stmt.run(name, code, description, JSON.stringify(permissions || []), req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/roles/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM roles WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.get('/api/permissions', (req, res) => {
  const stmt = db.prepare('SELECT * FROM permissions ORDER BY sort_order, id');
  res.json(stmt.all());
});

app.post('/api/permissions', (req, res) => {
  const { name, code, parent_id, type, path, icon, sort_order } = req.body;
  const stmt = db.prepare('INSERT INTO permissions (name, code, parent_id, type, path, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(name, code, parent_id, type || 'menu', path, icon, sort_order || 0);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.get('/api/approvals', (req, res) => {
  const stmt = db.prepare('SELECT * FROM approvals ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/approvals', (req, res) => {
  const { title, type, applicant_id, applicant_name, content, amount, status } = req.body;
  const stmt = db.prepare('INSERT INTO approvals (title, type, applicant_id, applicant_name, content, amount, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(title, type, applicant_id, applicant_name, content, amount, status || '待审批');
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/approvals/:id', (req, res) => {
  const { title, type, content, amount, status, approver_id, approver_name, approve_time, remark } = req.body;
  const stmt = db.prepare('UPDATE approvals SET title=?, type=?, content=?, amount=?, status=?, approver_id=?, approver_name=?, approve_time=?, remark=? WHERE id=?');
  stmt.run(title, type, content, amount, status, approver_id, approver_name, approve_time, remark, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/approvals/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM approvals WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.get('/api/reports', (req, res) => {
  const stmt = db.prepare('SELECT * FROM reports ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/reports', (req, res) => {
  const { title, content, report_type, reporter_id, reporter_name, status } = req.body;
  const stmt = db.prepare('INSERT INTO reports (title, content, report_type, reporter_id, reporter_name, status) VALUES (?, ?, ?, ?, ?, ?)');
  const result = stmt.run(title, content, report_type, reporter_id, reporter_name, status || '待审核');
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/reports/:id', (req, res) => {
  const { title, content, report_type, status, reviewer_id, reviewer_name, review_time } = req.body;
  const stmt = db.prepare('UPDATE reports SET title=?, content=?, report_type=?, status=?, reviewer_id=?, reviewer_name=?, review_time=? WHERE id=?');
  stmt.run(title, content, report_type, status, reviewer_id, reviewer_name, review_time, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/reports/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM reports WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.get('/api/notices', (req, res) => {
  const stmt = db.prepare('SELECT * FROM notices ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/notices', (req, res) => {
  const { title, content, type, publisher_id, publisher_name, status, publish_time } = req.body;
  const stmt = db.prepare('INSERT INTO notices (title, content, type, publisher_id, publisher_name, status, publish_time) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(title, content, type, publisher_id, publisher_name, status || '草稿', publish_time);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/notices/:id', (req, res) => {
  const { title, content, type, status, publish_time } = req.body;
  const stmt = db.prepare('UPDATE notices SET title=?, content=?, type=?, status=?, publish_time=? WHERE id=?');
  stmt.run(title, content, type, status, publish_time, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/notices/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM notices WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.get('/api/inspections', (req, res) => {
  const stmt = db.prepare('SELECT * FROM inspections ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/inspections', (req, res) => {
  const { project_id, project_name, inspector_id, inspector_name, score, status, issues, images, result, rectify_status } = req.body;
  const stmt = db.prepare('INSERT INTO inspections (project_id, project_name, inspector_id, inspector_name, score, status, issues, images, result, rectify_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result2 = stmt.run(project_id, project_name, inspector_id, inspector_name, score, status || '待整改', issues, JSON.stringify(images || []), result, rectify_status || '待整改');
  res.json({ id: result2.lastInsertRowid, message: '添加成功' });
});

app.put('/api/inspections/:id', (req, res) => {
  const { score, status, issues, result, rectify_status } = req.body;
  const stmt = db.prepare('UPDATE inspections SET score=?, status=?, issues=?, result=?, rectify_status=? WHERE id=?');
  stmt.run(score, status, issues, result, rectify_status, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/inspections/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM inspections WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.get('/api/acceptance', (req, res) => {
  const stmt = db.prepare('SELECT * FROM acceptance ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/acceptance', (req, res) => {
  const { project_id, project_name, stage, accept_status, accept_date, quality_score, issues, attachment } = req.body;
  const stmt = db.prepare('INSERT INTO acceptance (project_id, project_name, stage, accept_status, accept_date, quality_score, issues, attachment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(project_id, project_name, stage, accept_status || '待验收', accept_date, quality_score, issues, attachment);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/acceptance/:id', (req, res) => {
  const { accept_status, accept_date, quality_score, issues } = req.body;
  const stmt = db.prepare('UPDATE acceptance SET accept_status=?, accept_date=?, quality_score=?, issues=? WHERE id=?');
  stmt.run(accept_status, accept_date, quality_score, issues, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/acceptance/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM acceptance WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

app.get('/api/invoices', (req, res) => {
  const stmt = db.prepare('SELECT * FROM invoices ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/invoices', (req, res) => {
  const { invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark } = req.body;
  const stmt = db.prepare('INSERT INTO invoices (invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(invoice_no, customer_id, customer_name, amount, tax_rate || 0, tax_amount || 0, total_amount || amount, type, status || '待开具', issue_date, remark);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/invoices/:id', (req, res) => {
  const { invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark } = req.body;
  const stmt = db.prepare('UPDATE invoices SET invoice_no=?, customer_id=?, customer_name=?, amount=?, tax_rate=?, tax_amount=?, total_amount=?, type=?, status=?, issue_date=?, remark=? WHERE id=?');
  stmt.run(invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/invoices/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM invoices WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ message: '删除成功' });
});

// ========== 1装ERP扩展API ==========

// 公海客户
app.get('/api/customer-pool', (req, res) => {
  const stmt = db.prepare('SELECT * FROM customer_pool ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/customer-pool', (req, res) => {
  const { name, phone, source, area, budget, demand, lost_reason, lost_date } = req.body;
  const stmt = db.prepare('INSERT INTO customer_pool (name, phone, source, area, budget, demand, lost_reason, lost_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(name, phone, source, area, budget, demand, lost_reason, lost_date);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.delete('/api/customer-pool/:id', (req, res) => {
  db.prepare('DELETE FROM customer_pool WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 楼盘管理
app.get('/api/buildings', (req, res) => {
  const stmt = db.prepare('SELECT * FROM buildings ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/buildings', (req, res) => {
  const { name, address, area, building_type, total_houses, developer, property_fee, status } = req.body;
  const stmt = db.prepare('INSERT INTO buildings (name, address, area, building_type, total_houses, developer, property_fee, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(name, address, area, building_type, total_houses, developer, property_fee, status || '在售');
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/buildings/:id', (req, res) => {
  const { name, address, area, building_type, total_houses, developer, property_fee, status } = req.body;
  db.prepare('UPDATE buildings SET name=?, address=?, area=?, building_type=?, total_houses=?, developer=?, property_fee=?, status=? WHERE id=?')
    .run(name, address, area, building_type, total_houses, developer, property_fee, status, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/buildings/:id', (req, res) => {
  db.prepare('DELETE FROM buildings WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 渠道管理
app.get('/api/channels', (req, res) => {
  const stmt = db.prepare('SELECT * FROM channels ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/channels', (req, res) => {
  const { name, type, contact_person, contact_phone, address, commission_rate, status, remark } = req.body;
  const stmt = db.prepare('INSERT INTO channels (name, type, contact_person, contact_phone, address, commission_rate, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(name, type, contact_person, contact_phone, address, commission_rate || 0, status || '合作中', remark);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/channels/:id', (req, res) => {
  const { name, type, contact_person, contact_phone, address, commission_rate, status, remark } = req.body;
  db.prepare('UPDATE channels SET name=?, type=?, contact_person=?, contact_phone=?, address=?, commission_rate=?, status=?, remark=? WHERE id=?')
    .run(name, type, contact_person, contact_phone, address, commission_rate, status, remark, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/channels/:id', (req, res) => {
  db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 营销案例
app.get('/api/marketing-cases', (req, res) => {
  const stmt = db.prepare('SELECT * FROM marketing_cases ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/marketing-cases', (req, res) => {
  const { title, building_name, area, style, budget, cost, images, description, status, publish_date } = req.body;
  const stmt = db.prepare('INSERT INTO marketing_cases (title, building_name, area, style, budget, cost, images, description, status, publish_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(title, building_name, area, style, budget, cost, JSON.stringify(images || []), description, status || '草稿', publish_date);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/marketing-cases/:id', (req, res) => {
  const { title, building_name, area, style, budget, cost, images, description, status, publish_date } = req.body;
  db.prepare('UPDATE marketing_cases SET title=?, building_name=?, area=?, style=?, budget=?, cost=?, images=?, description=?, status=?, publish_date=? WHERE id=?')
    .run(title, building_name, area, style, budget, cost, JSON.stringify(images || []), description, status, publish_date, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/marketing-cases/:id', (req, res) => {
  db.prepare('DELETE FROM marketing_cases WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 供应商管理
app.get('/api/suppliers', (req, res) => {
  const stmt = db.prepare('SELECT * FROM suppliers ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/suppliers', (req, res) => {
  const { name, type, contact_person, contact_phone, address, bank_account, tax_number, status, remark } = req.body;
  const stmt = db.prepare('INSERT INTO suppliers (name, type, contact_person, contact_phone, address, bank_account, tax_number, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(name, type, contact_person, contact_phone, address, bank_account, tax_number, status || '合作中', remark);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/suppliers/:id', (req, res) => {
  const { name, type, contact_person, contact_phone, address, bank_account, tax_number, status, remark } = req.body;
  db.prepare('UPDATE suppliers SET name=?, type=?, contact_person=?, contact_phone=?, address=?, bank_account=?, tax_number=?, status=?, remark=? WHERE id=?')
    .run(name, type, contact_person, contact_phone, address, bank_account, tax_number, status, remark, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/suppliers/:id', (req, res) => {
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 采购单
app.get('/api/purchases', (req, res) => {
  const stmt = db.prepare('SELECT * FROM purchases ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/purchases', (req, res) => {
  const { purchase_no, supplier_id, supplier_name, project_id, project_name, total_amount, status, purchase_date, expected_date, operator, remark } = req.body;
  const stmt = db.prepare('INSERT INTO purchases (purchase_no, supplier_id, supplier_name, project_id, project_name, total_amount, status, purchase_date, expected_date, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(purchase_no, supplier_id, supplier_name, project_id, project_name, total_amount || 0, status || '待审核', purchase_date, expected_date, operator, remark);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/purchases/:id', (req, res) => {
  const { total_amount, paid_amount, status, remark } = req.body;
  db.prepare('UPDATE purchases SET total_amount=?, paid_amount=?, status=?, remark=? WHERE id=?')
    .run(total_amount, paid_amount, status, remark, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/purchases/:id', (req, res) => {
  db.prepare('DELETE FROM purchases WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 成本记录
app.get('/api/cost-records', (req, res) => {
  const stmt = db.prepare('SELECT * FROM cost_records ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.get('/api/cost-records/project/:projectId', (req, res) => {
  const stmt = db.prepare('SELECT * FROM cost_records WHERE project_id = ? ORDER BY date DESC');
  res.json(stmt.all(req.params.projectId));
});

app.post('/api/cost-records', (req, res) => {
  const { project_id, project_name, type, category, amount, date, operator, invoice_status, remark } = req.body;
  const stmt = db.prepare('INSERT INTO cost_records (project_id, project_name, type, category, amount, date, operator, invoice_status, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(project_id, project_name, type, category, amount, date, operator, invoice_status || '未开票', remark);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.delete('/api/cost-records/:id', (req, res) => {
  db.prepare('DELETE FROM cost_records WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 整改问题
app.get('/api/rectification-issues', (req, res) => {
  const stmt = db.prepare('SELECT * FROM rectification_issues ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/rectification-issues', (req, res) => {
  const { inspection_id, project_id, project_name, issue_desc, priority, status, responsible_id, responsible_name, due_date, images, remark } = req.body;
  const stmt = db.prepare('INSERT INTO rectification_issues (inspection_id, project_id, project_name, issue_desc, priority, status, responsible_id, responsible_name, due_date, images, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(inspection_id, project_id, project_name, issue_desc, priority || '普通', status || '待处理', responsible_id, responsible_name, due_date, JSON.stringify(images || []), remark);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/rectification-issues/:id', (req, res) => {
  const { status, finish_date, remark } = req.body;
  db.prepare('UPDATE rectification_issues SET status=?, finish_date=?, remark=? WHERE id=?')
    .run(status, finish_date, remark, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/rectification-issues/:id', (req, res) => {
  db.prepare('DELETE FROM rectification_issues WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 考勤管理
app.get('/api/attendance', (req, res) => {
  const { employee_id, date } = req.query;
  let sql = 'SELECT * FROM attendance WHERE 1=1';
  const params = [];
  if (employee_id) { sql += ' AND employee_id = ?'; params.push(employee_id); }
  if (date) { sql += ' AND date = ?'; params.push(date); }
  sql += ' ORDER BY date DESC, check_in_time DESC';
  const stmt = db.prepare(sql);
  res.json(stmt.all(...params));
});

app.post('/api/attendance', (req, res) => {
  const { employee_id, employee_name, date, check_in_time, check_out_time, work_hours, status, type, remark } = req.body;
  const stmt = db.prepare('INSERT INTO attendance (employee_id, employee_name, date, check_in_time, check_out_time, work_hours, status, type, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(employee_id, employee_name, date, check_in_time, check_out_time, work_hours || 0, status || '正常', type || '上班', remark);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.delete('/api/attendance/:id', (req, res) => {
  db.prepare('DELETE FROM attendance WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 售后维保
app.get('/api/warranties', (req, res) => {
  const stmt = db.prepare('SELECT * FROM warranties ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/warranties', (req, res) => {
  const { project_id, project_name, customer_name, customer_phone, type, description, images, status, handle_user, handle_date, result, satisfaction, cost } = req.body;
  const stmt = db.prepare('INSERT INTO warranties (project_id, project_name, customer_name, customer_phone, type, description, images, status, handle_user, handle_date, result, satisfaction, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result2 = stmt.run(project_id, project_name, customer_name, customer_phone, type, description, JSON.stringify(images || []), status || '待处理', handle_user, handle_date, result, satisfaction, cost || 0);
  res.json({ id: result2.lastInsertRowid, message: '添加成功' });
});

app.put('/api/warranties/:id', (req, res) => {
  const { status, handle_date, result, satisfaction, cost, remark } = req.body;
  db.prepare('UPDATE warranties SET status=?, handle_date=?, result=?, satisfaction=?, cost=?, remark=? WHERE id=?')
    .run(status, handle_date, result, satisfaction, cost, remark, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/warranties/:id', (req, res) => {
  db.prepare('DELETE FROM warranties WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 设计量房
app.get('/api/design-measurements', (req, res) => {
  const stmt = db.prepare('SELECT * FROM design_measurements ORDER BY created_at DESC');
  res.json(stmt.all());
});

app.post('/api/design-measurements', (req, res) => {
  const { customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status, drawings, remark } = req.body;
  const stmt = db.prepare('INSERT INTO design_measurements (customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status, drawings, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(customer_id, customer_name, building_name, house_number, area, layout, measure_date, designer, status || '待测量', drawings, remark);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

app.put('/api/design-measurements/:id', (req, res) => {
  const { status, drawings, remark } = req.body;
  db.prepare('UPDATE design_measurements SET status=?, drawings=?, remark=? WHERE id=?')
    .run(status, drawings, remark, req.params.id);
  res.json({ message: '更新成功' });
});

app.delete('/api/design-measurements/:id', (req, res) => {
  db.prepare('DELETE FROM design_measurements WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// Boss看板数据
app.get('/api/boss-dashboard', (req, res) => {
  // 汇总统计数据
  const today = new Date().toISOString().split('T')[0];
  
  const customerStats = {
    total: db.prepare('SELECT COUNT(*) as count FROM customers').get().count,
    today: db.prepare("SELECT COUNT(*) as count FROM customers WHERE DATE(created_at) = ?").get(today)?.count || 0,
    thisMonth: db.prepare("SELECT COUNT(*) as count FROM customers WHERE DATE_FORMAT(created_at, '%Y-%m') = ?").get(today.substring(0, 7))?.count || 0
  };
  
  const contractStats = {
    total: db.prepare('SELECT COUNT(*) as count FROM contracts').get().count,
    signed: db.prepare("SELECT COUNT(*) as count FROM contracts WHERE status = '已签订'").get().count,
    totalAmount: db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM contracts WHERE status = '已签订'").get().total
  };
  
  const projectStats = {
    total: db.prepare('SELECT COUNT(*) as count FROM projects').get().count,
    active: db.prepare("SELECT COUNT(*) as count FROM projects WHERE status NOT IN ('已完工', '已终止')").get().count,
    finished: db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = '已完工'").get().count
  };
  
  const financeStats = {
    income: db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'income'").get().total,
    expense: db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'expense'").get().total,
    thisMonthIncome: db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'income' AND DATE_FORMAT(date, '%Y-%m') = ?").get(today.substring(0, 7))?.total || 0,
    thisMonthExpense: db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM finance WHERE type = 'expense' AND DATE_FORMAT(date, '%Y-%m') = ?").get(today.substring(0, 7))?.total || 0
  };
  
  const warehouseStats = {
    totalMaterials: db.prepare('SELECT COUNT(*) as count FROM materials').get().count,
    lowStock: db.prepare('SELECT COUNT(*) as count FROM materials WHERE quantity <= min_stock').get().count,
    totalValue: db.prepare('SELECT COALESCE(SUM(quantity * cost_price), 0) as total FROM materials').get().total
  };
  
  const employeeStats = {
    total: db.prepare("SELECT COUNT(*) as count FROM employees WHERE status = '在职'").get().count
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
app.get('/api/contract-variables', (req, res) => {
  const stmt = db.prepare('SELECT * FROM contract_variables ORDER BY id');
  res.json(stmt.all());
});

app.post('/api/contract-variables', (req, res) => {
  const { name, label, description } = req.body;
  if (!name || !label) {
    return res.json({ success: false, message: '变量名和显示名必填' });
  }
  const stmt = db.prepare('INSERT INTO contract_variables (name, label, description) VALUES (?, ?, ?)');
  const result = stmt.run(name, label, description || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/contract-variables/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM contract_variables WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ success: true, message: '删除成功' });
});

// 创建变量表（如果不存在）
db.exec(`
  CREATE TABLE IF NOT EXISTS contract_variables (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

const existingVars = db.prepare('SELECT name FROM contract_variables').all();
const existingNames = existingVars.map(v => v.name);

defaultVars.forEach(v => {
  if (!existingNames.includes(v.name)) {
    db.prepare('INSERT INTO contract_variables (name, label) VALUES (?, ?)').run(v.name, v.label);
  }
});

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
const PUPPETEER_CONFIG = {
  executablePath: '/Users/gtamer/.cache/puppeteer/chrome/mac-131.0.6778.204/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
};

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

app.listen(PORT, () => {
  console.log(`🚀 装企云ERP系统后端运行在 http://localhost:${PORT}`);
});
