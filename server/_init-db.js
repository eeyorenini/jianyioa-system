// 一次性脚本：用 mysql2 导 init.sql 到目标库
// 用法：node init-db.js
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ENV = {
  host: '116.204.19.53',
  port: 3306,
  user: 'jianyioa',
  password: 'zpfbAsxyA76P2ZHw',
  database: 'jianyioa',
};

const SQL_FILE = '/Users/gtamer/Desktop/jianyioa-system/server/init.sql';

(async () => {
  // 1. 先不连库，确库存在
  console.log('[1/3] 检查数据库是否存在...');
  let conn = await mysql.createConnection({
    host: ENV.host, port: ENV.port, user: ENV.user, password: ENV.password,
    multipleStatements: true,
  });
  const [rows] = await conn.query("SHOW DATABASES LIKE 'jianyioa'");
  if (rows.length === 0) {
    console.log('  数据库不存在，创建中...');
    await conn.query("CREATE DATABASE jianyioa DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci");
    console.log('  ✓ 已创建 jianyioa (utf8mb4)');
  } else {
    console.log('  ✓ 已存在 jianyioa');
  }
  await conn.end();

  // 2. 连目标库
  console.log('[2/3] 连接 jianyioa 库...');
  conn = await mysql.createConnection({
    host: ENV.host, port: ENV.port, user: ENV.user, password: ENV.password,
    database: ENV.database, multipleStatements: true,
  });
  console.log('  ✓ 已连接');

  // 3. 跑 SQL
  console.log('[3/3] 导入 init.sql ...');
  let sql = fs.readFileSync(SQL_FILE, 'utf8');
  // 删 SET FOREIGN_KEY_CHECKS=0 末尾改 1（import 完成后让外键生效）
  // 文件本身已 SET FOREIGN_KEY_CHECKS = 0，最后一句也会重新设回 1
  // 拆成多语句：mysql2 multipleStatements 支持
  try {
    await conn.query(sql);
    console.log('  ✓ SQL 执行完成');
  } catch (e) {
    console.error('  ✗ 导入失败:', e.message);
  }

  // 4. 验证
  console.log('验证：表数量与角色/管理员账号');
  const [tables] = await conn.query("SHOW TABLES");
  console.log(`  表数量: ${tables.length}`);
  console.log(`  表列表前 10: ${tables.slice(0,10).map(r => Object.values(r)[0]).join(', ')}...`);
  const [admins] = await conn.query("SELECT id, username, name, role_id FROM employees WHERE username='admin'");
  console.log(`  admin 用户: ${JSON.stringify(admins)}`);
  const [roles] = await conn.query("SELECT id, code, name FROM roles");
  console.log(`  角色: ${JSON.stringify(roles)}`);

  await conn.end();
  console.log('Done.');
})();
