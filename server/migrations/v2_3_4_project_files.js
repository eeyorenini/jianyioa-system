/**
 * v2.3.4 项目文件功能 · P1 数据结构
 * 内容：新建 project_files 表
 *   字段：id, project_id, category, title, file_path, file_size, file_ext,
 *         description, status, uploaded_by, uploaded_at, reviewed_by,
 *         reviewed_at, review_comment, created_at, updated_at
 *   索引：idx_project (project_id, status, category)
 *         idx_uploader (uploaded_by, status)
 *
 * 状态机：pending → approved / rejected；revoked 由上传人撤回
 * 分类：8 类 contract/design_cad/design_render/point_layout/construction_drawing/quote/change_order/other
 * 权限位：project_file:read / read_all / write / approve（独立 migration 加 permissions + 角色 preset）
 *
 * 幂等：CREATE TABLE IF NOT EXISTS，重复执行安全。
 * 执行：node migrations/v2_3_4_project_files.js
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

    // 1. project_files 主表
    await conn.query(`
      CREATE TABLE IF NOT EXISTS project_files (
        id              INT PRIMARY KEY AUTO_INCREMENT,
        project_id      INT NOT NULL COMMENT '关联项目ID',
        category        VARCHAR(32) NOT NULL COMMENT '分类: contract/design_cad/design_render/point_layout/construction_drawing/quote/change_order/other',
        title           VARCHAR(200) NOT NULL COMMENT '用户原文件名(显示用)',
        file_path       VARCHAR(500) NOT NULL COMMENT '服务器物理路径 uploads/project_files/yyyy/mm/uuid.ext',
        file_size       INT NOT NULL DEFAULT 0 COMMENT '字节',
        file_ext        VARCHAR(16) NOT NULL COMMENT '扩展名 pdf/jpg/png/...',
        description     TEXT NULL COMMENT '上传人备注(可选)',
        status          VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/revoked',
        uploaded_by     INT NOT NULL COMMENT '上传人 employees.id',
        uploaded_at     DATETIME NOT NULL,
        reviewed_by     INT NULL COMMENT '审核人 employees.id',
        reviewed_at     DATETIME NULL,
        review_comment  TEXT NULL,
        created_at      DATETIME NOT NULL,
        updated_at      DATETIME NOT NULL,
        INDEX idx_project (project_id, status, category),
        INDEX idx_uploader (uploaded_by, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目文件(合同/设计图/效果图/点位图/施工图/报价单/变更签证/其他)'
    `);
    console.log('✅ project_files 表已建');

    console.log('\n🎉 P1 数据结构迁移完成');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('❌ 迁移失败:', e); process.exit(1); });
