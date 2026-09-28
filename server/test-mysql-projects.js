const dbModule = require('./db-mysql-async.js');
const pool = dbModule.pool;

async function t() {
  const [rows] = await pool.query(`
    SELECT p.id, p.name, p.creator_id, p.status,
           c.name as customer_name, c.phone as customer_phone,
           des.name as designer_name, des.phone as designer_phone,
           sup.name as supervisor_name, sup.phone as supervisor_phone,
           mgr.name as manager_name, mgr.phone as manager_phone
    FROM projects p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN employees des ON p.designer_id = des.id
    LEFT JOIN employees sup ON p.supervisor_id = sup.id
    LEFT JOIN employees mgr ON p.manager_id = mgr.id
    ORDER BY p.created_at DESC
    LIMIT 5
  `);
  console.log('MySQL projects:', rows.length, rows.map(r => ({ id: r.id, name: r.name, creator_id: r.creator_id })));
}

t().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
