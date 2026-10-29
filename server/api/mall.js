/**
 * 商城 / 材料订单（含 mall* 查询构造器）（2026-10-29 渐进拆分第 17 轮）
 *
 * 搬运自 server.js 原 3725-4422 行，搬入时 698 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerMallRoutes(app, deps) {
  const {
    pool,
    db,
    getUserId,
    addLog,
    permCore,
    isAdmin,
    hasReadAllPermission,
    sendAppNotification,
  } = deps;

  const MALL_PRICE_EXPR = 'COALESCE(NULLIF(m.mall_price, 0), m.quote_price)';

  /** 业主端只暴露这些列 —— 成本/毛利/供应商/公式一律不出库 */
  const MALL_PUBLIC_FIELDS = `
    m.id, m.name, m.code, m.model, m.specification, m.color, m.series,
    m.quote_unit, m.cover_image, m.gallery, m.remark,
    m.mall_stock, m.mall_sku_code, m.category_id, m.brand_id,
    c.name AS category_name,
    s.name AS sub_name,
    COALESCE(NULLIF(b.name, ''), m.brand) AS brand_name,
    b.logo AS brand_logo,
    ${MALL_PRICE_EXPR} AS price
  `;

  const MALL_JOINS = `
    FROM main_materials m
    LEFT JOIN material_categories c ON m.category_id = c.id
    LEFT JOIN material_categories s ON m.sub_id = s.id
    LEFT JOIN material_brands b ON m.brand_id = b.id
  `;

  /** 管理端：能看/能改商城（管理员 或 有 material 权限） */
  async function mallCan(req, action) {
    const userId = getUserId(req);
    if (!userId) return false;
    const role = String(req.headers['x-user-role'] || '');
    if (role === 'admin' || role === '超级管理员') return true;
    if (await isAdmin(userId)) return true;
    try {
      return await permCore.canAction(userId, 'material', action || 'read');
    } catch (e) {
      return false;
    }
  }

  /** 订单号：M + yyyyMMdd + 4 位当日流水，业主好抄、财务好核对 */
  async function mallNextOrderNo() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const prefix = 'M' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    const [rows] = await pool.query(
      'SELECT order_no FROM mall_orders WHERE order_no LIKE ? ORDER BY order_no DESC LIMIT 1',
      [prefix + '%']
    );
    let seq = 1;
    if (rows.length) {
      const tail = parseInt(String(rows[0].order_no).slice(prefix.length), 10);
      if (Number.isFinite(tail)) seq = tail + 1;
    }
    return prefix + String(seq).padStart(4, '0');
  }

  /* ---------------- 业主端：商品 ---------------- */

  app.get('/api/mall/products', async (req, res) => {
    try {
      const where = ["m.mall_status = 1"];
      const params = [];

      const kw = String(req.query.keyword || '').trim();
      if (kw) {
        const like = '%' + kw + '%';
        where.push(`(m.name LIKE ? OR m.model LIKE ? OR m.specification LIKE ? OR m.series LIKE ?
          OR b.name LIKE ? OR b.alias LIKE ? OR m.pinyin LIKE ? OR m.pinyin_abbr LIKE ?
          OR b.pinyin LIKE ? OR b.pinyin_abbr LIKE ?)`);
        for (let i = 0; i < 10; i++) params.push(like);
      }
      const cid = parseInt(req.query.category_id, 10);
      if (Number.isFinite(cid)) { where.push('m.category_id = ?'); params.push(cid); }
      const bid = parseInt(req.query.brand_id, 10);
      if (Number.isFinite(bid)) { where.push('m.brand_id = ?'); params.push(bid); }

      const whereSql = ' WHERE ' + where.join(' AND ');
      const [cnt] = await pool.query(`SELECT COUNT(*) AS total ${MALL_JOINS} ${whereSql}`, params);
      const total = Number(cnt[0] && cnt[0].total) || 0;

      const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 20));
      const offset = (pageNum - 1) * pageSize;

      let orderBy = 'm.sort_order ASC, m.id DESC';
      const sort = String(req.query.sort || '');
      if (sort === 'price_asc') orderBy = `${MALL_PRICE_EXPR} ASC, m.id DESC`;
      else if (sort === 'price_desc') orderBy = `${MALL_PRICE_EXPR} DESC, m.id DESC`;
      else if (sort === 'new') orderBy = 'm.id DESC';

      const [list] = await pool.query(
        `SELECT ${MALL_PUBLIC_FIELDS} ${MALL_JOINS} ${whereSql} ORDER BY ${orderBy} LIMIT ${pageSize} OFFSET ${offset}`,
        params
      );
      res.json({ list, total, page: pageNum, limit: pageSize });
    } catch (err) {
      console.error('mall products error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mall/categories', async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT c.id, c.name, COUNT(*) AS count
           FROM main_materials m
           JOIN material_categories c ON m.category_id = c.id
          WHERE m.mall_status = 1
          GROUP BY c.id, c.name
          ORDER BY count DESC`
      );
      res.json(rows);
    } catch (err) {
      console.error('mall categories error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mall/products/:id', async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT ${MALL_PUBLIC_FIELDS} ${MALL_JOINS} WHERE m.id = ? AND m.mall_status = 1`,
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: '商品不存在或已下架' });
      res.json(rows[0]);
    } catch (err) {
      console.error('mall product detail error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /* ---------------- 业主端：收款信息 ---------------- */

  app.get('/api/mall/payinfo', async (req, res) => {
    try {
      const [rows] = await pool.query(
        "SELECT setting_value FROM system_settings WHERE category = 'mall_bank' LIMIT 1"
      );
      let info = {};
      if (rows.length && rows[0].setting_value) {
        try { info = JSON.parse(rows[0].setting_value); } catch (e) { info = {}; }
      }
      res.json({
        bank_name: info.bank_name || '',
        account_name: info.account_name || '',
        account_no: info.account_no || '',
        note: info.note || ''
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ---------------- 业主端：下单 ---------------- */

  app.post('/api/mall/orders', async (req, res) => {
    let conn = null;
    try {
      const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
      if (!items.length) return res.status(400).json({ error: '购物车是空的' });

      // 合并同商品、丢掉非法数量
      const want = new Map();
      for (const it of items) {
        const mid = parseInt(it.material_id, 10);
        const qty = parseInt(it.qty, 10);
        if (!Number.isFinite(mid) || !Number.isFinite(qty) || qty <= 0) continue;
        want.set(mid, (want.get(mid) || 0) + Math.min(qty, 9999));
      }
      if (!want.size) return res.status(400).json({ error: '没有有效的商品' });

      const ids = [...want.keys()];
      const [goods] = await pool.query(
        `SELECT m.id, m.name, m.specification, m.model, m.quote_unit, m.cover_image,
                m.mall_stock, ${MALL_PRICE_EXPR} AS price,
                COALESCE(NULLIF(b.name, ''), m.brand) AS brand_name
           FROM main_materials m
           LEFT JOIN material_brands b ON m.brand_id = b.id
          WHERE m.id IN (${ids.map(() => '?').join(',')}) AND m.mall_status = 1`,
        ids
      );
      if (goods.length !== ids.length) {
        return res.status(400).json({ error: '部分商品已下架，请刷新后重试' });
      }

      // 金额一律服务端算
      let totalAmount = 0;
      let totalQty = 0;
      const lines = goods.map((g) => {
        const qty = want.get(g.id);
        const price = Number(g.price) || 0;
        if (Number(g.mall_stock) > 0 && qty > Number(g.mall_stock)) {
          const e = new Error(`「${g.name}」库存不足，仅剩 ${g.mall_stock}`);
          e.statusCode = 400;
          throw e;
        }
        const subtotal = Math.round(price * qty * 100) / 100;
        totalAmount += subtotal;
        totalQty += qty;
        return {
          material_id: g.id,
          name: g.name,
          spec: g.specification || g.model || '',
          brand: g.brand_name || '',
          image: g.cover_image || '',
          unit: g.quote_unit || '',
          unit_price: price,
          qty,
          subtotal
        };
      });
      totalAmount = Math.round(totalAmount * 100) / 100;

      // 下单人：业主身份优先，员工代下也能记
      const userId = getUserId(req);
      const identity = await permCore.resolveCustomerIdentity(userId, req.headers['x-user-type'], req.headers['x-user-scope']);
      const customerId = identity ? identity.customerId : null;
      const customerName = (identity && identity.name) || String(req.body.customer_name || '').trim();
      const phone = (identity && identity.phone) || String(req.body.phone || '').trim();
      const remark = String(req.body.remark || '').slice(0, 500);

      conn = await pool.getConnection();
      await conn.beginTransaction();

      // 订单号唯一索引兜底，撞号就顺延重试
      let orderNo = null;
      let orderId = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = await mallNextOrderNo();
        try {
          const [r] = await conn.query(
            `INSERT INTO mall_orders
               (order_no, customer_id, customer_name, phone, total_amount, item_count, total_qty,
                status, remark, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,'pending',?,NOW(),NOW())`,
            [candidate, customerId, customerName, phone, totalAmount, lines.length, totalQty, remark]
          );
          orderNo = candidate;
          orderId = r.insertId;
          break;
        } catch (e) {
          if (String(e.code || '').includes('DUP') || String(e.message).includes('Duplicate')) continue;
          throw e;
        }
      }
      if (!orderNo) throw new Error('订单号生成失败，请重试');

      for (const l of lines) {
        await conn.query(
          `INSERT INTO mall_order_items
             (order_id, material_id, name, spec, brand, image, unit, unit_price, qty, subtotal, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
          [orderId, l.material_id, l.name, l.spec, l.brand, l.image, l.unit, l.unit_price, l.qty, l.subtotal]
        );
      }

      await conn.commit();

      res.json({
        id: orderId,
        order_no: orderNo,
        total_amount: totalAmount,
        item_count: lines.length,
        total_qty: totalQty,
        items: lines,
        message: '下单成功'
      });
    } catch (err) {
      if (conn) { try { await conn.rollback(); } catch (e) {} }
      console.error('mall order create error:', err.message);
      res.status(err.statusCode || 500).json({ error: err.message });
    } finally {
      if (conn) { try { conn.release(); } catch (e) {} }
    }
  });

  /* ---------------- 业主端：我的订单 ---------------- */

  app.get('/api/mall/orders', async (req, res) => {
    try {
      const userId = getUserId(req);
      const identity = await permCore.resolveCustomerIdentity(userId, req.headers['x-user-type'], req.headers['x-user-scope']);
      if (!identity) return res.json([]);

      const [orders] = await pool.query(
        `SELECT id, order_no, total_amount, item_count, total_qty, status, remark, paid_at, created_at
           FROM mall_orders
          WHERE customer_id = ?
          ORDER BY id DESC`,
        [identity.customerId]
      );
      if (!orders.length) return res.json([]);

      const ids = orders.map((o) => o.id);
      const [items] = await pool.query(
        `SELECT order_id, name, spec, image, unit, unit_price, qty, subtotal
           FROM mall_order_items WHERE order_id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      const byOrder = new Map();
      for (const it of items) {
        if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
        byOrder.get(it.order_id).push(it);
      }
      res.json(orders.map((o) => Object.assign({}, o, { items: byOrder.get(o.id) || [] })));
    } catch (err) {
      console.error('mall orders error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mall/orders/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      const identity = await permCore.resolveCustomerIdentity(userId, req.headers['x-user-type'], req.headers['x-user-scope']);
      const [rows] = await pool.query('SELECT * FROM mall_orders WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: '订单不存在' });
      const o = rows[0];
      if (identity && o.customer_id && o.customer_id !== identity.customerId) {
        return res.status(403).json({ error: '无权查看该订单' });
      }
      const [items] = await pool.query(
        'SELECT * FROM mall_order_items WHERE order_id = ?', [o.id]
      );
      res.json(Object.assign({}, o, { items }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ---------------- 管理端：商品 ---------------- */

  app.get('/api/mall/admin/products', async (req, res) => {
    try {
      if (!(await mallCan(req, 'read'))) return res.status(403).json({ error: '无权限' });
      const where = [];
      const params = [];
      // on_sale=1 只看已上架；on_sale=0 只看未上架；不传看全部
      const onSale = String(req.query.on_sale == null ? '' : req.query.on_sale);
      if (onSale === '1') where.push('m.mall_status = 1');
      else if (onSale === '0') where.push('(m.mall_status IS NULL OR m.mall_status = 0)');

      const kw = String(req.query.keyword || '').trim();
      if (kw) {
        const like = '%' + kw + '%';
        where.push('(m.name LIKE ? OR m.model LIKE ? OR m.specification LIKE ? OR b.name LIKE ? OR m.pinyin LIKE ? OR m.pinyin_abbr LIKE ?)');
        for (let i = 0; i < 6; i++) params.push(like);
      }
      const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

      const [cnt] = await pool.query(`SELECT COUNT(*) AS total ${MALL_JOINS} ${whereSql}`, params);
      const total = Number(cnt[0] && cnt[0].total) || 0;

      const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 20));
      const offset = (pageNum - 1) * pageSize;

      const [list] = await pool.query(
        `SELECT m.id, m.name, m.model, m.specification, m.quote_unit, m.quote_price,
                m.cover_image, m.mall_status, m.mall_price, m.mall_stock, m.mall_sku_code,
                c.name AS category_name, s.name AS sub_name,
                COALESCE(NULLIF(b.name, ''), m.brand) AS brand_name,
                ${MALL_PRICE_EXPR} AS price
         ${MALL_JOINS} ${whereSql}
         ORDER BY m.mall_status DESC, m.sort_order ASC, m.id DESC
         LIMIT ${pageSize} OFFSET ${offset}`,
        params
      );
      res.json({ list, total, page: pageNum, limit: pageSize });
    } catch (err) {
      console.error('mall admin products error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/mall/admin/products/:id', async (req, res) => {
    try {
      if (!(await mallCan(req, 'write'))) return res.status(403).json({ error: '无权限' });
      const userId = getUserId(req);
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: '参数错误' });

      const b = req.body || {};
      const sets = [];
      const params = [];
      if (b.mall_status !== undefined) {
        sets.push('mall_status = ?');
        params.push(Number(b.mall_status) ? 1 : 0);
      }
      if (b.mall_price !== undefined) {
        const n = Number(b.mall_price);
        sets.push('mall_price = ?');
        params.push(b.mall_price === '' || b.mall_price == null || !Number.isFinite(n) ? null : n);
      }
      if (b.mall_stock !== undefined) {
        const n = parseInt(b.mall_stock, 10);
        sets.push('mall_stock = ?');
        params.push(Number.isFinite(n) ? n : 0);
      }
      if (b.mall_sku_code !== undefined) {
        sets.push('mall_sku_code = ?');
        params.push(String(b.mall_sku_code || ''));
      }
      if (!sets.length) return res.status(400).json({ error: '没有要更新的字段' });

      params.push(id);
      await pool.query(`UPDATE main_materials SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`, params);

      const [row] = await pool.query('SELECT name, mall_status FROM main_materials WHERE id = ?', [id]);
      if (row.length) {
        await addLog(userId, '', '编辑', '商城管理', id, row[0].name,
          `商城: ${row[0].name} → ${Number(row[0].mall_status) ? '上架' : '下架'}`, req.ip);
      }
      res.json({ message: '已更新' });
    } catch (err) {
      console.error('mall admin product update error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /* ---------------- 管理端：订单 ---------------- */

  app.get('/api/mall/admin/orders', async (req, res) => {
    try {
      if (!(await mallCan(req, 'read'))) return res.status(403).json({ error: '无权限' });
      const where = [];
      const params = [];
      const st = String(req.query.status || '').trim();
      if (st) { where.push('status = ?'); params.push(st); }
      const kw = String(req.query.keyword || '').trim();
      if (kw) {
        const like = '%' + kw + '%';
        where.push('(order_no LIKE ? OR customer_name LIKE ? OR phone LIKE ?)');
        params.push(like, like, like);
      }
      const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

      const [cnt] = await pool.query(`SELECT COUNT(*) AS total FROM mall_orders ${whereSql}`, params);
      const total = Number(cnt[0] && cnt[0].total) || 0;

      const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 20));
      const offset = (pageNum - 1) * pageSize;

      const [list] = await pool.query(
        `SELECT * FROM mall_orders ${whereSql} ORDER BY id DESC LIMIT ${pageSize} OFFSET ${offset}`,
        params
      );

      if (list.length) {
        const ids = list.map((o) => o.id);
        const [items] = await pool.query(
          `SELECT * FROM mall_order_items WHERE order_id IN (${ids.map(() => '?').join(',')})`, ids
        );
        const byOrder = new Map();
        for (const it of items) {
          if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
          byOrder.get(it.order_id).push(it);
        }
        list.forEach((o) => { o.items = byOrder.get(o.id) || []; });
      }
      res.json({ list, total, page: pageNum, limit: pageSize });
    } catch (err) {
      console.error('mall admin orders error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/mall/admin/orders/:id', async (req, res) => {
    try {
      if (!(await mallCan(req, 'write'))) return res.status(403).json({ error: '无权限' });
      const userId = getUserId(req);
      const id = parseInt(req.params.id, 10);
      const action = String((req.body && req.body.action) || '').trim();
      const [rows] = await pool.query('SELECT * FROM mall_orders WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: '订单不存在' });
      const o = rows[0];

      if (action === 'confirm') {
        if (o.status === 'paid') return res.json({ message: '已是已收款状态' });
        await pool.query(
          "UPDATE mall_orders SET status = 'paid', paid_at = NOW(), paid_by = ?, updated_at = NOW() WHERE id = ?",
          [userId, id]
        );
        await addLog(userId, '', '编辑', '商城管理', id, o.order_no, `确认收款: ${o.order_no}`, req.ip);
        return res.json({ message: '已确认收款' });
      }
      if (action === 'cancel') {
        await pool.query(
          "UPDATE mall_orders SET status = 'cancelled', updated_at = NOW() WHERE id = ?", [id]
        );
        await addLog(userId, '', '编辑', '商城管理', id, o.order_no, `取消订单: ${o.order_no}`, req.ip);
        return res.json({ message: '已取消' });
      }
      if (action === 'remark') {
        await pool.query(
          'UPDATE mall_orders SET admin_remark = ?, updated_at = NOW() WHERE id = ?',
          [String((req.body && req.body.admin_remark) || '').slice(0, 500), id]
        );
        return res.json({ message: '已保存' });
      }
      return res.status(400).json({ error: '未知操作' });
    } catch (err) {
      console.error('mall admin order update error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /* ---------------- 管理端：收款设置 ---------------- */

  app.get('/api/mall/admin/settings', async (req, res) => {
    try {
      if (!(await mallCan(req, 'read'))) return res.status(403).json({ error: '无权限' });
      const [rows] = await pool.query(
        "SELECT setting_value FROM system_settings WHERE category = 'mall_bank' LIMIT 1"
      );
      let info = {};
      if (rows.length && rows[0].setting_value) {
        try { info = JSON.parse(rows[0].setting_value); } catch (e) { info = {}; }
      }
      res.json({
        bank_name: info.bank_name || '',
        account_name: info.account_name || '',
        account_no: info.account_no || '',
        note: info.note || ''
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/mall/admin/settings', async (req, res) => {
    try {
      if (!(await mallCan(req, 'write'))) return res.status(403).json({ error: '无权限' });
      const b = req.body || {};
      const payload = JSON.stringify({
        bank_name: String(b.bank_name || '').slice(0, 100),
        account_name: String(b.account_name || '').slice(0, 100),
        account_no: String(b.account_no || '').slice(0, 60),
        note: String(b.note || '').slice(0, 300)
      });
      const [rows] = await pool.query(
        "SELECT id FROM system_settings WHERE category = 'mall_bank' LIMIT 1"
      );
      if (rows.length) {
        await pool.query(
          "UPDATE system_settings SET setting_value = ?, updated_at = NOW() WHERE id = ?",
          [payload, rows[0].id]
        );
      } else {
        await pool.query(
          "INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES ('mall_bank', ?, NOW(), NOW())",
          [payload]
        );
      }
      res.json({ message: '已保存' });
    } catch (err) {
      console.error('mall settings save error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /* ---------------- 管理端：概览 ---------------- */

  app.get('/api/mall/admin/stats', async (req, res) => {
    try {
      if (!(await mallCan(req, 'read'))) return res.status(403).json({ error: '无权限' });
      const [onSale] = await pool.query('SELECT COUNT(*) AS n FROM main_materials WHERE mall_status = 1');
      const [noImg] = await pool.query(
        "SELECT COUNT(*) AS n FROM main_materials WHERE mall_status = 1 AND (cover_image IS NULL OR cover_image = '')"
      );
      const [noPrice] = await pool.query(
        'SELECT COUNT(*) AS n FROM main_materials WHERE mall_status = 1 AND (mall_price IS NULL OR mall_price = 0) AND (quote_price IS NULL OR quote_price = 0)'
      );
      const [pending] = await pool.query("SELECT COUNT(*) AS n, COALESCE(SUM(total_amount),0) AS amt FROM mall_orders WHERE status = 'pending'");
      const [paid] = await pool.query("SELECT COUNT(*) AS n, COALESCE(SUM(total_amount),0) AS amt FROM mall_orders WHERE status = 'paid'");
      res.json({
        on_sale: onSale[0].n,
        no_image: noImg[0].n,
        no_price: noPrice[0].n,
        pending_count: pending[0].n,
        pending_amount: Number(pending[0].amt) || 0,
        paid_count: paid[0].n,
        paid_amount: Number(paid[0].amt) || 0
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/material-orders', async (req, res) => {
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
    const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'purchase');
    if (hasAll) {
      const stmt = db.prepare('SELECT * FROM material_orders ORDER BY created_at DESC');
      return res.json(await stmt.all());
    }
    const stmt = db.prepare('SELECT * FROM material_orders WHERE creator_id = ? ORDER BY created_at DESC');
    res.json(await stmt.all(userId));
  });

  app.post('/api/material-orders', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { material_id, quantity, status, order_date, expected_date, supplier, operator, note } = req.body;
    const stmt = db.prepare('INSERT INTO material_orders (material_id, quantity, status, order_date, expected_date, supplier, operator, note, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(material_id, quantity, status || '待采购', order_date, expected_date, supplier, operator, note, userId);
    await addLog(userId, '', '新增', '材料订单', result.lastInsertRowid, material_id, `材料订单 ID: ${material_id}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  // 采购申请（移动端专用）
  app.post('/api/material/purchase', async (req, res) => {
    const userId = getUserId(req);
    const { project_id, material_name, spec, quantity, unit, supplier, amount, remark } = req.body;
    if (!project_id) return res.status(400).json({ code: 1, msg: '请选择项目' });
    if (!material_name) return res.status(400).json({ code: 1, msg: '请填写材料名称' });
    if (!quantity) return res.status(400).json({ code: 1, msg: '请填写数量' });
    const stmt = db.prepare(
      'INSERT INTO material_orders (project_id, applicant_id, material_name, spec, quantity, unit, supplier, amount, note, status, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    // 2026-10-10：申请单状态统一改为 'pending'（待审核），审核通过后改 'approved'（进行中）
    const result = await stmt.run(project_id, userId, material_name, spec || '', quantity, unit || '', supplier || '', amount || 0, remark || '', 'pending', userId);
    const newPurchaseId = result.lastInsertRowid;
    await addLog(userId, '', '新增', '采购申请', newPurchaseId, 0, `采购申请：${material_name}`, req.ip);

    // 发送应用内通知：查项目相关人（设计师/监理/经理）+ 管理员（改用 MySQL）
    try {
      const [proj] = await pool.query(`
        SELECT p.*,
          des.phone as designer_phone, des.name as designer_name, des.id as designer_id,
          sup.phone as supervisor_phone, sup.name as supervisor_name, sup.id as supervisor_id,
          mgr.phone as manager_phone, mgr.name as manager_name, mgr.id as manager_id,
          creator.phone as creator_phone, creator.name as creator_name
        FROM projects p
        LEFT JOIN employees des ON p.designer_id = des.id
        LEFT JOIN employees sup ON p.supervisor_id = sup.id
        LEFT JOIN employees mgr ON p.manager_id = mgr.id
        LEFT JOIN employees creator ON creator.id = ?
        WHERE p.id = ?
      `, [userId, project_id]);

      const targets = [];
      if (proj) {
        if (proj.designer_phone) targets.push({ phone: proj.designer_phone, name: proj.designer_name, user_id: proj.designer_id });
        if (proj.supervisor_phone) targets.push({ phone: proj.supervisor_phone, name: proj.supervisor_name, user_id: proj.supervisor_id });
        if (proj.manager_phone) targets.push({ phone: proj.manager_phone, name: proj.manager_name, user_id: proj.manager_id });
        if (proj.creator_phone) targets.push({ phone: proj.creator_phone, name: proj.creator_name, user_id: userId });
        // 管理员
        const [admins] = await pool.query('SELECT phone, name, id FROM employees WHERE id = 1');
        if (admins[0] && admins[0].phone) targets.push({ phone: admins[0].phone, name: admins[0].name || '管理员', user_id: admins[0].id });
      }

      const creatorName = proj[0]?.creator_name || '未知';
      const content = `【${material_name}】采购申请，数量：${quantity}${unit || ''}，金额：¥${amount || 0}，申请人：${creatorName}`;
      sendAppNotification('purchase', '新采购申请', content, newPurchaseId, 'purchase', targets).catch(console.error);
    } catch (err) {
      console.error('purchase notification error:', err);
    }

    res.json({ code: 0, msg: '提交成功', id: newPurchaseId });
  });

  app.put('/api/material-orders/:id', async (req, res) => {
    const userId = getUserId(req);
    const { project_id, material_id, material_name, spec, quantity, unit, supplier, amount, status, order_date, expected_date, operator, note } = req.body;
    // 权限检查
    const [existing] = await db.prepare('SELECT creator_id FROM material_orders WHERE id = ?').all(req.params.id);
    if (!existing) return res.status(404).json({ error: '订单不存在' });
    if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });

    // 查旧状态，用于判断是否变为"已到货"
    const [oldOrder] = await db.prepare('SELECT status, project_id, material_name FROM material_orders WHERE id = ?').all(req.params.id);
    const oldStatus = oldOrder?.status;

    const stmt = db.prepare('UPDATE material_orders SET project_id=?, material_id=?, material_name=?, spec=?, quantity=?, unit=?, supplier=?, amount=?, status=?, order_date=?, expected_date=?, operator=?, note=? WHERE id=?');
    await stmt.run(project_id || null, material_id || null, material_name || '', spec || '', quantity || '', unit || '', supplier || '', amount || 0, status, order_date || '', expected_date || '', operator || '', note || '', req.params.id);
    await addLog(userId, '', '编辑', '材料订单', req.params.id, material_name || material_id || '', `更新材料订单：${material_name || material_id}`, req.ip);

    // 状态变为"已到货"时，通知创建人
    if (oldStatus !== '已到货' && status === '已到货') {
      try {
        const [order] = await db.prepare('SELECT creator_id, project_id, material_name FROM material_orders WHERE id = ?').all(req.params.id);
        if (order) {
          const [creator] = await db.prepare('SELECT phone, name, id FROM employees WHERE id = ?').all(order.creator_id);
          if (creator && creator.phone) {
            const content = `【${order.material_name}】采购材料已到货，请注意验收`;
            sendAppNotification('purchase_status', '采购材料已到货', content, parseInt(req.params.id), 'purchase', [{ phone: creator.phone, name: creator.name, user_id: creator.id }]).catch(console.error);
          }
        }
      } catch (err) {
        console.error('purchase_status notification error:', err);
      }
    }

    res.json({ message: '更新成功' });
  });

};
