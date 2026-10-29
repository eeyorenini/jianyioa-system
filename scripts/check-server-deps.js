#!/usr/bin/env node
/**
 * 升级包 server 目录依赖完整性校验
 * ---------------------------------------------------------------
 * 从 server.js 出发，递归解析所有相对路径 require()，
 * 检查目标文件是否都在包里。缺一个就退出码 1。
 *
 * 用途：防止「包漏文件 → 服务器 Node 启动即崩 → Apache 503」。
 * v2.5.2 事故就是 server.js require('./material-pinyin') 但包里没这个文件。
 *
 * 用法: node check-server-deps.js <包内 server 目录>
 * 退出: 0 齐全 / 1 缺失 / 2 参数错误
 */
'use strict';

const fs = require('fs');
const path = require('path');

const argRoot = process.argv[2];
if (!argRoot || !fs.existsSync(argRoot)) {
  console.error('用法: node check-server-deps.js <server目录>');
  process.exit(2);
}
// 必须转成绝对路径：resolveSpec() 返回的是 path.resolve() 的绝对路径，
// 而孤儿检测用 path.join(apiDir, f) —— 若 root 是相对路径（`server`），
// 两边永远不相等，已注册模块会被全部误报成孤儿。传绝对路径时才不发作，
// 所以之前 make-release.sh 一直没踩到这个 bug。
const root = path.resolve(argRoot);

const entry = path.join(root, 'server.js');
if (!fs.existsSync(entry)) {
  console.error(`✗ 找不到入口文件: ${entry}`);
  process.exit(1);
}

// require('...') / require("...")
const RE_REQUIRE = /require\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
// require( 后面不是引号 → 动态拼接，静态无法解析
const RE_DYNAMIC = /require\s*\(\s*(?!['"])/g;

const missing = [];   // 真缺失
const thirdParty = []; // 指向 node_modules 的，服务器已装，跳过
const dynamic = [];   // 动态路径，需人工确认
const visited = new Set();
const queue = [entry];

function resolveSpec(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    base + '.js',
    base + '.cjs',
    base + '.mjs',
    base + '.json',
    path.join(base, 'index.js'),
    path.join(base, 'index.json'),
  ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch (e) { /* 不存在，继续试下一个 */ }
  }
  return null;
}

while (queue.length) {
  const file = queue.shift();
  if (visited.has(file)) continue;
  visited.add(file);
  if (!/\.(js|cjs|mjs)$/.test(file)) continue;

  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (e) {
    missing.push(`${path.relative(root, file)}（读取失败）`);
    continue;
  }

  const rel = path.relative(root, file) || 'server.js';

  // 动态 require：列出来让人过一眼（RE_DYNAMIC 带 g 标志，test() 会推进
  // lastIndex 造成状态污染，所以每次先归零）
  RE_DYNAMIC.lastIndex = 0;
  if (RE_DYNAMIC.test(src)) dynamic.push(rel);

  RE_REQUIRE.lastIndex = 0;
  let m;
  while ((m = RE_REQUIRE.exec(src))) {
    const spec = m[2];

    // 跳过被行注释掉的 require：`// require('./api/x')(app, ...)`
    // 否则会把它算进依赖图，导致「注释掉接线」被误判为「依赖完整」——
    // 而 Express 那边根本没注册，接口全 404。
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const before = src.slice(lineStart, m.index);
    if (before.includes('//') || /^\s*\*/.test(before)) continue;

    // 只管相对路径；裸模块名（express 等）是第三方
    if (!spec.startsWith('.')) continue;

    // server.js 里写的是 require('./node_modules/dotenv')，包内不带 node_modules
    if (spec.includes('node_modules/') || spec.startsWith('node_modules/')) {
      thirdParty.push(`${spec}  ← ${rel}`);
      continue;
    }

    const hit = resolveSpec(file, spec);
    if (hit) {
      queue.push(hit);
    } else {
      missing.push(`${spec}  ← ${rel}`);
    }
  }
}

// ---------- 孤儿模块检查 ----------
// api/*.js 存在、但 server.js 里没有 require 它 → 服务照常启动，什么都不报，
// 但那批接口全部 404。这类事故比「启动崩溃」更隐蔽：503 至少马上被人发现，
// 404 往往等业务方打电话才知道。和 v2.5.2 漏 material-pinyin.js 同一根源：
// 文件边界和引用关系没有强制校验。
const apiDir = path.join(root, 'api');
const orphans = [];
if (fs.existsSync(apiDir)) {
  for (const f of fs.readdirSync(apiDir)) {
    if (!f.endsWith('.js')) continue;
    const full = path.join(apiDir, f);
    if (!visited.has(full)) orphans.push(`api/${f}`);
  }
}

// ---------- 报告 ----------
const checked = visited.size;

if (thirdParty.length) {
  console.log(`  · 跳过第三方（服务器 node_modules 自带）: ${thirdParty.length} 处`);
}
if (dynamic.length) {
  console.log(`  ⚠ 含动态 require，需人工确认: ${[...new Set(dynamic)].join(', ')}`);
}

if (orphans.length) {
  console.error('');
  console.error(`  ✗ ${orphans.length} 个模块存在但未被 require —— 其中的接口全部 404：`);
  for (const o of orphans) console.error(`      ${o}`);
  console.error('');
  console.error('  处理：在 server.js 里补一行');
  console.error("        require('./api/<模块>')(app, { ...依赖 });");
  console.error('        改完重新出包。参考 docs/服务端路由清单.md 的「孤儿模块」提示。');
  process.exit(1);
}

if (missing.length === 0) {
  console.log(`  ✓ 依赖完整：检查 ${checked} 个模块，相对 require 全部可在包内解析`);
  process.exit(0);
}

console.error('');
console.error('  ✗ 包里缺文件！服务器启动会直接崩（Cannot find module）：');
for (const item of missing) console.error(`      ${item}`);
console.error('');
console.error('  处理：检查 make-release.sh 里的 rsync --exclude 规则，');
console.error('        把被误排掉的文件放出来，或手工补进包内 server/ 目录。');
process.exit(1);
