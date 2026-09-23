const mysql = require('./server/node_modules/mysql2/promise');

async function check() {
  const connection = await mysql.createConnection({
    host: '116.204.19.53',
    user: 'jianyioa',
    password: 'zpfbAsxyA76P2ZHw',
    database: 'jianyioa'
  });
  
  const [customers] = await connection.query(
    'SELECT id, name, phone FROM customers WHERE phone IS NOT NULL AND phone != ""'
  );
  console.log('所有客户:', customers);
  
  await connection.end();
}

check();
