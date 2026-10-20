require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const zlib = require('zlib');
(async () => {
  const pool = mysql.createPool({host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:2,dateStrings:true});
  const [cols] = await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='contracts' ORDER BY ORDINAL_POSITION",[process.env.DB_NAME]);
  const names = cols.map(c=>c.COLUMN_NAME);
  const [ddl] = await pool.query('SHOW CREATE TABLE contracts');
  const target = '/Users/gtamer/Desktop/jianyioa-system/backup-20261020/contracts_before_migration.sql.gz';
  const gz = zlib.createGzip({level: 6});
  const ws = fs.createWriteStream(target);
  gz.pipe(ws);
  const write = s => new Promise(r => { if (gz.write(s)) r(); else gz.once('drain', r); });
  const esc = v => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}'`;
  await write('-- contracts 表备份 ' + new Date().toISOString() + '\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nDROP TABLE IF EXISTS `contracts`;\n' + ddl[0]['Create Table'] + ';\n');
  const [ids] = await pool.query('SELECT id FROM contracts ORDER BY id');
  let n = 0;
  for (const {id} of ids) {
    const [rows] = await pool.query('SELECT * FROM contracts WHERE id = ?', [id]);
    for (const r of rows) {
      await write(`INSERT INTO \`contracts\` (${names.map(x=>'`'+x+'`').join(',')}) VALUES (${names.map(x=>esc(r[x])).join(',')});\n`);
      n++;
    }
    console.log(`已备份 ${n}/${ids.length} 条 (id=${id})`);
  }
  await write('SET FOREIGN_KEY_CHECKS=1;\n');
  gz.end();
  await new Promise(r => ws.on('close', r));
  console.log('备份完成:', target, (fs.statSync(target).size/1024/1024).toFixed(1)+'MB', '行数:', n);
  await pool.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
