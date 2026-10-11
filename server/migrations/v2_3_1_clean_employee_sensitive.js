/**
 * v2.3.1 P2 §3 清理：移除 employees 表的工资/身份证/紧急联系/电话 4 个字段
 * 原因：项目运营不需要这些字段；后续角色权限细分交给外部联系人独立管理。
 *
 * 同时新增 external_contacts 表（独立模块 key = external_contact）：
 *   - 字段：id, name, phone, category (工人/供应商/...), company, role, remark, is_active, created_by, created_at
 *   - 不走 employees；纯独立管理。
 *
 * 注意：本脚本可重复执行（幂等），列已存在时跳过 ALTER。
 *
 * 执行：node migrations/v2_3_1_clean_employee_sensitive.js
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4',
});

async function dropColumnIfExists(conn, table, col) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [process.env.DB_NAME, table, col]
  );
  if (rows[0].c > 0) {
    await conn.query(`ALTER TABLE ${table} DROP COLUMN ${col}`);
    console.log(`✅ ${table}.${col} 已删除`);
  } else {
    console.log(`⏭ ${table}.${col} 不存在，跳过`);
  }
}

async function main() {
  const conn = await pool.getConnection();
  try {
    console.log('✅ 已连接 ' + process.env.DB_HOST + '/' + process.env.DB_NAME);

    // 1) 清理 employees 表的 4 个无用字段
    for (const col of ['salary', 'id_card', 'emergency_contact', 'emergency_phone']) {
      await dropColumnIfExists(conn, 'employees', col);
    }

    // 2) 新增 external_contacts 表
    await conn.query(`
      CREATE TABLE IF NOT EXISTS external_contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL COMMENT '姓名/称呼',
        phone VARCHAR(50) DEFAULT NULL COMMENT '联系电话',
        category VARCHAR(50) NOT NULL DEFAULT '工人' COMMENT '分类：工人/供应商/设计师/其他',
        company VARCHAR(200) DEFAULT NULL COMMENT '公司/团队',
        role VARCHAR(100) DEFAULT NULL COMMENT '角色/工种',
        remark TEXT COMMENT '备注',
        is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用',
        created_by INT DEFAULT NULL COMMENT '创建人',
        created_at DATETIME DEFAULT NULL,
        updated_at DATETIME DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ external_contacts 表已就绪');

    // 3) permissions 表新增模块 external_contacts（独立模块 key = external_contact）
    const [pc] = await conn.query("SELECT id FROM permissions WHERE code = 'external_contact' LIMIT 1");
    if (!pc[0]) {
      await conn.query(
        "INSERT INTO permissions (name, code, parent_id, type, path, icon, sort_order, created_at) VALUES ('外部联系人', 'external_contact', NULL, 'menu', '/external-contacts', 'UserFilled', 27, NOW())"
      );
      console.log('✅ permissions 新增模块 external_contact（外部联系人）');
    } else {
      console.log('⏭ permissions 已有 external_contact');
    }

    console.log('\n🎉 清理完成');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('❌ 迁移失败:', e); process.exit(1); });