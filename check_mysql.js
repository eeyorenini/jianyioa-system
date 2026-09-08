// Check MySQL database tables and row counts
const mysql = require('mysql2');

const conn = mysql.createConnection({
  host: '127.0.0.1',
  user: 'jianyioa',
  password: 'zpfbAsxyA76P2ZHw',
  database: 'jianyioa'
});

conn.connect((err) => {
  if (err) { console.error('connect error:', err); conn.end(); return; }
  
  conn.query('SHOW TABLES', (e, tables) => {
    if (e) { console.error('show tables error:', e); conn.end(); return; }
    
    console.log('Tables count:', tables.length);
    console.log('---');
    
    let count = 0;
    tables.forEach(row => {
      const tableName = Object.values(row)[0];
      conn.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``, (e2, r) => {
        if (e2) {
          console.log(`${tableName}: ERROR ${e2.message}`);
        } else {
          console.log(`${tableName}: ${r[0].cnt} rows`);
        }
        count++;
        if (count === tables.length) conn.end();
      });
    });
  });
});
