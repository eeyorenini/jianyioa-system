// MySQL 同步适配层 v6 — 使用 util.promisify + mysql2/promise，彻底稳定化 deasync
const mysql = require('mysql2/promise');
const deasync = require('deasync');
const { promisify } = require('util');

const DB_CONFIG = {
  host: (process.env.DB_HOST || '127.0.0.1').trim(),
  port: Number(process.env.DB_PORT || '3306'),
  user: (process.env.DB_USER || 'jianyioa').trim(),
  password: (process.env.DB_PASSWORD || 'zpfbAsxyA76P2ZHw').trim(),
  database: (process.env.DB_NAME || 'jianyioa').trim(),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT) || 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: true,
};

// mysql2/promise 池已经是 async，直接用 deasync 包装
const pool = mysql.createPool(DB_CONFIG);

// 将 pool.query promise 版本包装为同步
function syncQuery(sql, params) {
  let result, err, done = false;
  pool.query(sql, params || [])
    .then(res => { result = Array.isArray(res) ? res[0] : res; done = true; })
    .catch(e => { err = e; done = true; });
  while (!done) deasync.runLoopOnce();
  if (err) throw err;
  return result;
}

function syncGet(sql, params) {
  const rows = syncQuery(sql, params);
  return rows[0] || undefined;
}

function syncRun(sql, params) {
  console.log('[syncRun]', sql, 'params:', JSON.stringify(params));
  // pool.query 返回 [rows, fields]，INSERT/UPDATE/DELETE 返回 ResultSetHeader
  let result, err, done = false;
  pool.query(sql, params || [])
    .then(res => {
      // 判断类型：数组 = SELECT 结果，对象 = INSERT 结果
      if (Array.isArray(res)) {
        result = { lastInsertRowid: undefined, changes: res.length };
      } else {
        result = { lastInsertRowid: res.insertId, changes: res.affectedRows };
      }
      done = true;
    })
    .catch(e => { err = e; done = true; });
  while (!done) deasync.runLoopOnce();
  if (err) {
    console.log('[syncRun ERROR] sql length:', (err.sql || sql).length, 'first 300:', (err.sql || sql).substring(0, 300));
    throw err;
  }
  return result;
}

function syncExec(sql) {
  // pool.query 返回 [rows, fields]，返回 rows
  let result, err, done = false;
  pool.query(sql)
    .then(res => { result = Array.isArray(res) ? res[0] : res; done = true; })
    .catch(e => { err = e; done = true; });
  while (!done) deasync.runLoopOnce();
  if (err) throw err;
  return result;
}

// pragma 是 SQLite 特有，MySQL 改为空操作
function pragma(_sql) {}

// Statement 类（模拟 better-sqlite3 的 prepare 返回对象）
class Statement {
  constructor(sql) { this.sql = sql; }

  get(...args) {
    const params = Array.isArray(args[0]) ? args[0] : args;
    return syncGet(this.sql, params);
  }

  all(...args) {
    const params = Array.isArray(args[0]) ? args[0] : args;
    return syncQuery(this.sql, params);
  }

  // run — 参数内联到 SQL（mysql2 prepared statement 有参数绑定 bug，改用直接拼接）
  run(...args) {
    console.log('[run invoked] this.sql:', this.sql, 'args:', JSON.stringify(args));
    const params = Array.isArray(args[0]) ? args[0] : args;
    console.log('[Statement.run] params:', JSON.stringify(params));
    if (!params || params.length === 0) {
      return syncRun(this.sql, []);
    }
    console.log('[RUN DEBUG] sql:', this.sql, 'params length:', params.length, 'params:', JSON.stringify(params));
    let paramIdx = 0;
    let sql = '';
    for (let i = 0; i < this.sql.length; i++) {
      if (this.sql[i] === '?' && paramIdx < params.length) {
        const v = params[paramIdx++];
        if (v === null || v === undefined) {
          sql += 'NULL';
        } else if (typeof v === 'number') {
          sql += String(v);
        } else {
          sql += '\'' + String(v).replace(/'/g, "''") + '\'';
        }
      } else {
        sql += this.sql[i];
      }
    }
    console.log('[RUN DEBUG] final sql:', sql);
    console.log('[RUN DEBUG] final sql length:', sql.length);
    return syncRun(sql, []);
  }
}

// Database 类
class Database {
  prepare(sql) { return new Statement(sql); }
  exec(sql) { return syncExec(sql); }
  pragma(sql) { return pragma(sql); }
  close() {
    let done = false;
    pool.end().then(() => { done = true; }).catch(() => { done = true; });
    while (!done) deasync.runLoopOnce();
  }
}

module.exports = Database;
module.exports.pool = pool;
