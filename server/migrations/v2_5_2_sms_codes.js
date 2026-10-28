/**
 * v2.5.2 短信验证码登录 —— 建表脚本（幂等）
 *
 * 用法：
 *   node migrations/v2_5_2_sms_codes.js --dry-run   仅预览
 *   node migrations/v2_5_2_sms_codes.js --apply     执行
 *
 * 设计要点：
 *   - 只存 code_hash（sha256），不存验证码明文 → 拖库也拿不到可用验证码
 *   - 按 (phone, scene) 建索引，登录/绑定等场景可共用一张表
 *   - MySQL 5.5 兼容：不用 JSON 类型、不用 DATETIME DEFAULT CURRENT_TIMESTAMP
 */
const { pool } = require('../db-mysql-async.js');

const DDL = [
  `CREATE TABLE IF NOT EXISTS sms_codes (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    phone       VARCHAR(20)  NOT NULL COMMENT '接收手机号',
    scene       VARCHAR(20)  NOT NULL DEFAULT 'login' COMMENT 'login/bind/reset',
    code_hash   CHAR(64)     NOT NULL COMMENT 'sha256(验证码)，不存明文',
    expires_at  DATETIME     NOT NULL COMMENT '过期时间（默认 5 分钟）',
    used_at     DATETIME     NULL     COMMENT '使用时间，非空即已消费',
    fail_count  INT          NOT NULL DEFAULT 0 COMMENT '校验失败次数，达 5 次作废',
    ip          VARCHAR(64)  NULL     COMMENT '请求来源 IP',
    created_at  DATETIME     NOT NULL,
    KEY idx_phone_scene (phone, scene),
    KEY idx_expires (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8`,

  // 配置项：验证码模板号（与 31 个通知模板分开，避免混用）
  // 不在这里写数据，由 PC 设置页或下面的 UPDATE 兜底
];

async function colExists(table, col) {
  const [rows] = await pool.query(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, col]
  );
  return rows.length > 0;
}

(async () => {
  const apply = process.argv.includes('--apply');
  console.log('模式：', apply ? 'APPLY（会执行）' : 'DRY-RUN（仅预览）');

  const [tables] = await pool.query("SHOW TABLES LIKE 'sms_codes'");
  console.log('sms_codes 是否已存在：', tables.length ? '是' : '否');

  if (!apply) {
    console.log('\n--- 将要执行的 DDL ---');
    DDL.forEach((s) => console.log(s.split('\n')[0] + ' ...'));
    console.log('\n加 --apply 才真正执行');
    await pool.end();
    return;
  }

  for (const sql of DDL) {
    await pool.query(sql);
    console.log('✓ 执行：', sql.split('\n')[0]);
  }

  // 兜底：确保 sms 配置里有 code_template_code 键（空值，等用户填）
  const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE category='sms'");
  if (rows.length) {
    let outer;
    try { outer = JSON.parse(rows[0].setting_value); } catch (e) { outer = null; }
    if (outer) {
      const inner = outer.setting_value || outer;
      if (!Object.prototype.hasOwnProperty.call(inner, 'code_template_code')) {
        inner.code_template_code = '';
        outer.setting_value = inner;
        await pool.query("UPDATE system_settings SET setting_value=?, updated_at=NOW() WHERE category='sms'", [
          JSON.stringify(outer),
        ]);
        console.log('✓ 已在 sms 配置中补上 code_template_code（空值，待填模板号）');
      } else {
        console.log('· sms 配置已存在 code_template_code，跳过');
      }
    }
  } else {
    console.log('! system_settings 无 sms 记录，跳过配置补键');
  }

  const [chk] = await pool.query('SHOW COLUMNS FROM sms_codes');
  console.log('\n最终 sms_codes 列：', chk.map((c) => c.Field).join(', '));
  await pool.end();
})().catch((e) => {
  console.error('失败：', e.message);
  process.exitCode = 1;
  pool.end();
});
