/**
 * 定向修复：把被误归到「瓷砖」的开关面板 / 艺术涂料挪回正确品类
 *
 * 背景：v2_5_0 迁移的 RULES 把「系列名」当瓷砖处理，但系列名是品牌私有的：
 *   L3系列 / K3系列 / L16系列   → 雷士开关面板
 *   皓彩系列 / 灵悦系列 / 致尚系列 → 西门子开关面板
 *   综合色系                    → 微尔勒艺术涂料（辅材/油漆涂料）
 * 共 385 条被错归到瓷砖。
 *
 * 用法：node migrations/_fix_switch_mismap.js [--dry-run]
 */
const db = require('../db-mysql-async.js');
const pool = db.pool;
const DRY = process.argv.includes('--dry-run');

/* 与 v2_5_0 迁移里的 switchSub() 保持一致 */
function switchSub(name) {
  const s = String(name || '');
  if (/空开|漏电|断路器|配电箱|电箱/.test(s)) return 'switch.breaker';
  if (/插座|五孔|四孔|六孔|三孔|16A|10A|电话|电脑|电视|USB|信息|网口|光纤|电视\+电脑|电视＋电脑/.test(s)) return 'switch.socket';
  return 'switch.panel';
}

const FIX_SWITCH = {
  'L3系列': { brand: '雷士' },
  'K3系列': { brand: '雷士' },
  'L16系列': { brand: '雷士' },
  '皓彩系列': { brand: '西门子' },
  '灵悦系列': { brand: '西门子' },
  '致尚系列': { brand: '西门子' },
};

(async () => {
  const [cats] = await pool.query('SELECT id, code, name FROM material_categories');
  const idByCode = {};
  cats.forEach(c => { idByCode[c.code] = c.id; });
  const [brands] = await pool.query('SELECT id, name FROM material_brands');
  const brandIdByName = {};
  brands.forEach(b => { brandIdByName[b.name] = b.id; });

  for (const code of ['switch', 'switch.panel', 'switch.socket', 'switch.breaker', 'paint', 'paint.latex', 'aux', 'main']) {
    if (!idByCode[code]) throw new Error('缺少品类 code: ' + code);
  }
  for (const bn of ['雷士', '西门子', '微尔勒']) {
    if (!brandIdByName[bn]) throw new Error('缺少品牌: ' + bn);
  }

  let totalFixed = 0;
  const stat = [];

  /* ---------- 1. 开关面板：按商品名判子类 ---------- */
  for (const [oldCat, cfg] of Object.entries(FIX_SWITCH)) {
    const [rows] = await pool.query(
      'SELECT id, name FROM main_materials WHERE category = ?', [oldCat]
    );
    if (!rows.length) continue;
    const bySub = { 'switch.panel': 0, 'switch.socket': 0, 'switch.breaker': 0 };
    for (const r of rows) {
      const sub = switchSub(r.name);
      bySub[sub]++;
      if (!DRY) {
        await pool.query(
          `UPDATE main_materials
              SET type_id=?, category_id=?, sub_id=?, brand_id=?, series=?
            WHERE id=?`,
          [idByCode.main, idByCode.switch, idByCode[sub], brandIdByName[cfg.brand], oldCat, r.id]
        );
      }
    }
    totalFixed += rows.length;
    stat.push({
      原值: oldCat, 条数: rows.length, 归属: '开关面板 / ' + cfg.brand,
      开关: bySub['switch.panel'], 插座: bySub['switch.socket'], 空开: bySub['switch.breaker'],
    });
  }

  /* ---------- 2. 艺术涂料（微尔勒：商品名都是「艺术墙（…）」） ---------- */
  for (const oldCat of ['综合色系', '珠光', '纯色']) {
    const [rows] = await pool.query(
      'SELECT id FROM main_materials WHERE category = ?', [oldCat]
    );
    if (!rows.length) continue;
    if (!DRY) {
      for (const r of rows) {
        await pool.query(
          `UPDATE main_materials
              SET type_id=?, category_id=?, sub_id=?, brand_id=?, series=?
            WHERE id=?`,
          [idByCode.aux, idByCode.paint, idByCode['paint.latex'], brandIdByName['微尔勒'], oldCat, r.id]
        );
      }
    }
    totalFixed += rows.length;
    stat.push({ 原值: oldCat, 条数: rows.length, 归属: '油漆涂料 / 微尔勒' });
  }

  console.log(DRY ? '\n=== DRY-RUN（未写库）===' : '\n=== 修复完成 ===');
  console.table(stat);
  console.log(`共处理 ${totalFixed} 条`);

  /* ---------- 3. 修后校验 ---------- */
  const [chk] = await pool.query(`
    SELECT t.name AS 类型, c.name AS 品类, COUNT(*) AS 条数
      FROM main_materials m
      LEFT JOIN material_categories t ON m.type_id = t.id
      LEFT JOIN material_categories c ON m.category_id = c.id
     WHERE m.category IN ('L3系列','K3系列','L16系列','皓彩系列','灵悦系列','致尚系列','综合色系','珠光','纯色')
     GROUP BY t.name, c.name`);
  console.log('== 修后归属校验 ==');
  console.table(chk);

  const [tot] = await pool.query('SELECT COUNT(*) AS n FROM main_materials');
  console.log('全表条数：', tot[0].n);

  await pool.end();
})().catch(e => { console.error('[ERR]', e.message); process.exit(1); });
