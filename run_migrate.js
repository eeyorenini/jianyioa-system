// Execute migration SQL on MySQL
const fs = require('fs');
const mysql = require('mysql2');

const sql = fs.readFileSync('D:/wwwroot/jianyioa-system/migrate_data.sql', 'utf8');

// Split by semicolon but keep CREATE/DELETE/INSERT statements
// Remove comments and split properly
const lines = sql.split('\n');
const statements = [];
let current = '';

lines.forEach(line => {
  const trimmed = line.trim();
  if (trimmed.startsWith('--') || trimmed === '') {
    return; // skip comments and empty lines
  }
  current += ' ' + trimmed;
  if (trimmed.endsWith(';')) {
    statements.push(current.trim());
    current = '';
  }
});

console.log(`Total statements to execute: ${statements.length}`);

const conn = mysql.createConnection({
  host: '127.0.0.1',
  user: 'jianyioa',
  password: 'zpfbAsxyA76P2ZHw',
  database: 'jianyioa',
  multipleStatements: false,
  namedPlaceholders: false
});

conn.connect(err => {
  if (err) { console.error('Connection error:', err); process.exit(1); }
  console.log('Connected to MySQL');

  let success = 0;
  let errors = 0;
  const errorLogs = [];

  function runNext(i) {
    if (i >= statements.length) {
      console.log(`\nDone! Success: ${success}, Errors: ${errors}`);
      if (errors > 0) {
        console.log('First 5 errors:');
        errorLogs.slice(0, 5).forEach(e => console.log(' -', e));
      }
      conn.end();
      return;
    }

    const stmt = statements[i];
    if (!stmt || stmt.length < 10) {
      runNext(i + 1);
      return;
    }

    conn.query(stmt, (err, result) => {
      if (err) {
        errors++;
        if (errors <= 5) errorLogs.push(`${stmt.substring(0, 80)}... -> ${err.message}`);
        else if (errors === 6) errorLogs.push(`... and ${errors - 5} more errors`);
      } else {
        success++;
      }
      runNext(i + 1);
    });
  }

  runNext(0);
});
