#!/usr/bin/env python3
"""
jianyioa server.js 精准拆分脚本 v2
策略：先提取辅助函数，再按路由路径前缀分配段落
"""
import re
import os
import subprocess

BASE = os.path.dirname(os.path.abspath(__file__))
IN_FILE = os.path.join(BASE, 'server.js')
BACKUP_FILE = os.path.join(BASE, 'server.js.bak2')

# 备份
with open(IN_FILE, 'r') as f:
    original = f.read()
with open(BACKUP_FILE, 'w') as f:
    f.write(original)
print(f"备份到 server.js.bak2，原始: {len(original)} chars")

# ============================================================
# 1. 找到 db = new Database() 的位置作为分界线
# ============================================================
db_match = re.search(r'\nconst db = new Database\(\);', original)
top_end = db_match.end()  # 包含换行符
MIDDLE_MARKER = '\n___MIDDLE___'  # 用来分割两部分的标记

# ============================================================
# 2. 找到权限函数们（getUserId, isAdmin, checkPermission 等）
# ============================================================
top_code = original[:top_end]
rest_code = original[top_end:]

# 提取所有 async function xxx 和 function xxx 定义（跳过 arrow functions）
# 找到顶部区域的辅助函数（非路由处理函数）
func_def_pattern = re.compile(r'^(async )?function (\w+)\(', re.MULTILINE)

perm_funcs = {}
all_funcs = {}

# 扫描顶部找函数
for m in func_def_pattern.finditer(top_code):
    fname = m.group(2)
    start = m.start()
    # 找函数体（简单括号计数）
    brace_start = top_code.index('{', m.end() - 1)
    depth = 1
    pos = brace_start + 1
    while depth > 0 and pos < len(top_code):
        if top_code[pos] == '{': depth += 1
        elif top_code[pos] == '}': depth -= 1
        pos += 1
    func_body = top_code[start:pos]
    all_funcs[fname] = func_body

# 这些是需要保留在 middleware/auth.js 的函数
perm_func_names = ['getUserId', 'isAdmin', 'hasReadAllPermission', 'checkPermission',
                   'getCurrentUser', 'hasPermission', 'ensureSystemLogTable',
                   'getUserName', 'getUserPhone', 'generateRandomPassword', 'passwordFromPhone']

# ============================================================
# 3. 提取 addLog 函数
# ============================================================
addlog_func = all_funcs.get('addLog', None)
print(f"addLog: {'找到' if addlog_func else '未找到'}")
for k, v in all_funcs.items():
    if 'log' in k.lower():
        print(f"  类似函数: {k}")

# 找 addLog 的实际位置
addlog_search = re.search(r'(// ==================== 操作日志写入[^\n]*\n.*?\n)(?=\n// [=]{10,}模块|__MIDDLE)', original, re.DOTALL)
if not addlog_search:
    # 找 addLog 函数定义
    for k, v in all_funcs.items():
        if 'addLog' in k or 'add' in k.lower():
            print(f"  可能的日志函数: {k}")

# ============================================================
# 4. 读取 server.js 找到所有 app.METHOD 路由
# ============================================================
routes = []  # (method, path, start_line, end_line, code)

# 用行号来追踪
lines = original.split('\n')
in_route = False
current_route = None  # (method, path, lines_list)

route_pattern = re.compile(r"^\s*app\.(get|post|put|delete|patch|use)\(['\"]([^'\"]+)['\"]")

i = 0
while i < len(lines):
    line = lines[i]
    m = route_pattern.match(line)
    if m:
        # 保存上一个路由
        if current_route:
            routes.append(current_route)
        method = m.group(1)
        path = m.group(2)
        current_route = [method, path, i, i+1, [line]]
        in_route = True
    elif in_route and current_route:
        current_route[4].append(line)
        current_route[3] = i + 1
        # 检测是否到下一个路由或段落注释
        if route_pattern.match(line.strip()):
            routes.append(current_route)
            method = route_pattern.match(line.strip()).group(1)
            path = route_pattern.match(line.strip()).group(2)
            current_route = [method, path, i, i+1, [line]]
        # 段落注释（新段落开始）
        elif re.match(r'^// [=]{10,}', line.strip()) and len(current_route[4]) > 3:
            routes.append(current_route)
            current_route = None
            in_route = False
    i += 1

if current_route:
    routes.append(current_route)

print(f"\n找到 {len(routes)} 个路由定义")

# ============================================================
# 5. 按路径前缀分组
# ============================================================
GROUPS = {
    'auth': ['/api/employees/login', '/api/customers/login'],
    'customers': ['/api/customers', '/api/customer-follow', '/api/customer-pool', '/api/customer-follow'],
    'contracts': ['/api/contracts', '/api/contract-templates', '/api/signers', '/api/contracts/upload-word'],
    'projects': ['/api/projects', '/api/project-stages', '/api/project-logs', '/api/project-log', '/api/my/logs', '/api/quotes', '/api/progress-node-templates', '/api/progress-nodes', '/api/progress-node-template-nodes'],
    'approvals': ['/api/approvals'],
    'finance': ['/api/budgets', '/api/finance', '/api/dashboard', '/api/boss-dashboard'],
    'warehouse': ['/api/materials', '/api/main-materials', '/api/material-orders', '/api/material', '/api/material/purchase'],
    'employees': ['/api/departments', '/api/employees', '/api/roles', '/api/permissions', '/api/user/info', '/api/employees/grouped'],
    'notifications': ['/api/notifications', '/api/messages', '/api/notices', '/api/debug-notify'],
    'reports': ['/api/reports', '/api/inspections', '/api/my/inspections', '/api/acceptance', '/api/dispatches', '/api/invoices'],
    'system': ['/api/system-logs', '/api/operation-logs', '/api/debug', '/api/health', '/api/progress-node-templates', '/api/progress-node-template-nodes', '/api/sms-templates', '/api/sms-send'],
    'erp': ['/api/buildings', '/api/channels', '/api/marketing-cases', '/api/suppliers', '/api/purchases', '/api/cost-records', '/api/rectification-issues', '/api/attendance', '/api/warranties', '/api/design-measurements'],
    'upload': ['/api/upload-image', '/api/upload-pdf', '/api/delete-images'],
}

def get_group(path):
    for group_name, prefixes in GROUPS.items():
        for prefix in prefixes:
            if path.startswith(prefix) or path == prefix:
                return group_name
    # 特殊处理
    if '/sms' in path or '/progress-node' in path:
        return 'system'
    if '/login' in path:
        return 'auth'
    return None

# ============================================================
# 6. 将路由分配到各文件
# ============================================================
grouped = {g: [] for g in GROUPS}
unassigned = []

for method, path, start, end, code_lines in routes:
    grp = get_group(path)
    if grp:
        grouped[grp].append((method, path, start, end, code_lines))
    else:
        unassigned.append((method, path, start, end))
        print(f"  未分配: {method} {path}")

print("\n分组情况:")
for g, rs in grouped.items():
    print(f"  {g}: {len(rs)} 个路由")

# ============================================================
# 7. 生成各路由文件
# ============================================================
os.makedirs(os.path.join(BASE, 'routes'), exist_ok=True)
os.makedirs(os.path.join(BASE, 'middleware'), exist_ok=True)
os.makedirs(os.path.join(BASE, 'utils'), exist_ok=True)

def gen_router(group_name, routes_list):
    """生成一个路由文件"""
    lines_out = [
        "'use strict';",
        "",
        "const express = require('express');",
        "const router = express.Router();",
        "",
        "const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');",
        "const { addLog } = require('../utils/addLog');",
        "const { pool } = require('../db-mysql-async');",
        "const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');",
        "const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');",
        "",
    ]
    
    for method, path, start, end, code_lines in routes_list:
        # 把 app.METHOD 改成 router.METHOD
        new_lines = []
        for line in code_lines:
            new_line = re.sub(r'^(\s*)app\.', r'\1router.', line)
            new_lines.append(new_line)
        lines_out.extend(new_lines)
        lines_out.append('')
    
    lines_out.append('module.exports = router;')
    content = '\n'.join(lines_out)
    
    filepath = os.path.join(BASE, f'routes/{group_name}.js')
    with open(filepath, 'w') as f:
        f.write(content)
    
    return len(content), len(lines_out)

print("\n生成路由文件:")
for g, rs in grouped.items():
    if rs:
        size, nlines = gen_router(g, rs)
        print(f"  routes/{g}.js: {size} chars, {nlines} lines")

# ============================================================
# 8. 生成 middleware/auth.js
# ============================================================
# 从 top_code 中提取所有辅助函数
middle_marker_pos = top_end
# top_code 包含 require + 中间件定义 + db初始化行
# 需要把权限函数提取出来

# 找所有函数定义（在顶部区域，即第一个 app.use/app.get 之前）
# 找到第一个 app. 的位置
first_app = re.search(r'\napp\.', top_code)
if first_app:
    helper_code = top_code[:first_app.start()]
else:
    helper_code = top_code

# 从 helper_code 中提取函数
func_bodies = []
func_names_found = set()
# 找所有函数
for m in re.finditer(r'^(async )?function (\w+)\(', helper_code, re.MULTILINE):
    fname = m.group(2)
    if fname in func_names_found:
        continue
    func_names_found.add(fname)
    # 提取函数体
    brace = helper_code.index('{', m.end() - 1)
    depth = 1
    pos = brace + 1
    while depth > 0 and pos < len(helper_code):
        if helper_code[pos] == '{': depth += 1
        elif helper_code[pos] == '}': depth -= 1
        pos += 1
    func_bodies.append(helper_code[m.start():pos])

# 也需要 pool 的定义
pool_def = re.search(r'(const pool = .*?;.*?\n)', top_code, re.DOTALL)
pool_code = pool_def.group(1) if pool_def else "const pool = null; // TODO\n"

# 找 addLog 函数（从顶部或中间部分）
addlog_search = re.search(
    r'(// ==================== 操作日志写入[^\n]*\n(?:.*?\n)*?)(?=\n// [=]{10,}模块)',
    original, re.DOTALL
)
addlog_code = addlog_search.group(1).strip() if addlog_search else ''

# 找 notifyProject 等通知函数
notify_start = re.search(r'// ==================== 通用通知函数', original)
notify_end = re.search(r'// ==================== 通知短信发送函数', original)
notify_code = original[notify_start.start():notify_end.start()] if notify_start and notify_end else ''

# 找阿里云短信函数
sms_funcs_start = re.search(r'// ==================== 阿里云添加模板 API', original)
sms_funcs_end = re.search(r'// ==================== 短信发送 API', original)
aliyun_code = original[sms_funcs_start.start():sms_funcs_end.start()] if sms_funcs_start and sms_funcs_end else ''

# 找 notifyProject 实现（中间那段）
np_middle = re.search(r'// ==================== 通用通知函数[^\n]*\n(.*?)(?=\n// ==================== 通知短信发送函数)', original, re.DOTALL)
notify_impl = np_middle.group(1).strip() if np_middle else ''

# ============================================================
# 生成 middleware/auth.js
# ============================================================
auth_content = "'use strict';\n\n"
auth_content += "const { pool } = require('../db-mysql-async');\n\n"
for body in func_bodies:
    auth_content += body + '\n\n'

with open(os.path.join(BASE, 'middleware/auth.js'), 'w') as f:
    f.write(auth_content)
print(f"\nmiddleware/auth.js: {len(auth_content)} chars, {auth_content.count(chr(10))} lines")

# ============================================================
# 生成 utils/addLog.js
# ============================================================
addlog_content = "'use strict';\n\n"
addlog_content += "const { pool } = require('../db-mysql-async');\n\n"
if addlog_code:
    addlog_content += addlog_code + '\n'
else:
    addlog_content += "// TODO: addLog function not found\n"

with open(os.path.join(BASE, 'utils/addLog.js'), 'w') as f:
    f.write(addlog_content)
print(f"utils/addLog.js: {len(addlog_content)} chars")

# ============================================================
# 生成 utils/notify.js
# ============================================================
# 需要找到 notifyProject 的完整实现 + sendApprovalNotification + insertInAppNotification + sendAppNotification
# 找到这些函数的定义
notif_funcs = ['notifyProject', 'sendApprovalNotification', 'sendAppNotification', 'insertInAppNotification']
notify_bodies = []

for fname in notif_funcs:
    m = re.search(rf'(?:async )?function {fname}\(', original)
    if m:
        brace = original.index('{', m.end() - 1)
        depth = 1
        pos = brace + 1
        while depth > 0 and pos < len(original):
            if original[pos] == '{': depth += 1
            elif original[pos] == '}': depth -= 1
            pos += 1
        notify_bodies.append(original[m.start():pos])

# 还需要 notifyProject 之前的通知规则默认配置
notif_config_start = re.search(r'// ==================== 通知规则默认配置', original)
notif_config_end = re.search(r'// ==================== 通用通知函数', original)
notif_config = original[notif_config_start.start():notif_config_end.start()] if notif_config_start and notif_config_end else ''

notify_content = "'use strict';\n\n"
notify_content += "const { pool } = require('../db-mysql-async');\n"
notify_content += "const { sendAliyunSms } = require('./sms');\n\n"
if notif_config:
    notify_content += notif_config.strip() + '\n\n'
for body in notify_bodies:
    notify_content += body + '\n\n'

with open(os.path.join(BASE, 'utils/notify.js'), 'w') as f:
    f.write(notify_content)
print(f"utils/notify.js: {len(notify_content)} chars")

# ============================================================
# 生成 utils/sms.js
# ============================================================
sms_content = "'use strict';\n\n"
if aliyun_code:
    sms_content += alyun_code.strip() + '\n\n'
else:
    sms_content += "// TODO: Aliyun SMS functions not found\n"

with open(os.path.join(BASE, 'utils/sms.js'), 'w') as f:
    f.write(sms_content)
print(f"utils/sms.js: {len(sms_content)} chars")

# ============================================================
# 生成新的 server.js
# ============================================================
# 新的 server.js 只需要：
# 1. require 基础模块
# 2. 中间件
# 3. 全局日志中间件
# 4. require 所有路由和工具
# 5. 启动监听

new_server = """'use strict';

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

const app = express();

// ---- 中间件 ----
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// 文件上传配置
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

// 静态文件
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---- 全局日志中间件 ----
"""

# 添加全局日志中间件（从原始代码提取）
syslog_m = re.search(r'(// ================================================================\n// 全局系统日志中间件.*?)(?=\n// ================================================================\n\nconst db)', original, re.DOTALL)
if syslog_m:
    new_server += syslog_m.group(1) + '\n'

new_server += """
// ---- 数据库初始化 ----
const { pool } = require('./db-mysql-async');
const db = require('./db-mysql-async').database; // SQLite adapter

async function initDatabase() {
"""

# 找 initDatabase 函数
initdb_m = re.search(r'(async function initDatabase\(\) \{.*)', original, re.DOTALL)
if initdb_m:
    initdb_code = initdb_m.group(1)
    # 找到函数结束
    brace = initdb_code.index('{')
    depth = 1
    pos = brace + 1
    while depth > 0 and pos < len(initdb_code):
        if initdb_code[pos] == '{': depth += 1
        elif initdb_code[pos] == '}': depth -= 1
        pos += 1
    new_server += initdb_code[:pos] + '\n'

new_server += """
  await initDatabase();

// ---- 路由 ----
const authRoutes = require('./routes/auth');
const customersRoutes = require('./routes/customers');
const contractsRoutes = require('./routes/contracts');
const projectsRoutes = require('./routes/projects');
const approvalsRoutes = require('./routes/approvals');
const financeRoutes = require('./routes/finance');
const warehouseRoutes = require('./routes/warehouse');
const employeesRoutes = require('./routes/employees');
const notificationsRoutes = require('./routes/notifications');
const reportsRoutes = require('./routes/reports');
const systemRoutes = require('./routes/system');
const erpRoutes = require('./routes/erp');
const uploadRoutes = require('./routes/upload');

// 路由注册
app.use('/api/employees/login', authRoutes);
app.use('/api/customers/login', authRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/customer-follow', customersRoutes);
app.use('/api/customer-pool', customersRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/contract-templates', contractsRoutes);
app.use('/api/signers', contractsRoutes);
app.use('/api/contracts/upload-word', contractsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/project-stages', projectsRoutes);
app.use('/api/project-logs', projectsRoutes);
app.use('/api/quotes', projectsRoutes);
app.use('/api/progress-node-templates', projectsRoutes);
app.use('/api/progress-nodes', projectsRoutes);
app.use('/api/progress-node-template-nodes', projectsRoutes);
app.use('/api/my/logs', projectsRoutes);
app.use('/api/approvals', approvalsRoutes);
app.use('/api/budgets', financeRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/dashboard', financeRoutes);
app.use('/api/boss-dashboard', financeRoutes);
app.use('/api/materials', warehouseRoutes);
app.use('/api/main-materials', warehouseRoutes);
app.use('/api/material-orders', warehouseRoutes);
app.use('/api/material', warehouseRoutes);
app.use('/api/departments', employeesRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/roles', employeesRoutes);
app.use('/api/permissions', employeesRoutes);
app.use('/api/user/info', employeesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/messages', notificationsRoutes);
app.use('/api/notices', notificationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/inspections', reportsRoutes);
app.use('/api/my/inspections', reportsRoutes);
app.use('/api/acceptance', reportsRoutes);
app.use('/api/dispatches', reportsRoutes);
app.use('/api/invoices', reportsRoutes);
app.use('/api/system-logs', systemRoutes);
app.use('/api/operation-logs', systemRoutes);
app.use('/api/debug', systemRoutes);
app.use('/api/health', systemRoutes);
app.use('/api/sms-templates', systemRoutes);
app.use('/api/sms-send', systemRoutes);
app.use('/api/buildings', erpRoutes);
app.use('/api/channels', erpRoutes);
app.use('/api/marketing-cases', erpRoutes);
app.use('/api/suppliers', erpRoutes);
app.use('/api/purchases', erpRoutes);
app.use('/api/cost-records', erpRoutes);
app.use('/api/rectification-issues', erpRoutes);
app.use('/api/attendance', erpRoutes);
app.use('/api/warranties', erpRoutes);
app.use('/api/design-measurements', erpRoutes);
app.use('/api/upload-image', uploadRoutes);
app.use('/api/upload-pdf', uploadRoutes);
app.use('/api/delete-images', uploadRoutes);

// ---- 启动 ----
const PORT = process.env.PORT || 3002;
"""

# 找原始启动代码
listen_m = re.search(r'(const server = app\.listen.*)', original, re.DOTALL)
if listen_m:
    new_server += '\n' + listen_m.group(1)
else:
    new_server += '\nconst server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));'

new_server_path = os.path.join(BASE, 'server.js')
with open(new_server_path, 'w') as f:
    f.write(new_server)

result = subprocess.run(['node', '--check', new_server_path], capture_output=True, text=True)
if result.returncode == 0:
    print(f"\n✅ 新 server.js 语法正确: {len(new_server)} chars, {new_server.count(chr(10))} lines")
else:
    print(f"\n❌ 语法错误:\n{result.stderr[:800]}")

# 列出所有生成的文件
print("\n生成的文件:")
for f in sorted(os.listdir(os.path.join(BASE, 'routes'))):
    fp = os.path.join(BASE, 'routes', f)
    print(f"  routes/{f}: {os.path.getsize(fp)} bytes")

print("\n完成!")
