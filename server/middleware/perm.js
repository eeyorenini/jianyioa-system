'use strict';

/**
 * 建亿 OA · 权限核心（v2.3.1 P2 落地）
 *
 * 单一真源：roles.permissions（数据库）。代码里不再"按角色写死"业务判断。
 *
 * 主要导出：
 *   - loadUserPermissions(userId)          : 读 {module:action} 集合
 *   - canAction(userId, moduleKey, action) : 是否可以做该动作（admin 直通）
 *   - canReadAll(userId, moduleKey)        : 是否该模块 read_all
 *   - visibleScope(userId, moduleKey)      : 'all' | 'related' | 'none'
 *   - relatedProjectIds(userId)            : 我关联的项目 ID 集合（含 foreman/creator）
 *   - requirePerm(moduleKey, action)       : Express 中间件（403 直接拒）
 *   - requireAuth()                        : Express 鉴权中间件
 *
 * 缓存策略：10 秒内存缓存，避免每次请求都查库。
 */

const { pool } = require('../db-mysql-async');

const CACHE_TTL_MS = 10 * 1000;
const permCache = new Map(); // userId -> { perms:Set, scope:Map, exp:number }

function _now() { return Date.now(); }

async function loadUserPermissions(userId) {
  if (!userId) return new Set();
  const hit = permCache.get(userId);
  if (hit && hit.exp > _now()) return hit.perms;
  try {
    const [rows] = await pool.query(
      `SELECT r.permissions AS role_perms, e.username AS username, r.code AS role_code
       FROM employees e
       LEFT JOIN roles r ON r.id = e.role_id
       WHERE e.id = ? LIMIT 1`,
      [userId]
    );
    let permSet = new Set();
    if (rows && rows[0]) {
      const row = rows[0];
      // admin（role_code 或 username = admin）直通
      if (row.role_code === 'admin' || row.username === 'admin') {
        permSet = new Set(['*']);
      } else {
        let raw = row.role_perms;
        if (typeof raw === 'string') {
          try { raw = JSON.parse(raw); } catch { raw = []; }
        }
        if (Array.isArray(raw)) raw.forEach((p) => p && permSet.add(String(p)));
      }
    }
    permCache.set(userId, { perms: permSet, exp: _now() + CACHE_TTL_MS });
    return permSet;
  } catch (e) {
    console.error('[perm] loadUserPermissions failed:', e.message);
    return new Set();
  }
}

function invalidatePermCache(userId) {
  if (userId == null) permCache.clear();
  else permCache.delete(userId);
}

/** 是否可以做 {module}:{action}。admin(*)、未配、跨动作一律安全语义 */
async function canAction(userId, moduleKey, action = 'read') {
  if (!userId || !moduleKey) return false;
  const perms = await loadUserPermissions(userId);
  if (perms.has('*')) return true;
  // read_all 自动覆盖 read
  if (action === 'read' && perms.has(`${moduleKey}:read_all`)) return true;
  return perms.has(`${moduleKey}:${action}`);
}

/** 是否拥有该模块的 read_all */
async function canReadAll(userId, moduleKey) {
  if (!userId || !moduleKey) return false;
  const perms = await loadUserPermissions(userId);
  if (perms.has('*')) return true;
  return perms.has(`${moduleKey}:read_all`);
}

/** 三档可见性 */
async function visibleScope(userId, moduleKey) {
  if (!userId || !moduleKey) return 'none';
  const perms = await loadUserPermissions(userId);
  if (perms.has('*')) return 'all';
  if (perms.has(`${moduleKey}:read_all`)) return 'all';
  if (perms.has(`${moduleKey}:read`)) return 'related';
  return 'none';
}

/** "我关联的项目"集合（含工长/创建人/设计师/监理/项目经理/客户） */
async function relatedProjectIds(userId) {
  if (!userId) return new Set();
  try {
    const [rows] = await pool.query(
      `SELECT id FROM projects
       WHERE creator_id = ? OR designer_id = ? OR supervisor_id = ?
          OR manager_id = ? OR foreman_id = ?
       UNION
       SELECT id FROM projects WHERE customer_id IN (SELECT id FROM customers WHERE phone = (SELECT phone FROM employees WHERE id = ?))`,
      [userId, userId, userId, userId, userId, userId]
    );
    return new Set((rows || []).map((r) => r.id));
  } catch (e) {
    console.error('[perm] relatedProjectIds failed:', e.message);
    return new Set();
  }
}

/**
 * 解析「业主（客户）身份」—— 业主端 x-user-id 存的不是 employees.id，
 * 而是 customers.id（有自己客户档案的人）或 family_members.id（纯家庭成员）。
 *
 * 2026-10-29 v2.5.3 改造为「项目级授权」后的口径：
 *
 *   ① 一个手机号代表一个**人**，不是一条记录。同一个人可能既有自己的客户档案
 *      （名下有自己的项目），又被别人邀请进某个项目。这两种身份**并存**，
 *      可见项目取并集 —— 这就是「从账号未来行使主账号权利」的落地方式。
 *
 *   ② 授权粒度是**项目**，不是客户。family_members 一行 = 一个手机号对一个项目的
 *      查看授权（project_id）。业主有两套房时，只邀请家人看其中一套，
 *      家人就只能看到那一套，不会顺带看到另一套的合同金额。
 *
 *   ③ scope === 'member' 时只查 family_members、跳过 customers。
 *      原因：两套自增序列会撞号（库里 family_members.id=5 与 customers.id=5 同时存在），
 *      副账号若先查 customers，会被误认成那个主账号。前端在「我是成员」时注入
 *      x-user-scope: member。伪造这个头只会让权限变小（查不到 family_members 行 → 401），
 *      不构成提权。
 *
 * @param {number} userId   x-user-id 的值
 * @param {string} userType x-user-type（customer / employee / 空）
 * @param {string} scope    x-user-scope（member / 空）
 * @returns {null | {
 *   customerId:number,          // 锚点 id（兼容旧调用方；有自己档案=自己，否则=成员行指向的主账号）
 *   ownCustomerId:number|null,  // ★ 自己客户档案 id；纯家庭成员为 null（决定"自己名下项目"的范围）
 *   isFamilyMember:boolean,     // 是否没有自己的客户档案（纯成员）
 *   familyMemberId:number|null,
 *   familyMemberIds:number[],
 *   name:string, phone:string,
 *   grantedProjectIds:number[],       // ★ 被授权查看的项目
 *   legacyGrantCustomerIds:number[],  // 老数据兜底：project_id 为 NULL 的已绑成员行（按客户级给全项目）
 * }}
 */
async function resolveCustomerIdentity(userId, userType = '', scope = '') {
  if (!userId) return null;
  try {
    const declaredCustomer = String(userType || '').toLowerCase() === 'customer';
    const asMember = String(scope || '').toLowerCase() === 'member';

    let phone = null;
    let ownCustomer = null;
    let memberRows = [];

    if (asMember) {
      // 副账号：只认 family_members，绝不查 customers（消除撞号误判）
      const [fm] = await pool.query(
        'SELECT id, customer_id, name, phone FROM family_members WHERE id = ? LIMIT 1', [userId]
      );
      if (!fm || !fm.length) return null;
      phone = fm[0].phone;
      memberRows = fm;
    } else {
      // 员工优先排除（只在未显式声明 customer 时；employees/customers id 会撞号）
      if (!declaredCustomer) {
        const [emp] = await pool.query('SELECT id FROM employees WHERE id = ? LIMIT 1', [userId]);
        if (emp && emp.length) return null; // 是员工，走原有权限体系
      }
      const [cus] = await pool.query(
        'SELECT id, name, phone FROM customers WHERE id = ? LIMIT 1', [userId]
      );
      if (cus && cus.length) {
        ownCustomer = cus[0];
        phone = cus[0].phone;
      } else {
        const [fm] = await pool.query(
          'SELECT id, customer_id, name, phone FROM family_members WHERE id = ? LIMIT 1', [userId]
        );
        if (!fm || !fm.length) return null;
        phone = fm[0].phone;
        memberRows = fm;
      }
    }

    // ---- 有了手机号，把这个「人」的完整身份算齐 ----
    if (phone) {
      // 自己有没有客户档案（副账号登陆时也会查，决定他能不能用主账号权利）
      if (!ownCustomer) {
        const [cus2] = await pool.query(
          'SELECT id, name, phone FROM customers WHERE phone = ? LIMIT 1', [phone]
        );
        if (cus2 && cus2.length) ownCustomer = cus2[0];
      }
      // 该手机号被授权过的全部记录（可能跨多个主账号、多个项目）
      const [rows] = await pool.query(
        `SELECT id, customer_id, name, phone, relation, project_id, bound_at, is_master
           FROM family_members WHERE phone = ? AND status = 1`, [phone]
      );
      if (rows && rows.length) memberRows = rows;
    }

    // ---- 授权项目：只算「本人已确认」且「不是主账号自述行」 ----
    const grantedProjectIds = [];
    const legacyGrantCustomerIds = [];
    for (const r of memberRows) {
      if (Number(r.is_master) === 1) continue;   // 主账号自述行不产生授权
      if (!r.bound_at) continue;                 // 业主登记了但本人没确认 → 无任何权限
      if (r.project_id) grantedProjectIds.push(Number(r.project_id));
      else legacyGrantCustomerIds.push(Number(r.customer_id)); // 老数据：客户级授权
    }

    const ownCustomerId = ownCustomer ? Number(ownCustomer.id) : null;

    // 锚点：优先自己档案；纯成员用成员行指向的主账号（仅作标识，不再拿它算全项目）
    let anchorCustomerId = ownCustomerId;
    if (!anchorCustomerId) {
      const first = memberRows[0];
      anchorCustomerId = first ? Number(first.customer_id) : null;
    }
    if (!anchorCustomerId) return null;

    return {
      customerId: anchorCustomerId,
      ownCustomerId,
      isFamilyMember: !ownCustomerId,
      familyMemberId: memberRows.length ? Number(memberRows[0].id) : null,
      familyMemberIds: memberRows.map((r) => Number(r.id)),
      name: ownCustomerId
        ? (ownCustomer.name || '')
        : ((memberRows[0] && memberRows[0].name) || ''),
      phone: phone || '',
      grantedProjectIds,
      legacyGrantCustomerIds,
    };
  } catch (e) {
    console.error('[perm] resolveCustomerIdentity failed:', e.message);
    return null;
  }
}

/**
 * 该业主能看到的项目 ID 集合（业主端可见范围）。
 *
 * ⚠️ 2026-10-29 起是**并集**，不再是「customer_id 名下全部项目」：
 *   ① 自己客户档案名下的项目（ownCustomerId）—— 主账号权利，副账号将来扶正后自动生效
 *   ② 被授权查看的项目（grantedProjectIds）—— 项目级授权
 *   ③ 历史兼容：project_id 为 NULL 的已绑成员行，按客户级给全项目
 *
 * 纯家庭成员（无自己档案）的 ownCustomerId 为 null，拿不到主账号的项目，
 * 只有被授权的那些 —— 这正是「只绑特定项目」的核心保障。
 */
async function customerProjectIds(identity) {
  if (!identity) return new Set();
  const ids = new Set();
  try {
    // 老调用方手工构造的 identity 可能没有 ownCustomerId，回退到 customerId
    const ownId = identity.ownCustomerId !== undefined ? identity.ownCustomerId : identity.customerId;

    // ① 自己名下的项目
    if (ownId) {
      const [rows] = await pool.query(
        'SELECT id FROM projects WHERE customer_id = ?', [ownId]
      );
      for (const r of rows || []) ids.add(Number(r.id));
    }

    // ② 被授权的项目
    for (const pid of identity.grantedProjectIds || []) ids.add(Number(pid));

    // ③ 历史兼容：客户级老授权
    for (const cid of identity.legacyGrantCustomerIds || []) {
      const [rows] = await pool.query(
        'SELECT id FROM projects WHERE customer_id = ?', [cid]
      );
      for (const r of rows || []) ids.add(Number(r.id));
    }
  } catch (e) {
    console.error('[perm] customerProjectIds failed:', e.message);
  }
  return ids;
}

/** "我能看到的项目"集合 = related ∪ read_all → 全部 */
async function visibleProjectIds(userId, moduleKey) {
  if (!userId) return new Set();
  if (await canReadAll(userId, moduleKey)) return null; // null = 全部
  return relatedProjectIds(userId);
}

// ============ Express 中间件 ============

function pickUserId(req) {
  const v = req.headers['x-user-id'];
  const n = parseInt(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 要求登录（无登录 → 401） */
function requireAuth() {
  return async (req, res, next) => {
    const uid = pickUserId(req);
    if (!uid) return res.status(401).json({ error: '未登录' });
    req.userId = uid;
    // 加载一次权限到 req，便于后续中间件复用
    req.userPerms = await loadUserPermissions(uid);
    next();
  };
}

/** 要求 {module}:{action}，无权限 → 403 */
function requirePerm(moduleKey, action = 'read') {
  return async (req, res, next) => {
    const uid = pickUserId(req);
    if (!uid) return res.status(401).json({ error: '未登录' });
    req.userId = uid;
    req.userPerms = req.userPerms || await loadUserPermissions(uid);
    if (req.userPerms.has('*')) return next();
    if (action === 'read' && req.userPerms.has(`${moduleKey}:read_all`)) return next();
    if (!req.userPerms.has(`${moduleKey}:${action}`)) {
      return res.status(403).json({ error: '无权限', module: moduleKey, action });
    }
    next();
  };
}

/**
 * SQL 工具：把"项目可见集"过滤统一拼到 WHERE。
 *  - read_all 或 admin → 返回 ''（不过滤）
 *  - read             → 返回 ` AND <alias>.<project_col> IN (?...)`
 *  - 无权限           → 返回 ` AND 1=0`（永远查不到任何数据）
 *
 * @param {string} alias  表别名（如 'a' / 'p' / 'pr'），空串表示不带别名
 * @param {string} projectCol  该表的项目字段名（默认 'project_id'）
 * @returns {{ sql: string, params: number[] }}
 */
async function buildProjectScopeClause(userId, moduleKey, alias = '', projectCol = 'project_id') {
  const scope = await visibleScope(userId, moduleKey);
  if (scope === 'all') return { sql: '', params: [] };
  if (scope === 'none') return { sql: ' AND 1=0', params: [] };
  const ids = Array.from(await relatedProjectIds(userId));
  if (!ids.length) return { sql: ` AND 1=0`, params: [] };
  const col = alias ? `${alias}.${projectCol}` : projectCol;
  return { sql: ` AND ${col} IN (${ids.map(() => '?').join(',')})`, params: ids };
}

/** 与上同理，但子句拼在"自己 OR 提交人"的并列里（用于「即使不在关联项目，我是创建人也能看到」） */
async function buildProjectScopeOrSelfClause(userId, moduleKey, alias, projectCol, selfCol) {
  const scope = await visibleScope(userId, moduleKey);
  if (scope === 'all') return { sql: '', params: [] };
  if (scope === 'none') return { sql: ' AND 1=0', params: [] };
  const ids = Array.from(await relatedProjectIds(userId));
  const idsSql = ids.length ? `${alias ? alias + '.' : ''}${projectCol} IN (${ids.map(() => '?').join(',')})` : '1=0';
  const selfSql = selfCol ? `${alias ? alias + '.' : ''}${selfCol} = ?` : null;
  const inner = selfSql ? `(${idsSql} OR ${selfSql})` : `(${idsSql})`;
  const params = ids.length ? [...ids] : [];
  if (selfSql) params.push(userId);
  return { sql: ` AND ${inner}`, params };
}

module.exports = {
  loadUserPermissions,
  canAction,
  canReadAll,
  visibleScope,
  relatedProjectIds,
  resolveCustomerIdentity,
  customerProjectIds,
  visibleProjectIds,
  requireAuth,
  requirePerm,
  invalidatePermCache,
  pickUserId,
  buildProjectScopeClause,
  buildProjectScopeOrSelfClause,
};