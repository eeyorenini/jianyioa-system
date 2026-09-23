const mysql = require('./server/node_modules/mysql2/promise');

async function check() {
  const connection = await mysql.createConnection({
    host: '116.204.19.53',
    user: 'jianyioa',
    password: 'zpfbAsxyA76P2ZHw',
    database: 'jianyioa'
  });
  
  console.log('=== 客户表 ===');
  const [customers] = await connection.query(
    'SELECT id, name, phone FROM customers WHERE phone IS NOT NULL AND phone != ""'
  );
  console.log(customers);
  
  console.log('\n=== 家庭成员表 ===');
  const [family] = await connection.query('SELECT * FROM family_members');
  console.log(family);
  
  console.log('\n=== 项目表（客户相关）===');
  const [projects] = await connection.query(
    'SELECT id, name, customer_id FROM projects WHERE customer_id IS NOT NULL LIMIT 10'
  );
  console.log(projects);
  
  await connection.end();
}

check();
