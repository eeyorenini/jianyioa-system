#!/usr/bin/env node
/**
 * 拆分健康度体检（server.js → api/* + lib/*）
 * ---------------------------------------------------------------
 * 拆分的风险不是「代码跑不起来」——那种会立刻 503 被发现。
 * 真正的风险是「静默失效」：
 *   1. 存根少传一个依赖 → 模块里解构出来是 undefined，只在调用到那条路时才炸
 *   2. 模块存在但没被 require → 接口全 404，没人报错
 *   3. 注册顺序变了 → 同路径路由被后注册的覆盖
 *   4. 头注释写的行数过时 → 后来人对着假信息改代码
 *
 * 本脚本只读，不改任何文件。用法：
 *   node scripts/health-check.js [server目录，默认 server]
 *   node scripts/health-check.js server --json   只输出 JSON
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const JSON_ONLY = args.includes('--json');
const rootArg = args.find((a) => !a.startsWith('--')) || 'server';
const ROOT = path.resolve(rootArg);
const ENTRY = path.join(ROOT, 'server.js');

if (!fs.existsSync(ENTRY)) {
  console.error(`找不到入口: ${ENTRY}`);
  process.exit(2);
}

const read = (p) => fs.readFileSync(p, 'utf8');
const lines = (p) => read(p).split('\n');
const serverSrc = read(ENTRY);
const serverLines = serverSrc.split('\n');

const apiDir = path.join(ROOT, 'api');
const libDir = path.join(ROOT, 'lib');
const listJs = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.js')).sort() : []);
const apiFiles = listJs(apiDir);
const libFiles = listJs(libDir);

// ============================================================
// 工具：从 openIndex 处的括号开始，返回与之匹配的闭括号下标
// 需要跳过字符串 / 模板字符串 / 行注释 / 块注释，否则 deps 里的
// 箭头函数、中文文案里的括号会把配平带偏。
// 注意：必须按「同一对括号」计数。早先版本从 `(` 开始却按 `{}` 计数，
// 结果 deps 对象永远取不到，把 41 个模块全误报成「依赖没传」。
// ============================================================
function matchBracket(src, openIndex) {
  const open = src[openIndex];
  const close = { '(': ')', '[': ']', '{': '}' }[open];
  if (!close) return -1;

  let depth = 0;
  let inStr = null;
  let inTpl = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openIndex; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (inTpl) {
      if (c === '\\') { i++; continue; }
      if (c === '`') inTpl = false;
      continue;
    }

    if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '`') { inTpl = true; continue; }

    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 把对象字面量内部按顶层逗号切成段（跳过嵌套括号/字符串） */
function splitTopLevel(inner) {
  const out = [];
  let buf = '';
  let depth = 0;
  let inStr = null;
  let inTpl = false;
  let inLineComment = false;

  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    const next = inner[i + 1];

    if (inLineComment) {
      buf += c;
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inStr) {
      buf += c;
      if (c === '\\') { buf += next; i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (inTpl) {
      buf += c;
      if (c === '\\') { buf += next; i++; continue; }
      if (c === '`') inTpl = false;
      continue;
    }
    if (c === '/' && next === '/') { inLineComment = true; buf += c; continue; }
    if (c === '"' || c === "'") { inStr = c; buf += c; continue; }
    if (c === '`') { inTpl = true; buf += c; continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    if (c === '}' || c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

/** 从对象字面量里取 key 列表（`a, b: x, c` → a,b,c） */
function objectKeys(inner) {
  const keys = [];
  for (const seg of splitTopLevel(inner)) {
    const cleaned = seg.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!cleaned) continue;
    const m = cleaned.match(/^([A-Za-z_$][\w$]*)\s*(?::|$)/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

// ============================================================
// 1. 解析 server.js 里的模块接线（存根）
// ============================================================
const STUB_RE = /require\s*\(\s*['"]\.\/(api|lib)\/([A-Za-z0-9_\-.]+)['"]\s*\)\s*\(/g;
const stubs = [];
let sm;
while ((sm = STUB_RE.exec(serverSrc))) {
  const kind = sm[1];
  const name = sm[2];
  const callOpen = sm.index + sm[0].length - 1; // 指向 (
  const closeIdx = matchBracket(serverSrc, callOpen);
  const callArgs = closeIdx > 0 ? serverSrc.slice(callOpen + 1, closeIdx) : '';

  // 两种接线形态：
  //   require('./api/x')(app, { ...deps })
  //   require('./lib/notify')({ ...deps })
  const appMatch = callArgs.match(/^\s*app\s*,/);
  const hasApp = !!appMatch;
  const rest = hasApp ? callArgs.slice(appMatch[0].length) : callArgs;
  let depsInner = null;
  const braceAt = rest.indexOf('{');
  if (braceAt >= 0) {
    const closeB = matchBracket(rest, braceAt);
    if (closeB > 0) depsInner = rest.slice(braceAt + 1, closeB);
  }

  const lineNo = serverSrc.slice(0, sm.index).split('\n').length;
  stubs.push({
    kind,
    name,
    file: kind === 'api' ? `api/${name}.js` : `lib/${name}.js`,
    line: lineNo,
    hasApp,
    deps: depsInner === null ? [] : objectKeys(depsInner),
    depsRaw: depsInner,
  });
}

// ============================================================
// 2. 解析每个模块的 deps 解构
// ============================================================
function moduleDestructured(file) {
  const src = read(path.join(ROOT, file));
  // const { a, b } = deps;
  const re = /const\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const braceAt = m.index + m[0].length - 1;
    const closeB = matchBracket(src, braceAt);
    if (closeB < 0) continue;
    const tail = src.slice(closeB + 1, closeB + 60);
    if (/^\s*=\s*deps\b/.test(tail)) {
      return { keys: objectKeys(src.slice(braceAt + 1, closeB)), src };
    }
  }
  return { keys: [], src };
}

// ============================================================
// 3. 逐模块对比：未传依赖（危险）/ 冗余传参（无害但过时）
// ============================================================
const stubByFile = new Map(stubs.map((s) => [s.file, s]));
const missingDeps = [];   // 模块要但存根没给 → undefined
const extraDeps = [];     // 存根给了但模块没用 → 依赖清单过时
const notWired = [];      // api 模块存在但没接线

for (const f of apiFiles) {
  const rel = `api/${f}`;
  const stub = stubByFile.get(rel);
  const { keys } = moduleDestructured(rel);
  if (!stub) {
    notWired.push({ file: rel, destructured: keys.length });
    continue;
  }
  const want = new Set(keys);
  const got = new Set(stub.deps);
  const miss = [...want].filter((k) => !got.has(k));
  const extra = [...got].filter((k) => !want.has(k));
  if (miss.length) missingDeps.push({ file: rel, line: stub.line, keys: miss });
  if (extra.length) extraDeps.push({ file: rel, line: stub.line, keys: extra });
}

// lib 里只有 notify 走工厂模式
for (const s of stubs.filter((x) => x.kind === 'lib')) {  if (!s.depsRaw) continue;
  const src = read(path.join(ROOT, s.file));
  // 工厂函数内部解构：createNotify(deps) 里 const deps = {...} 或参数解构
  const got = new Set(s.deps);
  const bodyStart = src.indexOf('module.exports');
  const body = bodyStart >= 0 ? src.slice(bodyStart) : src;
  const used = [...got].filter((k) => {
    const re = new RegExp(`\\b${k.replace(/[.$]/g, '\\$&')}\\b`, 'g');
    return (body.match(re) || []).length > 0;
  });
  const miss = [...got].filter((k) => !used.includes(k));
  if (miss.length) extraDeps.push({ file: s.file, line: s.line, keys: miss });
}

// lib/* 的孤儿检测（check-server-deps.js 只查 api/，这里补上）
const libRefs = new Set();
const libRefSources = [serverSrc].concat(apiFiles.map((f) => read(path.join(apiDir, f))));
for (const s of libRefSources) {
  for (const re of [
    /require\s*\(\s*['"]\.\/lib\/([A-Za-z0-9_\-.]+)['"]\s*\)/g,
    /require\s*\(\s*['"]\.\.\/lib\/([A-Za-z0-9_\-.]+)['"]\s*\)/g,
  ]) {
    let mm;
    while ((mm = re.exec(s))) libRefs.add(`${mm[1]}.js`);
  }
}
const orphanLibs = libFiles.filter((f) => !libRefs.has(f));

// ============================================================
// 4. 路由清点 + 重复注册
// ============================================================
const ROUTE_RE = /^\s*app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/;
const routeOwners = [];
const allFiles = [{ file: 'server.js', abs: ENTRY }].concat(
  apiFiles.map((f) => ({ file: `api/${f}`, abs: path.join(apiDir, f) }))
);

for (const { file, abs } of allFiles) {
  const L = read(abs).split('\n');
  for (let i = 0; i < L.length; i++) {
    const m = L[i].match(ROUTE_RE);
    if (m) {
      routeOwners.push({ file, line: i + 1, method: m[1].toUpperCase(), path: m[2] });
    }
  }
}

const seen = new Map();
for (const r of routeOwners) {
  const key = `${r.method} ${r.path}`;
  if (!seen.has(key)) seen.set(key, []);
  seen.get(key).push(r);
}
const duplicates = [...seen.entries()]
  .filter(([, arr]) => arr.length > 1)
  .map(([key, arr]) => ({ key, occurrences: arr.map((a) => `${a.file}:${a.line}`) }));

const perModule = new Map();
for (const r of routeOwners) perModule.set(r.file, (perModule.get(r.file) || 0) + 1);

// server.js 里还剩几条路由
const serverRouteCount = routeOwners.filter((r) => r.file === 'server.js').length;

// ============================================================
// 5. 头注释声称行数 vs 实际行数
// ============================================================
const headerClaims = [];
for (const f of apiFiles.concat(libFiles)) {
  const rel = (apiFiles.includes(f) ? 'api/' : 'lib/') + f;
  const src = read(path.join(ROOT, rel));
  const L = src.split('\n');
  // 只看文件头 30 行内的注释
  const head = L.slice(0, 30).join('\n');
  const nums = [...head.matchAll(/共\s*(\d+)\s*行/g)].map((m) => parseInt(m[1], 10));
  if (!nums.length) continue;
  const claimed = nums.reduce((a, b) => a + b, 0);
  const actual = L.length - (L[L.length - 1] === '' ? 1 : 0);
  const diff = actual - claimed;
  // 头部注释本身占几行，允许 20 行以内的偏差（含加固说明追加）
  if (Math.abs(diff) > 20) {
    headerClaims.push({ file: rel, claimed, actual, diff });
  }
}

// ============================================================
// 6. server.js 顶层符号的死代码检测
// ============================================================
const topDefs = [];
for (let i = 0; i < serverLines.length; i++) {
  const l = serverLines[i];
  let m = l.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
  if (m) { topDefs.push({ name: m[1], line: i + 1, kind: 'function' }); continue; }
  m = l.match(/^const\s+([A-Za-z_$][\w$]*)\s*=/);
  if (m) { topDefs.push({ name: m[1], line: i + 1, kind: 'const' }); }
}

const allSrc = [serverSrc].concat(
  apiFiles.map((f) => read(path.join(apiDir, f))),
  libFiles.map((f) => read(path.join(libDir, f)))
).join('\n');

const deadSymbols = [];
for (const d of topDefs) {
  const re = new RegExp(`\\b${d.name.replace(/[.$]/g, '\\$&')}\\b`, 'g');
  const hits = (allSrc.match(re) || []).length;
  // 只出现 1 次 = 只有定义处
  if (hits <= 1) deadSymbols.push({ name: d.name, line: d.line, kind: d.kind, hits });
}

// ============================================================
// 7. 语法检查（node --check 全量）
// ============================================================
const syntaxFailed = [];
let syntaxChecked = 0;
const targets = [ENTRY].concat(
  apiFiles.map((f) => path.join(apiDir, f)),
  libFiles.map((f) => path.join(libDir, f))
);
for (const t of targets) {
  syntaxChecked++;
  try {
    execFileSync(process.execPath, ['--check', t], { stdio: 'pipe' });
  } catch (e) {
    syntaxFailed.push({ file: path.relative(ROOT, t), error: String(e.stderr || e.message).split('\n')[0] });
  }
}

// ============================================================
// 8. 规模统计
// ============================================================
function countLines(abs) { return lines(abs).length; }
const apiSizes = apiFiles.map((f) => ({ file: `api/${f}`, lines: countLines(path.join(apiDir, f)) }));
const libSizes = libFiles.map((f) => ({ file: `lib/${f}`, lines: countLines(path.join(libDir, f)) }));
const apiTotal = apiSizes.reduce((a, b) => a + b.lines, 0);
const libTotal = libSizes.reduce((a, b) => a + b.lines, 0);
const sortedBySize = apiSizes.concat(libSizes).sort((a, b) => b.lines - a.lines);

const report = {
  generatedAt: new Date().toISOString(),
  root: ROOT,
  scale: {
    serverLines: serverLines.length,
    serverRoutes: serverRouteCount,
    apiModules: apiFiles.length,
    apiLines: apiTotal,
    libModules: libFiles.length,
    libLines: libTotal,
    moduleLinesTotal: apiTotal + libTotal,
    avgModuleLines: Math.round((apiTotal + libTotal) / (apiFiles.length + libFiles.length)),
    largest: sortedBySize.slice(0, 5),
    smallest: sortedBySize.slice(-3).reverse(),
    routesInModules: routeOwners.length - serverRouteCount,
    totalRoutes: routeOwners.length,
  },
  wiring: {
    stubCount: stubs.length,
    notWired,
    missingDeps,
    extraDeps,
    orphanLibs,
  },
  routes: {
    total: routeOwners.length,
    duplicates,
    perModule: [...perModule.entries()].map(([file, n]) => ({ file, routes: n })).sort((a, b) => b.routes - a.routes),
  },
  hygiene: {
    headerClaims,
    deadSymbols,
    syntaxChecked,
    syntaxFailed,
  },
};

if (JSON_ONLY) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// ============================================================
// 人类可读输出
// ============================================================
const line = (c) => console.log(c.repeat(64));
const ok = (s) => console.log(`  ✓ ${s}`);
const warn = (s) => console.log(`  ⚠ ${s}`);
const bad = (s) => console.log(`  ✗ ${s}`);

line('=');
console.log('建亿OA 服务端拆分健康度体检');
console.log(`时间: ${report.generatedAt}`);
line('=');

console.log('\n【一、规模】');
console.log(`  server.js          ${report.scale.serverLines} 行 / ${report.scale.serverRoutes} 条路由`);
console.log(`  api/*               ${report.scale.apiModules} 个 / ${report.scale.apiLines} 行`);
console.log(`  lib/*               ${report.scale.libModules} 个 / ${report.scale.libLines} 行`);
console.log(`  模块合计            ${report.scale.moduleLinesTotal} 行，平均 ${report.scale.avgModuleLines} 行/个`);
console.log(`  路由总数            ${report.scale.totalRoutes}（模块内 ${report.scale.routesInModules}）`);
console.log('  最大的 5 个:');
for (const x of report.scale.largest) console.log(`      ${String(x.lines).padStart(5)}  ${x.file}`);

console.log('\n【二、接线完整性】');
console.log(`  存根总数 ${report.wiring.stubCount}`);
if (notWired.length) {
  bad(`${notWired.length} 个 api 模块存在但没接线（其中接口全部 404）：`);
  for (const x of notWired) console.log(`      ${x.file}（解构 ${x.destructured} 个依赖）`);
} else {
  ok('所有 api 模块都已接线');
}
if (missingDeps.length) {
  bad(`${missingDeps.length} 个模块要了存根没传的依赖 → 运行时 undefined：`);
  for (const x of missingDeps) console.log(`      ${x.file}:${x.line}  缺 ${x.keys.join(', ')}`);
} else {
  ok('没有「模块要但存根没传」的依赖');
}
if (extraDeps.length) {
  warn(`${extraDeps.length} 处存根传了模块没用到的依赖（无害，但依赖清单过时）：`);
  for (const x of extraDeps) console.log(`      ${x.file}:${x.line}  多余 ${x.keys.join(', ')}`);
} else {
  ok('没有冗余传参');
}
if (orphanLibs.length) {
  bad(`${orphanLibs.length} 个 lib 模块没有任何文件 require：`);
  for (const f of orphanLibs) console.log(`      lib/${f}`);
} else {
  ok(`lib/ 下 ${libFiles.length} 个模块都有引用者`);
}

console.log('\n【三、路由】');
console.log(`  共 ${report.routes.total} 条`);
if (duplicates.length) {
  bad(`${duplicates.length} 组重复注册（同方法同路径，只有第一条生效）：`);
  for (const d of duplicates) console.log(`      ${d.key}  ← ${d.occurrences.join(' , ')}`);
} else {
  ok('没有重复注册');
}
const topModules = report.routes.perModule.slice(0, 5);
console.log('  路由最多的模块:');
for (const x of topModules) console.log(`      ${String(x.routes).padStart(3)} 条  ${x.file}`);

console.log('\n【四、代码卫生】');
if (headerClaims.length) {
  warn(`${headerClaims.length} 个模块头注释声称的行数与实际差 20 行以上：`);
  for (const h of headerClaims) console.log(`      ${h.file}  声称 ${h.claimed} / 实际 ${h.actual}（差 ${h.diff > 0 ? '+' : ''}${h.diff}）`);
} else {
  ok('模块头注释的行数与实际一致');
}
if (deadSymbols.length) {
  warn(`server.js 有 ${deadSymbols.length} 个顶层符号只出现在定义处（疑似死代码）：`);
  for (const d of deadSymbols) console.log(`      ${d.name}  (${d.kind}, 第 ${d.line} 行)`);
} else {
  ok('server.js 顶层符号都有引用者');
}
if (syntaxFailed.length) {
  bad(`${syntaxFailed.length} 个文件语法错误：`);
  for (const s of syntaxFailed) console.log(`      ${s.file}  ${s.error}`);
} else {
  ok(`${syntaxChecked} 个文件语法全部通过`);
}

line('=');
const problems = notWired.length + missingDeps.length + duplicates.length + syntaxFailed.length + orphanLibs.length;
console.log(problems === 0 ? '结论：结构健康，无阻断性问题' : `结论：有 ${problems} 项需要处理`);
line('=');
process.exit(problems === 0 ? 0 : 1);
