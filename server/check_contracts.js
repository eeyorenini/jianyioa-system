const mysql = require('mysql2/promise');
async function main() {
  const pool = mysql.createPool({
    host: '116.204.19.53',
    port: 3306,
    user: 'jianyioa',
    password: 'zpfbAsxyA76P2ZHw',
    database: 'jianyioa'
  });
  const [rows] = await pool.query('SELECT id, contract_no, created_by FROM contracts ORDER BY id DESC LIMIT 5');
  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
}
main().catch(console.error);
