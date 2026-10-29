#!/usr/bin/env node
/**
 * 建亿OA 冒烟测试
 * ================
 * 目的：在改动 server.js 后，一条命令确认「接口还在、还能返回数据」。
 *
 * 安全设计（本机连的是生产库，绝不能误写）：
 *   1. 只发 GET 请求 —— 不做任何写操作
 *   2. 排除 /api/debug* —— 这类 GET 实际会写库（/api/debug/save-contract）
 *   3. 路径参数用库里真实存在的 id，避免「记录不存在」被误判成错误
 *   4. 每个请求 10 秒超时，避免拖死
 *
 * 判定口径：
 *   🟢 2xx                     正常
 *   🟡 4xx / 3xx               路由存在，被鉴权或参数校验拦下（正常）
 *   🔴 5xx                     服务端报错 —— 必须修
 *   🔴 404 + HTML "Cannot GET" 路由不存在 —— 接口被删或改名了
 *   🔴 超时 / 连接失败         进程卡死或已崩
 *
 * 用法：
 *   node scripts/smoke-test.js                # 自己起服务、测完关掉
 *   node scripts/smoke-test.js --no-spawn     # 测已在 3002 跑着的服务
 *   node scripts/smoke-test.js --verbose      # 打印每个请求
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3002';
const TIMEOUT = 10000;
// 慢接口单独放宽：导出/统计/备份这类接口本身就是 5-10 秒量级
// （实测 /api/main-materials/export 生成 200KB Excel 要 6-10s，正好贴在 10s 阈值上），
// 用同一个阈值会让每次跑都随机冒出一个 🔴 超时，把真正的 5xx 淹掉 —— 告警一旦失真就没人看了。
const SLOW_TIMEOUT = 30000;
const SLOW_PATTERNS = [/\/export\b/, /\/download\b/, /\/dashboard\//, /\/stats\b/,
                       /\/summary\b/, /\/report/, /backup/];
const timeoutFor = (url) => (SLOW_PATTERNS.some((re) => re.test(url)) ? SLOW_TIMEOUT : TIMEOUT);
const CONCURRENCY = 4;
const ADMIN_ID = 1;

const argv = process.argv.slice(2);
const NO_SPAWN = argv.includes('--no-spawn');
const VERBOSE = argv.includes('--verbose');

const C = {
  r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[36m',
  d: '\x1b[2m', B: '\x1b[1m', 0: '\x1b[0m',
};
const ok = (s) => console.log(`${C.g}  ✓${C[0]} ${s}`);
const bad = (s) => console.log(`${C.r}  ✗${C[0]} ${s}`);
const warn = (s) => console.log(`${C.y}  !${C[0]} ${s}`);
const step = (s) => console.log(`\n${C.b}${C.B}▸ ${s}${C[0]}`);
const dim = (s) => `${C.d}${s}${C[0]}`;

// ---------------------------------------------------------------- 数据库
async function withDb(fn) {
  const mysql = require(path.join(SERVER_DIR, 'node_modules', 'mysql2', 'promise'));
  require(path.join(SERVER_DIR, 'node_modules', 'dotenv')).config({
    path: path.join(SERVER_DIR, '.env'),
    quiet: true,
  });
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true,
  });
  try {
    return await fn(conn);
  } finally {
    await conn.end().catch(() => {});
  }
}

// ---------------------------------------------------------------- 采样真实 id
// 让含路径参数的接口拿到真实存在的记录，否则 404 分不清是「没这条记录」还是「接口没了」
// ⚠️ 必须逐接口解析：:id 在不同接口里指的不是同一张表
//    返回 { '/api/contracts/:id': { id: 7 }, ... }
async function resolveSamples(routes) {
  const perRoute = {};
  const idCache = new Map();          // 表名 → 最小 id，避免重复查库
  const byParamFixed = {              // 名字能确定表的参数
    projectId: 'projects',
    customerId: 'customers',
    templateId: 'progress_node_templates',
  };

  await withDb(async (conn) => {
    const [tables] = await conn.query('SHOW TABLES');
    const tableList = tables.map((t) => Object.values(t)[0]);

    const minId = async (t) => {
      if (idCache.has(t)) return idCache.get(t);
      let v = null;
      if (tableList.includes(t)) {
        try {
          const [rows] = await conn.query(`SELECT MIN(id) AS id FROM \`${t}\``);
          if (rows.length && rows[0].id != null) v = rows[0].id;
        } catch (e) { /* 无 id 列 */ }
      }
      idCache.set(t, v);
      return v;
    };

    const [ph] = await conn.query(
      'SELECT phone FROM customers WHERE phone IS NOT NULL AND phone <> "" ORDER BY id LIMIT 1'
    ).catch(() => [[]]);
    const samplePhone = ph.length ? ph[0].phone : '13800000000';

    for (const r of routes) {
      const m = r.path.match(/:([A-Za-z_]+)/g);
      if (!m) continue;
      const parts = r.path.split('/').filter(Boolean);
      const vals = {};
      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i];
        if (!seg.startsWith(':')) continue;
        const name = seg.slice(1);
        if (name === 'phone') { vals.phone = samplePhone; continue; }

        const prev = (parts[i - 1] || '').replace(/^by-/, '');
        const norm = prev.replace(/-/g, '_');
        const cands = [];
        if (byParamFixed[name]) cands.push(byParamFixed[name]);
        cands.push(norm, norm.replace(/s$/, ''), norm + 's');
        if (name.endsWith('Id')) {
          const base = name.slice(0, -2).replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
          cands.push(base + 's', base);
        }
        let v = null;
        for (const t of [...new Set(cands)].filter(Boolean)) {
          v = await minId(t);
          if (v != null) break;
        }
        if (v == null) { vals[name] = 1; vals.__fallback = true; }
        else vals[name] = v;
      }
      perRoute[r.path] = vals;
    }
  }).catch((e) => {
    warn(`取样本 id 失败（将统一用 1）：${e.message}`);
  });

  return perRoute;
}

function fillPath(routePath, perRoute) {
  const vals = perRoute[routePath] || {};
  return {
    url: routePath.replace(/:([A-Za-z_]+)/g, (_, name) => encodeURIComponent(vals[name] ?? 1)),
    noSample: !!vals.__fallback,   // 库里没这条样本数据，404 属正常
  };
}

// ---------------------------------------------------------------- 单请求
async function probe(route, url) {
  const tmo = timeoutFor(url);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), tmo);
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + url, {
      method: 'GET',
      headers: { 'x-user-id': String(ADMIN_ID), 'x-user-type': 'employee' },
      signal: ctl.signal,
      redirect: 'manual',
    });
    const ms = Date.now() - t0;
    const ct = res.headers.get('content-type') || '';
    let body = '';
    if (res.status >= 400) body = await res.text().catch(() => '');

    // Express 默认 404：「Cannot GET /xxx」HTML —— 这说明路由根本没注册
    const isRouteMissing =
      res.status === 404 && /Cannot GET/i.test(body || '');

    let level;
    if (res.status >= 500) level = 'red';
    else if (isRouteMissing) level = 'red';
    else if (res.status >= 400) level = 'yellow';
    else if (res.status >= 300) level = 'yellow';
    else level = 'green';

    return {
      level, status: res.status, ms,
      note: isRouteMissing ? '路由未注册（Cannot GET）'
        : res.status >= 500 ? (body || '').replace(/\s+/g, ' ').slice(0, 160)
        : '',
    };
  } catch (e) {
    const ms = Date.now() - t0;
    const aborted = e.name === 'AbortError';
    return {
      level: 'red', status: 0, ms,
      note: aborted ? `超时 >${tmo / 1000}s` : `连接失败：${e.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(tasks, limit) {
  const out = new Array(tasks.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= tasks.length) return;
      out[idx] = await tasks[idx]();
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------- 路由基线
function loadInventory() {
  const p = path.join(ROOT, 'docs', 'route-inventory.json');
  if (!fs.existsSync(p)) return null;
  return require(p);
}

const BASELINE_FILE = path.join(ROOT, 'docs', 'route-baseline.json');

function diffBaseline(routes) {
  const cur = routes.map((r) => `${r.method} ${r.path}`).sort();
  if (!fs.existsSync(BASELINE_FILE)) {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify({ createdAt: new Date().toISOString(), routes: cur }, null, 2));
    return { created: true, removed: [], added: [] };
  }
  const base = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).routes;
  const baseSet = new Set(base);
  const curSet = new Set(cur);
  return {
    created: false,
    removed: base.filter((x) => !curSet.has(x)),
    added: cur.filter((x) => !baseSet.has(x)),
    total: { base: base.length, cur: cur.length },
  };
}

// ---------------------------------------------------------------- 起停服务
async function waitHealthy(ms = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch (e) { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

function startServer() {
  const node = process.execPath;
  const logPath = '/tmp/jianyioa-smoke-server.log';
  const out = fs.openSync(logPath, 'w');
  const child = spawn(node, ['server.js'], {
    cwd: SERVER_DIR,
    stdio: ['ignore', out, out],
    detached: true,   // 独立进程组，方便整组回收
  });
  child.unref();
  return { child, logPath };
}

function stopServer(pid) {
  try { process.kill(-pid, 'SIGTERM'); } catch (e) {
    try { process.kill(pid, 'SIGTERM'); } catch (e2) { /* 已退出 */ }
  }
}

// ---------------------------------------------------------------- 主流程
(async () => {
  console.log(`\n${C.B}═══ 建亿OA 冒烟测试 ═══${C[0]}  ${dim(new Date().toLocaleString('zh-CN'))}`);
  console.log(dim(`目标 ${BASE}   账号 admin(id=${ADMIN_ID})   只读模式`));

  let server = null;
  if (!NO_SPAWN) {
    step('启动服务');
    server = startServer();
    const up = await waitHealthy();
    if (!up) {
      bad(`服务 40 秒内未就绪，查看日志：${server.logPath}`);
      try {
        const t = fs.readFileSync(server.logPath, 'utf8').trim().split('\n').slice(-15).join('\n');
        console.log(dim(t));
      } catch (e) { /* ignore */ }
      stopServer(server.child.pid);
      process.exit(1);
    }
    ok('服务已就绪');
  }

  // ---- 准备路由清单
  const inv = loadInventory();
  if (!inv) {
    bad('缺 docs/route-inventory.json，先跑 node scripts/route-inventory.js');
    if (server) stopServer(server.child.pid);
    process.exit(1);
  }

  let routes = [];
  for (const m of inv.modules) {
    for (const r of m.routes) {
      if (r.method !== 'GET') continue;
      if (r.path.startsWith('/api/debug')) continue;   // GET 但会写库，必须排除
      if (!r.path.startsWith('/')) continue;           // 兜底路由 '*' 之类不是真实接口
      routes.push({ ...r, module: m.name });
    }
  }

  step('采集真实样本 id（让含参数的接口拿到存在的记录）');
  const samples = await resolveSamples(routes);
  const sampleLines = Object.entries(samples)
    .map(([p, v]) => `  ${p} → ${Object.entries(v).map(([k, x]) => `${k}=${x}`).join(' ')}`);
  if (sampleLines.length) console.log(dim(sampleLines.join('\n')));

  // ---- 基础设施
  step('基础设施');
  const infra = [
    { path: '/api/health', want: [200], label: '后端健康检查' },
    { path: '/', label: 'PC 首页 web/dist' },
    { path: '/m/', label: 'H5 首页 public-mobile-h5' },
  ];
  const infraResults = [];
  for (const t of infra) {
    const r = await probe(t, t.path);
    const pass = t.want ? t.want.includes(r.status) : r.status >= 200 && r.status < 400;
    infraResults.push({ ...t, ...r, pass });
    if (pass) { ok(`${t.label.padEnd(22)} ${r.status}  ${dim(r.ms + 'ms')}`); }
    else bad(`${t.label.padEnd(22)} ${r.status}  ${r.note || ''}`);
  }

  // ---- GET 接口
  step(`GET 接口巡检（${routes.length} 个）`);
  const tasks = routes.map((r) => async () => {
    const { url, noSample } = fillPath(r.path, samples);
    const res = await probe(r, url);
    // 库里没这条样本数据时，404 是「没数据」而不是「接口坏了」，单独归为 skip
    if (noSample && res.status === 404) {
      res.level = 'skip';
      res.note = '库里无样本数据';
    }
    if (VERBOSE) {
      const tag = res.level === 'green' ? ' ' : res.level === 'yellow' ? '!' : res.level === 'skip' ? '.' : '✗';
      console.log(dim(`  ${tag} ${String(res.status).padEnd(4)} ${String(res.ms).padStart(5)}ms  ${r.method} ${url}  [${r.module}]`));
    }
    return { ...r, url, ...res };
  });
  const results = await runPool(tasks, CONCURRENCY);

  const greens = results.filter((r) => r.level === 'green');
  const yellows = results.filter((r) => r.level === 'yellow');
  const reds = results.filter((r) => r.level === 'red');
  const skips = results.filter((r) => r.level === 'skip');

  // ---- 路由基线
  step('路由清单基线比对');
  const allRoutes = [];
  inv.modules.forEach((m) => m.routes.forEach((r) => allRoutes.push(r)));
  const diff = diffBaseline(allRoutes);
  if (diff.created) {
    warn(`首次运行，已建立基线 ${allRoutes.length} 条 → docs/route-baseline.json`);
  } else {
    if (diff.removed.length) {
      bad(`接口消失 ${diff.removed.length} 个（对比基线 ${diff.total.base} → 现在 ${diff.total.cur}）`);
      diff.removed.slice(0, 20).forEach((x) => console.log(dim(`      - ${x}`)));
    } else ok('没有接口消失');
    if (diff.added.length) {
      console.log(dim(`  新增 ${diff.added.length} 个（正常，改完记得更新基线）`));
      diff.added.slice(0, 10).forEach((x) => console.log(dim(`      + ${x}`)));
    }
  }

  // ---- 汇总
  console.log(`\n${C.B}═══ 汇总 ═══${C[0]}`);
  console.log(`  ${C.g}🟢 正常${C[0]}        ${greens.length}`);
  console.log(`  ${C.y}🟡 已拦截${C[0]}      ${yellows.length}   ${dim('4xx/3xx：路由在，鉴权或参数拦住')}`);
  console.log(`  ${C.d}⚪ 无数据${C[0]}      ${skips.length}   ${dim('库里没有样本记录，404 属正常')}`);
  console.log(`  ${C.r}🔴 异常${C[0]}        ${reds.length}   ${dim('5xx / 路由丢失 / 超时')}`);

  if (reds.length) {
    console.log(`\n${C.r}${C.B}需要处理：${C[0]}`);
    reds.sort((a, b) => b.status - a.status).forEach((r) => {
      console.log(`  ${C.r}${String(r.status).padEnd(4)}${C[0]} ${r.method} ${r.url}`);
      console.log(dim(`       [${r.module}] server.js:${r.line}  ${r.note}`));
    });
  }

  // ---- 落盘
  const report = {
    time: new Date().toISOString(),
    base: BASE,
    account: `admin(id=${ADMIN_ID})`,
    infra: infraResults,
    summary: { green: greens.length, yellow: yellows.length, skip: skips.length, red: reds.length, total: results.length },
    baseline: diff.created ? 'created' : { removed: diff.removed, added: diff.added },
    reds,
    yellows: yellows.map((r) => ({ method: r.method, path: r.path, status: r.status, module: r.module })),
    skips: skips.map((r) => ({ method: r.method, path: r.path, url: r.url, module: r.module })),
  };
  fs.writeFileSync(path.join(ROOT, 'docs', 'smoke-report.json'), JSON.stringify(report, null, 2));

  const md = [];
  md.push(`# 冒烟测试报告`, '', `- 时间：${new Date().toLocaleString('zh-CN')}`, `- 目标：${BASE}`, `- 账号：admin(id=${ADMIN_ID})（只读）`, '');
  md.push(`## 汇总`, '', `| 结果 | 数量 |`, `|---|---|`,
    `| 🟢 正常 | ${greens.length} |`, `| 🟡 已拦截 | ${yellows.length} |`,
    `| ⚪ 无数据 | ${skips.length} |`, `| 🔴 异常 | ${reds.length} |`, `| 总计 | ${results.length} |`, '');
  if (reds.length) {
    md.push(`## 🔴 异常明细`, '', `| 状态 | 接口 | 模块 | 行号 | 说明 |`, `|---|---|---|---|---|`);
    reds.forEach((r) => md.push(`| ${r.status} | \`${r.method} ${r.url}\` | ${r.module} | ${r.line} | ${(r.note || '').replace(/\|/g, '\\|')} |`));
    md.push('');
  }
  if (!diff.created && diff.removed.length) {
    md.push(`## 消失的接口`, '', ...diff.removed.map((x) => `- \`${x}\``), '');
  }
  fs.writeFileSync(path.join(ROOT, 'docs', 'smoke-report.md'), md.join('\n'));

  console.log(`\n${dim('报告：docs/smoke-report.md / docs/smoke-report.json')}`);

  if (server) {
    stopServer(server.child.pid);
    console.log(dim('测试服务已关闭'));
  }
  const failed = reds.length > 0 || (!diff.created && diff.removed.length > 0);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(`${C.r}冒烟测试自身出错：${C[0]}`, e);
  process.exit(2);
});
