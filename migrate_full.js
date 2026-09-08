// Full migration - runs on server
// Uses sqlite3 npm (callback-based) + mysql2 npm
const sqlite3 = require('D:/wwwroot/jianyioa-system/node_modules/sqlite3');
const mysql = require('D:/wwwroot/jianyioa-system/node_modules/mysql2');
const fs = require('fs');

const SQLITE_PATH = 'D:/wwwroot/jianyioa-system/oa.db';
const OUTPUT_PATH = 'D:/wwwroot/jianyioa-system/migrate_final.sql';
const MYSQL_BIN = 'D:/BtSoft/mysql/MySQL5.5/bin/mysql.exe';
const MYSQL_USER = 'jianyioa';
const MYSQL_PASS = 'zpfbAsxyA76P2ZHw';
const MYSQL_DB = 'jianyioa';

function sqliteQuery(sql) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(SQLITE_PATH);
    db.all(sql, (err, rows) => {
      db.close();
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function main() {
  const conn = mysql.createConnection({
    host: '127.0.0.1',
    user: MYSQL_USER,
    password: MYSQL_PASS,
    database: MYSQL_DB
  });

  await new Promise(r => conn.connect(r));
  console.log('[1] MySQL connected');

  // Get MySQL schema
  const [tables] = await new Promise((res, rej) => {
    conn.query('SHOW TABLES', (e, r) => e ? rej(e) : res([r]));
  });
  const tableNames = tables.map(t => Object.values(t)[0]);

  const mysqlCols = {};
  for (const table of tableNames) {
    const [cols] = await new Promise((res, rej) => {
      conn.query(`SHOW COLUMNS FROM \`${table}\``, (e, r) => e ? rej(e) : res([r]));
    });
    mysqlCols[table] = new Set(cols.map(c => c.Field));
  }
  console.log(`[2] Schema loaded (${tableNames.length} tables)`);
  conn.end();

  // Extract SQLite data
  console.log('[3] Extracting SQLite data...');
  let allSql = `SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n`;
  let totalRows = 0;

  for (const table of tableNames) {
    const pragma = await sqliteQuery(`PRAGMA table_info("${table}")`);
    const sqliteCols = pragma.map(c => c.name);
    const match = sqliteCols.filter(c => mysqlCols[table].has(c));
    if (match.length === 0) continue;

    const rows = await sqliteQuery(`SELECT * FROM "${table}"`);
    if (rows.length === 0) continue;

    allSql += `-- ${table}: ${rows.length} rows\nDELETE FROM ${table};\n`;
    for (const row of rows) {
      const vals = match.map(col => {
        const v = row[col];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return String(v);
        return "'" + String(v).replace(/'/g, "''") + "'";
      });
      allSql += `INSERT INTO ${table} (${match.join(',')}) VALUES (${vals.join(',')});\n`;
    }
    allSql += '\n';
    console.log(`  ✓ ${table}: ${rows.length} rows`);
    totalRows += rows.length;
  }

  allSql += 'SET FOREIGN_KEY_CHECKS = 1;\n';

  // Write SQL file
  fs.writeFileSync(OUTPUT_PATH, allSql, 'utf8');
  const sizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`[4] SQL written: ${sizeMB} MB`);

  // Import via MySQL CLI using spawn
  console.log('[5] Importing to MySQL...');
  const { spawn } = require('child_process');
  const mysqlProc = spawn(MYSQL_BIN, [`-u${MYSQL_USER}`, `-p${MYSQL_PASS}`, MYSQL_DB], {
    windowsHide: true
  });

  let errOut = '';
  mysql.stderr.on('data', d => errOut += d.toString());
  mysql.on('error', e => console.log('Spawn error:', e.message));

  mysqlProc.stdin.write(allSql);
  mysqlProc.stdin.end();

  await new Promise(r => mysqlProc.on('close', r));

  if (errOut && errOut.includes('ERROR')) {
    console.log('[!] MySQL warnings/errors:', errOut.substring(0, 300));
  } else {
    console.log('[6] ✓ Import complete!');
  }

  console.log(`\n=== DONE: ${totalRows} rows migrated ===`);
}

main().catch(e => { console.error('[ERROR]', e.message); process.exit(1); });
