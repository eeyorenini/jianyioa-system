// MySQL 同步适配器 - 单个持久连接，mysql2 callback API
// 替换 mysql2/promise + deasync，避免 Node 22 上的严重延迟
const mysql = require('mysql2');

const DB_CONFIG = {
  host: (process.env.DB_HOST || '127.0.0.1').trim(),
  port: Number(process.env.DB_PORT || '3306'),
  user: (process.env.DB_USER || 'jianyioa').trim(),
  password: (process.env.DB_PASSWORD || 'zpfbAsxyA76P2ZHw').trim(),
  database: (process.env.DB_NAME || 'jianyioa').trim(),
  charset: 'utf8mb4',
  dateStrings: true,
  timezone: '+08:00',
};

// 持久连接
const conn = mysql.createConnection(DB_CONFIG);
conn.connect((err) => {
  if (err) console.error('[DB] Connection error:', err.message);
  else console.log('[DB] Connected to MySQL');
});

// 同步查询（callback 方式 + deasync 等待）
const deasync = require('deasync');

function syncQuery(sql, params) {
  let result = null, error = null, done = false;
  conn.query(sql, params || [], (e, rows) => {
    if (e) error = e;
    else result = rows;
    done = true;
  });
  while (!done) deasync.runLoopOnce();
  if (error) throw error;
  return result;
}

// Statement 类 (模拟 better-sqlite3 的 prepare 返回对象)
class Statement {
  constructor(sql) { this.sql = sql; }

  get(...args) {
    const params = Array.isArray(args[0]) ? args[0] : args;
    const rows = syncQuery(this.sql, params);
    return rows[0];
  }

  all(...args) {
    const params = Array.isArray(args[0]) ? args[0] : args;
    return syncQuery(this.sql, params);
  }

  run(...args) {
    const params = Array.isArray(args[0]) ? args[0] : args;
    if (!params || params.length === 0) {
      return this._syncRun(this.sql);
    }
    // 参数内联到 SQL（避免 mysql2 prepared statement 参数绑定问题）
    let paramIdx = 0;
    let sql = '';
    for (let i = 0; i < this.sql.length; i++) {
      if (this.sql[i] === '?' && paramIdx < params.length) {
        const v = params[paramIdx++];
        if (v === null || v === undefined) sql += 'NULL';
        else if (typeof v === 'number') sql += String(v);
        else sql += "'" + String(v).replace(/'/g, "''") + "'";
      } else {
        sql += this.sql[i];
      }
    }
    return this._syncRun(sql);
  }

  _syncRun(sql) {
    let result = null, error = null, done = false;
    conn.query(sql, (e, res) => {
      if (e) error = e;
      else result = { lastInsertRowid: res.insertId, changes: res.affectedRows };
      done = true;
    });
    while (!done) deasync.runLoopOnce();
    if (error) throw error;
    return result;
  }
}

// Database 类
class Database {
  prepare(sql) { return new Statement(sql); }
  exec(sql) { return syncQuery(sql); }
  pragma(sql) { return []; }
  close() { conn.end(() => {}); }
}

module.exports = Database;
module.exports.conn = conn;
