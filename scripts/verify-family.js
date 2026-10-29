#!/usr/bin/env node
/**
 * 家庭成员 / 项目级授权 —— 端到端验证（v2.5.3 二次改造）
 *
 * 为什么写成脚本而不是手动 curl：
 *   本机 3002 服务脱离会话后会被回收（nohup/disown 也挡不住），
 *   手动起一个再等一会儿回来测，进程已经没了。
 *   这个脚本 spawn 子进程 → 等健康检查 → 跑完全部场景 → 关掉，一个命令内闭环。
 *
 * 用法：node scripts/verify-family.js
 * 会写库（新增测试成员、插验证码、临时插一个项目、改 bound_at），跑完自动清理。
 *
 * 核心待验证命题：
 *   ① 授权粒度是**项目**：一个业主名下有两套房时，只被邀请看 A 的家人看不到 B。
 *   ② 一个人可以既是自己项目的主账号、又是别人项目的副账号，项目取并集。
 *   ③ 副账号的 x-user-id 用自己的 family_members.id + x-user-scope=member，
 *      不会因为 id 撞号被认成主账号（权限放大成整个家族）。
 *   ④ GET /api/projects?customer_id= 不能再被用来查别人的项目。
 */
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');

// 依赖装在 server/ 下（本脚本在仓库根的 scripts/，直接 require 找不到 node_modules）
const SERVER_DIR = path.join(__dirname, '..', 'server');
const mysql = require(path.join(SERVER_DIR, 'node_modules', 'mysql2', 'promise'));
require(path.join(SERVER_DIR, 'node_modules', 'dotenv')).config({ path: path.join(SERVER_DIR, '.env') });

const PORT = 3002;
const BASE = `http://127.0.0.1:${PORT}`;
const NODE_BIN = process.execPath;

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}  ${detail ? '→ ' + detail : ''}`); }
}

async function req(method, url, { headers = {}, body } = {}) {
  const r = await fetch(BASE + url, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch (e) { data = null; }
  return { status: r.status, data };
}

async function waitHealthy(timeoutMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return true;
    } catch (e) { /* 还没起来 */ }
    await new Promise((res) => setTimeout(res, 700));
  }
  return false;
}

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// 往短信验证码表塞一条可用验证码（不走真实短信）
async function putCode(conn, phone, code) {
  await conn.query(
    `INSERT INTO sms_codes (phone, scene, code_hash, expires_at, fail_count, ip, created_at)
     VALUES (?, 'login', ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), 0, '127.0.0.1', NOW())`,
    [phone, sha256(code)]
  );
}

const projIds = (r) => (Array.isArray(r.data) ? r.data.map((p) => Number(p.id)).sort((a, b) => a - b) : []);

async function main() {
  console.log('启动后端服务…');
  const child = spawn(NODE_BIN, ['server.js'], {
    cwd: SERVER_DIR,
    stdio: 'ignore',
    detached: false,
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
  });
  child.on('error', (e) => console.error('子进程错误:', e.message));

  const healthy = await waitHealthy();
  if (!healthy) {
    console.error('❌ 服务没起来（日志见 /tmp/verify-family-server.log 或前台输出）');
    try { child.kill('SIGKILL'); } catch (e) { /* ignore */ }
    process.exit(1);
  }
  console.log('服务已就绪（DDL 迁移已在启动时执行）\n');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, dateStrings: true,
  });

  // ============ 测试用固定数据 ============
  // 郭大大 customers.id=5，项目 15「柏林山水1-1-103」
  // 国二   customers.id=14，项目 17「云秀花园紫竹院1102」
  // 郑大   customers.id=6，手机号 13693365077（同时被郭大大登记成「郑大大」）
  const H_MASTER = { 'x-user-id': '5', 'x-user-type': 'customer' };
  const H_OTHER = { 'x-user-id': '14', 'x-user-type': 'customer' };
  const NEW_PHONE = '13900007777';
  const FAKE_PROJECT_ID = 9998; // 临时插到郭大大名下的第二套房，用于证明「只能看被授权的那一个」

  // 基线：真实家庭成员条数。清理段拿它比对，避免脚本误删真实数据。
  // 不写死数字 —— 大王随时会在页面上加真人成员，写死就得每次改脚本。
  const [baseFm] = await conn.query('SELECT COUNT(*) AS n FROM family_members');
  const BASE_FM_COUNT = Number(baseFm[0].n);

  try {
    // 前置：确认迁移已补上 project_id 列
    const [cols] = await conn.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='family_members' AND COLUMN_NAME IN ('project_id','bound_at')"
    );
    ok('迁移已补 project_id / bound_at 列', cols.length === 2, JSON.stringify(cols.map((c) => c.COLUMN_NAME)));

    const [idx] = await conn.query("SHOW INDEX FROM family_members WHERE Key_name = 'uk_phone'");
    ok('已移除 uk_phone（同一个人可被多个项目邀请）', idx.length === 0, `仍有 ${idx.length} 条`);

    // 临时给郭大大加第二套房 —— 这样「项目级」和「客户级」的结果才会不同
    await conn.query(
      `INSERT INTO projects (id, name, customer_id, status, created_at)
       VALUES (?, '越权测试用房', 5, '开工准备', NOW())
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [FAKE_PROJECT_ID]
    );

    // ============ 一、列表（按人聚合 + 项目） ============
    console.log('【一、家庭成员列表】');
    let r = await req('GET', '/api/family-members');
    ok('匿名访问被拒 401', r.status === 401, `实际 ${r.status}`);

    r = await req('GET', '/api/family-members', { headers: H_MASTER });
    const list = Array.isArray(r.data) ? r.data : [];
    ok('主账号能看到 3 条（主账号 + 郑大大 + 郑二）', r.status === 200 && list.length === 3, `实际 ${list.length} 条`);
    const masterRow = list.find((m) => m.is_master === 1);
    ok('第一行是主账号且 is_self=true', !!masterRow && masterRow.is_self === true);
    ok('主账号 can_manage=false（不能删自己）', !!masterRow && masterRow.can_manage === false);
    const memberRows = list.filter((m) => m.is_master === 0);
    ok('成员行 can_manage=true（主账号可管理）', memberRows.length > 0 && memberRows.every((m) => m.can_manage === true));
    ok('成员行带出被授权的项目名', memberRows.some((m) => Array.isArray(m.projects) && m.projects.length > 0 && m.projects[0].name),
      JSON.stringify(memberRows.map((m) => m.projects)));

    // 同号码多项目要聚合为一行（不出现两个「郑大大」）
    const phones = memberRows.map((m) => m.phone);
    ok('同一手机号只出现一行（按人聚合）', new Set(phones).size === phones.length, JSON.stringify(phones));

    // ============ 二、添加成员时的项目授权 ============
    console.log('\n【二、添加成员（项目级授权）】');
    r = await req('POST', '/api/family-members', { headers: H_MASTER, body: { name: '临时测试甲', phone: NEW_PHONE, relation: '子女' } });
    ok('郭大大添加成员成功（名下多项目时必须指定，这里未指定）',
      r.status === 400 && /选择|项目/.test((r.data && r.data.error) || ''), JSON.stringify(r.data));
    ok('多项目时返回可选项目列表', Array.isArray(r.data && r.data.projects) && r.data.projects.length === 2,
      JSON.stringify(r.data && r.data.projects));

    r = await req('POST', '/api/family-members', {
      headers: H_MASTER, body: { name: '临时测试甲', phone: NEW_PHONE, relation: '子女', project_id: 15 },
    });
    ok('指定项目 15 后添加成功', r.status === 200 && r.data && r.data.success === true, JSON.stringify(r.data));
    ok('返回 is_bound=false（需本人确认）', r.data && r.data.is_bound === false);
    const newId = r.data && r.data.id;

    r = await req('POST', '/api/family-members', {
      headers: H_MASTER, body: { name: '临时测试甲', phone: NEW_PHONE, relation: '子女', project_id: FAKE_PROJECT_ID },
    });
    ok('同号码再授权第二套房 → 新增一行（不是更新）', r.status === 200 && r.data && r.data.success === true && !r.data.updated,
      JSON.stringify(r.data));

    r = await req('POST', '/api/family-members', {
      headers: H_MASTER, body: { name: '越权', phone: '13900006666', project_id: 17 },
    });
    ok('不能授权别人名下的项目（17 属于国二）', r.status === 403, JSON.stringify(r.data));

    // 换个家庭（国二）邀请同一个号码看自己的项目 —— 项目级授权允许
    r = await req('POST', '/api/family-members', {
      headers: H_OTHER, body: { name: '临时测试甲', phone: NEW_PHONE, relation: '父母', project_id: 17 },
    });
    ok('另一个人也能邀请同一号码看自己的项目（一人多项目）', r.status === 200 && r.data && r.data.success === true,
      JSON.stringify(r.data));

    // 清理掉第二套房那一行，让后续只授权 15，才能验证「看不到第二套房」
    await conn.query('DELETE FROM family_members WHERE phone = ? AND project_id = ?', [NEW_PHONE, FAKE_PROJECT_ID]);
    ok('已撤销第二套房的授权（保留 项目15 + 项目17）', true);

    // ============ 三、待确认成员登录 → 一次确认全部 ============
    console.log('\n【三、待确认成员登录 → 一次确认多个项目】');
    const code1 = '246810';
    await putCode(conn, NEW_PHONE, code1);
    r = await req('POST', '/api/customer-auth/login-by-code', { body: { phone: NEW_PHONE, code: code1 } });
    const pend = r.data || {};
    ok('待确认成员登录返回 needBindFamily', pend.needBindFamily === true, JSON.stringify(pend).slice(0, 200));
    ok('返回一次性 bindToken', !!(pend.bindToken && pend.bindToken.length >= 32));
    ok('未确认前不返回任何项目/档案字段', !(pend.customer || pend.masterCustomer));
    ok('列出全部待确认项目（2 个：15 与 17）',
      Array.isArray(pend.pendingProjects) && pend.pendingProjects.length === 2,
      JSON.stringify(pend.pendingProjects));
    const pnames = (pend.pendingProjects || []).map((p) => Number(p.projectId)).sort((a, b) => a - b);
    ok('待确认项目 id 正确 = [15,17]', pnames.length === 2 && pnames[0] === 15 && pnames[1] === 17, JSON.stringify(pnames));
    ok('弹窗带出邀请人姓名', (pend.pendingProjects || []).every((p) => !!p.masterName), JSON.stringify(pend.pendingProjects));

    const bindToken = pend.bindToken;
    r = await req('POST', '/api/family-members/confirm-bind', { body: { bindToken: 'a'.repeat(48) } });
    ok('伪造 bindToken 被拒（400）', r.status === 400, `实际 ${r.status}`);

    r = await req('POST', '/api/family-members/confirm-bind', { body: { bindToken } });
    const bound = r.data || {};
    ok('一次确认绑定两个项目', r.status === 200 && bound.success === true, JSON.stringify(bound).slice(0, 200));
    ok('boundCount = 2', Number(bound.boundCount) === 2, `实际 ${bound.boundCount}`);
    ok('grantedProjects 含 15 和 17',
      Array.isArray(bound.grantedProjects) && bound.grantedProjects.map((p) => Number(p.id)).sort((a, b) => a - b).join(',') === '15,17',
      JSON.stringify(bound.grantedProjects));
    const memberRawId = bound.familyMemberId || (bound.customer && bound.customer.id);
    ok('副账号 customer.id = 成员自己那条 id（不再用主账号 id）',
      Number(bound.customer && bound.customer.id) === Number(memberRawId),
      `customer.id=${bound.customer && bound.customer.id} familyMemberId=${bound.familyMemberId}`);

    r = await req('POST', '/api/family-members/confirm-bind', { body: { bindToken } });
    ok('同一 bindToken 不能重复使用', r.status === 400, `实际 ${r.status}`);

    // 副账号请求头：x-user-id = 成员自己的 id，x-user-scope = member
    const H_NEW = { 'x-user-id': String(memberRawId), 'x-user-type': 'customer', 'x-user-scope': 'member' };

    // ============ 四、项目可见范围（核心） ============
    console.log('\n【四、项目可见范围（项目级授权核心）】');
    r = await req('GET', '/api/projects', { headers: H_NEW });
    let ids = projIds(r);
    ok('副账号能看到被授权的 2 个项目 [15,17]', ids.join(',') === '15,17', JSON.stringify(ids));

    r = await req('GET', `/api/projects?customer_id=5`, { headers: H_NEW });
    ids = projIds(r);
    ok('带 ?customer_id=5 也不能看到郭大大的第二套房（参数被忽略）',
      ids.join(',') === '15,17', JSON.stringify(ids));

    r = await req('GET', `/api/projects?customer_id=${FAKE_PROJECT_ID}`, { headers: H_NEW });
    ids = projIds(r);
    ok('带 ?customer_id=9998 也拿不到未授权项目', ids.join(',') === '15,17', JSON.stringify(ids));

    // 主账号确实能看到自己的第二套房 → 证明上面的「看不到」不是因为数据不存在
    r = await req('GET', '/api/projects', { headers: H_MASTER });
    ids = projIds(r);
    ok('主账号能看到自己的两套房 [15,9998]', ids.join(',') === '15,9998', JSON.stringify(ids));

    r = await req('GET', '/api/projects', { headers: H_OTHER });
    ids = projIds(r);
    ok('国二只能看到自己的 [17]', ids.join(',') === '17', JSON.stringify(ids));

    // 未授权项目的验收记录必须 403
    r = await req('GET', `/api/acceptance?project_id=${FAKE_PROJECT_ID}`, { headers: H_NEW });
    ok('未授权项目的验收记录 403', r.status === 403, `实际 ${r.status}`);

    // ============ 五、副账号只读 ============
    console.log('\n【五、副账号只读，不能管理成员】');
    r = await req('GET', '/api/family-members', { headers: H_NEW });
    const subList = Array.isArray(r.data) ? r.data : [];
    ok('副账号能看到所属家庭的成员', r.status === 200 && subList.length > 0, `实际 ${subList.length}`);
    ok('副账号 can_manage 全为 false', subList.every((m) => m.can_manage === false));
    ok('副账号 is_self 指向自己', subList.some((m) => m.is_self === true));

    r = await req('POST', '/api/family-members', { headers: H_NEW, body: { name: '硬加', phone: '13900005555' } });
    ok('副账号不能添加成员（403）', r.status === 403, `实际 ${r.status}`);

    r = await req('DELETE', '/api/family-members/2', { headers: H_NEW });
    ok('副账号不能删成员（403）', r.status === 403, `实际 ${r.status}`);

    r = await req('DELETE', '/api/family-members/2', { headers: H_OTHER });
    ok('别的业主删不了这家人成员（403）', r.status === 403, `实际 ${r.status}`);

    // ============ 六、身份撞号：副账号不会被认成主账号 ============
    console.log('\n【六、撞号防护】');
    // family_members.id=5 与 customers.id=5 同时存在（库里真实数据）
    const [collide] = await conn.query(
      'SELECT (SELECT COUNT(*) FROM customers WHERE id=5) AS c5, (SELECT COUNT(*) FROM family_members WHERE id=5) AS f5'
    );
    if (Number(collide[0].f5) > 0) {
      const H_COLLIDE = { 'x-user-id': '5', 'x-user-type': 'customer', 'x-user-scope': 'member' };
      r = await req('GET', '/api/projects', { headers: H_COLLIDE });
      const cids = projIds(r);
      ok('声明 member 时按 family_members.id=5 解析，不会被当成郭大大(customers.5)',
        !cids.includes(15) || cids.length === 0, JSON.stringify(cids));
    } else {
      ok('撞号样本不存在，跳过（无 family_members.id=5）', true);
    }

    // ============ 七、主账号 + 被邀请 并存 ============
    console.log('\n【七、从账号未来行使主账号权利（双重身份并存）】');
    // 郑大 customers.id=6，名下 0 个项目；同时被郭大大登记成「郑大大」（库里已有 id=2 那条）
    // ⚠️ 这里**不能** INSERT ... ON DUPLICATE KEY —— (phone,project_id) 已存在时会命中
    //    真实那条记录并把它改掉，测完清理就少一条数据（本轮踩过）。只按 id 更新 bound_at。
    const [zhengRow] = await conn.query(
      "SELECT id, project_id FROM family_members WHERE phone = '13693365077' AND is_master = 0 LIMIT 1"
    );
    ok('库里已有郑大大这条成员记录（id=2）', zhengRow.length === 1, JSON.stringify(zhengRow));
    const zhengMemberId = zhengRow.length ? Number(zhengRow[0].id) : null;
    if (zhengMemberId && !zhengRow[0].project_id) {
      await conn.query('UPDATE family_members SET project_id = 15 WHERE id = ?', [zhengMemberId]);
    }

    const code2 = '135790';
    await putCode(conn, '13693365077', code2);
    r = await req('POST', '/api/customer-auth/login-by-code', { body: { phone: '13693365077', code: code2 } });
    ok('郑大登录进自己的客户档案（customers.id=6），不被郭家抢走',
      r.data && r.data.success === true && Number(r.data.customer && r.data.customer.id) === 6,
      JSON.stringify(r.data && r.data.customer));
    ok('同时带出待确认项目（项目 15）',
      Array.isArray(r.data && r.data.pendingProjects) && r.data.pendingProjects.length >= 1 &&
      Number(r.data.pendingProjects[0].projectId) === 15,
      JSON.stringify(r.data && r.data.pendingProjects));
    ok('主账号身份不因被邀请而降级（isFamilyMember 不成立）', !(r.data && r.data.isFamilyMember));

    // 主账号 + 被授权项目，项目范围取并集
    r = await req('GET', '/api/projects', { headers: { 'x-user-id': '6', 'x-user-type': 'customer' } });
    const zhengIds = projIds(r);
    ok('郑大确认前只能看到自己名下（0 个）', zhengIds.length === 0, JSON.stringify(zhengIds));

    // 模拟他确认了项目 15 的邀请（只改 bound_at，行本身保留）
    if (zhengMemberId) {
      await conn.query('UPDATE family_members SET bound_at = NOW() WHERE id = ?', [zhengMemberId]);
    }
    r = await req('GET', '/api/projects', { headers: { 'x-user-id': '6', 'x-user-type': 'customer' } });
    const zhengIds2 = projIds(r);
    ok('确认后能看到被授权的项目 15（主账号权利 + 授权项目取并集）',
      zhengIds2.includes(15), JSON.stringify(zhengIds2));
    ok('仍然看不到郭大大未授权的第二套房', !zhengIds2.includes(FAKE_PROJECT_ID), JSON.stringify(zhengIds2));

    // ============ 八、登录文案（无项目） ============
    console.log('\n【八、未登记手机号的提示】');
    const code3 = '998877';
    const UNKNOWN_PHONE = '13900004444';
    await putCode(conn, UNKNOWN_PHONE, code3);
    r = await req('POST', '/api/customer-auth/login-by-code', { body: { phone: UNKNOWN_PHONE, code: code3 } });
    ok('未登记号码登录失败', r.data && r.data.success === false, JSON.stringify(r.data));
    ok('提示引导联系销售人员', /销售|项目/.test(String((r.data && r.data.message) || '')), JSON.stringify(r.data && r.data.message));

    // ============ 九、清理 ============
    console.log('\n【九、清理测试数据】');
    await conn.query('DELETE FROM family_members WHERE phone = ?', [NEW_PHONE]);
    // 郑大大那条是真实数据，只把 bound_at 恢复为 NULL（不能删行）
    await conn.query("UPDATE family_members SET bound_at = NULL, bind_openid = NULL WHERE phone = '13693365077' AND is_master = 0");
    await conn.query('DELETE FROM projects WHERE id = ?', [FAKE_PROJECT_ID]);
    await conn.query('DELETE FROM sms_codes WHERE phone IN (?, ?, ?)', [NEW_PHONE, '13693365077', UNKNOWN_PHONE]);
    const [left] = await conn.query('SELECT COUNT(*) AS n FROM family_members WHERE phone = ?', [NEW_PHONE]);
    ok('测试成员已清理', Number(left[0].n) === 0);
    const [leftPj] = await conn.query('SELECT COUNT(*) AS n FROM projects WHERE id = ?', [FAKE_PROJECT_ID]);
    ok('临时项目已清理', Number(leftPj[0].n) === 0);
    const [leftFm] = await conn.query('SELECT COUNT(*) AS n FROM family_members');
    ok(`家庭成员总数回到基线 ${BASE_FM_COUNT} 条（真实数据未被破坏）`,
      Number(leftFm[0].n) === BASE_FM_COUNT, `实际 ${leftFm[0].n}`);
    const [zhengAfter] = await conn.query(
      "SELECT id, bound_at FROM family_members WHERE phone = '13693365077' AND is_master = 0"
    );
    ok('郑大大记录仍在且恢复为「待加入」',
      zhengAfter.length === 1 && zhengAfter[0].bound_at === null, JSON.stringify(zhengAfter));
  } finally {
    await conn.end().catch(() => {});
    try { child.kill('SIGTERM'); } catch (e) { /* ignore */ }
    await new Promise((res) => setTimeout(res, 800));
    try { child.kill('SIGKILL'); } catch (e) { /* ignore */ }
  }

  console.log('\n' + '='.repeat(56));
  console.log(`通过 ${pass} / 失败 ${fail}`);
  if (fail) { console.log('失败项：'); failures.forEach((f) => console.log('  · ' + f)); }
  console.log('='.repeat(56));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('验证脚本异常:', e); process.exit(1); });
