const dbModule = require('./db-mysql-async.js');
const pool = dbModule.pool;

async function t() {
  await pool.query('DELETE FROM purchase_request_items WHERE request_id <= 6');
  await pool.query('DELETE FROM purchase_reimbursements WHERE request_id <= 6');
  await pool.query('DELETE FROM purchase_requests WHERE id <= 6');
  console.log('清理完成');
  await pool.end();
  process.exit(0);
}
t();
