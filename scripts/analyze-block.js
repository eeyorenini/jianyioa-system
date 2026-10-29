#!/usr/bin/env node
/**
 * analyze-block.js —— 拆分前置分析
 *
 * 用途：给定 server.js 里的一段行区间，列出这段代码引用了哪些「块外」的顶层符号，
 *      以及这些符号在 server.js 里是第几行定义的。用来避免拆出去后 require 不到
 *      （v2.5.2 就是因为漏了 server/material-pinyin.js 导致线上 503）。
 *
 * 用法：
 *   node scripts/analyze-block.js 10042 11289
 *   node scripts/analyze-block.js 10042 11289 --file server/server.js
 *
 * 输出：
 *   1. 顶层定义清单（const / let / var / function / class / require 解构）
 *   2. 这些符号在块内出现的次数（>0 的就是模块需要注入的依赖）
 *   3. 块内自己定义的符号（不需要注入）
 *
 * 注意：纯正则分析，会漏掉「动态属性访问」和「同名局部变量遮蔽」，
 *      结果仅作清单用，最终仍必须靠 node --check + 依赖检查脚本 + 冒烟验证。
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('用法: node scripts/analyze-block.js <startLine> <endLine> [--file path]');
  process.exit(1);
}
const start = parseInt(args[0], 10);
const end = parseInt(args[1], 10);
const fileIdx = args.indexOf('--file');
const file = fileIdx >= 0 ? args[fileIdx + 1] : path.join(__dirname, '..', 'server', 'server.js');

const lines = fs.readFileSync(file, 'utf8').split('\n');
if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end > lines.length || start > end) {
  console.error(`行区间非法：${start}-${end}（文件共 ${lines.length} 行）`);
  process.exit(1);
}

const before = lines.slice(0, start - 1);
const block = lines.slice(start - 1, end);
const blockText = block.join('\n');

// ---------- 1. 收集 server.js 顶层定义 ----------
// 只认「行首无缩进」的声明，缩进的都是块内局部变量
const RE_DEF = [
  /^const\s+([A-Za-z_$][\w$]*)\s*=/,                 // const X =
  /^let\s+([A-Za-z_$][\w$]*)\s*=/,                   // let X =
  /^var\s+([A-Za-z_$][\w$]*)\s*=/,                   // var X =
  /^function\s+([A-Za-z_$][\w$]*)\s*\(/,             // function X(
  /^async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/,     // async function X(
  /^class\s+([A-Za-z_$][\w$]*)\s*/,                  // class X
];

const topDefs = new Map(); // name -> lineNo
lines.forEach((ln, i) => {
  if (!ln || /^\s/.test(ln)) return;
  for (const re of RE_DEF) {
    const m = ln.match(re);
    if (m) {
      // 同名多次赋值时保留第一次（hoisting 与顺序无关，列出全部位置更有用）
      if (!topDefs.has(m[1])) topDefs.set(m[1], i + 1);
      return;
    }
  }
  // const { a, b, c } = require(...) 形式的解构
  const m2 = ln.match(/^const\s*\{([^}]*)\}\s*=/);
  if (m2) {
    m2[1].split(',').forEach((raw) => {
      const name = raw.split(':').pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name) && !topDefs.has(name)) topDefs.set(name, i + 1);
    });
  }
});

// ---------- 2. 块内自己的定义（含缩进的函数/变量，视为私有） ----------
const localNames = new Set();
block.forEach((ln) => {
  let m;
  if ((m = ln.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/))) localNames.add(m[1]);
  else if ((m = ln.match(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/))) localNames.add(m[1]);
  else if ((m = ln.match(/^\s*class\s+([A-Za-z_$][\w$]*)/))) localNames.add(m[1]);
  // 路由回调里的参数也算局部（req/res/next）
});

// ---------- 3. 统计块内引用 ----------
const used = [];
for (const [name, defLine] of topDefs) {
  if (localNames.has(name)) continue;
  // 用词边界匹配，避免 user 命中 user_id
  const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');
  const hits = (blockText.match(re) || []).length;
  if (hits > 0) used.push({ name, defLine, hits });
}
used.sort((a, b) => b.hits - a.hits);

// ---------- 4. 块内定义的顶层风格符号（拆出去后是模块私有） ----------
const blockDefs = [];
block.forEach((ln, i) => {
  if (!ln || /^\s/.test(ln)) return;
  for (const re of RE_DEF) {
    const m = ln.match(re);
    if (m) { blockDefs.push({ name: m[1], line: start + i }); return; }
  }
});

// ---------- 5. 块外的调用点（拆出去后这些地方会 require 不到） ----------
const outsideText = before.join('\n') + '\n' + lines.slice(end).join('\n');
const leaked = [];
for (const { name, line } of blockDefs) {
  const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');
  const hits = (outsideText.match(re) || []).length;
  if (hits > 0) leaked.push({ name, line, outsideHits: hits });
}

// ---------- 输出 ----------
console.log(`\n=== 块 ${start}-${end}（${block.length} 行）外部依赖 ===\n`);
if (used.length === 0) {
  console.log('（无）');
} else {
  console.log('依赖名'.padEnd(34) + '定义行'.padEnd(10) + '块内出现');
  console.log('-'.repeat(60));
  for (const u of used) {
    console.log(String(u.name).padEnd(34) + String(u.defLine).padEnd(10) + u.hits);
  }
}

console.log(`\n=== 块内自己定义的顶层符号（${blockDefs.length} 个）===`);
console.log(blockDefs.map((d) => `${d.name}@${d.line}`).join(', ') || '（无）');

if (leaked.length) {
  console.log(`\n⚠️  以下块内符号在块外仍被引用（拆走后会 undefined）:`);
  for (const l of leaked) console.log(`   ${l.name}（块内 ${l.line} 行）→ 块外还有 ${l.outsideHits} 处引用`);
} else {
  console.log('\n✅ 块内符号全部是私有的，块外无引用');
}

console.log(`\n=== require 模板 ===`);
const skip = new Set(['app', 'req', 'res', 'next', 'module', 'exports', 'require', 'console', 'process']);
const names = used.filter((u) => !skip.has(u.name)).map((u) => u.name);
console.log(`require('./api/xxx')(app, { ${names.join(', ')} });`);
console.log('');
