#!/usr/bin/env node
/**
 * 建亿OA 数据库全量导出（无 mysqldump 环境下的替代方案）
 * ---------------------------------------------------------------
 * 本机没装 mysql 客户端，用项目自带的 mysql2 直接读库生成 SQL 文本。
 *
 * 输出：结构 + 数据 的完整 SQL（可直接 mysql < xxx.sql 还原）
 * 只读：只执行 SHOW / SELECT，不写任何数据。
 *
 * 用法:
 *   node backup-db.js                     # 输出到 ../备份/db/jianyioa-<时间>.sql.gz
 *   node backup-db.js /path/out.sql       # 指定输出文件（不压缩）
 *   node backup-db.js --schema-only       # 只要结构
 *
 * ⚠️ 连的是生产库（.env 里的 DB_HOST），导出期间有轻微查询负载，
 *    6.4MB 的量级可以忽略。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 项目内依赖，注意用相对路径解析（脚本放在 scripts/ 目录）
const SERVER_DIR = path.resolve(__dirname, '..', 'server');
require(path.join(SERVER_DIR, 'node_modules', 'dotenv')).config({
  path: path.join(SERVER_DIR, '.env'),
});
const mysql = require(path.join(SERVER_DIR, 'node_modules', 'mysql2', 'promise'));

const args = process.argv.slice(2);
const SCHEMA_ONLY = args.includes('--schema-only');
const outArg = args.find(a => !a.startsWith('--'));

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-`
            + `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

const DB = (process.env.DB_NAME || 'jianyioa').trim();
const OUT = outArg || path.resolve(__dirname, '..', '..',
  'jianyioa项目版本管理', '备份', 'db', `jianyioa-${stamp}.sql`);

// ---------- SQL 值转义 ----------
function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (Buffer.isBuffer(v)) return `X'${v.toString('hex')}'`;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date) {
    return `'${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} `
         + `${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}'`;
  }
  // 字符串：走 mysql2 的 escape（处理引号、反斜杠、特殊字符）
  return mysql.escape(String(v));
}

(async () => {
  const conn = await mysql.createConnection({
    host: (process.env.DB_HOST || '127.0.0.1').trim(),
    port: Number(process.env.DB_PORT || 3306),
    user: (process.env.DB_USER || '').trim(),
    password: process.env.DB_PASSWORD || '',
    database: DB,
    dateStrings: true,          // 日期按字符串返回，避免时区偏移
    charset: 'utf8mb4',
    connectTimeout: 20000,
  });

  console.error(`已连接 ${DB}，开始导出...`);

  const [tables] = await conn.query(
    `SELECT table_name AS t FROM information_schema.tables
     WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name`, [DB]);

  const chunks = [];
  chunks.push(`-- 建亿OA 数据库备份`);
  chunks.push(`-- 数据库: ${DB}`);
  chunks.push(`-- 导出时间: ${now.toISOString()}`);
  chunks.push(`-- 表数量: ${tables.length}`);
  chunks.push(`-- 还原: mysql -u<user> -p ${DB} < 本文件\n`);
  chunks.push(`SET NAMES utf8mb4;`);
  chunks.push(`SET FOREIGN_KEY_CHECKS = 0;`);
  chunks.push(`SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n`);

  let totalRows = 0;
  let totalBytes = 0;

  for (const { t } of tables) {
    const [createRows] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
    const ddl = createRows[0]['Create Table'] || createRows[0]['Create View'];
    chunks.push(`-- ----------------------------`);
    chunks.push(`-- ${t}`);
    chunks.push(`-- ----------------------------`);
    chunks.push(`DROP TABLE IF EXISTS \`${t}\`;`);
    chunks.push(`${ddl};\n`);

    if (SCHEMA_ONLY) continue;

    const [rows] = await conn.query(`SELECT * FROM \`${t}\``);
    if (!rows.length) continue;

    const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ');

    // 分批 INSERT，避免单条语句过长（contracts 有 base64 大字段）
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const values = slice.map(r => '(' + Object.keys(rows[0]).map(c => sqlVal(r[c])).join(', ') + ')');
      chunks.push(`INSERT INTO \`${t}\` (${cols}) VALUES\n${values.join(',\n')};`);
    }
    chunks.push('');

    totalRows += rows.length;
    totalBytes += Buffer.byteLength(chunks[chunks.length - 1] || '');
    process.stderr.write(`\r  ${t.padEnd(36)} ${String(rows.length).padStart(7)} 行`);
  }

  chunks.push(`SET FOREIGN_KEY_CHECKS = 1;`);

  const sql = chunks.join('\n');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const finalPath = outArg ? OUT : OUT + '.gz';
  const buf = Buffer.from(sql, 'utf8');

  if (outArg) {
    fs.writeFileSync(finalPath, buf);
  } else {
    fs.writeFileSync(finalPath, zlib.gzipSync(buf, { level: 9 }));
  }

  const size = fs.statSync(finalPath).size;
  console.error('\n');
  console.error(`  ✓ 表 ${tables.length} 张，数据 ${totalRows} 行`);
  console.error(`  ✓ 输出 ${finalPath}`);
  console.error(`  ✓ 体积 ${(size / 1048576).toFixed(2)} MB（未压缩 ${(buf.length / 1048576).toFixed(2)} MB）`);

  await conn.end();
})().catch(e => {
  console.error('\n  ✗ 导出失败:', e.message);
  process.exit(1);
});
