/**
 * 修复 project_files.title 的中文乱码（UTF-8 → Latin-1 双重编码）
 *
 * 根因：busboy 按 latin1 解读 multipart filename，中文被解成多字符，
 *       存进 utf8mb4 后成为双重编码。详见 server.js 中 fixMojibake 注释。
 *
 * 用法：
 *   node scripts/fix-project-files-mojibake.js            # 干跑，只预览不写库
 *   node scripts/fix-project-files-mojibake.js --apply    # 真正写库
 *
 * 安全：--apply 前会自动把原 title 备份到 project_files_title_bak_<时间戳> 表。
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const APPLY = process.argv.includes('--apply');

function fixMojibake(name) {
  if (typeof name !== 'string' || !name) return name;
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  try {
    const recovered = Buffer.from(name, 'latin1').toString('utf8');
    if (recovered.includes('\ufffd')) return name;
    return recovered;
  } catch {
    return name;
  }
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });

  const [rows] = await conn.query(
    'SELECT id, title FROM project_files ORDER BY id'
  );

  const fixes = rows
    .map((r) => ({ id: r.id, from: r.title, to: fixMojibake(r.title) }))
    .filter((r) => r.from !== r.to);

  console.log(`共扫描 ${rows.length} 条，需修复 ${fixes.length} 条`);
  console.log('');

  if (!fixes.length) {
    console.log('无需修复，退出。');
    await conn.end();
    return;
  }

  fixes.forEach((f) => {
    console.log(`#${f.id}`);
    console.log(`  原: ${f.from}`);
    console.log(`  新: ${f.to}`);
  });
  console.log('');

  if (!APPLY) {
    console.log('=== 干跑模式，未写库 ===');
    console.log('确认无误后加 --apply 执行写入：');
    console.log('  node scripts/fix-project-files-mojibake.js --apply');
    await conn.end();
    return;
  }

  // 备份原数据到独立表，便于回滚
  const bakTable = 'project_files_title_bak_' + Date.now();
  await conn.query(
    `CREATE TABLE \`${bakTable}\` (
       id INT NOT NULL,
       title VARCHAR(200) DEFAULT NULL,
       backed_up_at DATETIME NULL DEFAULT NULL,
       PRIMARY KEY (id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  for (const f of fixes) {
    await conn.query(
      `INSERT INTO \`${bakTable}\` (id, title, backed_up_at) VALUES (?, ?, NOW())`,
      [f.id, f.from]
    );
  }
  console.log(`已备份到表 ${bakTable}（${fixes.length} 条）`);

  for (const f of fixes) {
    await conn.query('UPDATE project_files SET title = ? WHERE id = ?', [f.to, f.id]);
  }
  console.log(`已修复 ${fixes.length} 条，提交完成。`);

  // 复核
  const [after] = await conn.query(
    'SELECT id, title FROM project_files WHERE id IN (?) ORDER BY id',
    [fixes.map((f) => f.id)]
  );
  console.log('');
  console.log('=== 修复后复核 ===');
  after.forEach((r) => console.log(`#${r.id}  ${r.title}`));

  await conn.end();
})().catch((e) => {
  console.error('执行失败:', e.message);
  process.exit(1);
});
