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
  visibleProjectIds,
  requireAuth,
  requirePerm,
  invalidatePermCache,
  pickUserId,
  buildProjectScopeClause,
  buildProjectScopeOrSelfClause,
};