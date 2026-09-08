// Smart migration - runs LOCALLY, reads local SQLite + MySQL schema from init.sql
// generates MySQL-compatible INSERT statements
const Database = require('/Users/gtamer/Desktop/test/oa-system/server/node_modules/better-sqlite3');
const mysql = require('/Users/gtamer/Desktop/jianyioa-system/node_modules/mysql2');
const fs = require('fs');

const sqliteDb = new Database('/Users/gtamer/Desktop/test/oa-system/server/oa.db');
const mysqlHost = '116.204.19.53';
const mysqlUser = 'jianyioa';
const mysqlPass = 'zpfbAsxyA76P2ZHw';
const mysqlDB = 'jianyioa';
const outputFile = '/Users/gtamer/Desktop/jianyioa-system/migrate_data3.sql';

async function main() {
  // Connect to MySQL (remote server)
  const conn = mysql.createConnection({
    host: mysqlHost,
    user: mysqlUser,
    password: mysqlPass,
    database: mysqlDB,
    port: 3306
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
      // Get SQLite columns
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

      console.log(`✓ ${table}: ${rows.length} rows (${matchingCols.length} cols)`);
      totalRows += rows.length;
    } catch (e) {
      console.log(`✗ ${table}: ${e.message}`);
    }
  }

  sql += 'SET FOREIGN_KEY_CHECKS = 1;\n';
  fs.writeFileSync(outputFile, sql, 'utf8');
  const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);
  console.log(`\nDone! ${totalRows} rows, ${sizeKB} KB -> ${outputFile}`);
  sqliteDb.close();
}

main().catch(e => { console.error(e); process.exit(1); });
