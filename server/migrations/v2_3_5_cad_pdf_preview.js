/**
 * v2.3.5 CAD 文件 PDF 预览
 * 内容：给 project_files 表加 pdf_preview 字段，存 CAD 转换后的 PDF 路径
 * 幂等：ALTER TABLE IF NOT EXISTS 不支持，改为先查再添加
 * 执行：node migrations/v2_3_5_cad_pdf_preview.js
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4',
});

async function main() {
  const conn = await pool.getConnection();
  try {
    console.log('✅ 已连接 ' + process.env.DB_HOST + '/' + process.env.DB_NAME + '\n');

    // 检查字段是否已存在
    const [cols] = await conn.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'project_files' AND COLUMN_NAME = 'pdf_preview'",
      [process.env.DB_NAME]
    );

    if (cols.length > 0) {
      console.log('ℹ️  pdf_preview 字段已存在，跳过');
    } else {
      await conn.query(`
        ALTER TABLE project_files
        ADD COLUMN pdf_preview VARCHAR(500) DEFAULT NULL COMMENT 'CAD转换后的PDF预览路径'
      `);
      console.log('✅ pdf_preview 字段已添加');
    }

    console.log('\n🎉 CAD PDF 预览迁移完成');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('❌ 迁移失败:', e); process.exit(1); });
