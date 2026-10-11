/**
 * v2.3.1 P5 收尾：主材/采购里的供应商引用重建
 *
 * 场景：
 *   - main_materials.supplier_id 原本指向 suppliers.id=1（已 DROP）
 *   - 该数据搬到了 external_contacts 新 id=2
 *   - 但 main_materials 的 supplier_id 还指向老 id=1，已失效
 *
 * 本脚本：
 *   1) 扫描 main_materials / purchase_requests / purchases 三表用过的 supplier_id 集合
 *   2) 在 external_contacts 里按 (name, phone) 找出/创建对应记录，记录 old_id -> new_id 映射
 *   3) 用映射回写三表的 supplier_id；supplier_name 已经是名，可保留也可同步
 *   4) 处理 orphan：没有任何 supplier_id 但有 supplier_name 文本的，按名入 external_contacts 后保留文本
 *   5) 清掉所有 supplier_id 指向不存在记录的孤行（置 NULL）
 *
 * 幂等：可重复执行；映射表已建立的 supplier 跳过。
 *
 * 执行：node migrations/v2_3_1_repair_supplier_refs.js
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

const SOURCE_TABLES = [
  { table: 'main_materials', idCol: 'id', supIdCol: 'supplier_id', supNameCol: 'supplier_name' },
  { table: 'purchase_requests', idCol: 'id', supIdCol: 'supplier_id', supNameCol: 'supplier_name' },
  { table: 'purchases', idCol: 'id', supIdCol: 'supplier_id', supNameCol: 'supplier_name' },
];

async function main() {
  const conn = await pool.getConnection();
  try {
    console.log('✅ 已连接 ' + process.env.DB_HOST + '/' + process.env.DB_NAME);

    // 1) 收集老 supplier_id -> { name, phone } 映射（从 main_materials 本身的 supplier_name 拿名）
    //    因为 suppliers 表已 DROP，只能从文本名推回
    const idToName = new Map();
    for (const t of SOURCE_TABLES) {
      const [rows] = await conn.query(
        `SELECT DISTINCT ${t.supIdCol} AS sid, ${t.supNameCol} AS sname FROM ${t.table}
         WHERE ${t.supIdCol} IS NOT NULL`
      );
      for (const r of rows) {
        if (!idToName.has(r.sid)) {
          idToName.set(r.sid, { name: r.sname || `历史供应商#${r.sid}`, phone: null });
        }
      }
    }
    console.log('老 supplier_id 集合:', [...idToName.entries()]);

    // 2) 按 name 找 / 建 external_contacts 记录，建立 sid -> ext_id 映射
    const sidToExtId = new Map();
    for (const [sid, info] of idToName.entries()) {
      // 先按名找
      const [exist] = await conn.query(
        "SELECT id FROM external_contacts WHERE category='供应商' AND name=? LIMIT 1",
        [info.name]
      );
      if (exist.length) {
        sidToExtId.set(sid, exist[0].id);
        console.log(`  老 id=${sid} (${info.name}) → 已有 ext_id=${exist[0].id}`);
      } else {
        const [r] = await conn.query(
          `INSERT INTO external_contacts (name, phone, category, company, role, remark, is_active, created_by, created_at, updated_at)
           VALUES (?, ?, '供应商', ?, NULL, '从历史 supplier_id 恢复', 1, NULL, NOW(), NOW())`,
          [info.name, info.phone, info.name]
        );
        sidToExtId.set(sid, r.insertId);
        console.log(`  老 id=${sid} (${info.name}) → 新建 ext_id=${r.insertId}`);
      }
    }

    // 3) 回写各表的 supplier_id
    for (const t of SOURCE_TABLES) {
      for (const [sid, extId] of sidToExtId.entries()) {
        const [r] = await conn.query(
          `UPDATE ${t.table} SET ${t.supIdCol}=? WHERE ${t.supIdCol}=?`,
          [extId, sid]
        );
        if (r.affectedRows) console.log(`  ${t.table}: supplier_id=${sid} → ${extId}（${r.affectedRows} 行）`);
      }
    }

    // 4) 处理只有 supplier_name 没有 supplier_id 的"文本供应商"（按名入 external_contacts）
    //    这一步不再回写 supplier_id（不知道原 id），但保证外部联系人里能看到全部供应商名。
    const nameSet = new Set([...idToName.values()].map(v => v.name));
    let insertedByName = 0;
    for (const t of SOURCE_TABLES) {
      const [rows] = await conn.query(
        `SELECT DISTINCT ${t.supNameCol} AS sname FROM ${t.table}
         WHERE ${t.supNameCol} IS NOT NULL AND ${t.supNameCol}<>'' AND ${t.supIdCol} IS NULL`
      );
      for (const r of rows) {
        const [exist] = await conn.query(
          "SELECT id FROM external_contacts WHERE category='供应商' AND name=? LIMIT 1",
          [r.sname]
        );
        if (!exist.length) {
          await conn.query(
            `INSERT INTO external_contacts (name, phone, category, company, role, remark, is_active, created_by, created_at, updated_at)
             VALUES (?, NULL, '供应商', ?, NULL, '从历史供应商名恢复', 1, NULL, NOW(), NOW())`,
            [r.sname, r.sname]
          );
          insertedByName++;
        }
      }
    }
    console.log(`按名补建供应商: ${insertedByName} 条`);

    // 5) 验证
    const [ex] = await conn.query("SELECT COUNT(*) c FROM external_contacts WHERE category='供应商'");
    console.log(`\n✅ external_contacts 供应商类目总数: ${ex[0].c}`);

    const [mainMats] = await conn.query("SELECT COUNT(*) c FROM main_materials WHERE supplier_id IS NOT NULL");
    console.log(`main_materials 有 supplier_id 的记录: ${mainMats[0].c}`);

    // 6) 校验 supplier_id 都能在 external_contacts 找到
    const [orphan] = await conn.query(`
      SELECT 'main_materials' AS t, supplier_id, COUNT(*) c FROM main_materials WHERE supplier_id IS NOT NULL AND supplier_id NOT IN (SELECT id FROM external_contacts WHERE category='供应商') GROUP BY supplier_id
      UNION ALL
      SELECT 'purchases' AS t, supplier_id, COUNT(*) c FROM purchases WHERE supplier_id IS NOT NULL AND supplier_id NOT IN (SELECT id FROM external_contacts WHERE category='供应商') GROUP BY supplier_id
      UNION ALL
      SELECT 'purchase_requests' AS t, supplier_id, COUNT(*) c FROM purchase_requests WHERE supplier_id IS NOT NULL AND supplier_id NOT IN (SELECT id FROM external_contacts WHERE category='供应商') GROUP BY supplier_id
    `);
    if (orphan.length) {
      console.log('⚠️ 孤行（应清 NULL）:', orphan);
      // 置 NULL
      for (const t of SOURCE_TABLES) {
        await conn.query(
          `UPDATE ${t.table} SET ${t.supIdCol}=NULL WHERE ${t.supIdCol} IS NOT NULL AND ${t.supIdCol} NOT IN (SELECT id FROM external_contacts WHERE category='供应商')`
        );
      }
      console.log('已把孤行 supplier_id 置 NULL');
    } else {
      console.log('✅ 全部 supplier_id 都能在外部联系人供应商类目里找到');
    }

    console.log('\n🎉 修复完成');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('❌ 修复失败:', e); process.exit(1); });