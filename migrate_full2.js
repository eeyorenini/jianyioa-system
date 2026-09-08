// Full migration: ALL SQLite tables -> MySQL (all matched columns)
const sqlite3 = require('D:/wwwroot/jianyioa-system/node_modules/sqlite3');
const mysql = require('D:/wwwroot/jianyioa-system/node_modules/mysql2');
const fs = require('fs');

const SQLITE_PATH = 'D:/wwwroot/jianyioa-system/oa.db';
const OUTPUT_PATH = 'D:/wwwroot/jianyioa-system/migrate_full2.sql';

function sqliteQuery(sql) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(SQLITE_PATH);
    db.all(sql, (err, rows) => { db.close(); err ? reject(err) : resolve(rows); });
  });
}

async function main() {
  const conn = mysql.createConnection({
    host: '127.0.0.1', user: 'jianyioa', password: 'zpfbAsxyA76P2ZHw', database: 'jianyioa'
  });
  await new Promise(r => conn.connect(r));

  // Get ALL MySQL tables
  const [tables] = await new Promise((res, rej) => {
    conn.query('SHOW TABLES', (e, r) => e ? rej(e) : res([r]));
  });
  const tableNames = tables.map(t => Object.values(t)[0]);

  // Get MySQL columns for all tables
  const mysqlCols = {};
  for (const table of tableNames) {
    const [cols] = await new Promise((res, rej) => {
      conn.query(`SHOW COLUMNS FROM \`${table}\``, (e, r) => e ? rej(e) : res([r]));
    });
    mysqlCols[table] = new Set(cols.map(c => c.Field));
  }
  conn.end();
  console.log(`MySQL: ${tableNames.length} tables`);

  // Get ALL SQLite tables
  const sqliteTables = await sqliteQuery(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  const sqliteTableNames = sqliteTables.map(t => t.name);
  console.log(`SQLite: ${sqliteTableNames.length} tables`);

  let totalRows = 0;
  let allSql = 'SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n';

  for (const table of sqliteTableNames) {
    const pragma = await sqliteQuery(`PRAGMA table_info("${table}")`);
    const sqliteCols = pragma.map(c => c.name);
    const match = sqliteCols.filter(c => mysqlCols[table] && mysqlCols[table].has(c));

    if (match.length === 0) {
      console.log(`  SKIP ${table}: no matching columns`);
      continue;
    }

    const rows = await sqliteQuery(`SELECT * FROM "${table}"`);
    if (rows.length === 0) {
      console.log(`  EMPTY ${table}`);
      continue;
    }

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
    console.log(`  MIGRATE ${table}: ${rows.length} rows`);
    totalRows += rows.length;
  }

  allSql += 'SET FOREIGN_KEY_CHECKS = 1;\n';
  fs.writeFileSync(OUTPUT_PATH, allSql, 'utf8');
  const sizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`SQL: ${sizeMB} MB, ${totalRows} rows total`);
}

main().catch(e => { console.error('[ERROR]', e.message); process.exit(1); });
