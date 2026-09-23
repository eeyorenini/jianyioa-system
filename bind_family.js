const mysql = require('./server/node_modules/mysql2/promise');

async function bindFamily() {
  const connection = await mysql.createConnection({
    host: '116.204.19.53',
    user: 'jianyioa',
    password: 'zpfbAsxyA76P2ZHw',
    database: 'jianyioa'
  });

  try {
    // 把郑大大绑定到郭大大（customer_id=5）
    await connection.query(
      'UPDATE family_members SET customer_id = 5 WHERE phone = ?',
      ['13693365077']
    );
    console.log('✅ 郑大大已绑定到郭大大的账户');
    
    // 确认更新
    const [member] = await connection.query(
      'SELECT * FROM family_members WHERE phone = ?',
      ['13693365077']
    );
    console.log('更新后:', member);
    
  } catch (e) {
    console.error('❌ 失败:', e.message);
  } finally {
    await connection.end();
  }
}

bindFamily();
