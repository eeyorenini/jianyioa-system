/**
 * v2.3.1 权限体系 · P1 数据结构
 * 内容：
 *   1) projects  新增 foreman_id（工长，与项目经理分开）
 *   2) employees 新增 is_external（外部人员标记，默认不进通讯录）
 *   3) permissions 表补齐 3 个新模块（project_log / material / collection）
 *   4) system_settings 新增 customer_visibility（客户端 8 开关，全局一份）
 *
 * 幂等：可重复执行；已存在的字段/记录自动跳过。
 * 执行：node migrations/v2_3_1_permission_foundation.js
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

async function hasColumn(conn, table, column) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [process.env.DB_NAME, table, column]
  );
  return rows[0].c > 0;
}

async function main() {
  const conn = await pool.getConnection();
  try {
    console.log('✅ 已连接 ' + process.env.DB_HOST + '/' + process.env.DB_NAME + '\n');

    // 1. projects.foreman_id
    if (await hasColumn(conn, 'projects', 'foreman_id')) {
      console.log('⏭ projects.foreman_id 已存在');
    } else {
      await conn.query("ALTER TABLE projects ADD COLUMN foreman_id INT DEFAULT NULL COMMENT '工长(员工ID)' AFTER supervisor_id");
      console.log('✅ projects.foreman_id 已新增');
    }

    // 2. employees.is_external
    if (await hasColumn(conn, 'employees', 'is_external')) {
      console.log('⏭ employees.is_external 已存在');
    } else {
      await conn.query("ALTER TABLE employees ADD COLUMN is_external TINYINT(1) NOT NULL DEFAULT 0 COMMENT '外部人员(1=是,默认不进通讯录)'");
      console.log('✅ employees.is_external 已新增');
    }

    // 3. permissions 补齐 3 个新模块
    const newModules = [
      ['施工日志', 'project_log', '/project-logs', 'Notebook', 24],
      ['主材管理', 'material', '/materials', 'Box', 25],
      ['催收记录', 'collection', '/collections', 'Money', 26],
    ];
    for (const [name, code, path, icon, sort] of newModules) {
      const [rows] = await conn.query("SELECT id FROM permissions WHERE code = ? LIMIT 1", [code]);
      if (rows.length) {
        console.log('⏭ permissions 已有模块 ' + code);
      } else {
        await conn.query(
          "INSERT INTO permissions (name, code, parent_id, type, path, icon, sort_order, created_at) VALUES (?, ?, NULL, 'menu', ?, ?, ?, NOW())",
          [name, code, path, icon, sort]
        );
        console.log('✅ permissions 新增模块 ' + code + '（' + name + '）');
      }
    }

    // 4. system_settings.customer_visibility
    const defaultVisibility = JSON.stringify({
      project_info: true,      // 项目信息（名称/进度/节点）
      project_log: true,       // 施工日志
      inspection: true,        // 巡检记录
      acceptance: true,        // 验收记录
      rectification: true,     // 整改单
      contract_amount: false,  // 合同金额（默认关）
      family_members: true,    // 家庭成员（可增删）
      messages: true,          // 消息通知
    });
    const [vs] = await conn.query("SELECT id FROM system_settings WHERE category = 'customer_visibility' LIMIT 1");
    if (vs.length) {
      console.log('⏭ system_settings.customer_visibility 已存在');
    } else {
      await conn.query(
        "INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES ('customer_visibility', ?, NOW(), NOW())",
        [defaultVisibility]
      );
      console.log('✅ system_settings 新增 customer_visibility（默认：合同金额关，其余开）');
    }

    console.log('\n🎉 P1 数据结构迁移完成');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('❌ 迁移失败:', e); process.exit(1); });
