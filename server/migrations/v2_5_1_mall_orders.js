/**
 * v2.5.1 商城订单表
 *
 * 设计原则（按"简单一些"的要求）：
 *   - 商品池直接复用 main_materials，mall_status=1 即在商城可见，不另建商品表、不双写。
 *   - 购物车放前端 storage，不入库（业主换设备重新加，可接受）。
 *   - 无在线支付：下单只生成订单号，业主银行转账时把订单号写进备注，财务人工确认。
 *
 * MySQL 5.5.62 限制：
 *   - 不支持 DATETIME DEFAULT CURRENT_TIMESTAMP → 用固定默认值，写入时显式 NOW()
 *   - COMMENT 不能用双引号（ANSI_QUOTES）→ 一律单引号
 *
 * 用法：node migrations/v2_5_1_mall_orders.js [--dry-run]
 */
const db = require('../db-mysql-async.js');
const pool = db.pool;
const DRY = process.argv.includes('--dry-run');

async function q(sql, params) {
  const [rows] = await pool.query(sql, params || []);
  return rows;
}

(async () => {
  /* ---------- 1. 订单主表 ---------- */
  if (!DRY) {
    await q(`
      CREATE TABLE IF NOT EXISTS mall_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_no VARCHAR(32) NOT NULL COMMENT '订单编号，业主转账备注用，形如 M202610280001',
        customer_id INT DEFAULT NULL COMMENT 'customers.id',
        customer_name VARCHAR(100) DEFAULT '' COMMENT '下单人姓名（快照）',
        phone VARCHAR(50) DEFAULT '' COMMENT '联系电话（快照）',
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '订单总额',
        item_count INT NOT NULL DEFAULT 0 COMMENT '商品种类数',
        total_qty INT NOT NULL DEFAULT 0 COMMENT '商品总件数',
        status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending待转账/paid已收款/cancelled已取消',
        remark TEXT COMMENT '业主备注',
        admin_remark TEXT COMMENT '财务备注',
        paid_at DATETIME DEFAULT NULL COMMENT '确认收款时间',
        paid_by INT DEFAULT NULL COMMENT '确认人 employees.id',
        created_at DATETIME DEFAULT '2024-01-01 00:00:00',
        updated_at DATETIME DEFAULT '2024-01-01 00:00:00',
        UNIQUE KEY uk_order_no (order_no),
        KEY idx_customer (customer_id),
        KEY idx_status (status),
        KEY idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商城订单'
    `);
    console.log('[1] mall_orders 已就绪');
  } else {
    console.log('[1] [dry] 将建 mall_orders');
  }

  /* ---------- 2. 订单明细表 ---------- */
  if (!DRY) {
    await q(`
      CREATE TABLE IF NOT EXISTS mall_order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        material_id INT DEFAULT NULL COMMENT 'main_materials.id',
        name VARCHAR(255) NOT NULL DEFAULT '' COMMENT '商品名快照',
        spec VARCHAR(255) DEFAULT '' COMMENT '规格快照',
        brand VARCHAR(100) DEFAULT '' COMMENT '品牌快照',
        image VARCHAR(500) DEFAULT '' COMMENT '主图快照',
        unit VARCHAR(50) DEFAULT '' COMMENT '单位',
        unit_price DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '成交单价（下单时快照，不随主材改价变动）',
        qty INT NOT NULL DEFAULT 1,
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT '2024-01-01 00:00:00',
        KEY idx_order (order_id),
        KEY idx_material (material_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商城订单明细'
    `);
    console.log('[2] mall_order_items 已就绪');
  } else {
    console.log('[2] [dry] 将建 mall_order_items');
  }

  /* ---------- 3. 商城索引（主材表按上架状态筛） ---------- */
  if (!DRY) {
    const idx = await q(`SHOW INDEX FROM main_materials WHERE Key_name = 'idx_mall_status'`);
    if (!idx.length) {
      await q(`ALTER TABLE main_materials ADD INDEX idx_mall_status (mall_status)`);
      console.log('[3] 新增索引 idx_mall_status');
    } else {
      console.log('[3] 索引 idx_mall_status 已存在');
    }
  } else {
    console.log('[3] [dry] 将检查 idx_mall_status');
  }

  /* ---------- 4. 现状播报 ---------- */
  if (!DRY) {
    const [cnt] = await q(`SELECT COUNT(*) AS n FROM main_materials WHERE mall_status = 1`);
    const [price] = await q(`SELECT COUNT(*) AS n FROM main_materials WHERE mall_status = 1 AND (mall_price IS NULL OR mall_price = 0)`);
    console.log(`\n已上架商品：${cnt.n} 条`);
    if (price.n) console.log(`  其中 ${price.n} 条没填商城价（商城端会回退到报价 quote_price）`);
    const [o] = await q(`SELECT COUNT(*) AS n FROM mall_orders`);
    console.log(`现有订单：${o.n} 条`);
  }

  await pool.end();
})().catch(e => { console.error('[ERR]', e.message); process.exit(1); });
