// 修复家庭成员数据
const mysql = require('./server/node_modules/mysql2/promise');

async function fix() {
  const connection = await mysql.createConnection({
    host: '116.204.19.53',
    user: 'jianyioa',
    password: 'zpfbAsxyA76P2ZHw',
    database: 'jianyioa'
  });

  try {
    // 先清空家庭成员表
    await connection.query('TRUNCATE TABLE family_members');
    console.log('🗑️ 清空 family_members 表');
    
    // 获取所有客户
    const [customers] = await connection.query(
      'SELECT id, name, phone FROM customers WHERE phone IS NOT NULL AND phone != ""'
    );
    
    // 为每个客户创建主账户记录
    for (const c of customers) {
      await connection.query(
        'INSERT INTO family_members (customer_id, name, phone, relation, is_master, status) VALUES (?, ?, ?, ?, 1, 1)',
        [c.id, c.name || '客户', c.phone, '本人']
      );
      console.log(`✅ ${c.name} (${c.phone})`);
    }
    
    console.log(`🎉 完成，共 ${customers.length} 个主账户`);
  } catch (e) {
    console.error('❌ 失败:', e.message);
  } finally {
    await connection.end();
  }
}

fix();
