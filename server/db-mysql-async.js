// MySQL async 适配层 — 替代 deasync 版本，Node 22 兼容
const mysql = require('mysql2/promise');

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
  connectTimeout: 15000,       // 连接超时 15s
  socketTimeout: 60000,       // 查询超时 60s
  enableKeepAlive: true,      // 开启 keepalive
  keepAliveInitialDelay: 30000 // 30s后开始 keepalive
};

const pool = mysql.createPool(DB_CONFIG);

// Statement 类（async 版本）
class Statement {
  constructor(sql) { this.sql = sql; }

  async get(...args) {
    const params = Array.isArray(args[0]) ? args[0] : args;
    const [rows] = await pool.query(this.sql, params);
    return rows[0];
  }

  async all(...args) {
    const params = Array.isArray(args[0]) ? args[0] : args;
    const [rows] = await pool.query(this.sql, params);
    return rows;
  }

  async run(...args) {
    const params = Array.isArray(args[0]) ? args[0] : args;
    const [result] = await pool.query(this.sql, params);
    return {
      lastInsertRowid: result.insertId,
      changes: result.affectedRows,
    };
  }
}

// Database 类
class Database {
  prepare(sql) { return new Statement(sql); }
  async exec(sql) {
    const [result] = await pool.query(sql);
    return result;
  }
  pragma(_sql) { return []; } // SQLite 兼容，空操作
  async close() { await pool.end(); }
}

module.exports = Database;
module.exports.pool = pool;
