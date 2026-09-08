// Test sqlite3 npm on server
const sqlite3 = require('D:/wwwroot/jianyioa-system/node_modules/sqlite3');
const db = new sqlite3.Database('D:/wwwroot/jianyioa-system/oa.db', (err) => {
  if (err) {
    console.error('Open error:', err.message);
    process.exit(1);
  }
  console.log('SQLite opened successfully');
  
  db.all("SELECT COUNT(*) as cnt FROM employees", (err, rows) => {
    if (err) {
      console.error('Query error:', err.message);
      process.exit(1);
    }
    console.log('employees count:', rows[0].cnt);
    db.close();
    console.log('Done!');
  });
});
