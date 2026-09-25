#!/usr/bin/env python3
"""
将 server.js 拆分为 routes/ 模块化结构
"""
import re
import os
import json

BASE = os.path.dirname(os.path.abspath(__file__))
SERVER_JS = os.path.join(BASE, 'server.js')

with open(SERVER_JS, 'r') as f:
    content = f.read()

print(f"原始文件: {len(content)} chars, {content.count(chr(10))} lines\n")

# ============================================================
# 1. 提取顶部代码（到 const db = new Database();）
# ============================================================
db_match = re.search(r'\nconst db = new Database\(\);', content)
top_code = content[:db_match.start()]
db_line = db_match.group()
rest = content[db_match.end():]

print(f"顶部代码: {len(top_code)} chars, ~{top_code.count(chr(10))} lines")

# ============================================================
# 2. 提取底部启动代码（app.listen 之后）
# ============================================================
listen_m = re.search(r'\n(?:const server = )?app\.listen\([^)]+\)', rest)
if listen_m:
    boot_code = rest[listen_m.start():]
    rest = rest[:listen_m.start()]
else:
    boot_code = ''

# ============================================================
# 3. 提取 addLog 函数（从顶部代码中）
# ============================================================
addlog_m = re.search(r'(// ==================== 操作日志写入[^\n]*\n.*?)(?=\n// [=]{10,} |\nconst pool|\nmodule)', top_code, re.DOTALL)
if addlog_m:
    addlog_code = addlog_m.group(1).strip()
    addlog_start = addlog_m.start()
    top_before_addlog = top_code[:addlog_start]
    top_after_addlog = top_code[addlog_m.end():]
    print(f"\n找到 addLog 函数: {addlog_code[:60]}...")
else:
    addlog_code = None
    top_before_addlog = top_code

# ============================================================
# 4. 提取权限中间件函数（从顶部代码）
# ============================================================
# getUserId, isAdmin, hasReadAllPermission, checkPermission, getCurrentUser
perm_funcs = ['getUserId', 'isAdmin', 'hasReadAllPermission', 'checkPermission', 'getCurrentUser', 'hasPermission', 'ensureSystemLogTable']
perm_code_parts = []
remaining_top = top_before_addlog

# 找到所有权限相关函数
for func_name in perm_funcs:
    # 匹配函数定义：async function xxx 或 function xxx
    pattern = rf'\n(?:async )?function {re.escape(func_name)}\([^{{]*\)\s*\{{'
    m = re.search(pattern, top_code)
    if m:
        # 找到函数开始，向后找到配对的最后一个 }
        start = m.start()
        # 向前找到函数名前的注释和空白
        # 提取从注释到函数结束的完整内容
        # 简单方法：从函数名开始找匹配的大括号
        brace_start = m.end() - 1  # '{' 的位置
        depth = 1
        pos = brace_start + 1
        while depth > 0 and pos < len(top_code):
            if top_code[pos] == '{':
                depth += 1
            elif top_code[pos] == '}':
                depth -= 1
            pos += 1
        func_full = top_code[start:pos]
        perm_code_parts.append((func_name, func_full))
        print(f"  提取权限函数: {func_name} ({len(func_full)} chars)")

# ============================================================
# 5. 按段落分割路由代码
# ============================================================
# 用 "// ====" 或 "// ==========" 分割
sep_pattern = re.compile(r'\n// [=]{10,}[^\n]*\n')
route_sections = sep_pattern.split(rest)

print(f"\n路由段落数量: {len(route_sections)}")

# ============================================================
# 6. 建立段落名称映射
# ============================================================
def get_section_label(text):
    """从段落开头提取注释标题"""
    lines = text.strip().split('\n')
    for line in lines[:3]:  # 看前3行
        m = re.match(r'^// [=]+(.*?)[=]+', line.strip())
        if m:
            return m.group(1).strip()
    return None

# ============================================================
# 7. 创建路由文件
# ============================================================
def make_router_file(filename, code, requires=None):
    """生成一个路由文件"""
    lines = [
        "const express = require('express');",
        "const router = express.Router();",
        "",
        "",
    ]
    
    # 添加 requires
    if requires:
        for req in requires:
            lines.append(req)
        lines.append("")
    
    # 添加代码（去掉重复的 app. 前的注释）
    # 找到第一个 app. 开头的行
    code_lines = code.strip().split('\n')
    first_app_line = 0
    for i, line in enumerate(code_lines):
        if re.match(r"^\s*app\.(get|post|put|delete|use)", line):
            first_app_line = i
            break
    
    # 如果前面有孤立注释（不属于任何路由的注释块），保留
    header_lines = code_lines[:first_app_line]
    body_lines = code_lines[first_app_line:]
    
    # 清理 app. 为 router.
    new_body = []
    for line in body_lines:
        # app.get -> router.get 等等
        new_line = re.sub(r'^(\s*)app\.', r'\1router.', line)
        new_body.append(new_line)
    
    lines.extend(header_lines)
    lines.extend(new_body)
    lines.append("")
    lines.append("module.exports = router;")
    
    content_str = '\n'.join(lines)
    
    filepath = os.path.join(BASE, filename)
    with open(filepath, 'w') as f:
        f.write(content_str)
    
    return len(content_str), len(lines)

# ============================================================
# 8. 分析并分配段落到文件
# ============================================================
file_map = {
    'routes/auth.js': [],
    'routes/customers.js': [],
    'routes/contracts.js': [],
    'routes/projects.js': [],
    'routes/approvals.js': [],
    'routes/finance.js': [],
    'routes/warehouse.js': [],
    'routes/employees.js': [],
    'routes/notifications.js': [],
    'routes/reports.js': [],
    'routes/system.js': [],
    'routes/erp.js': [],
    'routes/upload.js': [],
}

def assign_section(section_text, label):
    """根据标签分配段落到文件"""
    text_lower = (section_text + (label or '')).lower()
    
    if '客户' in (label or ''):
        if '跟进' in text_lower or 'follow' in text_lower or 'pool' in text_lower:
            return 'routes/customers.js'
        return 'routes/customers.js'
    if '合同' in (label or '') or 'contract' in text_lower or 'template' in text_lower or '签约人' in (label or ''):
        return 'routes/contracts.js'
    if '项目' in (label or '') or 'progress' in text_lower or 'stage' in text_lower or 'node' in text_lower or '节点' in (label or ''):
        return 'routes/projects.js'
    if '审批' in (label or '') or 'approval' in text_lower:
        return 'routes/approvals.js'
    if '财务' in (label or '') or 'finance' in text_lower or 'budget' in text_lower or 'dashboard' in text_lower or 'boss' in text_lower:
        return 'routes/finance.js'
    if '仓库' in (label or '') or 'material' in text_lower or 'warehouse' in text_lower or '订单' in (label or ''):
        return 'routes/warehouse.js'
    if '员工' in (label or '') or '部门' in (label or '') or 'role' in text_lower or 'permission' in text_lower or 'employee' in text_lower or 'user' in text_lower.split('/api/')[0]:
        return 'routes/employees.js'
    if '通知' in (label or '') or 'message' in text_lower or 'notice' in text_lower or '站内' in (label or ''):
        return 'routes/notifications.js'
    if '报告' in (label or '') or 'report' in text_lower or '汇报' in (label or ''):
        return 'routes/reports.js'
    if '系统' in (label or '') or '日志' in (label or '') or 'system' in text_lower or 'log' in text_lower or 'debug' in text_lower or 'health' in text_lower:
        return 'routes/system.js'
    if any(k in text_lower for k in ['楼盘', '渠道', '供应商', '采购', '整改', '考勤', '维保', '量房', '营销', 'building', 'channel', 'supplier', 'purchase', 'cost', 'attendance', 'warranty', 'measurement']):
        return 'routes/erp.js'
    if '上传' in (label or '') or 'upload' in text_lower or '文件' in (label or ''):
        return 'routes/upload.js'
    if '登录' in (label or '') or 'login' in text_lower or '员工' in (label or ''):
        return 'routes/auth.js'
    
    # 尝试从路由路径判断
    api_paths = re.findall(r"app\.(get|post|put|delete|use)\(['\"]([^'\"]+)['\"]", section_text)
    for method, path in api_paths:
        if '/customers' in path or '/customer' in path:
            return 'routes/customers.js'
        if '/contracts' in path or '/contract' in path:
            return 'routes/contracts.js'
        if '/projects' in path or '/project' in path:
            return 'routes/projects.js'
        if '/approvals' in path:
            return 'routes/approvals.js'
        if '/finance' in path or '/budget' in path:
            return 'routes/finance.js'
        if '/materials' in path or '/warehouse' in path:
            return 'routes/warehouse.js'
        if '/employees' in path or '/departments' in path or '/roles' in path or '/user/info' in path:
            return 'routes/employees.js'
        if '/notifications' in path or '/messages' in path or '/notices' in path:
            return 'routes/notifications.js'
        if '/reports' in path or '/inspections' in path or '/acceptance' in path:
            return 'routes/reports.js'
        if '/system-logs' in path or '/operation-logs' in path or '/debug' in path or '/health' in path:
            return 'routes/system.js'
        if '/buildings' in path or '/channels' in path or '/suppliers' in path or '/rectification' in path:
            return 'routes/erp.js'
        if '/upload' in path:
            return 'routes/upload.js'
        if '/login' in path:
            return 'routes/auth.js'
    
    return None

# 逐段分析
section_files = []
for i, section in enumerate(route_sections):
    stripped = section.strip()
    if not stripped:
        continue
    label = get_section_label(stripped)
    target_file = assign_section(stripped, label)
    if target_file:
        section_files.append((target_file, stripped, label))
        print(f"  [{i}] -> {target_file}: {label}")
    else:
        print(f"  [{i}] -> 未分配: {label}")
        print(f"    前100字: {stripped[:100]}")

print(f"\n共分配 {len(section_files)} 个段落到路由文件")

# ============================================================
# 9. 合并同一文件的多个段落
# ============================================================
merged = {}  # filename -> combined_code
for fname, code, label in section_files:
    if fname not in merged:
        merged[fname] = ''
    if label:
        merged[fname] += f'\n// ---- {label} ----\n'
    merged[fname] += code + '\n'

# ============================================================
# 10. 生成权限中间件文件
# ============================================================
perm_requires = [
    "const { pool } = require('../db-mysql-async');",
    "",
]
perm_code = '\n'.join([code for _, code in perm_code_parts])

middleware_auth_content = (
    "'use strict';\n\n" +
    '\n'.join(perm_requires) + '\n' +
    perm_code + '\n'
)
with open(os.path.join(BASE, 'middleware/auth.js'), 'w') as f:
    f.write(middleware_auth_content)
print(f"\nmiddleware/auth.js: {len(middleware_auth_content)} chars")

# ============================================================
# 11. 生成 addLog 工具文件
# ============================================================
if addlog_code:
    addlog_content = (
        "'use strict';\n\n" +
        "const { pool } = require('../db-mysql-async');\n\n" +
        addlog_code.strip() + '\n'
    )
    with open(os.path.join(BASE, 'utils/addLog.js'), 'w') as f:
        f.write(addlog_content)
    print(f"utils/addLog.js: {len(addlog_content)} chars")

# ============================================================
# 12. 生成各路由文件
# ============================================================
for fname, combined in merged.items():
    requires = [
        "const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');",
        "const { addLog } = require('../utils/addLog');",
        "const { pool } = require('../db-mysql-async');",
        "const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');",
        "const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');",
    ]
    size, lines = make_router_file(fname, combined, requires)
    print(f"{fname}: {size} chars, {lines} lines")

# ============================================================
# 13. 生成精简版 server.js
# ============================================================
new_server = top_before_addlog.strip() + '\n'

# 添加权限中间件和工具函数的 require
new_server += """
// ---- 权限与工具 ----
const { getUserId, isAdmin, hasReadAllPermission, checkPermission, getCurrentUser } = require('./middleware/auth');
const { addLog } = require('./utils/addLog');
const { notifyProject, sendApprovalNotification, sendAppNotification, insertInAppNotification } = require('./utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('./utils/sms');

// ---- 路由注册 ----
"""

# 添加路由 require 和 use
route_requires = [
    ('routes/auth', '/api/employees', '/api/customers'),
    ('routes/customers', '/api/customers'),
    ('routes/contracts', '/api/contracts', '/api/contract-templates', '/api/signers'),
    ('routes/projects', '/api/projects', '/api/project-stages', '/api/project-logs', '/api/quotes', '/api/progress-'),
    ('routes/approvals', '/api/approvals'),
    ('routes/finance', '/api/budgets', '/api/finance', '/api/dashboard'),
    ('routes/warehouse', '/api/materials', '/api/main-materials', '/api/material-orders'),
    ('routes/employees', '/api/departments', '/api/employees', '/api/roles', '/api/permissions', '/api/user'),
    ('routes/notifications', '/api/notifications', '/api/messages', '/api/notices'),
    ('routes/reports', '/api/reports', '/api/inspections', '/api/acceptance', '/api/dispatches', '/api/invoices'),
    ('routes/system', '/api/system-logs', '/api/operation-logs', '/api/debug', '/api/health'),
    ('routes/erp', '/api/buildings', '/api/channels', '/api/marketing-cases', '/api/suppliers', '/api/purchases', '/api/cost-records', '/api/rectification-issues', '/api/attendance', '/api/warranties', '/api/design-measurements'),
    ('routes/upload', '/api/upload-image', '/api/upload-pdf', '/api/delete-images'),
]

for route_name, *paths in route_requires:
    for path in paths:
        new_server += f"app.use('{path}', require('./{route_name}'));\n"

new_server += '\n' + boot_code

server_js_path = os.path.join(BASE, 'server_new.js')
with open(server_js_path, 'w') as f:
    f.write(new_server)

print(f"\nserver_new.js (精简版): {len(new_server)} chars, {new_server.count(chr(10))} lines")

# 语法检查
import subprocess
result = subprocess.run(['node', '--check', server_js_path], capture_output=True, text=True)
if result.returncode == 0:
    print("✅ server_new.js 语法检查通过")
else:
    print(f"❌ 语法错误:\n{result.stderr[:500]}")

print("\n拆分完成！")
