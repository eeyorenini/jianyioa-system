const dbModule = require('./db-mysql-async.js');
const pool = dbModule.pool;

async function t() {
  try {
    const [r] = await pool.query(
      'INSERT INTO purchase_requests (project_id, project_name, applicant_id, applicant_name, total_amount, status, remark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [1, '测试项目', 1, '管理员', 1000, 'pending', '测试']
    );
    console.log('插入成功', JSON.stringify(r));
  } catch(e) {
    console.error('错误', e.code, e.message, e.sqlMessage);
  }
  await pool.end();
}
t().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
