// Smart migration: read MySQL schema, then extract only matching columns from SQLite
const Database = require('/Users/gtamer/Desktop/test/oa-system/server/node_modules/better-sqlite3');
const mysql = require('/Users/gtamer/Desktop/jianyioa-system/node_modules/mysql2');
const fs = require('fs');

const sqliteDb = new Database('/Users/gtamer/Desktop/test/oa-system/server/oa.db');
const outputFile = '/Users/gtamer/Desktop/jianyioa-system/migrate_data2.sql';

async function main() {
  // Connect to MySQL to get actual schema
  const conn = mysql.createConnection({
    host: '127.0.0.1',
    user: 'jianyioa',
    password: 'zpfbAsxyA76P2ZHw',
    database: 'jianyioa'
  });

  await new Promise((resolve, reject) => {
    conn.connect(err => {
      if (err) { console.error('MySQL connect error:', err.message); reject(err); return; }
      console.log('Connected to MySQL (remote)');
      resolve();
    });
  });

  // Get MySQL table columns
  const [tables] = await new Promise((resolve, reject) => {
    conn.query('SHOW TABLES', (err, rows) => {
      if (err) reject(err);
      else resolve([rows.map(r => Object.values(r)[0])]);
    });
  });

  const mysqlColumns = {};
  for (const table of tables) {
    const [cols] = await new Promise((resolve, reject) => {
      conn.query(`SHOW COLUMNS FROM \`${table}\``, (err, rows) => {
        if (err) reject(err);
        else resolve([rows.map(r => r.Field)]);
      });
    });
    mysqlColumns[table] = new Set(cols);
    console.log(`MySQL table: ${table} (${cols.length} columns)`);
  }

  conn.end();

  // Now extract SQLite data, only matching columns
  let sql = '-- SQLite to MySQL Migration (schema-matched)\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n';

  const tablesToMigrate = Object.keys(mysqlColumns);
  let totalRows = 0;

  for (const table of tablesToMigrate) {
    try {
      // Get SQLite columns that also exist in MySQL
      const sqliteCols = sqliteDb.prepare(`PRAGMA table_info("${table}")`).all();
      const sqliteColNames = sqliteCols.map(c => c.name);
      const matchingCols = sqliteColNames.filter(c => mysqlColumns[table].has(c));

      if (matchingCols.length === 0) {
        console.log(`⊘ ${table}: no matching columns`);
        continue;
      }

      const rows = sqliteDb.prepare(`SELECT * FROM "${table}"`).all();
      if (rows.length === 0) {
        console.log(`○ ${table}: 0 rows (skip)`);
        continue;
      }

      sql += `-- ${table}: ${rows.length} rows\n`;
      sql += `DELETE FROM ${table};\n`;

      rows.forEach(row => {
        const values = matchingCols.map(col => {
          const val = row[col];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return String(val);
          if (typeof val === 'boolean') return val ? 1 : 0;
          return "'" + String(val).replace(/'/g, "''") + "'";
        });
        sql += `INSERT INTO ${table} (${matchingCols.join(', ')}) VALUES (${values.join(', ')});\n`;
      });
      sql += '\n';

      console.log(`✓ ${table}: ${rows.length} rows, ${matchingCols.length} columns`);
      totalRows += rows.length;
    } catch (e) {
      console.log(`✗ ${table}: ${e.message}`);
    }
  }

  sql += 'SET FOREIGN_KEY_CHECKS = 1;\n-- Done\n';
  fs.writeFileSync(outputFile, sql, 'utf8');
  console.log(`\nExported ${totalRows} rows to ${outputFile}`);
  console.log(`File size: ${(fs.statSync(outputFile).size / 1024).toFixed(1)} KB`);

  sqliteDb.close();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
