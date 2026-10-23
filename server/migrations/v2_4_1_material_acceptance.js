/**
 * v2.4.1 主材验收 —— 建表 + 角色权限 seed
 *
 * 做什么：
 *   1) 建 material_acceptances（主单）/ material_acceptance_items（材料明细）两张表；
 *   2) 给现有角色补 material_acceptance:* 权限（只追加缺失项，不删除、不覆盖人工配置）。
 *
 * 为什么需要单跑：
 *   server.js 启动 2.6s 后也会自动建表（覆盖代码 → 重启即生效）；
 *   但权限是数据、不是代码，必须显式执行本脚本（或到 PC「角色权限」里手工勾选）。
 *
 * 执行：node migrations/v2_4_1_material_acceptance.js
 * 只看不写：DRY=1 node migrations/v2_4_1_material_acceptance.js
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const mysql = require('mysql2/promise');

const DRY = process.env.DRY === '1';

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

// 角色 → 追加的权限串
// read_all = 看全公司；read = 只看关联项目（含 projects.foreman_id 指向自己，工长天然命中）
const GRANTS = {
  manager: ['material_acceptance:read_all', 'material_acceptance:write'],
  Engineer: ['material_acceptance:read_all', 'material_acceptance:write', 'material_acceptance:delete'],
  material: ['material_acceptance:read_all', 'material_acceptance:write'],
  user: ['material_acceptance:read', 'material_acceptance:write'],
  designer: ['material_acceptance:read'],
  finance: ['material_acceptance:read_all'],
  // admin 不加：后端按 role_code/username = admin 直通全部
};

const DDL = [
  `CREATE TABLE IF NOT EXISTS material_acceptances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    accept_no VARCHAR(50) DEFAULT '',
    project_id INT NOT NULL,
    project_name VARCHAR(255) DEFAULT '',
    accept_date VARCHAR(50) DEFAULT '',
    stage VARCHAR(50) DEFAULT '',
    foreman_id INT DEFAULT NULL,
    foreman_name VARCHAR(100) DEFAULT '',
    supplier_id INT DEFAULT NULL,
    supplier_name VARCHAR(255) DEFAULT '',
    delivery_no VARCHAR(100) DEFAULT '',
    docs TEXT,
    storage VARCHAR(50) DEFAULT '',
    result VARCHAR(50) DEFAULT '',
    handling VARCHAR(50) DEFAULT '',
    item_count INT DEFAULT 0,
    pass_count INT DEFAULT 0,
    fail_count INT DEFAULT 0,
    photos TEXT,
    remark TEXT,
    creator_id INT DEFAULT NULL,
    created_at DATETIME NULL DEFAULT NULL,
    updated_at DATETIME NULL DEFAULT NULL,
    KEY idx_ma_project (project_id),
    KEY idx_ma_date (accept_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS material_acceptance_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    accept_id INT NOT NULL,
    material_id INT DEFAULT NULL,
    material_name VARCHAR(255) DEFAULT '',
    spec VARCHAR(255) DEFAULT '',
    brand VARCHAR(255) DEFAULT '',
    unit VARCHAR(50) DEFAULT '',
    plan_qty DECIMAL(12,2) DEFAULT NULL,
    actual_qty DECIMAL(12,2) DEFAULT NULL,
    verdict VARCHAR(20) DEFAULT '合格',
    problem_tags TEXT,
    remark VARCHAR(255) DEFAULT '',
    sort_order INT DEFAULT 0,
    KEY idx_mai_accept (accept_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

(async () => {
  try {
    for (const sql of DDL) {
      if (DRY) { console.log('[dry] 跳过建表'); break; }
      await pool.query(sql);
    }
    console.log(DRY ? '[dry] 建表已跳过' : '✅ 两张表已就绪');

    const [roles] = await pool.query('SELECT id, name, code, permissions FROM roles');
    for (const r of roles) {
      const wanted = GRANTS[r.code];
      if (!wanted || !wanted.length) continue;
      let perms = r.permissions;
      if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch { perms = []; }
      }
      if (!Array.isArray(perms)) perms = [];
      const missing = wanted.filter((p) => !perms.includes(p));
      if (!missing.length) {
        console.log(`  - ${r.name}(${r.code}) 已有全部权限，跳过`);
        continue;
      }
      const next = [...perms, ...missing];
      if (DRY) {
        console.log(`[dry] ${r.name}(${r.code}) 将追加: ${missing.join(', ')}`);
        continue;
      }
      await pool.query('UPDATE roles SET permissions = ? WHERE id = ?', [JSON.stringify(next), r.id]);
      console.log(`  + ${r.name}(${r.code}) 追加: ${missing.join(', ')}`);
    }
    console.log('✅ 权限 seed 完成');
  } catch (e) {
    console.error('❌ 失败:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
