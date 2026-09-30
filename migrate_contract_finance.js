/**
 * v2.2 合同管理与财务管理迁移脚本
 * 从 Mac 本地直连云数据库执行
 */
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: '127.0.0.1',   // 云数据库通过 SSH 隧道映射到本地 13306
  port: 13306,
  user: 'jianyioa',
  password: 'zpfbAsxyA76P2ZHw',
  database: 'jianyioa',
  waitForConnections: true,
  connectionLimit: 3,
});

async function migrate() {
  const conn = await pool.getConnection();
  try {
    console.log('✅ 连接成功，开始迁移...\n');

    // 1. contracts 新增字段
    const alterContracts = [
      "ALTER TABLE contracts ADD COLUMN project_id INT DEFAULT NULL COMMENT '关联项目ID' AFTER customer_id",
      "ALTER TABLE contracts ADD COLUMN contract_amount DECIMAL(12,2) DEFAULT NULL COMMENT '营收金额' AFTER project_id",
      "ALTER TABLE contracts ADD COLUMN file_path VARCHAR(500) DEFAULT NULL COMMENT '合同文件路径' AFTER contract_amount",
      "ALTER TABLE contracts ADD COLUMN review_status VARCHAR(20) DEFAULT 'pending' COMMENT '审核状态' AFTER file_path",
      "ALTER TABLE contracts ADD COLUMN reviewed_by INT DEFAULT NULL COMMENT '审核人ID' AFTER review_status",
      "ALTER TABLE contracts ADD COLUMN reviewed_at DATETIME DEFAULT NULL COMMENT '审核时间' AFTER reviewed_by",
    ];

    for (const sql of alterContracts) {
      try {
        await conn.query(sql);
        console.log('✅', sql.substring(0, 70));
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') console.log('⏭ 已存在:', sql.substring(0, 50));
        else console.error('❌', e.code, sql.substring(0, 50));
      }
    }

    // 2. 新增 contract_changes 表
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS contract_changes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contract_id INT NOT NULL,
        project_id INT NOT NULL,
        type ENUM('increase','decrease') NOT NULL,
        project_name VARCHAR(255) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        details TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_by INT DEFAULT NULL,
        reviewed_by INT DEFAULT NULL,
        reviewed_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      console.log('✅ 创建表 contract_changes');
    } catch (e) {
      if (e.code === 'ER_TABLE_EXISTS_ERROR') console.log('⏭ contract_changes 已存在');
      else console.error('❌', e.code, e.message);
    }

    // 3. 新增 collection_records 表
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS collection_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        record_date DATE NOT NULL,
        remark TEXT,
        images TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_by INT DEFAULT NULL,
        confirmed_by INT DEFAULT NULL,
        confirmed_at DATETIME DEFAULT NULL,
        confirmed_amount DECIMAL(12,2) DEFAULT NULL,
        confirmed_remark TEXT,
        confirmed_images TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      console.log('✅ 创建表 collection_records');
    } catch (e) {
      if (e.code === 'ER_TABLE_EXISTS_ERROR') console.log('⏭ collection_records 已存在');
      else console.error('❌', e.code, e.message);
    }

    // 4. 新增 payment_records 表
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS payment_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        type VARCHAR(20) NOT NULL,
        category VARCHAR(50) DEFAULT 'manual',
        source_id INT DEFAULT NULL,
        amount DECIMAL(12,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        remark TEXT,
        created_by INT DEFAULT NULL,
        confirmed_by INT DEFAULT NULL,
        confirmed_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      console.log('✅ 创建表 payment_records');
    } catch (e) {
      if (e.code === 'ER_TABLE_EXISTS_ERROR') console.log('⏭ payment_records 已存在');
      else console.error('❌', e.code, e.message);
    }

    // 5. dispatches 表新增字段
    const alterDispatches = [
      "ALTER TABLE dispatches ADD COLUMN review_status VARCHAR(20) DEFAULT 'pending' COMMENT '业务审核状态'",
      "ALTER TABLE dispatches ADD COLUMN financial_status VARCHAR(20) DEFAULT 'unpaid' COMMENT '财务状态'",
    ];
    for (const sql of alterDispatches) {
      try {
        await conn.query(sql);
        console.log('✅', sql.substring(0, 70));
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') console.log('⏭ 已存在:', sql.substring(0, 50));
        else console.error('❌', e.code, sql.substring(0, 50));
      }
    }

    console.log('\n🎉 迁移完成！');
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(e => { console.error('迁移失败:', e.message); process.exit(1); });
