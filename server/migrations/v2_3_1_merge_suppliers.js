/**
 * v2.3.1 P5 收尾：合并 suppliers → external_contacts
 *
 * 步骤：
 *   1) SELECT * FROM suppliers → 写入 external_contacts (category='供应商')，
 *      字段映射：name=name, phone=contact_phone, company=name, role=remark/contact_person, remark=remark
 *   2) DROP TABLE suppliers（幂等：先检查再删）
 *   3) 删除 permissions 表 code='supplier' 的行
 *   4) 端到端验证：suppliers 数据 0、external_contacts 供应商类目有数
 *
 * ⚠️ 注意：main_materials.supplier_name、materials.supplier 等字段是文本引用，
 *   删 suppliers 表不会破坏数据；前端如要展示供应商名，已迁入 external_contacts。
 *
 * 执行：node migrations/v2_3_1_merge_suppliers.js
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
    console.log('✅ 已连接 ' + process.env.DB_HOST + '/' + process.env.DB_NAME);

    // 1) 检查 suppliers 是否存在
    const [tables] = await conn.query("SHOW TABLES LIKE 'suppliers'");
    if (!tables.length) {
      console.log('⏭ suppliers 表不存在，跳过数据搬迁');
    } else {
      const [rows] = await conn.query("SELECT id, name, contact_person, contact_phone, remark, status FROM suppliers");
      console.log(`suppliers 总数: ${rows.length}`);
      let moved = 0;
      for (const r of rows) {
        // 防止重复迁：如果已有同名同电话供应商，跳过
        const [exists] = await conn.query(
          "SELECT id FROM external_contacts WHERE category='供应商' AND name=? AND (phone=? OR phone IS NULL)",
          [r.name, r.contact_phone || '']
        );
        if (exists.length) {
          console.log(`⏭ 跳过已存在: ${r.name} (${r.contact_phone || '无电话'})`);
          continue;
        }
        // remark = 原 remark + 联系人 + 状态
        const remarkParts = [];
        if (r.contact_person) remarkParts.push(`联系人：${r.contact_person}`);
        if (r.status) remarkParts.push(`状态：${r.status}`);
        if (r.remark) remarkParts.push(r.remark);
        await conn.query(
          `INSERT INTO external_contacts (name, phone, category, company, role, remark, is_active, created_by, created_at, updated_at)
           VALUES (?, ?, '供应商', ?, ?, ?, 1, NULL, NOW(), NOW())`,
          [r.name, r.contact_phone || null, r.name, r.contact_person || null, remarkParts.join('；') || null]
        );
        moved++;
      }
      console.log(`✅ 已迁移 ${moved} 条 suppliers → external_contacts`);

      // 2) 删 suppliers 表
      await conn.query("DROP TABLE IF EXISTS suppliers");
      console.log('✅ suppliers 表已 DROP');
    }

    // 3) 删 permissions 表的 supplier 行
    const [pr] = await conn.query("SELECT id FROM permissions WHERE code='supplier'");
    if (pr.length) {
      await conn.query("DELETE FROM permissions WHERE code='supplier'");
      console.log(`✅ permissions 表 supplier 行已删（id=${pr[0].id}）`);
    } else {
      console.log('⏭ permissions 表无 supplier 行');
    }

    // 4) 验证
    const [exCount] = await conn.query("SELECT COUNT(*) AS c FROM external_contacts WHERE category='供应商'");
    console.log(`✅ external_contacts 供应商类目记录数: ${exCount[0].c}`);

    const [stillSup] = await conn.query("SHOW TABLES LIKE 'suppliers'");
    console.log(`✅ suppliers 表仍存在? ${stillSup.length > 0 ? '是（异常）' : '否（已删除）'}`);

    console.log('\n🎉 合并完成');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('❌ 迁移失败:', e); process.exit(1); });