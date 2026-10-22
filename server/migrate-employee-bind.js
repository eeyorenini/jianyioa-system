// 员工微信绑定：建表 + 补索引（幂等，可重复执行）
require('dotenv').config({ path: __dirname + '/.env' });
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, dateStrings: true,
  });

  // 0. 查重（唯一索引前必须确认）
  const [dupOpenid] = await c.query(
    'SELECT mini_openid, COUNT(*) n FROM wechat_users WHERE mini_openid IS NOT NULL GROUP BY mini_openid HAVING n > 1'
  );
  const [dupEmp] = await c.query(
    'SELECT employee_id, COUNT(*) n FROM wechat_users WHERE employee_id IS NOT NULL GROUP BY employee_id HAVING n > 1'
  );
  console.log('mini_openid 重复:', dupOpenid.length ? dupOpenid : '无');
  console.log('employee_id 重复:', dupEmp.length ? dupEmp : '无');
  if (dupOpenid.length || dupEmp.length) {
    console.log('❌ 存在重复数据，先清理再执行');
    process.exit(1);
  }

  // 1. ticket 表
  await c.query(`
    CREATE TABLE IF NOT EXISTS employee_bind_tickets (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      ticket      VARCHAR(32)  NOT NULL COMMENT '一次性票据，放小程序码 scene',
      employee_id INT          NOT NULL COMMENT '要绑定的员工',
      created_by  INT          NOT NULL COMMENT '生成该码的管理员 id',
      expires_at  DATETIME     NOT NULL COMMENT '过期时间（UTC），默认生成后 10 分钟',
      used_at     DATETIME     NULL     COMMENT '使用时间（UTC），非空即已用',
      used_openid VARCHAR(64)  NULL     COMMENT '哪个微信用的',
      create_time DATETIME     NOT NULL,
      UNIQUE KEY uk_ticket (ticket),
      KEY idx_employee (employee_id),
      KEY idx_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工微信绑定一次性票据'
  `);
  console.log('✅ employee_bind_tickets 已就绪');

  // 2. wechat_users 索引与字段
  const [idx] = await c.query('SHOW INDEX FROM wechat_users');
  const names = idx.map((x) => x.Key_name);
  if (!names.includes('uk_mini_openid')) {
    await c.query('ALTER TABLE wechat_users ADD UNIQUE KEY uk_mini_openid (mini_openid)');
    console.log('✅ 已加 uk_mini_openid');
  } else {
    console.log('· uk_mini_openid 已存在');
  }
  if (!names.includes('uk_employee')) {
    await c.query('ALTER TABLE wechat_users ADD UNIQUE KEY uk_employee (employee_id)');
    console.log('✅ 已加 uk_employee');
  } else {
    console.log('· uk_employee 已存在');
  }

  const [cols] = await c.query('SHOW COLUMNS FROM wechat_users LIKE "last_identity"');
  if (!cols.length) {
    await c.query("ALTER TABLE wechat_users ADD COLUMN last_identity VARCHAR(20) NULL COMMENT 'employee | customer，双身份用户上次选择'");
    console.log('✅ 已加 last_identity');
  } else {
    console.log('· last_identity 已存在');
  }

  // 3. 结果确认
  const [t] = await c.query('SHOW COLUMNS FROM employee_bind_tickets');
  console.log('\nemployee_bind_tickets 字段:', t.map((x) => x.Field).join(', '));
  const [i2] = await c.query('SHOW INDEX FROM wechat_users');
  console.log('wechat_users 索引:', [...new Set(i2.map((x) => x.Key_name))].join(', '));
  const [c2] = await c.query('SHOW COLUMNS FROM wechat_users');
  console.log('wechat_users 字段:', c2.map((x) => x.Field).join(', '));

  await c.end();
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
