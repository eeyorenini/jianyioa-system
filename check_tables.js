// Check which MySQL tables have data
const mysql = require('D:/wwwroot/jianyioa-system/node_modules/mysql2');
async function main() {
  const conn = mysql.createConnection({
    host: '127.0.0.1', user: 'jianyioa', password: 'zpfbAsxyA76P2ZHw', database: 'jianyioa'
  });
  await new Promise(r => conn.connect(r));
  
  const tables = await new Promise((res, rej) => {
    conn.query('SHOW TABLES', (e, r) => e ? rej(e) : res(r));
  });
  
  for (const row of tables) {
    const table = Object.values(row)[0];
    try {
      const [cnt] = await new Promise((res, rej) => {
        conn.query(`SELECT COUNT(*) as c FROM \`${table}\``, (e, r) => e ? rej(e) : res(r));
      });
      const count = cnt ? Object.values(cnt)[0] : 0;
      if (count > 0) process.stdout.write(`${table}: ${count}\n`);
    } catch(e) {
      process.stdout.write(`${table}: ERROR ${e.code}\n`);
    }
  }
  conn.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
