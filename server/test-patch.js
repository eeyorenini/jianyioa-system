// 直接模拟 POST /api/purchase-requests 的核心逻辑
const dbModule = require('./db-mysql-async.js');
const pool = dbModule.pool;

async function test() {
  const userId = 1;
  const userName = '管理员';
  const project_id = 1;
  const project_name = '测试项目';
  const items = [{ material_id: null, material_name: '瓷砖', unit: '箱', quantity: 10, unit_price: 100, total_price: 1000 }];
  const remark = '测试';

  try {
    const total_amount = items.reduce((sum, i) => sum + (parseFloat(i.total_price) || 0), 0);
    console.log('total_amount:', total_amount);

    const [result] = await pool.query(
      `INSERT INTO purchase_requests (project_id, project_name, applicant_id, applicant_name, total_amount, status, remark, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, NOW())`,
      [project_id, project_name, userId, userName, total_amount, remark]
    );
    console.log('插入结果:', result);
    const requestId = result.insertId;

    for (const item of items) {
      await pool.query(
        `INSERT INTO purchase_request_items (request_id, material_id, material_name, unit, quantity, unit_price, total_price, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [requestId, item.material_id || null, item.material_name, item.unit, item.quantity, item.unit_price, item.total_price]
      );
    }
    console.log('成功! requestId:', requestId);
  } catch(e) {
    console.error('错误:', e.code, e.message);
  }
  await pool.end();
  process.exit(0);
}
test();
