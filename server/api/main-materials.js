/**
 * 主材库 / 材料分类 / 品牌（含 mm* 查询与写入构造器）（2026-10-29 渐进拆分第 17 轮）
 *
 * 搬运自 server.js 原 2728-3724 行，搬入时 997 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerMainMaterialRoutes(app, deps) {
  const {
    pool,
    db,
    fs,
    path,
    os,
    spawnSync,
    upload,
    getUserId,
    isAdmin,
    addLog,
    hasReadAllPermission,
    buildPinyin,
    mmParseIds,
    fixMojibake,
  } = deps;

  const MM_COST_FIELDS = [
    'original_price', 'cost_price', 'cost_price2', 'contract_price',
    'internal_control_price', 'upgrade_profit_rate', 'loss_rate',
    'loss_amount', 'exchange_rate'
  ];

  function mmStripCost(rows, canSeeCost) {
    if (canSeeCost) return rows;
    return rows.map(r => {
      const o = Object.assign({}, r);
      for (const f of MM_COST_FIELDS) o[f] = null;
      return o;
    });
  }

  // mmParseIds（多选 id 解析）已抽到 ./lib/parse.js

  const MM_BASE_JOINS = `
    FROM main_materials m
    LEFT JOIN material_categories t ON m.type_id = t.id
    LEFT JOIN material_categories c ON m.category_id = c.id
    LEFT JOIN material_categories s ON m.sub_id = s.id
    LEFT JOIN material_brands b ON m.brand_id = b.id
  `;

  const MM_SELECT_FIELDS = `
    m.*,
    t.name AS type_name,
    c.name AS category_name,
    s.name AS sub_name,
    b.name AS brand_name,
    b.logo AS brand_logo,
    COALESCE(NULLIF(b.name, ''), m.brand) AS brand_display
  `;

  /**
   * 构造主材查询的 WHERE。
   * @param {object} q      req.query
   * @param {object} skip   要跳过的维度（facet 计数用），如 { brand: true }
   */
  function mmBuildWhere(q, skip) {
    skip = skip || {};
    const where = [];
    const params = [];

    if (!skip.type) {
      const tid = parseInt(q.type_id, 10);
      if (Number.isFinite(tid)) { where.push('m.type_id = ?'); params.push(tid); }
    }
    if (!skip.category) {
      const cid = parseInt(q.category_id, 10);
      if (Number.isFinite(cid)) { where.push('m.category_id = ?'); params.push(cid); }
    }
    // 兼容旧参数：category 传的是中文类别名（老前端与移动端在用）
    if (q.category && !q.category_id) {
      where.push('(c.name = ? OR m.category = ?)');
      params.push(q.category, q.category);
    }
    if (!skip.sub) {
      const sid = parseInt(q.sub_id, 10);
      if (Number.isFinite(sid)) { where.push('m.sub_id = ?'); params.push(sid); }
    }
    if (!skip.brand) {
      const bids = mmParseIds(q.brand_ids || q.brand_id);
      if (bids.length) {
        where.push('m.brand_id IN (' + bids.map(() => '?').join(',') + ')');
        params.push(...bids);
      }
    }
    if (!skip.series && q.series) {
      where.push('m.series = ?');
      params.push(q.series);
    }
    if (q.mall_status !== undefined && q.mall_status !== '') {
      const ms = parseInt(q.mall_status, 10);
      if (Number.isFinite(ms)) { where.push('m.mall_status = ?'); params.push(ms); }
    }
    if (q.has_image === '1') {
      where.push("(m.cover_image IS NOT NULL AND m.cover_image <> '')");
    } else if (q.has_image === '0') {
      where.push("(m.cover_image IS NULL OR m.cover_image = '')");
    }

    // 关键词：名称 / 编号 / 型号 / 规格 / 系列 / 品牌名 / 品牌别名 / 商品拼音 / 品牌拼音
    const kw = String(q.keyword || '').trim();
    if (kw) {
      const like = '%' + kw + '%';
      const kwWhere = [
        'm.name LIKE ?', 'm.code LIKE ?', 'm.model LIKE ?', 'm.specification LIKE ?',
        'm.series LIKE ?', 'b.name LIKE ?', 'b.alias LIKE ?',
        'm.pinyin LIKE ?', 'm.pinyin_abbr LIKE ?',
        'b.pinyin LIKE ?', 'b.pinyin_abbr LIKE ?',
      ];
      for (let i = 0; i < 11; i++) params.push(like);

      // 松散首字母：用户常跳字打（马可波罗 → mkl，而库里存的是 mkbl）。
      // 仅对 2~6 位纯字母生效，避免中文/数字关键词被塞进一堆 % 反而拖慢查询。
      if (/^[a-z]{2,6}$/i.test(kw)) {
        const loose = kw.toLowerCase().split('').join('%') + '%';
        kwWhere.push('m.pinyin_abbr LIKE ?', 'b.pinyin_abbr LIKE ?');
        params.push(loose, loose);
      }

      where.push('(' + kwWhere.join(' OR ') + ')');
    }

    // 快捷筛选
    if (!skip.quick) {
      const quick = String(q.quick || '');
      if (quick === 'noimg') {
        where.push("(m.cover_image IS NULL OR m.cover_image = '')");
      } else if (quick === 'nocat') {
        where.push('m.category_id IS NULL');
      } else if (quick === 'mall') {
        where.push('m.mall_status = 1');
      } else if (quick === 'lowprofit') {
        where.push('m.quote_price > 0 AND (m.quote_price - m.cost_price2) / m.quote_price < 0.25');
      } else if (quick === 'nobrand') {
        where.push('m.brand_id IS NULL');
      }
    }

    return {
      sql: where.length ? ' WHERE ' + where.join(' AND ') : '',
      params
    };
  }

  function mmOrderBy(sort) {
    switch (String(sort || '')) {
      case 'quote_desc': return ' ORDER BY m.quote_price DESC, m.id DESC';
      case 'quote_asc': return ' ORDER BY m.quote_price ASC, m.id ASC';
      case 'profit_asc': return ' ORDER BY (CASE WHEN m.quote_price > 0 THEN (m.quote_price - m.cost_price2) / m.quote_price ELSE 0 END) ASC, m.id DESC';
      case 'profit_desc': return ' ORDER BY (CASE WHEN m.quote_price > 0 THEN (m.quote_price - m.cost_price2) / m.quote_price ELSE 0 END) DESC, m.id DESC';
      case 'id_asc': return ' ORDER BY m.id ASC';
      case 'newest': return ' ORDER BY m.id DESC';
      default: return ' ORDER BY m.sort_order ASC, m.id DESC';
    }
  }

  /* ---------------- 品类字典 ---------------- */

  app.get('/api/material-categories/tree', async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, code, name, parent_id, level, sort_order
           FROM material_categories
          WHERE status = 1
          ORDER BY level ASC, sort_order ASC, id ASC`
      );
      // 每个节点的商品数（按 category_id 聚合，子类商品也计入所属品类）
      const [cntCat] = await pool.query(
        `SELECT category_id AS id, COUNT(*) AS cnt FROM main_materials WHERE category_id IS NOT NULL GROUP BY category_id`
      );
      const [cntSub] = await pool.query(
        `SELECT sub_id AS id, COUNT(*) AS cnt FROM main_materials WHERE sub_id IS NOT NULL GROUP BY sub_id`
      );
      const [cntType] = await pool.query(
        `SELECT type_id AS id, COUNT(*) AS cnt FROM main_materials WHERE type_id IS NOT NULL GROUP BY type_id`
      );
      const catMap = new Map(cntCat.map(r => [r.id, Number(r.cnt)]));
      const subMap = new Map(cntSub.map(r => [r.id, Number(r.cnt)]));
      const typeMap = new Map(cntType.map(r => [r.id, Number(r.cnt)]));

      const byId = new Map();
      const tree = [];
      for (const r of rows) {
        const node = {
          id: r.id, code: r.code, name: r.name, parent_id: r.parent_id,
          level: r.level, sort_order: r.sort_order,
          count: r.level === 1 ? (typeMap.get(r.id) || 0)
               : r.level === 2 ? (catMap.get(r.id) || 0)
               : (subMap.get(r.id) || 0),
          children: []
        };
        byId.set(r.id, node);
        if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id).children.push(node);
        else tree.push(node);
      }
      res.json(tree);
    } catch (err) {
      console.error('material-categories/tree error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/material-categories', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '仅管理员可维护品类' });
      const { code, name, parent_id, sort_order } = req.body || {};
      if (!code || !name) return res.status(400).json({ error: 'code 与 name 必填' });
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(String(code))) {
        return res.status(400).json({ error: 'code 只能是小写字母、数字、点、横线，且不可改' });
      }
      let level = 1;
      if (parent_id) {
        const [p] = await pool.query('SELECT level FROM material_categories WHERE id = ?', [parent_id]);
        if (!p.length) return res.status(400).json({ error: '上级品类不存在' });
        level = p[0].level + 1;
        if (level > 3) return res.status(400).json({ error: '最多三级' });
      }
      const [r] = await pool.query(
        `INSERT INTO material_categories (code, name, parent_id, level, sort_order, created_at, updated_at)
         VALUES (?,?,?,?,?,NOW(),NOW())`,
        [code, name, parent_id || null, level, Number(sort_order) || 0]
      );
      await addLog(userId, '', '新增', '主材管理', r.insertId, name, `新增品类: ${name}`, req.ip);
      res.json({ id: r.insertId, message: '新增成功' });
    } catch (err) {
      if (String(err.message).includes('Duplicate')) return res.status(400).json({ error: 'code 已存在' });
      console.error('material-categories POST error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/material-categories/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '仅管理员可维护品类' });
      const { name, sort_order, status } = req.body || {};
      // code 不允许改（商城/报价靠它对接）
      const sets = [];
      const params = [];
      if (name !== undefined) { sets.push('name = ?'); params.push(name); }
      if (sort_order !== undefined) { sets.push('sort_order = ?'); params.push(Number(sort_order) || 0); }
      if (status !== undefined) { sets.push('status = ?'); params.push(Number(status) ? 1 : 0); }
      if (!sets.length) return res.status(400).json({ error: '没有要更新的字段' });
      sets.push('updated_at = NOW()');
      params.push(req.params.id);
      await pool.query(`UPDATE material_categories SET ${sets.join(', ')} WHERE id = ?`, params);
      res.json({ message: '更新成功' });
    } catch (err) {
      console.error('material-categories PUT error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /* ---------------- 兼容：旧的类别名列表接口 ---------------- */
  // 老前端 onMounted 里调 /api/main-materials/categories 取下拉选项，
  // 语义从"category 字符串"改为"二级品类名"，字段名不变，避免前端 404。
  app.get('/api/main-materials/categories', async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT name FROM material_categories WHERE level = 2 AND status = 1 ORDER BY sort_order ASC, id ASC`
      );
      res.json(rows.map(r => r.name));
    } catch (err) {
      console.error('main-materials/categories error:', err.message);
      res.json([]);
    }
  });

  /* ---------------- 品牌字典 ---------------- */

  app.get('/api/material-brands', async (req, res) => {
    try {
      const kw = String(req.query.keyword || '').trim();
      const withCount = req.query.with_count === '1';
      const where = ['b.status = 1'];
      const params = [];
      if (kw) {
        where.push('(b.name LIKE ? OR b.alias LIKE ?)');
        params.push('%' + kw + '%', '%' + kw + '%');
      }
      let sql = `SELECT b.id, b.name, b.alias, b.logo, b.sort_order FROM material_brands b
                  WHERE ${where.join(' AND ')} ORDER BY b.sort_order ASC, b.id ASC`;
      const [rows] = await pool.query(sql, params);
      if (withCount && rows.length) {
        const [cnt] = await pool.query(
          `SELECT brand_id, COUNT(*) cnt FROM main_materials WHERE brand_id IS NOT NULL GROUP BY brand_id`
        );
        const m = new Map(cnt.map(r => [r.brand_id, Number(r.cnt)]));
        rows.forEach(r => { r.count = m.get(r.id) || 0; });
        // 该品牌主营的品类（品牌墙卡片上展示），取商品数最多的 3 个
        const [catRows] = await pool.query(
          `SELECT m.brand_id, c.name AS cat_name, COUNT(*) AS cnt
             FROM main_materials m JOIN material_categories c ON m.category_id = c.id
            WHERE m.brand_id IS NOT NULL
            GROUP BY m.brand_id, c.name
            ORDER BY m.brand_id, cnt DESC`
        );
        const catMap = new Map();
        for (const r of catRows) {
          if (!catMap.has(r.brand_id)) catMap.set(r.brand_id, []);
          const arr = catMap.get(r.brand_id);
          if (arr.length < 3) arr.push(r.cat_name);
        }
        rows.forEach(r => { r.cat_names = (catMap.get(r.id) || []).join(' · '); });
        rows.sort((a, b) => (b.count - a.count) || (a.sort_order - b.sort_order));
      }
      res.json(rows);
    } catch (err) {
      console.error('material-brands error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/material-brands', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '仅管理员可维护品牌' });
      const { name, alias, logo, sort_order } = req.body || {};
      if (!name) return res.status(400).json({ error: '品牌名必填' });
      const bpy = buildPinyin(name);
      const [r] = await pool.query(
        `INSERT INTO material_brands (name, alias, logo, sort_order, pinyin, pinyin_abbr, created_at, updated_at)
         VALUES (?,?,?,?,?,?,NOW(),NOW())`,
        [name, alias || name, logo || '', Number(sort_order) || 0, bpy.pinyin || '', bpy.pinyin_abbr || '']
      );
      await addLog(userId, '', '新增', '主材管理', r.insertId, name, `新增品牌: ${name}`, req.ip);
      res.json({ id: r.insertId, message: '新增成功' });
    } catch (err) {
      if (String(err.message).includes('Duplicate')) return res.status(400).json({ error: '品牌已存在' });
      console.error('material-brands POST error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/material-brands/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '仅管理员可维护品牌' });
      const { name, alias, logo, sort_order, status } = req.body || {};
      const sets = [];
      const params = [];
      if (name !== undefined) {
        sets.push('name = ?'); params.push(name);
        // 改名必须同步重算拼音，否则新名字搜不到（旧拼音还留着）
        const bpy = buildPinyin(name);
        sets.push('pinyin = ?'); params.push(bpy.pinyin || '');
        sets.push('pinyin_abbr = ?'); params.push(bpy.pinyin_abbr || '');
      }
      if (alias !== undefined) { sets.push('alias = ?'); params.push(alias); }
      if (logo !== undefined) { sets.push('logo = ?'); params.push(logo); }
      if (sort_order !== undefined) { sets.push('sort_order = ?'); params.push(Number(sort_order) || 0); }
      if (status !== undefined) { sets.push('status = ?'); params.push(Number(status) ? 1 : 0); }
      if (!sets.length) return res.status(400).json({ error: '没有要更新的字段' });
      sets.push('updated_at = NOW()');
      params.push(req.params.id);
      await pool.query(`UPDATE material_brands SET ${sets.join(', ')} WHERE id = ?`, params);
      // 品牌改名时同步回填冗余列，避免老代码读到旧名
      if (name !== undefined) {
        await pool.query('UPDATE main_materials SET brand = ? WHERE brand_id = ?', [name, req.params.id]);
      }
      res.json({ message: '更新成功' });
    } catch (err) {
      console.error('material-brands PUT error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /* ---------------- 主材列表（重写） ---------------- */

  app.get('/api/main-materials', async (req, res) => {
    try {
      const userId = getUserId(req);
      const userRole = req.headers['x-user-role'] || '';
      const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
      const canSeeCost = userIsAdmin || await hasReadAllPermission(userId, 'purchase');

      const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const offset = (pageNum - 1) * pageSize;

      // 项目维度：查该项目已用量（兼容移动端材料台账）
      // ⚠ 原实现 SELECT m.quantity，但 main_materials 没有 quantity 列 → 必然 500。
      //   这里改为从 material_out 汇总，库存列按 0 兜底，并给移动端补齐 unit / spec 别名。
      if (req.query.project_id) {
        const pid = parseInt(req.query.project_id, 10);
        const { sql: w, params: p } = mmBuildWhere(req.query, null);
        const sql = `
          SELECT ${MM_SELECT_FIELDS},
                 COALESCE(mo.used_qty, 0) AS used,
                 0 AS quantity,
                 COALESCE(NULLIF(m.purchase_unit, ''), m.quote_unit) AS unit,
                 m.specification AS spec
            FROM main_materials m
            LEFT JOIN material_categories t ON m.type_id = t.id
            LEFT JOIN material_categories c ON m.category_id = c.id
            LEFT JOIN material_categories s ON m.sub_id = s.id
            LEFT JOIN material_brands b ON m.brand_id = b.id
            LEFT JOIN (
              SELECT material_id, SUM(quantity) AS used_qty
                FROM material_out WHERE project_id = ? GROUP BY material_id
            ) mo ON m.id = mo.material_id
            ${w}
            ${mmOrderBy(req.query.sort)}
        `;
        const [list] = await pool.query(sql, [pid, ...p]);
        return res.json({ list: mmStripCost(list, canSeeCost), total: list.length, page: 1, limit: list.length });
      }

      const { sql: whereSql, params } = mmBuildWhere(req.query, null);

      const [cntRows] = await pool.query(
        `SELECT COUNT(*) AS total ${MM_BASE_JOINS} ${whereSql}`, params
      );
      const total = Number(cntRows[0] && cntRows[0].total) || 0;

      // LIMIT/OFFSET 已用 parseInt 校验，直接内联（mysql2 预处理对 LIMIT 占位符支持不佳）
      const [list] = await pool.query(
        `SELECT ${MM_SELECT_FIELDS} ${MM_BASE_JOINS} ${whereSql} ${mmOrderBy(req.query.sort)}
         LIMIT ${pageSize} OFFSET ${offset}`,
        params
      );

      res.json({
        list: mmStripCost(list, canSeeCost),
        total,
        page: pageNum,
        limit: pageSize,
        can_see_cost: !!canSeeCost
      });
    } catch (err) {
      console.error('main-materials GET error:', err.message, err.stack);
      res.status(500).json({ error: err.message });
    }
  });

  /* ---------------- facets：各维度动态计数 ---------------- */

  app.get('/api/main-materials/facets', async (req, res) => {
    try {
      const userId = getUserId(req);
      const userRole = req.headers['x-user-role'] || '';
      const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
      const canSeeCost = userIsAdmin || await hasReadAllPermission(userId, 'purchase');

      async function countBy(skip, groupExpr, joinExtra) {
        const { sql, params } = mmBuildWhere(req.query, skip);
        const [rows] = await pool.query(
          `SELECT ${groupExpr} AS k, COUNT(*) AS c ${MM_BASE_JOINS} ${joinExtra || ''} ${sql} GROUP BY ${groupExpr}`,
          params
        );
        return rows.map(r => ({ id: r.k, count: Number(r.c) }));
      }

      const [types, cats, subs, brands] = await Promise.all([
        countBy({ type: true }, 'm.type_id'),
        countBy({ category: true, sub: true }, 'm.category_id'),
        countBy({ sub: true }, 'm.sub_id'),
        countBy({ brand: true }, 'm.brand_id'),
      ]);

      // 快捷筛选的计数：各自跳过 quick 条件
      const [totalRow] = await pool.query(
        `SELECT COUNT(*) AS c ${MM_BASE_JOINS} ${mmBuildWhere(req.query, { quick: true }).sql}`,
        mmBuildWhere(req.query, { quick: true }).params
      );
      const quickCounts = { all: Number(totalRow[0].c) || 0 };
      for (const key of ['noimg', 'nocat', 'mall', 'lowprofit', 'nobrand']) {
        const q2 = Object.assign({}, req.query, { quick: key });
        const { sql, params } = mmBuildWhere(q2, null);
        const [r] = await pool.query(`SELECT COUNT(*) AS c ${MM_BASE_JOINS} ${sql}`, params);
        quickCounts[key] = Number(r[0].c) || 0;
      }

      // 系列下拉候选
      const { sql: sSql, params: sParams } = mmBuildWhere(req.query, { series: true });
      const [seriesRows] = await pool.query(
        `SELECT m.series AS k, COUNT(*) AS c ${MM_BASE_JOINS}
          ${sSql ? sSql + ' AND ' : ' WHERE '} m.series IS NOT NULL AND m.series <> ''
          GROUP BY m.series ORDER BY c DESC LIMIT 100`,
        sParams
      );

      res.json({
        total: quickCounts.all,
        can_see_cost: !!canSeeCost,
        types,
        categories: cats,
        subs,
        brands,
        quick: quickCounts,
        series: seriesRows.map(r => ({ name: r.k, count: Number(r.c) }))
      });
    } catch (err) {
      console.error('main-materials/facets error:', err.message, err.stack);
      res.status(500).json({ error: err.message });
    }
  });

  /* ---------------- 新增 / 编辑 ---------------- */

  /**
   * 品类 / 品牌字典缓存。
   * 批量导入 1000+ 行时逐行查库会慢到不可用，这里一次性加载到内存；
   * 字典有变更时传 force = true 刷新。
   */
  let _mmDictCache = null;
  async function mmDicts(force) {
    if (_mmDictCache && !force) return _mmDictCache;
    const [cats] = await pool.query(
      'SELECT id, code, name, level, parent_id FROM material_categories ORDER BY level, sort_order, id'
    );
    const [brands] = await pool.query('SELECT id, name, alias FROM material_brands');
    const catByName = new Map();
    const catById = new Map();
    cats.forEach(c => {
      if (!catByName.has(c.name)) catByName.set(c.name, c);
      catById.set(c.id, c);
    });
    const brandByName = new Map();
    brands.forEach(b => {
      if (!brandByName.has(b.name)) brandByName.set(b.name, b.id);
      String(b.alias || '').split(',').forEach(a => {
        const t = a.trim();
        if (t && !brandByName.has(t)) brandByName.set(t, b.id);
      });
    });
    _mmDictCache = { cats, brands, catByName, catById, brandByName };
    return _mmDictCache;
  }

  /**
   * 把前端传来的品类 / 品牌解析成 id，并回填冗余列（brand 旧字段、category 旧字段、pinyin）。
   * 前端可以直接传 brand_id，也可以只传 brand（品牌名或别名）。
   */
  async function mmResolveRefs(data) {
    const out = {};
    const dict = await mmDicts();

    // —— 品牌 ——
    let brandId = parseInt(data.brand_id, 10);
    let brandName = String(data.brand || '').trim();
    if (Number.isFinite(brandId)) {
      const [hit] = await pool.query('SELECT name FROM material_brands WHERE id = ?', [brandId]);
      if (hit.length) brandName = hit[0].name;
    } else if (brandName) {
      const id = dict.brandByName.get(brandName);
      if (id) {
        brandId = id;
        const b = dict.brands.find(x => x.id === id);
        if (b) brandName = b.name;
      }
    }
    out.brand_id = Number.isFinite(brandId) ? brandId : null;
    out.brand = brandName;

    // —— 品类：优先 sub_id，其次 category_id ——
    let typeId = parseInt(data.type_id, 10);
    let catId = parseInt(data.category_id, 10);
    let subId = parseInt(data.sub_id, 10);

    // 传的是中文名时按名字反查
    if (!Number.isFinite(subId) && data.sub_name) {
      const c = dict.catByName.get(String(data.sub_name).trim());
      if (c) subId = c.id;
    }
    if (!Number.isFinite(catId) && data.category_name) {
      const c = dict.catByName.get(String(data.category_name).trim());
      if (c) catId = c.id;
    }
    if (!Number.isFinite(typeId) && data.type_name) {
      const c = dict.catByName.get(String(data.type_name).trim());
      if (c) typeId = c.id;
    }

    // 兼容老前端 / 移动端：把中文品类名直接塞在 category 字段里传过来。
    // 命中字典就转成 id（按 level 决定挂在哪一级）；没命中就当作旧自由文本照原样落库，不报错。
    if (!Number.isFinite(catId) && !Number.isFinite(subId) && !Number.isFinite(typeId) && data.category) {
      const c = dict.catByName.get(String(data.category).trim());
      if (c) {
        if (c.level === 3) subId = c.id;
        else if (c.level === 2) catId = c.id;
        else typeId = c.id;
      }
    }

    out.type_id = Number.isFinite(typeId) ? typeId : null;
    out.category_id = Number.isFinite(catId) ? catId : null;
    out.sub_id = Number.isFinite(subId) ? subId : null;

    // 只给了子类时反推品类与类型
    if (out.sub_id) {
      const s = dict.catById.get(out.sub_id);
      if (s) {
        if (!out.category_id && s.parent_id) out.category_id = s.parent_id;
        if (!out.type_id && out.category_id) {
          const c = dict.catById.get(out.category_id);
          if (c && c.parent_id) out.type_id = c.parent_id;
        }
      }
    } else if (out.category_id) {
      const c = dict.catById.get(out.category_id);
      if (c) {
        if (!out.type_id && c.parent_id) out.type_id = c.parent_id;
        if (!out.sub_id && c.level === 3 && c.parent_id) out.category_id = c.parent_id;
      }
    }

    // 拼音
    const py = buildPinyin(data.name || '');
    out.pinyin = py.pinyin;
    out.pinyin_abbr = py.pinyin_abbr;

    // 回填旧字段 category（导出、移动端、老前端仍在读它）
    if (out.category_id) {
      const c = dict.catById.get(out.category_id);
      if (c) out.category = c.name;
    }

    return out;
  }

  /** 新增一条主材（POST 与 Excel 导入共用） */
  async function mmInsertOne(data, userId) {
    const refs = await mmResolveRefs(data);
    const merged = Object.assign({}, data, refs);

    // 供应商：v2.3.1 起统一在 external_contacts，旧的 suppliers 表已不存在
    let supplierName = String(merged.supplier_name || '').trim();
    const supplierId = parseInt(merged.supplier_id, 10);
    if (Number.isFinite(supplierId) && !supplierName) {
      const [sup] = await pool.query('SELECT name FROM external_contacts WHERE id = ?', [supplierId]);
      if (sup.length) supplierName = sup[0].name;
    }
    merged.supplier_name = supplierName;
    merged.supplier_id = Number.isFinite(supplierId) ? supplierId : null;

    const cols = MM_WRITE_COLS;
    const placeholders = cols.map(() => '?').join(',');
    const values = cols.map(c => mmNormalizeValue(c, merged[c]));
    const [result] = await pool.query(
      `INSERT INTO main_materials (${cols.join(', ')}, creator_id, created_at, updated_at)
       VALUES (${placeholders}, ?, NOW(), NOW())`,
      [...values, userId]
    );
    return result.insertId;
  }

  const MM_WRITE_COLS = [
    'code', 'name', 'original_price', 'cost_price', 'cost_price2', 'quote_price', 'contract_price',
    'quote_unit', 'exchange_rate', 'purchase_unit', 'loss_rate', 'loss_amount', 'warranty_period', 'stock_period',
    'specification', 'model', 'color', 'spec_alternative', 'model_alternative', 'color_alternative', 'brand',
    'sort_order', 'remark', 'acceptance_remark', 'contract_remark', 'other_remark', 'position', 'package_name',
    'upgrade_profit_rate', 'internal_control_price', 'combo', 'limit_formula', 'quote_formula', 'category',
    'is_visible', 'is_fixed', 'cover_image', 'gallery',
    'type_id', 'category_id', 'sub_id', 'brand_id', 'series',
    'mall_status', 'mall_price', 'mall_stock', 'mall_sku_code', 'pinyin', 'pinyin_abbr',
    'supplier_id', 'supplier_name'
  ];

  const MM_NUM_COLS = new Set([
    'original_price', 'cost_price', 'cost_price2', 'quote_price', 'contract_price',
    'loss_rate', 'loss_amount', 'sort_order', 'upgrade_profit_rate', 'internal_control_price',
    'is_visible', 'is_fixed', 'mall_status', 'mall_stock', 'mall_price'
  ]);
  const MM_INT_COLS = new Set(['type_id', 'category_id', 'sub_id', 'brand_id', 'supplier_id']);

  function mmNormalizeValue(col, raw) {
    if (MM_INT_COLS.has(col)) {
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : null;
    }
    if (col === 'exchange_rate') {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : 1;
    }
    if (col === 'mall_price') {
      if (raw === '' || raw == null) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    if (MM_NUM_COLS.has(col)) {
      if (raw === '' || raw == null) return 0;
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    if (col === 'quote_unit') return raw || '片';
    return raw == null ? '' : String(raw);
  }

  app.post('/api/main-materials', async (req, res) => {
    try {
      const userId = getUserId(req);
      const data = req.body || {};
      if (!data.name) return res.status(400).json({ error: '主材名称必填' });

      const newId = await mmInsertOne(data, userId);
      await addLog(userId, '', '新增', '主材管理', newId, data.name, `主材: ${data.name}`, req.ip);
      res.json({ id: newId, message: '添加成功' });
    } catch (err) {
      console.error('main-materials POST error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/main-materials/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      const [existing] = await pool.query('SELECT creator_id FROM main_materials WHERE id = ?', [req.params.id]);
      if (!existing.length) return res.status(404).json({ error: '主材不存在' });
      if (existing[0].creator_id !== userId && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无权修改他人的数据' });
      }
      const data = req.body || {};
      if (!data.name) return res.status(400).json({ error: '主材名称必填' });

      const refs = await mmResolveRefs(data);
      const merged = Object.assign({}, data, refs);

      let supplierName = String(merged.supplier_name || '').trim();
      const supplierId = parseInt(merged.supplier_id, 10);
      if (Number.isFinite(supplierId) && !supplierName) {
        const [sup] = await pool.query('SELECT name FROM external_contacts WHERE id = ?', [supplierId]);
        if (sup.length) supplierName = sup[0].name;
      }
      merged.supplier_name = supplierName;
      merged.supplier_id = Number.isFinite(supplierId) ? supplierId : null;

      const cols = MM_WRITE_COLS;
      const sets = cols.map(c => `${c} = ?`).join(', ');
      const values = cols.map(c => mmNormalizeValue(c, merged[c]));

      await pool.query(
        `UPDATE main_materials SET ${sets}, updated_at = NOW() WHERE id = ?`,
        [...values, req.params.id]
      );
      await addLog(userId, '', '编辑', '主材管理', req.params.id, merged.name, `更新主材: ${merged.name}`, req.ip);
      res.json({ message: '更新成功' });
    } catch (err) {
      console.error('main-materials PUT error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /* ---------------- 主图上传：单独一个端点，便于前端做裁剪/压缩 ---------------- */

  app.put('/api/main-materials/:id/cover', async (req, res) => {
    try {
      const userId = getUserId(req);
      const [existing] = await pool.query('SELECT creator_id FROM main_materials WHERE id = ?', [req.params.id]);
      if (!existing.length) return res.status(404).json({ error: '主材不存在' });
      if (existing[0].creator_id !== userId && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无权修改他人的数据' });
      }
      const url = String(req.body && req.body.cover_image || '').trim();
      await pool.query('UPDATE main_materials SET cover_image = ?, updated_at = NOW() WHERE id = ?',
        [url, req.params.id]);
      res.json({ message: '已更新', cover_image: url });
    } catch (err) {
      console.error('main-materials cover error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/main-materials/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      const [m] = await pool.query('SELECT name, creator_id FROM main_materials WHERE id = ?', [req.params.id]);
      if (!m.length) return res.status(404).json({ error: '记录不存在' });
      if (m[0].creator_id !== userId && !(await isAdmin(userId))) {
        return res.status(403).json({ error: '无权删除他人的数据' });
      }
      await pool.query('DELETE FROM main_materials WHERE id = ?', [req.params.id]);
      await addLog(userId, '', '删除', '主材管理', req.params.id, m[0].name, `删除主材: ${m[0].name}`, req.ip);
      res.json({ message: '删除成功' });
    } catch (err) {
      console.error('main-materials DELETE error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });


  app.post('/api/main-materials/batch-upsert', async (req, res) => {
    const userId = getUserId(req);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const insertStmt = db.prepare(`
      INSERT INTO main_materials (
        code, name, original_price, cost_price, cost_price2, quote_price, contract_price,
        quote_unit, exchange_rate, purchase_unit, loss_rate, loss_amount, warranty_period, stock_period,
        specification, model, color, spec_alternative, model_alternative, color_alternative, brand,
        sort_order, remark, acceptance_remark, contract_remark, other_remark, position, package_name,
        upgrade_profit_rate, internal_control_price, combo, limit_formula, quote_formula, category,
        is_visible, is_fixed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows) {
      if (!row.name) continue;
      await insertStmt.run(
        row.code || '',
        row.name || '',
        Number(row.original_price || 0),
        Number(row.cost_price || 0),
        Number(row.cost_price2 || 0),
        Number(row.quote_price || 0),
        Number(row.contract_price || 0),
        row.quote_unit || '片',
        Number(row.exchange_rate || 1),
        row.purchase_unit || '',
        Number(row.loss_rate || 0),
        Number(row.loss_amount || 0),
        row.warranty_period || '',
        row.stock_period || '',
        row.specification || '',
        row.model || '',
        row.color || '',
        row.spec_alternative || '',
        row.model_alternative || '',
        row.color_alternative || '',
        row.brand || '',
        Number(row.sort_order || 0),
        row.remark || '',
        row.acceptance_remark || '',
        row.contract_remark || '',
        row.other_remark || '',
        row.position || '',
        row.package_name || '',
        Number(row.upgrade_profit_rate || 0),
        Number(row.internal_control_price || 0),
        row.combo || '',
        row.limit_formula || '',
        row.quote_formula || '',
        row.category || '',
        Number(row.is_visible ?? 1),
        Number(row.is_fixed ?? 0)
      );
    }
    await addLog(userId, '', '新增', '主材管理', null, '批量导入', `批量导入主材 ${rows.length} 条`, req.ip);
    res.json({ message: '导入成功', count: rows.length });
  });

  app.post('/api/main-materials/import', upload.single('file'), async (req, res) => {
    // 2026-10-23 修复：本路由原先引用未声明的 userId，导入成功时抛 ReferenceError 并崩进程
    const userId = getUserId(req);
    if (!req.file) {
      res.status(400).json({ message: '未上传文件' });
      return;
    }
    // v2.3.6-hotfix2：修复中文文件名乱码
    req.file.originalname = fixMojibake(req.file.originalname);
    const originalExt = path.extname(req.file.originalname || '').toLowerCase();
    if (!['.xlsx', '.xlsm', '.xltx', '.xltm', '.xls'].includes(originalExt)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
      }
      res.status(400).json({ message: '仅支持Excel文件导入' });
      return;
    }
    if (originalExt === '.xls') {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
      }
      res.status(400).json({ message: '当前仅支持xlsx格式，请将xls另存为xlsx后再导入' });
      return;
    }
    const parseFilePath = `${req.file.path}${originalExt || '.xlsx'}`;
    fs.copyFileSync(req.file.path, parseFilePath);
    const script = `
import json,sys,pandas as pd
file_path=sys.argv[1]
try:
    df=pd.read_excel(file_path,sheet_name=0,engine='openpyxl')
except:
    try:
        df=pd.read_excel(file_path,sheet_name=0,engine='xlrd')
    except:
        df=pd.read_excel(file_path,sheet_name=0,engine='openpyxl')
df=df.fillna('')
headers=[str(c).strip() if pd.notna(c) else '' for c in df.columns]
mapping={
  '名称':'name','原价':'original_price','核算价':'cost_price','成本价':'cost_price2','报价':'quote_price','发包价':'contract_price',
  '报价单位':'quote_unit','兑换比例':'exchange_rate','采购单位':'purchase_unit','损耗比例':'loss_rate','损耗金额':'loss_amount',
  '保修时长':'warranty_period','备货周期':'stock_period','规格':'specification','型号':'model','颜色':'color',
  '规格备选':'spec_alternative','型号备选':'model_alternative','颜色备选':'color_alternative','品牌':'brand','排序':'sort_order',
  '备注说明':'remark','验收说明':'acceptance_remark','发包备注':'contract_remark','其他备注':'other_remark',
  '位置':'position','套系':'package_name','升级利润率':'upgrade_profit_rate','内控单价':'internal_control_price',
  '组合':'combo','限量公式':'limit_formula','报价量公式':'quote_formula','系统编号':'code','类别':'category',
  '类型':'type_name','品类':'category_name','子类':'sub_name','系列':'series','主图':'cover_image',
  '商城状态':'mall_status','商城价':'mall_price','商城库存':'mall_stock'
}
rows=[]
for idx,row in df.iterrows():
  item={}
  for i,h in enumerate(headers):
    key=mapping.get(h)
    if not key:
      continue
    v=row.iloc[i] if i < len(row) else ''
    item[key]='' if pd.isna(v) else str(v).strip()
  if item.get('name'):
    rows.append(item)
print(json.dumps(rows,ensure_ascii=False))
`;
    const result = spawnSync('python3', ['-c', script, parseFilePath], { encoding: 'utf8' });
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
    }
    try {
      fs.unlinkSync(parseFilePath);
    } catch (e) {
    }
    if (result.status !== 0) {
      const detail = result.stderr || '';
      console.log('Excel解析错误:', detail);
      if (detail.includes('BadZipFile') || detail.includes('File is not a zip file')) {
        res.status(400).json({ message: 'Excel文件格式无效或已损坏（文件大小异常：262144字节，可能是填充文件）。请重新从系统导出Excel文件后再导入。' });
        return;
      }
      res.status(500).json({ message: 'Excel解析失败: ' + detail.substring(0, 200), detail: result.stderr || '' });
      return;
    }
    let rows = [];
    try {
      rows = JSON.parse(result.stdout || '[]');
      console.log('导入数据行数:', rows.length, '首行字段:', rows[0] ? Object.keys(rows[0]) : '无', '字段数量:', rows[0] ? Object.keys(rows[0]).length : 0);
    } catch (e) {
      res.status(500).json({ message: 'Excel解析失败' });
      return;
    }
    // 复用 mmInsertOne：自动解析品类 / 品牌 / 拼音，并回填旧字段。
    // 字典先刷新一次，避免批量导入时逐行查库。
    await mmDicts(true);
    let okCount = 0;
    const failures = [];
    for (const row of rows) {
      if (!row.name) continue;
      try {
        await mmInsertOne(row, userId);
        okCount++;
      } catch (e) {
        failures.push({ name: row.name, error: e.message });
        console.error('导入单行失败:', row.name, e.message);
      }
    }
    await addLog(userId, '', '新增', '主材管理', null, '批量导入',
      `Excel导入主材 ${okCount} 条${failures.length ? `，失败 ${failures.length} 条` : ''}`, req.ip);
    res.json({
      message: failures.length ? `导入完成，成功 ${okCount} 条，失败 ${failures.length} 条` : '导入成功',
      count: okCount,
      failed: failures.length,
      failures: failures.slice(0, 20)
    });
  });

  app.get('/api/main-materials/export', async (req, res) => {
    // 带品类 / 品牌 / 系列一起导出，导出的表可直接再导入
    const [rows] = await pool.query(
      `SELECT ${MM_SELECT_FIELDS} ${MM_BASE_JOINS} ORDER BY m.sort_order ASC, m.id DESC`
    );
    const payloadPath = path.join(os.tmpdir(), `main_material_payload_${Date.now()}.json`);
    const outputPath = path.join(os.tmpdir(), `main_material_export_${Date.now()}.xlsx`);
    fs.writeFileSync(payloadPath, JSON.stringify(rows), 'utf8');
    const script = `
import json,sys,openpyxl
payload_path=sys.argv[1]
output_path=sys.argv[2]
with open(payload_path,'r',encoding='utf-8') as f:
  rows=json.load(f)
headers=['编号','名称','类型','品类','子类','系列','品牌','原价','核算价','成本价','报价','发包价','报价单位','兑换比例','采购单位','损耗比例','损耗金额','保修时长','备货周期','规格','型号','颜色','规格备选','型号备选','颜色备选','排序','备注说明','验收说明','发包备注','其他备注','位置','套系','升级利润率','内控单价','组合','限量公式','报价量公式','系统编号','主图','商城状态','商城价','商城库存']
fields=['id','name','type_name','category_name','sub_name','series','brand_display','original_price','cost_price','cost_price2','quote_price','contract_price','quote_unit','exchange_rate','purchase_unit','loss_rate','loss_amount','warranty_period','stock_period','specification','model','color','spec_alternative','model_alternative','color_alternative','sort_order','remark','acceptance_remark','contract_remark','other_remark','position','package_name','upgrade_profit_rate','internal_control_price','combo','limit_formula','quote_formula','code','cover_image','mall_status','mall_price','mall_stock']
wb=openpyxl.Workbook()
ws=wb.active
ws.title='主材管理'
ws.append(headers)
for r in rows:
  ws.append([r.get(f,'') if r.get(f) is not None else '' for f in fields])
wb.save(output_path)
`;
    const result = spawnSync('python3', ['-c', script, payloadPath, outputPath], { encoding: 'utf8' });
    try {
      fs.unlinkSync(payloadPath);
    } catch (e) {
    }
    if (result.status !== 0) {
      res.status(500).json({ message: '导出失败', detail: result.stderr || '' });
      return;
    }
    res.download(outputPath, '主材管理导出.xlsx', () => {
      try {
        fs.unlinkSync(outputPath);
      } catch (e) {
      }
    });
  });

  /* ==================================================================
   * 商城 v2.5.1 —— 无在线支付，只做「加购物车 → 生成订单号 → 银行转账备注」
   * ------------------------------------------------------------------
   * 设计原则（按"简单一些"的要求）：
   *   1. 商品池直接复用 main_materials，mall_status=1 即在商城可见。
   *      不另建商品表、不双写 —— 主材管理里勾「上架商城」立刻生效。
   *   2. 购物车放前端 storage，不入库（业主换设备重加，可接受）。
   *   3. 金额一律服务端算，不信前端传的 total。
   *   4. 下单只落订单，不扣库存、不改商品状态；财务人工确认收款。
   * ================================================================== */

  /** 商城价：填了 mall_price 用它，没填回退报价 quote_price */
};
