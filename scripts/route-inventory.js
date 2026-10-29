#!/usr/bin/env node
/**
 * 建亿OA 服务端路由清单生成器
 * ---------------------------------------------------------------
 * 解析 server/server.js，抽出全部路由，标注：
 *   · 方法 / 路径 / 行号
 *   · 归到哪个业务模块（按路径前缀）
 *   · 有没有做权限校验
 *
 * 为什么需要它：
 *   server.js 14658 行、360 个路由，没人知道全貌。做任何拆分之前，
 *   先得有一张地图——否则就是上次那种「按行号切」的瞎拆。
 *
 * 输出：
 *   docs/服务端路由清单.md     给人看
 *   docs/route-inventory.json  给脚本用
 *
 * 用法: node scripts/route-inventory.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server', 'server.js');
const OUT_MD = path.join(ROOT, 'docs', '服务端路由清单.md');
const OUT_JSON = path.join(ROOT, 'docs', 'route-inventory.json');

// ---------- 模块归类规则（顺序敏感，先具体后宽泛）----------
// 注意：短前缀必须加 (?:\/|$) 边界，否则 /api/me 会吞掉 /api/messages
const MODULE_RULES = [
  [/^\/api\/customer-auth/,                                    '业主认证'],
  [/^\/api\/customers(?:\/|$)/,                                '业主档案'],
  [/^\/api\/family(?:\/|$)/,                                   '业主档案'],
  [/^\/api\/customer-pool|^\/api\/customer-follow|^\/api\/external-contacts/, '客户资源'],
  [/^\/api\/auth(?:\/|$)/,                                     '员工认证'],
  [/^\/api\/employees(?:\/|$)|^\/api\/departments/,            '员工'],
  [/^\/api\/roles(?:\/|$)|^\/api\/permissions(?:\/|$)/,        '角色权限'],
  [/^\/api\/approvals(?:\/|$)/,                                '审批'],
  [/^\/api\/mall(?:\/|$)/,                                     '商城'],
  [/^\/api\/main-materials|^\/api\/materials(?:\/|$)|^\/api\/material-/, '主材'],
  [/^\/api\/acceptance|^\/api\/material-acceptance/,           '验收'],
  [/^\/api\/projects(?:\/|$)|^\/api\/project-|^\/api\/progress|^\/api\/quotes/, '项目'],
  [/^\/api\/contracts|^\/api\/contract-|^\/api\/signers/,      '合同'],
  [/^\/api\/finance|^\/api\/budgets|^\/api\/payments?|^\/api\/payment-records|^\/api\/collections?|^\/api\/collection-records|^\/api\/cost-records|^\/api\/change-orders/, '财务'],
  [/^\/api\/purchase|^\/api\/suppliers/,                       '采购'],
  [/^\/api\/messages|^\/api\/notifications|^\/api\/notices|^\/api\/notify/, '消息通知'],
  [/^\/api\/inspections|^\/api\/rectification|^\/api\/dispatches|^\/api\/warranties/, '工程质检'],
  [/^\/api\/upload|^\/api\/delete-images|^\/api\/files/,       '文件上传'],
  [/^\/api\/dashboard|^\/api\/reports?$|^\/api\/reports\/|^\/api\/invoices|^\/api\/boss-dashboard|^\/api\/monthly-trend/, '报表'],
  [/^\/api\/wechat/,                                           '微信集成'],
  [/^\/api\/sms/,                                              '短信'],
  [/^\/api\/system|^\/api\/health|^\/api\/debug|^\/api\/operation-logs|^\/api\/admin(?:\/|$)/, '系统'],
  [/^\/api\/todo/,                                             '待办'],
  [/^\/api\/my|^\/api\/me(?:\/|$)|^\/api\/user(?:\/|$)/,       '个人中心'],
  [/^\/api\/ai|^\/api\/export-pdf/,                            '工具'],
  [/^\/api\/buildings|^\/api\/channels|^\/api\/marketing|^\/api\/attendance|^\/api\/design-measurements|^\/api\/mobile/, '其他业务'],
  [/^\*$/,                                                     '兜底路由'],
  [/^\/api\//,                                                 '其他业务'],
];

// 权限校验关键字（出现在路由处理函数体内即视为有校验）
const PERM_KEYWORDS = [
  'checkPermission', 'checkAnyPermission', 'requirePerm',
  'canAction', 'isAdmin', 'hasReadAllPermission',
  'visibleScope', 'permCore', 'loadUserPermissions',
  'resolveCustomerIdentity',
];

// 登录校验关键字 —— 只证明「知道请求者是谁」，不代表有权限。
// ⚠️ 为什么要单独统计：只按 PERM_KEYWORDS 判「无权限校验」会把两类完全不同的风险
//    混成一个数字：
//      (a) 完全没有登录校验  → 未登录的公网请求就能拉全表（真实越权）
//      (b) 要求登录但无权限点 → 任何员工登录后能看到全部（范围过宽）
//    2026-10-29 踩过一次：GET /api/change-orders/list 属于 (a)，不带任何身份头就能
//    拿到全公司增减项金额，但清单里它和 (b) 混在同一个「无权限校验」计数里，
//    补了 getUserId 之后总数 186 一点没变，看不出任何改善。
// 判断「这个 handler 里有没有任何身份识别」的关键词。
// ⚠️ 只是静态扫描，宁可漏报也别把「有鉴权」误判成「裸奔」——误报会让人白改代码。
// 加入 requireLogin / mallCan / resolveMessageActor 的原因（v2.5.3）：
//   requireLogin           server.js 里新增的上传前置中间件
//   mallCan(req,'write')   商城后台自己的一层判定，内部按 x-user-id 查权限
//   resolveMessageActor    消息已读接口的身份解析（返回 unknown 就 401）
//   pickUserId             middleware/perm.js 的 header-only 取 id
//   resolveOwnerCustomerId  api/family-members.js 的业主身份解析（2026-10-29 加固）。
//                          该函数定义在第一个路由之前，路由体内只出现调用名，
//                          所以必须按函数名匹配，否则会被误报成「未登录」。
const AUTH_KEYWORDS = ['getUserId', "x-user-id", 'getCurrentUser', 'resolveCustomerIdentity',
                       'requireLogin', 'mallCan', 'resolveMessageActor', 'pickUserId',
                       'resolveOwnerCustomerId'];

// GET 类允许无权限（公开接口）白名单 —— 只用于报告里区分「公开」和「漏了」
// v2.5.3 补充：登录类（employees/login）、微信绑定类（未登录态下从公众号/小程序进入绑定手机号）、
// 单条已读（Handler 内 resolveMessageActor 兜底，返回 unknown 就是 401）。
const PUBLIC_PATTERNS = [/^\/api\/health/, /^\/api\/auth\/login/, /^\/api\/customers\/login/,
                         /^\/api\/customer-auth\//, /^\/api\/showcase/, /^\/api\/version/,
                         /^\/api\/employees\/login/,
                         /^\/api\/wechat\/(bind|mini-bind|mini-profile)$/,
                         /^\/api\/(notifications|messages)\/[^/]+\/read$/];

function classify(p) {
  for (const [re, name] of MODULE_RULES) {
    if (re.test(p)) return name;
  }
  return '未分类';
}

const src = fs.readFileSync(SERVER, 'utf8');
const lines = src.split('\n');

// ---------- 抽取路由 ----------
// ⚠️ 要同时扫 server.js 和 server/api/*.js：2026-10-29 起部分业务模块已抽出，
//    它们注册在同一张 app 上。只扫 server.js 会漏掉这些路由，导致基线误报「接口消失」。
const API_DIR = path.join(ROOT, 'server', 'api');
const SCAN_FILES = [SERVER];
if (fs.existsSync(API_DIR)) {
  for (const f of fs.readdirSync(API_DIR).sort()) {
    if (f.endsWith('.js')) SCAN_FILES.push(path.join(API_DIR, f));
  }
}

// ---------- 注册顺序（决定「重复注册时谁生效」）----------
// Express 按 app.get/app.use 的**执行顺序**匹配，第一条赢。
// 路由抽到 api/*.js 后，模块内路由的真实注册时机 = server.js 里那行 require 的时刻，
// 不是模块文件内的行号。2026-10-29 之前只按行号排序，结果把
// /api/wechat/config 判成「生效 server.js:11082，死代码 api/wechat.js:51」——正好反了。
// 这里给每条路由算一个可比较的 order：server.js 用行号；
// api/*.js 用「require 行号 + 模块内行号/100000」，保证模块内路由紧跟在 require 之后。
const RE_REQUIRE_API = /^\s*require\(\s*['"]\.\/api\/([A-Za-z0-9_-]+)['"]\s*\)\s*\(\s*app/;
const apiBaseLine = new Map();   // 'server/api/wechat.js' -> require 所在的 server.js 行号
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(RE_REQUIRE_API);
  if (m) apiBaseLine.set(path.join('server', 'api', m[1] + '.js'), i + 1);
}

const RE_ROUTE = /^\s*app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/;
const routes = [];

for (const file of SCAN_FILES) {
  const fileLines = fs.readFileSync(file, 'utf8').split('\n');
  const rel = path.relative(ROOT, file);
  const local = [];
  for (let i = 0; i < fileLines.length; i++) {
    const m = fileLines[i].match(RE_ROUTE);
    if (m) {
      local.push({
        method: m[1].toUpperCase(),
        path: m[2],
        line: i + 1,
        file: rel,
        _idx: local.length,
      });
    }
  }
  // 给本文件内的路由找代码范围，检测权限校验
  for (let k = 0; k < local.length; k++) {
    const start = local[k].line - 1;
    const end = k + 1 < local.length ? local[k + 1].line - 1 : fileLines.length;
    const body = fileLines.slice(start, end).join('\n');
    const hits = PERM_KEYWORDS.filter(kw => body.includes(kw));
    local[k].perm = hits.length > 0;
    local[k].permHits = hits;
    // 认证维度：有权限校验的必然要登录，所以 perm 也算 auth
    local[k].auth = local[k].perm || AUTH_KEYWORDS.some(kw => body.includes(kw));
    local[k].lines = end - start;
    // 真实注册顺序（见上方 apiBaseLine 注释）
    local[k].order = rel === path.join('server', 'server.js')
      ? local[k].line
      : (apiBaseLine.get(rel) ?? 1e9) + local[k].line / 1e5;
  }
  routes.push(...local);
}

// ---------- 按模块聚合 ----------
const byModule = {};
for (const r of routes) {
  r.module = classify(r.path);
  const key = r.module;
  if (!byModule[key]) byModule[key] = { count: 0, noPerm: 0, lines: 0, publicOk: 0, routes: [] };
  byModule[key].count++;
  byModule[key].lines += r.lines;
  if (!r.perm) {
    if (PUBLIC_PATTERNS.some(re => re.test(r.path))) {
      byModule[key].publicOk++;
      r.publicAllowed = true;
    } else {
      byModule[key].noPerm++;
      r.publicAllowed = false;
    }
  }
  byModule[key].routes.push(r);
}

const modules = Object.entries(byModule)
  .sort((a, b) => b[1].count - a[1].count);

const totalRoutes = routes.length;
const totalNoPerm = routes.filter(r => !r.perm && !r.publicAllowed).length;
// 「彻底裸奔」：连登录校验都没有，未登录的公网请求就能打。比「登录但无权限点」严重一档。
const totalNoAuth = routes.filter(r => !r.auth && !r.publicAllowed).length;
const writeOps = routes.filter(r => r.method !== 'GET').length;

// ---------- 检测重复注册 ----------
// 同一个「方法 + 路径」注册多次时，Express 只用第一条，后面全是死代码。
// 这正是 routes/employees.js 那类陷阱的翻版：改了不生效，还不报错。
// 按 order（真实注册顺序）排，不按行号 —— 跨文件后行号不可比。
const dupMap = new Map();
for (const r of routes) {
  const key = `${r.method} ${r.path}`;
  if (!dupMap.has(key)) dupMap.set(key, []);
  dupMap.get(key).push(r);
}
const locOf = (r) => (r.file === path.join('server', 'server.js')
  ? String(r.line) : `${path.basename(r.file)}:${r.line}`);
const duplicates = [...dupMap.entries()]
  .filter(([, v]) => v.length > 1)
  .map(([key, v]) => {
    const sorted = [...v].sort((a, b) => a.order - b.order);
    return {
      key,
      module: sorted[0].module,
      effectiveLine: sorted[0].line,
      effectiveAt: locOf(sorted[0]),
      shadowLines: sorted.slice(1).map(locOf),
      count: sorted.length,
    };
  });

// ---------- 输出 JSON ----------
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'server/server.js',
  totalLines: lines.length,
  totalRoutes,
  totalNoPerm,
  totalNoAuth,
  writeOps,
  duplicates,
  modules: modules.map(([name, d]) => ({
    name, count: d.count, noPerm: d.noPerm, publicOk: d.publicOk,
    approxLines: d.lines,
    routes: d.routes.map(r => ({
      method: r.method, path: r.path, line: r.line,
      file: r.file,
      perm: r.perm, auth: !!r.auth, publicAllowed: !!r.publicAllowed,
    })),
  })),
}, null, 2), 'utf8');

// ---------- 输出 Markdown ----------
const md = [];
md.push('# 建亿OA 服务端路由清单');
md.push('');
md.push(`> 自动生成于 ${new Date().toLocaleString('zh-CN')}　·　源文件 \`server/server.js\`（${lines.length} 行）`);
md.push('> 重新生成：`node scripts/route-inventory.js`');
md.push('');
md.push('## 总览');
md.push('');
md.push('| 指标 | 数值 |');
md.push('|---|---|');
md.push(`| 路由总数 | **${totalRoutes}** |`);
md.push(`| 其中写操作（POST/PUT/DELETE/PATCH） | ${writeOps} |`);
md.push(`| **无权限校验**（排除公开接口） | **${totalNoPerm}** |`);
md.push(`| ↳ 其中**连登录都不校验**（未登录公网可打） | **${totalNoAuth}** |`);
md.push(`| ↳ 其中要求登录、但无权限点 | ${totalNoPerm - totalNoAuth} |`);
md.push(`| 无校验占比 | ${(totalNoPerm / totalRoutes * 100).toFixed(1)}% |`);
md.push('');
md.push('## 按业务模块');
md.push('');
md.push('| 模块 | 路由数 | 无权限校验 | 公开接口 | 约占总行数 |');
md.push('|---|---:|---:|---:|---:|');
for (const [name, d] of modules) {
  md.push(`| ${name} | ${d.count} | ${d.noPerm > 0 ? '**' + d.noPerm + '**' : 0} | ${d.publicOk} | ${(d.lines / lines.length * 100).toFixed(1)}% |`);
}
md.push('');
md.push('## 需要关注的：无权限校验的路由');
md.push('');
md.push('> 这些接口**没有任何权限点校验**，靠登录或干脆什么都不靠。按危险度排序：');
md.push('> 「登录」列为 **✗** = 连 `getUserId` 都没调，未登录的公网请求直接能打（最严重）；');
md.push('> **✓** = 要求登录但无权限点，任何员工登录后能看到全部（范围过宽）。');
md.push('');
md.push('| 行号 | 方法 | 路径 | 模块 | 登录 |');
md.push('|---:|---|---|---|:--:|');
const noPermRoutes = routes.filter(r => !r.perm && !r.publicAllowed)
  .sort((a, b) => (a.auth === b.auth ? 0 : a.auth ? 1 : -1));  // 无登录的排前面
const loc = (r) => (r.file && r.file !== path.join('server', 'server.js')
  ? `${path.basename(r.file)}:${r.line}` : String(r.line));
for (const r of noPermRoutes) {
  md.push(`| ${loc(r)} | ${r.method} | \`${r.path}\` | ${r.module} | ${r.auth ? '✓' : '**✗**'} |`);
}
md.push('');
md.push('## ⚠️ 重复注册（后者永远不执行）');
md.push('');
if (!duplicates.length) {
  md.push('没有重复注册。');
} else {
  md.push(`> 同一个「方法 + 路径」注册了多次，Express 只用**第一条**。后面的全是死代码 —— 改它不会有任何效果。`);
  md.push('');
  md.push('| 方法 + 路径 | 模块 | 生效行号 | 死代码行号 |');
  md.push('|---|---|---:|---|');
  for (const d of duplicates) {
    md.push(`| \`${d.key}\` | ${d.module} | ${d.effectiveAt} | ${d.shadowLines.join(', ')} |`);
  }
}
md.push('');
md.push('## 全量清单');
md.push('');
for (const [name, d] of modules) {
  md.push(`### ${name}（${d.count} 个）`);
  md.push('');
  md.push('| 行号 | 方法 | 路径 | 权限 |');
  md.push('|---:|---|---|---|');
  for (const r of d.routes) {
    const p = r.perm ? '✓' : (r.publicAllowed ? '公开' : '**无**');
    md.push(`| ${loc(r)} | ${r.method} | \`${r.path}\` | ${p} |`);
  }
  md.push('');
}

fs.writeFileSync(OUT_MD, md.join('\n'), 'utf8');

console.log(`  路由总数: ${totalRoutes}`);
console.log(`  写操作:   ${writeOps}`);
console.log(`  无权限校验: ${totalNoPerm} (${(totalNoPerm / totalRoutes * 100).toFixed(1)}%)`);
console.log(`  模块数:   ${modules.length}`);
console.log(`  重复注册: ${duplicates.length} 组${duplicates.length ? '（后者不生效）' : ''}`);
for (const d of duplicates) {
  console.log(`    ${d.key.padEnd(38)} 生效 ${d.effectiveAt}，死代码 ${d.shadowLines.join(',')}`);
}

// ---------- 孤儿模块检测 ----------
// 拆出来的 api/*.js 如果没被 server.js require，其中的路由根本不会注册 —— 服务启动不报错，
// 接口却全 404。这是「拆了但忘接线」，和 v2.5.2 漏 material-pinyin.js 是同一类事故。
const apiFiles = SCAN_FILES.filter(f => f !== SERVER);
const orphans = apiFiles.filter(f => !apiBaseLine.has(path.relative(ROOT, f)));
if (orphans.length) {
  console.log('');
  console.log(`  ⚠️  ${orphans.length} 个模块未被 server.js 注册（其中的路由不会生效）：`);
  for (const f of orphans) console.log(`      ${path.relative(ROOT, f)}`);
}
console.log('');
for (const [name, d] of modules) {
  console.log(`    ${name.padEnd(10)} ${String(d.count).padStart(4)} 个  (无校验 ${d.noPerm})`);
}
console.log('');
console.log(`  ✓ ${OUT_MD}`);
console.log(`  ✓ ${OUT_JSON}`);
