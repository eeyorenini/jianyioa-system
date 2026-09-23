// 直接创建 family_members 表
const mysql = require('./server/node_modules/mysql2/promise');

async function createTable() {
  const connection = await mysql.createConnection({
    host: '116.204.19.53',
    user: 'jianyioa',
    password: 'zpfbAsxyA76P2ZHw',
    database: 'jianyioa'
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS family_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL COMMENT '主账户客户ID',
        name VARCHAR(100) NOT NULL COMMENT '成员姓名',
        phone VARCHAR(20) NOT NULL COMMENT '手机号（唯一标识）',
        relation VARCHAR(50) COMMENT '与主账户关系',
        is_master TINYINT(1) DEFAULT 0 COMMENT '是否主账户',
        status TINYINT(1) DEFAULT 1 COMMENT '状态',
        created_at DATETIME DEFAULT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_phone (phone),
        INDEX idx_customer_id (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ family_members 表创建成功');
  } catch (e) {
    console.error('❌ 创建失败:', e.message);
  } finally {
    await connection.end();
  }
}

createTable();
