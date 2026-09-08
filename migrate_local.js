// Smart migration - runs on server, reads local SQLite, writes MySQL-compatible SQL
// Usage: node migrate_local.js
const fs = require('fs');
const path = require('path');

// Use better-sqlite3 from jianyioa-system server dir (where it's installed)
let Database;
try {
  Database = require('D:/wwwroot/jianyioa-system/node_modules/better-sqlite3');
} catch (e) {
  try {
    Database = require('D:/wwwroot/jianyioa-system/server/node_modules/better-sqlite3');
  } catch (e2) {
    console.error('better-sqlite3 not found in node_modules');
    console.error('Looking in:', 'D:/wwwroot/jianyioa-system/node_modules');
    process.exit(1);
  }
}

const sqliteDb = new Database('D:/wwwroot/jianyioa-system/oa.db');
const mysql = require('D:/wwwroot/jianyioa-system/node_modules/mysql2');
const outputFile = 'D:/wwwroot/jianyioa-system/migrate_data2.sql';

console.log('SQLite DB opened:', sqliteDb.prepare('SELECT COUNT(*) as cnt FROM employees').get());

async function main() {
  const conn = mysql.createConnection({
    host: '127.0.0.1',
    user: 'jianyioa',
    password: 'zpfbAsxyA76P2ZHw',
    database: 'jianyioa'
  });

  await new Promise((resolve, reject) => {
    conn.connect(err => {
      if (err) { console.error('MySQL connect error:', err.message); reject(err); return; }
      console.log('Connected to MySQL');
      resolve();
    });
  });

  // Get MySQL table columns
  const [tableRows] = await new Promise((resolve, reject) => {
    conn.query('SHOW TABLES', (err, rows) => {
      if (err) reject(err);
      else resolve([rows.map(r => Object.values(r)[0])]);
    });
  });

  const mysqlColumns = {};
  for (const table of tableRows) {
    const [cols] = await new Promise((resolve, reject) => {
      conn.query(`SHOW COLUMNS FROM \`${table}\``, (err, rows) => {
        if (err) reject(err);
        else resolve([rows.map(r => r.Field)]);
      });
    });
    mysqlColumns[table] = new Set(cols);
  }
  conn.end();
  console.log('MySQL tables loaded:', tableRows.length);

  let sql = '-- SQLite to MySQL (schema-matched)\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n';
  let totalRows = 0;

  for (const table of tableRows) {
    try {
      const sqliteCols = sqliteDb.prepare(`PRAGMA table_info("${table}")`).all();
      const sqliteColNames = sqliteCols.map(c => c.name);
      const matchingCols = sqliteColNames.filter(c => mysqlColumns[table].has(c));

      if (matchingCols.length === 0) continue;

      const rows = sqliteDb.prepare(`SELECT * FROM "${table}"`).all();
      if (rows.length === 0) continue;

      sql += `-- ${table}: ${rows.length} rows\nDELETE FROM ${table};\n`;

      rows.forEach(row => {
        const values = matchingCols.map(col => {
          const val = row[col];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return String(val);
          return "'" + String(val).replace(/'/g, "''") + "'";
        });
        sql += `INSERT INTO ${table} (${matchingCols.join(', ')}) VALUES (${values.join(', ')});\n`;
      });
      sql += '\n';

      console.log(`✓ ${table}: ${rows.length} rows`);
      totalRows += rows.length;
    } catch (e) {
      console.log(`✗ ${table}: ${e.message}`);
    }
  }

  sql += 'SET FOREIGN_KEY_CHECKS = 1;\n';
  fs.writeFileSync(outputFile, sql, 'utf8');
  console.log(`\nDone! ${totalRows} rows, ${(fs.statSync(outputFile).size/1024).toFixed(1)} KB`);
  sqliteDb.close();
}

main().catch(e => { console.error(e); process.exit(1); });
