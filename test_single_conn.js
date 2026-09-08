// Test different mysql2 approaches for sync speed
const mysql = require('D:/wwwroot/jianyioa-system/node_modules/mysql2');

// Approach 1: single persistent connection with callback
const conn = mysql.createConnection({
  host: '127.0.0.1', user: 'jianyioa', password: 'zpfbAsxyA76P2ZHw',
  database: 'jianyioa', charset: 'utf8mb4', dateStrings: true
});
conn.connect((err) => {
  if (err) { console.error('connect error:', err.message); return; }
  const start = Date.now();
  conn.query('SELECT * FROM contract_templates', (e, rows) => {
    console.log('single conn callback:', Date.now() - start, 'ms, rows:', rows.length);
    const start2 = Date.now();
    conn.query('SELECT * FROM contracts', (e2, rows2) => {
      console.log('second query:', Date.now() - start2, 'ms, rows:', rows2.length);
      conn.end();
    });
  });
});
