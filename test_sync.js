// Test sync query performance
const mysql = require('D:/wwwroot/jianyioa-system/node_modules/mysql2/promise');
const deasync = require('deasync');

const pool = mysql.createPool({
  host: '127.0.0.1', user: 'jianyioa', password: 'zpfbAsxyA76P2ZHw',
  database: 'jianyioa', waitForConnections: true, connectionLimit: 10, charset: 'utf8mb4'
});

const start = Date.now();
let done = false, result = null, error = null;

pool.query('SELECT * FROM contract_templates')
  .then(r => { result = r[0]; done = true; })
  .catch(e => { error = e; done = true; });

while (!done) deasync.runLoopOnce();

console.log('deasync query:', Date.now() - start, 'ms, rows:', result ? result.length : error.message);
pool.end();
