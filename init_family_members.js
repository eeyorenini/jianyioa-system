// 初始化现有客户的家庭主账户数据
const mysql = require('./server/node_modules/mysql2/promise');

async function initFamilyMembers() {
  const connection = await mysql.createConnection({
    host: '116.204.19.53',
    user: 'jianyioa',
    password: 'zpfbAsxyA76P2ZHw',
    database: 'jianyioa'
  });

  try {
    // 查找所有有手机号的客户
    const [customers] = await connection.query(
      'SELECT id, name, phone FROM customers WHERE phone IS NOT NULL AND phone != ""'
    );
    
    console.log(`找到 ${customers.length} 个客户需要初始化`);
    
    for (const c of customers) {
      // 检查是否已有家庭成员记录
      const [exists] = await connection.query(
        'SELECT id FROM family_members WHERE customer_id = ? LIMIT 1',
        [c.id]
      );
      
      if (exists.length === 0) {
        await connection.query(
          'INSERT INTO family_members (customer_id, name, phone, relation, is_master, status) VALUES (?, ?, ?, ?, 1, 1)',
          [c.id, c.name || '客户', c.phone, '本人']
        );
        console.log(`✅ 添加主账户: ${c.name} (${c.phone})`);
      } else {
        console.log(`⏭️  已存在: ${c.name}`);
      }
    }
    
    console.log('🎉 初始化完成');
  } catch (e) {
    console.error('❌ 失败:', e.message);
  } finally {
    await connection.end();
  }
}

initFamilyMembers();
