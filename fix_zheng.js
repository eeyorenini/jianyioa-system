const mysql = require('./server/node_modules/mysql2/promise');

async function fix() {
  const connection = await mysql.createConnection({
    host: '116.204.19.53',
    user: 'jianyioa',
    password: 'zpfbAsxyA76P2ZHw',
    database: 'jianyioa'
  });

  try {
    // 修改郑大大为副账户
    await connection.query(
      'UPDATE family_members SET name = ?, relation = ?, is_master = 0 WHERE phone = ?',
      ['郑大大', '配偶', '13693365077']
    );
    console.log('✅ 郑大大已更新为副账户');
    
    // 确认
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

fix();
