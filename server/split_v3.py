#!/usr/bin/env python3
"""
jianyioa server.js 精准拆分 v3 — 已知所有函数行号，精准提取
"""
import re, os, subprocess

BASE = '/Users/gtamer/Desktop/jianyioa-system/server'
SERVER = f'{BASE}/server.js'

with open(SERVER, 'r') as f:
    lines = f.readlines()

def get_block(start_line, end_line_exclusive=None):
    """按行号提取代码块（1-indexed）"""
    start = start_line - 1
    end = end_line_exclusive - 1 if end_line_exclusive else len(lines)
    return ''.join(lines[start:end])

print(f"文件总行数: {len(lines)}")

# ================================================================
# 1. middleware/auth.js
# getUserId(1632), isAdmin(1651), userPermCache+getUserPermissions(1662),
# hasReadAllPermission(1689), clearUserPermCache(1696), checkPermission(1702)
# ================================================================
middleware_auth = get_block(1630, 1716).strip()
middleware_auth = (
    "'use strict';\n\n"
    "const { pool } = require('../db-mysql-async');\n"
    "const db = require('../db-mysql-async');\n\n"
    + middleware_auth
    + "\n\nmodule.exports = { getUserId, isAdmin, getUserPermissions, hasReadAllPermission, clearUserPermCache, checkPermission };"
)
with open(f'{BASE}/middleware/auth.js', 'w') as f:
    f.write(middleware_auth)
print(f"middleware/auth.js: {len(middleware_auth)} chars")

# ================================================================
# 2. utils/addLog.js (1776-1792)
# ================================================================
addlog_code = get_block(1776, 1793).strip()
addlog_code = (
    "'use strict';\n\n"
    "const { pool } = require('../db-mysql-async');\n\n"
    + addlog_code
    + "\n\nmodule.exports = { addLog };"
)
with open(f'{BASE}/utils/addLog.js', 'w') as f:
    f.write(addlog_code)
print(f"utils/addLog.js: {len(addlog_code)} chars")

# ================================================================
# 3. utils/notify.js
# 通知规则配置(599) + notifyProject(618) + insertInAppNotification(837)
# + sendAppNotification(874) + sendSmsFromNotify(907) + sendApprovalNotification(3863)
# ================================================================
notify_block = (
    get_block(599, 618).strip() + "\n\n" +   # getDefaultNotificationRules
    get_block(618, 781).strip() + "\n\n" +   # notifyProject
    get_block(837, 875).strip() + "\n\n" +   # insertInAppNotification
    get_block(874, 908).strip() + "\n\n" +   # sendAppNotification
    get_block(907, 1214).strip() + "\n\n" +  # sendSmsFromNotify
    get_block(3863, 4784).strip()             # sendApprovalNotification
)
notify_code = (
    "'use strict';\n\n"
    "const { pool } = require('../db-mysql-async');\n"
    "const { sendAliyunSms } = require('./sms');\n\n"
    + notify_block
    + "\n\nmodule.exports = { notifyProject, insertInAppNotification, sendAppNotification, sendSmsFromNotify, sendApprovalNotification };"
)
with open(f'{BASE}/utils/notify.js', 'w') as f:
    f.write(notify_code)
print(f"utils/notify.js: {len(notify_code)} chars")

# ================================================================
# 4. utils/sms.js
# addAliyunSmsTemplate(5332) + sendAliyunSms(5379)
# ================================================================
sms_code = (
    "'use strict';\n\n"
    + get_block(5332, 5379).strip()
    + "\n\n"
    + get_block(5379, 5808).strip()
    + "\n\nmodule.exports = { addAliyunSmsTemplate, sendAliyunSms };"
)
with open(f'{BASE}/utils/sms.js', 'w') as f:
    f.write(sms_code)
print(f"utils/sms.js: {len(sms_code)} chars")

# ================================================================
# 5. 按行号范围分割路由 → 各 routes/*.js
# 策略：扫描所有路由，app.METHOD(...) 连续块 = 一个路由
# ================================================================

# 路由行号范围（根据 grep 分析的段落）
ROUTE_SECTIONS = [
    # (filename, start_line, end_line_exclusive, desc)
    ('routes/customers.js',   240,  1130,  '客户管理 family-members/customer'),
    ('routes/contracts.js',  1408, 1855,  '签约人/合同模板'),
    ('routes/system.js',      1856, 1905,  'system-logs/operation-logs'),
    ('routes/finance.js',     1906, 2000,  '预算/财务/dashboard'),
    ('routes/projects.js',    2001, 2270,  '项目管理/项目节点/项目日志'),
    ('routes/projects.js',    2430, 2510,  'quotes/材料'),
    ('routes/finance.js',     2515, 2600,  '材料出入库'),
    ('routes/finance.js',     2660, 2800,  '主材/batch-upsert/import'),
    ('routes/finance.js',     2860, 3080,  'material-orders'),
    ('routes/employees.js',   3152, 3205,  'dashboard stats'),
    ('routes/employees.js',   3206, 3240,  'departments简单版'),
    ('routes/employees.js',   3241, 3500,  'employees/roles/permissions'),
    ('routes/approvals.js',   3501, 3740,  '审批API'),
    ('routes/notifications.js', 3741, 3940, 'notifications/messages'),
    ('routes/reports.js',     3941, 4020,  'reports/notices'),
    ('routes/reports.js',     4080, 4200,  'inspections/acceptance'),
    ('routes/erp.js',         4201, 4300,  '派工invoices'),
    ('routes/erp.js',         4301, 4635,  'ERP扩展: 公海/楼盘/渠道/供应商/采购/成本/整改/考勤/维保/量房'),
    ('routes/system.js',       4668, 4750,  'boss-dashboard'),
    ('routes/system.js',       4751, 4800,  'PDF生成'),
    ('routes/erp.js',          4801, 4900,  '更多ERP'),
    ('routes/erp.js',          4901, 4980,  'getBrowser'),
    ('routes/system.js',       4981, 5330,  '短信模板/同步阿里云/发送短信/PDF导出'),
    ('routes/erp.js',          5801, 5885,  '微信相关函数'),
    ('routes/system.js',       5885, 5920,  'getSetting/saveSetting'),
    ('routes/system.js',       5921, 6010,  '更多系统API'),
    ('routes/system.js',       6011, 6110,  '微信配置API'),
    ('routes/system.js',       6111, 6170,  '更多API'),
    ('routes/system.js',       6171, 6200,  '文件上传配置'),
    ('routes/system.js',       6201, 6243,  '最后一个路由段落'),
]

def lines_to_code(start, end_excl):
    """提取行号范围的代码，处理 app. -> router. 转换"""
    code = get_block(start, end_excl)
    # 转换 app.METHOD -> router.METHOD
    code = re.sub(r'^(\s*)app\.', r'\1router.', code, flags=re.MULTILINE)
    return code

def make_router(filename, sections):
    """从多个行号范围生成路由文件"""
    requires = [
        "'use strict';",
        "",
        "const express = require('express');",
        "const router = express.Router();",
        "",
        "const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');",
        "const { addLog } = require('../utils/addLog');",
        "const { pool } = require('../db-mysql-async');",
        "const { db } = require('../db-mysql-async');",
        "const { notifyProject, sendApprovalNotification, sendAppNotification, insertInAppNotification } = require('../utils/notify');",
        "const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');",
        "",
    ]
    all_code = '\n'.join(requires)
    
    for s_start, s_end, desc in sections:
        chunk = lines_to_code(s_start, s_end).strip()
        if chunk:
            all_code += f'\n// ---- {desc} ----\n' + chunk + '\n'
    
    all_code += '\nmodule.exports = router;'
    
    filepath = f'{BASE}/{filename}'
    with open(filepath, 'w') as f:
        f.write(all_code)
    return len(all_code), all_code.count('\n')

# 先删除旧文件
for fname in ['auth.js','customers.js','contracts.js','projects.js','approvals.js',
              'finance.js','employees.js','notifications.js','reports.js',
              'system.js','erp.js','upload.js']:
    p = f'{BASE}/routes/{fname}'
    if os.path.exists(p):
        os.remove(p)

# 创建路由文件
FILES = {
    'routes/customers.js':   [(240, 1130, '客户管理 family-members/customer')],
    'routes/contracts.js':   [(1408, 1855, '签约人/合同模板')],
    'routes/system.js':      [
        (1856, 1905, 'system-logs/operation-logs'),
        (4668, 4750, 'boss-dashboard'),
        (4751, 4800, 'PDF生成'),
        (4981, 5330, '短信模板/阿里云/发送/PDF'),
        (5801, 5885, '微信函数'),
        (5885, 5920, 'getSetting/saveSetting'),
        (5921, 6010, '更多系统API'),
        (6011, 6170, '微信配置'),
        (6171, 6200, '更多API'),
        (6201, 6243, '最后段落'),
    ],
    'routes/finance.js':     [
        (1906, 2000, '预算/财务/dashboard'),
        (2515, 2600, '材料出入库'),
        (2660, 2800, '主材/batch-upsert'),
        (2860, 3080, 'material-orders'),
    ],
    'routes/projects.js':     [
        (2001, 2270, '项目管理/节点/日志'),
        (2430, 2510, 'quotes/材料'),
    ],
    'routes/employees.js':   [
        (3152, 3205, 'dashboard stats'),
        (3206, 3240, 'departments'),
        (3241, 3500, 'employees/roles/permissions'),
    ],
    'routes/approvals.js':   [(3501, 3740, '审批API')],
    'routes/notifications.js': [(3741, 3940, 'notifications/messages')],
    'routes/reports.js':     [
        (3941, 4020, 'reports/notices'),
        (4080, 4200, 'inspections/acceptance'),
    ],
    'routes/erp.js':         [
        (4201, 4300, '派工/发票'),
        (4301, 4635, 'ERP扩展:公海/楼盘/渠道/供应商/采购/成本/整改/考勤/维保/量房'),
        (4801, 4900, '更多ERP'),
        (4901, 4980, 'getBrowser'),
    ],
}

for fname, sections in FILES.items():
    size, nlines = make_router(fname, sections)
    print(f"{fname}: {size} chars, {nlines} lines")

# ================================================================
# 6. 生成新 server.js
# ================================================================
# 顶部：require + 中间件
top = get_block(1, 123).strip()  # require + 开头

# 中间件部分（123-结构体结束）
# 找到 "const pool = " 或 "const db = new Database"
pool_pos = None
for i, line in enumerate(lines):
    if 'const pool = ' in line or 'const db = new Database' in line:
        pool_pos = i
        break

# 中间件结束位置（找第一个 app. 路由）
first_app_line = None
for i, line in enumerate(lines):
    if re.match(r'\s*app\.(get|post|put|delete|use)\(', line):
        first_app_line = i
        break

print(f"中间件结束行: {first_app_line+1}, pool行: {pool_pos+1 if pool_pos else 'not found'}")

# 提取中间件（去掉函数定义，因为函数移到其他文件了）
middleware_section = ''.join(lines[pool_pos:first_app_line])

# 全局日志中间件
syslog_start = None
for i, line in enumerate(lines):
    if '全局系统日志中间件' in line:
        syslog_start = i
        break

# 构建新 server.js
new_server = """'use strict';

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const { Pool } = require('mysql2/promise');

const app = express();

// ---- 中间件 ----
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// 文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---- 数据库 ----
"""

# 添加 pool 定义（从原始代码）
pool_def_start = None
for i, line in enumerate(lines):
    if 'const pool = new Pool' in line or 'const mysqlPool' in line:
        pool_def_start = i
        break
if pool_def_start is None:
    for i, line in enumerate(lines):
        if 'const pool = ' in line:
            pool_def_start = i
            break

if pool_def_start is not None:
    # 找到 pool 定义的结束（到分号）
    pool_end = pool_def_start
    while pool_end < len(lines) and ');' not in lines[pool_end]:
        pool_end += 1
    pool_end += 1
    pool_code = ''.join(lines[pool_def_start:pool_end])
    new_server += pool_code + '\n'

new_server += """
const db = require('./db-mysql-async');

// ---- 工具函数（从模块加载）----
const { getUserId, isAdmin, getUserPermissions, hasReadAllPermission, clearUserPermCache, checkPermission } = require('./middleware/auth');
const { addLog } = require('./utils/addLog');
const { notifyProject, sendApprovalNotification, sendAppNotification, insertInAppNotification } = require('./utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('./utils/sms');

// ---- 数据库初始化 ----
"""

# 添加 initDatabase
initdb_start = None
for i, line in enumerate(lines):
    if 'async function initDatabase' in line:
        initdb_start = i
        break

if initdb_start:
    # 找函数结束
    depth = 0
    initdb_end = initdb_start
    for i in range(initdb_start, len(lines)):
        for ch in lines[i]:
            if ch == '{': depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    initdb_end = i + 1
                    break
        if depth == 0:
            break
    initdb_code = ''.join(lines[initdb_start:initdb_end])
    new_server += initdb_code + '\n'

new_server += """
// ---- 路由注册 ----
"""

# 路由 require
route_reg = """
const authRoutes = require('./routes/auth');
const customersRoutes = require('./routes/customers');
const contractsRoutes = require('./routes/contracts');
const projectsRoutes = require('./routes/projects');
const approvalsRoutes = require('./routes/approvals');
const financeRoutes = require('./routes/finance');
const employeesRoutes = require('./routes/employees');
const notificationsRoutes = require('./routes/notifications');
const reportsRoutes = require('./routes/reports');
const systemRoutes = require('./routes/system');
const erpRoutes = require('./routes/erp');

// 路由映射（路径前缀 -> 路由文件）
// 注意：较长路径要放在前面，避免被短路径前缀匹配
const routeMappings = [
  ['/api/customers/login', authRoutes],
  ['/api/employees/login', authRoutes],
  ['/api/customers', customersRoutes],
  ['/api/customer-follow', customersRoutes],
  ['/api/customer-pool', customersRoutes],
  ['/api/contracts', contractsRoutes],
  ['/api/contract-templates', contractsRoutes],
  ['/api/signers', contractsRoutes],
  ['/api/projects', projectsRoutes],
  ['/api/project-stages', projectsRoutes],
  ['/api/project-logs', projectsRoutes],
  ['/api/quotes', projectsRoutes],
  ['/api/progress-node-templates', projectsRoutes],
  ['/api/progress-nodes', projectsRoutes],
  ['/api/my/logs', projectsRoutes],
  ['/api/approvals', approvalsRoutes],
  ['/api/budgets', financeRoutes],
  ['/api/finance', financeRoutes],
  ['/api/dashboard', financeRoutes],
  ['/api/materials', financeRoutes],
  ['/api/main-materials', financeRoutes],
  ['/api/material-orders', financeRoutes],
  ['/api/departments', employeesRoutes],
  ['/api/employees', employeesRoutes],
  ['/api/roles', employeesRoutes],
  ['/api/permissions', employeesRoutes],
  ['/api/user/info', employeesRoutes],
  ['/api/notifications', notificationsRoutes],
  ['/api/messages', notificationsRoutes],
  ['/api/notices', notificationsRoutes],
  ['/api/reports', reportsRoutes],
  ['/api/inspections', reportsRoutes],
  ['/api/my/inspections', reportsRoutes],
  ['/api/acceptance', reportsRoutes],
  ['/api/dispatches', reportsRoutes],
  ['/api/invoices', reportsRoutes],
  ['/api/system-logs', systemRoutes],
  ['/api/operation-logs', systemRoutes],
  ['/api/debug', systemRoutes],
  ['/api/health', systemRoutes],
  ['/api/sms-templates', systemRoutes],
  ['/api/sms-send', systemRoutes],
  ['/api/system-settings', systemRoutes],
  ['/api/wechat', systemRoutes],
  ['/api/buildings', erpRoutes],
  ['/api/channels', erpRoutes],
  ['/api/marketing-cases', erpRoutes],
  ['/api/suppliers', erpRoutes],
  ['/api/purchases', erpRoutes],
  ['/api/cost-records', erpRoutes],
  ['/api/rectification-issues', erpRoutes],
  ['/api/attendance', erpRoutes],
  ['/api/warranties', erpRoutes],
  ['/api/design-measurements', erpRoutes],
  ['/api/boss-dashboard', systemRoutes],
];

// 按路径长度降序排列，确保长路径优先匹配
routeMappings.sort((a, b) => b[0].length - a[0].length);

for (const [prefix, router] of routeMappings) {
  app.use(prefix, router);
}

// ---- 启动 ----
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`jianyioa server running on port ${PORT}`));
"""

new_server += route_reg

with open(f'{BASE}/server_new.js', 'w') as f:
    f.write(new_server)

result = subprocess.run(['node', '--check', f'{BASE}/server_new.js'], capture_output=True, text=True)
if result.returncode == 0:
    print(f"\n✅ server_new.js 语法通过: {len(new_server)} chars, {new_server.count(chr(10))} lines")
else:
    print(f"\n❌ 语法错误:\n{result.stderr[:1000]}")

print("\n拆分完成！")
print("\n各文件大小:")
for path, dirs, files in os.walk(f'{BASE}/routes'):
    for fn in sorted(files):
        fp = os.path.join(path, fn)
        print(f"  {fp}: {os.path.getsize(fp)} bytes")
for fn in ['middleware/auth.js', 'utils/addLog.js', 'utils/notify.js', 'utils/sms.js']:
    fp = f'{BASE}/{fn}'
    if os.path.exists(fp):
        print(f"  {fp}: {os.path.getsize(fp)} bytes")
