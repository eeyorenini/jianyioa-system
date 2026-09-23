// 清理重复数据后初始化
const mysql = require('./server/node_modules/mysql2/promise');

async function cleanAndInit() {
  const connection = await mysql.createConnection({
    host: '116.204.19.53',
    user: 'jianyioa',
    password: 'zpfbAsxyA76P2ZHw',
    database: 'jianyioa'
  });

  try {
    // 查看当前家庭成员数据
    const [members] = await connection.query('SELECT * FROM family_members');
    console.log('当前家庭成员:', members);
    
    // 找出重复手机号，保留主账户
    const [dupes] = await connection.query(`
      SELECT phone, COUNT(*) as cnt, MIN(id) as keep_id
      FROM family_members
      GROUP BY phone
      HAVING cnt > 1
    `);
    
    for (const d of dupes) {
      await connection.query(`
        DELETE FROM family_members 
        WHERE phone = ? AND id != ?
      `, [d.phone, d.keep_id]);
      console.log(`🗑️ 删除重复手机号 ${d.phone} 的记录`);
    }
    
    // 重新初始化
    const [customers] = await connection.query(
      'SELECT id, name, phone FROM customers WHERE phone IS NOT NULL AND phone != ""'
    );
    
    for (const c of customers) {
      const [exists] = await connection.query(
        'SELECT id FROM family_members WHERE customer_id = ? LIMIT 1',
        [c.id]
      );
      
      if (exists.length === 0) {
        await connection.query(
          'INSERT INTO family_members (customer_id, name, phone, relation, is_master, status) VALUES (?, ?, ?, ?, 1, 1)',
          [c.id, c.name || '客户', c.phone, '本人']
        );
        console.log(`✅ 添加: ${c.name} (${c.phone})`);
      }
    }
    
    console.log('🎉 完成');
  } catch (e) {
    console.error('❌ 失败:', e.message);
  } finally {
    await connection.end();
  }
}

cleanAndInit();
