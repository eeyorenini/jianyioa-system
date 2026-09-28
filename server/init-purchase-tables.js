const dbModule = require('./db-mysql-async.js');
const pool = dbModule.pool;

async function run() {
  console.log('开始创建采购相关表...');

  // 1. purchase_requests 表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      project_name VARCHAR(255),
      applicant_id INT NOT NULL,
      applicant_name VARCHAR(100),
      total_amount DECIMAL(12,2) DEFAULT 0,
      actual_amount DECIMAL(12,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      rejection_reason VARCHAR(255),
      remark TEXT,
      created_at DATETIME DEFAULT '2024-01-01 00:00:00',
      updated_at DATETIME DEFAULT '2024-01-01 00:00:00'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('✅ purchase_requests 表创建完成');

  // 2. purchase_request_items 表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_request_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL,
      material_id INT,
      material_name VARCHAR(255),
      unit VARCHAR(50),
      quantity DECIMAL(10,2) DEFAULT 0,
      unit_price DECIMAL(12,2) DEFAULT 0,
      total_price DECIMAL(12,2) DEFAULT 0,
      created_at DATETIME DEFAULT '2024-01-01 00:00:00'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('✅ purchase_request_items 表创建完成');

  // 3. purchase_reimbursements 表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_reimbursements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL,
      images TEXT,
      actual_amount DECIMAL(12,2) DEFAULT 0,
      financial_notes TEXT,
      confirmed_by INT,
      confirmed_by_name VARCHAR(100),
      confirmed_at DATETIME,
      created_at DATETIME DEFAULT '2024-01-01 00:00:00'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('✅ purchase_reimbursements 表创建完成');

  // 4. 添加采购相关权限
  const permissions = [
    { name: '提交采购申请', code: 'purchase:write', path: '/purchase-requests', icon: 'ShoppingCart', sort_order: 20 },
    { name: '审核采购申请', code: 'purchase:approve', path: '/purchase-requests', icon: 'Checked', sort_order: 21 },
    { name: '财务报销确认', code: 'purchase:finance', path: '/purchase-requests', icon: 'Money', sort_order: 22 },
    { name: '查看采购记录', code: 'purchase:view', path: '/purchase-requests', icon: 'Document', sort_order: 23 },
  ];

  for (const p of permissions) {
    try {
      await pool.query(
        'INSERT INTO permissions (name, code, path, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
        [p.name, p.code, p.path, p.icon, p.sort_order]
      );
      console.log(`✅ 权限 ${p.code} 添加成功`);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        console.log(`ℹ️ 权限 ${p.code} 已存在，跳过`);
      } else {
        console.error(`❌ 权限 ${p.code} 添加失败:`, e.message);
      }
    }
  }

  console.log('\n🎉 全部完成！');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
