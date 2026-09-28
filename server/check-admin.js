const dbModule = require('./db-mysql-async.js');
const pool = dbModule.pool;

async function t() {
  const [cols] = await pool.query(`SHOW COLUMNS FROM roles`);
  console.log('roles columns:', JSON.stringify(cols.map(c => c.Field)));

  const [admins] = await pool.query(`
    SELECT e.id, e.name, e.role_id, r.name as role_name
    FROM employees e
    LEFT JOIN roles r ON e.role_id = r.id
    WHERE e.name = '管理员' OR e.id = 1
    LIMIT 5
  `);
  console.log('Admin employees:', JSON.stringify(admins, null, 2));

  const [projects] = await pool.query(`SELECT id, name, creator_id, status FROM projects LIMIT 10`);
  console.log('Projects:', JSON.stringify(projects, null, 2));
}

t().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
