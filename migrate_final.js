// Simple approach: use mysql CLI via PowerShell Start-Process with stdin
// Step 1: Generate SQL file (same as migrate_full.js part 1-4)
// Step 2: Import using MySQL CLI

const sqlite3 = require('D:/wwwroot/jianyioa-system/node_modules/sqlite3');
const mysql = require('D:/wwwroot/jianyioa-system/node_modules/mysql2');
const fs = require('fs');

const SQLITE_PATH = 'D:/wwwroot/jianyioa-system/oa.db';
const OUTPUT_PATH = 'D:/wwwroot/jianyioa-system/migrate_final.sql';

function sqliteQuery(sql) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(SQLITE_PATH);
    db.all(sql, (err, rows) => { db.close(); err ? reject(err) : resolve(rows); });
  });
}

async function main() {
  // Check if SQL file already exists
  if (fs.existsSync(OUTPUT_PATH)) {
    console.log('[SKIP] migrate_final.sql already exists');
  }

  const conn = mysql.createConnection({
    host: '127.0.0.1', user: 'jianyioa', password: 'zpfbAsxyA76P2ZHw', database: 'jianyioa'
  });
  await new Promise(r => conn.connect(r));

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
  conn.end();
  console.log(`[1] Schema: ${tableNames.length} tables`);

  console.log('[2] Extracting SQLite...');
  let allSql = 'SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n';
  let totalRows = 0;

  for (const table of tableNames) {
    const pragma = await sqliteQuery(`PRAGMA table_info("${table}")`);
    const sqliteCols = pragma.map(c => c.name);
    const match = sqliteCols.filter(c => mysqlCols[table].has(c));
    if (match.length === 0) continue;

    const rows = await sqliteQuery(`SELECT * FROM "${table}"`);
    if (rows.length === 0) continue;

    allSql += `-- ${table}: ${rows.length}\nDELETE FROM ${table};\n`;
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
    console.log(`  ✓ ${table}: ${rows.length}`);
    totalRows += rows.length;
  }

  allSql += 'SET FOREIGN_KEY_CHECKS = 1;\n';
  fs.writeFileSync(OUTPUT_PATH, allSql, 'utf8');
  console.log(`[3] Written: ${(fs.statSync(OUTPUT_PATH).size/1024/1024).toFixed(2)} MB, ${totalRows} rows`);

  console.log('[4] Importing via mysql CLI...');

  // Use PowerShell with System.Diagnostics.Process for proper stdin
  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$sql = [System.IO.File]::ReadAllText('${OUTPUT_PATH.replace(/\\/g, '\\\\')}', [System.Text.Encoding]::UTF8)
$proc = Start-Process -FilePath 'D:\\BtSoft\\mysql\\MySQL5.5\\bin\\mysql.exe' -ArgumentList '-u','jianyioa','-pzpfbAsxyA76P2ZHw','jianyioa' -NoNewWindow -PassThru -RedirectStandardInput 'D:\\wwwroot\\jianyioa-system\\mysql_in.sql' -RedirectStandardError 'D:\\wwwroot\\jianyioa-system\\mysql_err.log' -Wait
Write-Host "Exit: $($proc.ExitCode)"
`;

  // First write the SQL to the redirect file
  fs.copyFileSync(OUTPUT_PATH, 'D:/wwwroot/jianyioa-system/mysql_in.sql');

  // Use Start-Process approach
  const { spawn } = require('child_process');
  const ps = spawn('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    `Start-Process -FilePath 'D:\\BtSoft\\mysql\\MySQL5.5\\bin\\mysql.exe' -ArgumentList '-u','jianyioa','-pzpfbAsxyA76P2ZHw','jianyioa' -NoNewWindow -PassThru -RedirectStandardInput 'D:\\wwwroot\\jianyioa-system\\mysql_in.sql' -RedirectStandardError 'D:\\wwwroot\\jianyioa-system\\mysql_err.log' -Wait`
  ], { windowsHide: true, stdio: 'pipe' });

  let out = '';
  ps.stdout.on('data', d => out += d);
  ps.on('close', code => {
    console.log('MySQL import exit code:', code);
    if (fs.existsSync('D:/wwwroot/jianyioa-system/mysql_err.log')) {
      const err = fs.readFileSync('D:/wwwroot/jianyioa-system/mysql_err.log', 'utf8');
      if (err.trim()) console.log('MySQL errors:', err.substring(0, 300));
    }
    console.log('[5] Done!');
  });
}

main().catch(e => { console.error('[ERROR]', e.message); process.exit(1); });
