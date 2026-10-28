/**
 * v2.5.x 主材品类体系迁移
 * ------------------------------------------------------------------
 * 目标：
 *   1. 建 material_categories（类型 → 品类 → 子类，带不可变 code）
 *   2. 建 material_brands（含 alias 别名、logo）
 *   3. main_materials 增加 type_id / category_id / sub_id / brand_id / series /
 *      gallery / mall_* / pinyin / pinyin_abbr
 *   4. 把现有 category 的 101 个脏值映射到「品类 + 系列 + 品牌」
 *   5. 把 brand 的 42 个取值清洗后写入 material_brands 并回填 brand_id
 *
 * 原则：
 *   - 幂等，可重复执行
 *   - 先备份 main_materials（表已存在则跳过）
 *   - **不删原 category / brand 列**，保留 3 个月做对照
 *   - 新字段为 NULL 时，老代码照常工作
 *
 * 用法：
 *   node migrations/v2_5_0_material_taxonomy.js --dry-run   # 只看报告，不写库
 *   node migrations/v2_5_0_material_taxonomy.js             # 执行
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const { buildPinyin } = require('../material-pinyin');

const DRY = process.argv.includes('--dry-run');
const log = (...a) => console.log(...a);

/* ==================================================================
 * 一、品类树种子
 * code 一旦生成永不可改（商城 / 报价 / Excel 都靠它对接）
 * ================================================================== */
const CAT_TREE = [
  {
    code: 'main', name: '主材', children: [
      {
        code: 'tile', name: '瓷砖', children: [
          { code: 'tile.glaze', name: '抛釉砖' },
          { code: 'tile.fullbody', name: '通体大理石' },
          { code: 'tile.wood', name: '木纹砖' },
          { code: 'tile.rustic', name: '仿古砖' },
          { code: 'tile.labor', name: '瓷砖工费' },
        ]
      },
      {
        code: 'floor', name: '地板', children: [
          { code: 'floor.solid', name: '实木地板' },
          { code: 'floor.laminate', name: '复合地板' },
          { code: 'floor.skirting', name: '踢脚线' },
        ]
      },
      {
        code: 'door', name: '门/垭口', children: [
          { code: 'door.wood', name: '木门' },
          { code: 'door.alu', name: '合金门' },
          { code: 'door.frame', name: '门套' },
          { code: 'door.entry', name: '入户门' },
          { code: 'door.lock', name: '门锁' },
          { code: 'door.window', name: '窗' },
        ]
      },
      {
        code: 'cabinet', name: '橱柜', children: [
          { code: 'cabinet.whole', name: '整体橱柜' },
          { code: 'cabinet.countertop', name: '台面' },
        ]
      },
      {
        code: 'sanitary', name: '洁具', children: [
          { code: 'sanitary.toilet', name: '马桶' },
          { code: 'sanitary.shower', name: '花洒' },
          { code: 'sanitary.vanity', name: '浴室柜' },
          { code: 'sanitary.drain', name: '地漏' },
          { code: 'sanitary.faucet', name: '龙头' },
          { code: 'sanitary.set', name: '洁具套装' },
        ]
      },
      {
        code: 'lighting', name: '灯具', children: [
          { code: 'lighting.ceiling', name: '吸顶灯' },
          { code: 'lighting.spot', name: '筒灯射灯' },
          { code: 'lighting.strip', name: '灯带' },
        ]
      },
      {
        code: 'switch', name: '开关面板', children: [
          { code: 'switch.panel', name: '开关' },
          { code: 'switch.socket', name: '插座' },
          { code: 'switch.breaker', name: '空开' },
        ]
      },
      {
        code: 'ceiling', name: '吊顶', children: [
          { code: 'ceiling.alu', name: '铝扣板' },
          { code: 'ceiling.integrated', name: '集成吊顶' },
        ]
      },
      {
        code: 'wallpanel', name: '护墙板', children: [
          { code: 'wallpanel.board', name: '护墙板' },
        ]
      },
      {
        code: 'glass', name: '玻璃', children: [
          { code: 'glass.item', name: '玻璃' },
        ]
      },
    ]
  },
  {
    code: 'aux', name: '辅材', children: [
      {
        code: 'pipewire', name: '水管电线', children: [
          { code: 'pipewire.ppr', name: 'PPR管' },
          { code: 'pipewire.wire', name: '电线' },
          { code: 'pipewire.drain', name: '排水管' },
        ]
      },
      {
        code: 'waterproof', name: '防水辅料', children: [
          { code: 'waterproof.coating', name: '防水涂料' },
          { code: 'waterproof.putty', name: '腻子' },
          { code: 'waterproof.plaster', name: '灰泥' },
        ]
      },
      {
        code: 'hardware', name: '五金', children: [
          { code: 'hardware.hinge', name: '铰链' },
          { code: 'hardware.slide', name: '滑轨' },
          { code: 'hardware.silicone', name: '玻璃胶' },
          { code: 'hardware.valve', name: '止逆阀' },
        ]
      },
      {
        code: 'paint', name: '油漆涂料', children: [
          { code: 'paint.latex', name: '乳胶漆' },
          { code: 'paint.wood', name: '木器漆' },
        ]
      },
    ]
  },
  {
    code: 'furniture', name: '家具家电', children: [
      {
        code: 'appliance', name: '家电', children: [
          { code: 'appliance.water', name: '净水' },
          { code: 'appliance.kitchen', name: '厨房电器' },
          { code: 'appliance.projector', name: '投影' },
        ]
      },
      {
        code: 'furniture.item', name: '家具', children: [
          { code: 'furniture.sofa', name: '沙发' },
          { code: 'furniture.bed', name: '床' },
          { code: 'furniture.dining', name: '餐桌椅' },
        ]
      },
      {
        code: 'soft', name: '软装', children: [
          { code: 'soft.curtain', name: '窗帘' },
          { code: 'soft.decor', name: '装饰画' },
        ]
      },
    ]
  },
];

/* ==================================================================
 * 二、品牌种子（含别名）
 * 名字取自 main_materials.brand 的 42 个取值，已做清洗
 * ================================================================== */
const BRANDS = [
  { name: '马可波罗', alias: '马可,MARCO POLO,华耐星选,马可波罗-华耐星选' },
  { name: '金意陶', alias: '金意陶,尚韵瓷砖,KITO' },
  { name: '雷士', alias: '雷士,NVC,雷士照明' },
  { name: '西门子', alias: '西门子,SIEMENS' },
  { name: '潜水艇', alias: '潜水艇,SUBMARINE' },
  { name: 'TATA', alias: 'TATA,Tata,他她,他她木门' },
  { name: '大自然', alias: '大自然,大自然地板' },
  { name: '欧派', alias: '欧派,OPPEIN' },
  { name: '安吉尔', alias: '安吉尔,Angel' },
  { name: '伟星', alias: '伟星,VASEN,伟星新材' },
  { name: '诺贝尔', alias: '诺贝尔,NABEL' },
  { name: '微尔勒', alias: '微尔勒' },
  { name: '昊博', alias: '昊博' },
  { name: '黑贺', alias: '黑贺,黒贺' },
  { name: '匠心', alias: '匠心' },
  { name: '运德阁', alias: '运德阁' },
  { name: '尚品本色', alias: '尚品本色,尚品' },
  { name: '圣莫', alias: '圣莫' },
  { name: '宁波金属', alias: '宁波金属' },
  { name: '伟腾顺天', alias: '伟腾顺天' },
  { name: '品格', alias: '品格' },
  { name: '方圣', alias: '方圣' },
  { name: '方盛', alias: '方盛' },
  { name: '公元', alias: '公元,ERA' },
  { name: '布莱阁', alias: '布莱阁' },
  { name: '壹品优', alias: '壹品优' },
  { name: '米格尔', alias: '米格尔' },
  { name: '华耐星选', alias: '华耐星选,华耐' },
  { name: '恒洁', alias: '恒洁,HUIDA' },
  { name: '瓦克', alias: '瓦克,WACKER' },
  { name: '亿达', alias: '亿达' },
  { name: '欧爵名品', alias: '欧爵名品,欧爵' },
  { name: '天鸿一品', alias: '天鸿一品' },
  { name: '艺凡布业', alias: '艺凡布业,艺凡' },
  { name: '华昌金利发', alias: '华昌金利发,华昌' },
  { name: '玫瑰故事', alias: '玫瑰故事' },
  { name: '金骑士', alias: '金骑士,金骑士经典,金骑士名流' },
  { name: '海蒂诗', alias: '海蒂诗,Hettich' },
  { name: '顾家', alias: '顾家,顾家家居,KUKA' },
  { name: '东方雨虹', alias: '东方雨虹,雨虹' },
  { name: '美巢', alias: '美巢' },
  { name: '百隆', alias: '百隆,Blum' },
  { name: '远东', alias: '远东,远东电缆' },
  { name: '奥华', alias: '奥华' },
];

/* ==================================================================
 * 三、category 脏值映射规则
 * k=原 category 值；t/c/s=品类 code；b=品牌名；se=true 表示原值本身是系列名
 * 顺序敏感：先匹配的先生效
 * ================================================================== */
const RULES = [
  // —— 工费（不是材料，单独子类，避免污染报价）——
  { k: '金意陶 尚韵瓷砖工费', t: 'main', c: 'tile', s: 'tile.labor', b: '金意陶', se: '尚韵' },
  { k: '马可波罗瓷砖工费', t: 'main', c: 'tile', s: 'tile.labor', b: '马可波罗' },

  // —— 瓷砖：纯系列名（原值搬进 series）——
  // ⚠️ 系列名是品牌私有的，不能凭"看起来像"就归类。下面 L3/K3/L16 属雷士开关，
  //    皓彩/灵悦/致尚 属西门子开关，综合色系是微尔勒艺术涂料 —— 已挪走，勿再放回瓷砖。
  { k: '尚韵', t: 'main', c: 'tile', se: true },
  { k: '木纹砖', t: 'main', c: 'tile', s: 'tile.wood' },

  // —— 开关面板：品牌系列名（雷士 L3/K3/L16、西门子 皓彩/灵悦/致尚）——
  // 子类由商品名判定，见 switchSub()（插座/开关/空开）
  { k: 'L3系列', t: 'main', c: 'switch', b: '雷士', se: true },
  { k: 'K3系列', t: 'main', c: 'switch', b: '雷士', se: true },
  { k: 'L16系列', t: 'main', c: 'switch', b: '雷士', se: true },
  { k: '皓彩系列', t: 'main', c: 'switch', b: '西门子', se: true },
  { k: '灵悦系列', t: 'main', c: 'switch', b: '西门子', se: true },
  { k: '致尚系列', t: 'main', c: 'switch', b: '西门子', se: true },

  // —— 艺术涂料（微尔勒：综合色系 / 珠光 / 纯色，商品名都是「艺术墙（…）」）——
  { k: '综合色系', t: 'aux', c: 'paint', s: 'paint.latex', b: '微尔勒', se: true },
  { k: '珠光', t: 'aux', c: 'paint', s: 'paint.latex', b: '微尔勒', se: true },
  { k: '纯色', t: 'aux', c: 'paint', s: 'paint.latex', b: '微尔勒', se: true },

  // —— 瓷砖：品牌名当 category ——
  { k: '马可波罗.', t: 'main', c: 'tile', b: '马可波罗' },
  { k: '金意陶', t: 'main', c: 'tile', b: '金意陶' },
  { k: '昊博', t: 'main', c: 'tile', b: '昊博' },
  { k: '诺贝尔', t: 'main', c: 'tile', b: '诺贝尔' },
  { k: '黒贺石英砖', t: 'main', c: 'tile', b: '黑贺' },
  { k: '华耐星选', t: 'main', c: 'tile', b: '华耐星选' },

  // —— 门 ——
  { k: '型材门.', t: 'main', c: 'door', s: 'door.alu' },
  { k: '型材门', t: 'main', c: 'door', s: 'door.alu' },
  { k: '门1', t: 'main', c: 'door' },
  { k: '1门', t: 'main', c: 'door' },
  { k: '油漆门', t: 'main', c: 'door', s: 'door.wood' },
  { k: '免漆门', t: 'main', c: 'door', s: 'door.wood' },
  { k: '清油门', t: 'main', c: 'door', s: 'door.wood' },
  { k: '混油门', t: 'main', c: 'door', s: 'door.wood' },
  { k: '木门', t: 'main', c: 'door', s: 'door.wood' },
  { k: '尚品免漆门', t: 'main', c: 'door', s: 'door.wood', b: '尚品本色' },
  { k: '入户门', t: 'main', c: 'door', s: 'door.entry' },
  { k: '智能锁', t: 'main', c: 'door', s: 'door.lock' },
  { k: '门锁', t: 'main', c: 'door', s: 'door.lock' },
  { k: '口套', t: 'main', c: 'door', s: 'door.frame' },
  { k: '垭口', t: 'main', c: 'door', s: 'door.frame' },
  { k: '木门包口', t: 'main', c: 'door', s: 'door.frame' },
  { k: '门单包口', t: 'main', c: 'door', s: 'door.frame' },
  { k: '门双包口', t: 'main', c: 'door', s: 'door.frame' },
  { k: '双包套铝合金', t: 'main', c: 'door', s: 'door.frame' },
  { k: '单包套铝合金', t: 'main', c: 'door', s: 'door.frame' },
  { k: '3窗口', t: 'main', c: 'door', s: 'door.window' },
  { k: '米格尔', t: 'main', c: 'door', s: 'door.wood', b: '米格尔' },
  { k: '金骑士', t: 'main', c: 'door', s: 'door.wood', b: '金骑士' },

  // —— 橱柜 ——
  { k: '定制橱柜', t: 'main', c: 'cabinet', s: 'cabinet.whole' },
  { k: '欧派橱柜', t: 'main', c: 'cabinet', s: 'cabinet.whole', b: '欧派' },
  { k: '2橱柜', t: 'main', c: 'cabinet', s: 'cabinet.whole' },

  // —— 洁具 ——
  { k: '线形地漏潜水艇', t: 'main', c: 'sanitary', s: 'sanitary.drain', b: '潜水艇' },
  { k: '长条地漏潜水艇', t: 'main', c: 'sanitary', s: 'sanitary.drain', b: '潜水艇' },
  { k: '方形地漏潜水艇', t: 'main', c: 'sanitary', s: 'sanitary.drain', b: '潜水艇' },
  { k: '洗衣机地漏潜水艇', t: 'main', c: 'sanitary', s: 'sanitary.drain', b: '潜水艇' },
  { k: '圆形地漏潜水艇', t: 'main', c: 'sanitary', s: 'sanitary.drain', b: '潜水艇' },
  { k: '干区地漏潜水艇', t: 'main', c: 'sanitary', s: 'sanitary.drain', b: '潜水艇' },
  { k: '艺术地漏潜水艇', t: 'main', c: 'sanitary', s: 'sanitary.drain', b: '潜水艇' },
  { k: '隐形地漏潜水艇', t: 'main', c: 'sanitary', s: 'sanitary.drain', b: '潜水艇' },
  { k: '泳池地漏潜水艇', t: 'main', c: 'sanitary', s: 'sanitary.drain', b: '潜水艇' },
  { k: '马桶潜水艇', t: 'main', c: 'sanitary', s: 'sanitary.toilet', b: '潜水艇' },
  { k: '花洒潜水艇', t: 'main', c: 'sanitary', s: 'sanitary.shower', b: '潜水艇' },
  { k: '伟星花洒', t: 'main', c: 'sanitary', s: 'sanitary.shower', b: '伟星' },
  { k: '伟星水龙头', t: 'main', c: 'sanitary', s: 'sanitary.faucet', b: '伟星' },
  { k: '洁具套装', t: 'main', c: 'sanitary', s: 'sanitary.set' },
  { k: '洁具套餐潜水艇', t: 'main', c: 'sanitary', s: 'sanitary.set', b: '潜水艇' },
  { k: '止逆阀潜水艇', t: 'aux', c: 'hardware', s: 'hardware.valve', b: '潜水艇' },

  // —— 吊顶 ——
  { k: '铝扣板正品', t: 'main', c: 'ceiling', s: 'ceiling.alu' },
  { k: '铝扣板奥华', t: 'main', c: 'ceiling', s: 'ceiling.alu', b: '奥华' },
  { k: '铝扣板', t: 'main', c: 'ceiling', s: 'ceiling.alu' },
  { k: '铝扣板.', t: 'main', c: 'ceiling', s: 'ceiling.alu' },
  { k: '铝扣板蜂窝板', t: 'main', c: 'ceiling', s: 'ceiling.alu' },
  { k: '电器奥华', t: 'main', c: 'ceiling', s: 'ceiling.integrated', b: '奥华' },
  { k: '电器', t: 'main', c: 'ceiling', s: 'ceiling.integrated' },

  // —— 地板 / 踢脚线 ——
  { k: '木地板', t: 'main', c: 'floor', s: 'floor.laminate' },
  { k: '运德阁踢脚线', t: 'main', c: 'floor', s: 'floor.skirting', b: '运德阁' },
  { k: '大自然踢脚线', t: 'main', c: 'floor', s: 'floor.skirting', b: '大自然' },
  { k: '尚品踢脚线', t: 'main', c: 'floor', s: 'floor.skirting', b: '尚品本色' },
  { k: '尚韵踢脚线', t: 'main', c: 'floor', s: 'floor.skirting', b: '金意陶' },
  { k: '马可波罗踢脚线', t: 'main', c: 'floor', s: 'floor.skirting', b: '马可波罗' },
  { k: 'TATA踢脚线', t: 'main', c: 'floor', s: 'floor.skirting', b: 'TATA' },

  // —— 护墙板 ——
  { k: '护墙板烤漆', t: 'main', c: 'wallpanel', s: 'wallpanel.board' },
  { k: '护墙板免漆', t: 'main', c: 'wallpanel', s: 'wallpanel.board' },

  // —— 玻璃 ——
  { k: '玻璃', t: 'main', c: 'glass', s: 'glass.item' },

  // —— 开关 ——
  { k: '雷士开关面板', t: 'main', c: 'switch', b: '雷士' },

  // —— 辅材 ——
  { k: '伟星', t: 'aux', c: 'pipewire', b: '伟星' },
  { k: '公元', t: 'aux', c: 'pipewire', b: '公元' },
  { k: '灰泥', t: 'aux', c: 'waterproof', s: 'waterproof.plaster' },
  { k: '瓦克胶', t: 'aux', c: 'hardware', s: 'hardware.silicone', b: '瓦克' },

  // —— 软装 ——
  { k: '密云精品窗帘', t: 'furniture', c: 'soft', s: 'soft.curtain' },
  { k: '布莱阁窗帘', t: 'furniture', c: 'soft', s: 'soft.curtain', b: '布莱阁' },

  // —— 家电：净水 ——
  { k: '中央软水机安吉尔', t: 'furniture', c: 'appliance', s: 'appliance.water', b: '安吉尔' },
  { k: '末端净水安吉尔', t: 'furniture', c: 'appliance', s: 'appliance.water', b: '安吉尔' },
  { k: '中央净水机安吉尔', t: 'furniture', c: 'appliance', s: 'appliance.water', b: '安吉尔' },
  { k: '前置安吉尔', t: 'furniture', c: 'appliance', s: 'appliance.water', b: '安吉尔' },
  { k: '壁挂饮水机安吉尔', t: 'furniture', c: 'appliance', s: 'appliance.water', b: '安吉尔' },
  { k: '前置伟星', t: 'furniture', c: 'appliance', s: 'appliance.water', b: '伟星' },
  { k: '中央软水机伟星', t: 'furniture', c: 'appliance', s: 'appliance.water', b: '伟星' },
  { k: '中央净水机伟星', t: 'furniture', c: 'appliance', s: 'appliance.water', b: '伟星' },
  { k: '台面净饮机伟星', t: 'furniture', c: 'appliance', s: 'appliance.water', b: '伟星' },
  { k: 'RO净水机伟星', t: 'furniture', c: 'appliance', s: 'appliance.water', b: '伟星' },
  { k: '超微泡机伟星', t: 'furniture', c: 'appliance', s: 'appliance.water', b: '伟星' },
  { k: '龙头净水器伟星', t: 'furniture', c: 'appliance', s: 'appliance.water', b: '伟星' },
  { k: '管线机伟星', t: 'furniture', c: 'appliance', s: 'appliance.water', b: '伟星' },
  { k: '投影', t: 'furniture', c: 'appliance', s: 'appliance.projector' },

  // —— 待定（明确知道是脏数据，但归不进去）——
  // 金泓牛 / 天鸿一品：实测商品名是「免漆实木复合木门」「平板混油实木多层门」，属门类
  { k: '金泓牛', t: 'main', c: 'door', s: 'door.wood' },
  { k: '天鸿一品', t: 'main', c: 'door', s: 'door.wood' },
  { k: '圣莫', t: 'main' },
  { k: '匠心', t: 'main' },
  { k: '微尔勒', t: 'main' },
  { k: '伟腾顺天', t: 'main' },
  { k: '品格', t: 'main' },
  { k: '方圣', t: 'main' },
  { k: '方盛', t: 'main' },
  { k: '壹品优', t: 'main' },
  { k: '亿达', t: 'main' },
  { k: '欧爵名品', t: 'main' },
  { k: '艺凡布业', t: 'furniture', c: 'soft' },
  { k: '华昌金利发', t: 'main' },
  { k: '玫瑰故事', t: 'main' },
  { k: '宁波金属', t: 'main' },
  { k: '海蒂诗', t: 'aux', c: 'hardware' },
  { k: '恒洁', t: 'main', c: 'sanitary', b: '恒洁' },
];

/* 开关面板子类：同一品类下混着开关/插座/空开，只能靠商品名判
   顺序要紧：「单开五孔」「单开16A」是插座不是开关，所以插座词先判 */
function switchSub(name) {
  const s = String(name || '');
  if (/空开|漏电|断路器|配电箱|电箱/.test(s)) return 'switch.breaker';
  if (/插座|五孔|四孔|六孔|三孔|16A|10A|电话|电脑|电视|USB|信息|网口|光纤|电视\+电脑|电视＋电脑/.test(s)) return 'switch.socket';
  return 'switch.panel';
}

/* 品牌字段清洗：原值 → 规范名（+ 从原值里拆出系列） */
const BRAND_FIX = {
  '金意陶/尚韵': { name: '金意陶', series: '尚韵' },
  '马可波罗-华耐星选': { name: '马可波罗' },
  '金骑士经典': { name: '金骑士', series: '经典' },
  '金骑士名流': { name: '金骑士', series: '名流' },
  'Tata': { name: 'TATA' },
  '黒贺': { name: '黑贺' },
};

/* ================================================================== */

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true,
    multipleStatements: true,
  });
  const q = async (sql, params) => (await conn.query(sql, params))[0];

  log(DRY ? '\n=== DRY RUN（不写库）===\n' : '\n=== 开始执行迁移 ===\n');

  /* ---------- 0. 备份 ---------- */
  const bakName = 'main_materials_bak_20261028';
  const [bakExists] = await q(
    `SELECT COUNT(*) c FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`, [bakName]
  );
  if (bakExists.c > 0) {
    log(`[0] 备份表 ${bakName} 已存在，跳过`);
  } else if (!DRY) {
    await q(`CREATE TABLE ${bakName} AS SELECT * FROM main_materials`);
    const [{ c }] = await q(`SELECT COUNT(*) c FROM ${bakName}`);
    log(`[0] 已备份 → ${bakName}（${c} 行）`);
  } else {
    log(`[0] [dry] 将备份到 ${bakName}`);
  }

  /* ---------- 1. 建字典表 ---------- */
  // ⚠ 目标库是 MySQL 5.5.62：不支持 DATETIME DEFAULT CURRENT_TIMESTAMP，
  //   也不能用双引号写 COMMENT（ANSI_QUOTES 下会报错）。统一用固定默认值 + 单引号。
  if (!DRY) {
    await q(`
      CREATE TABLE IF NOT EXISTS material_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL COMMENT '不可变编码，商城/报价靠它对接',
        name VARCHAR(60) NOT NULL,
        parent_id INT DEFAULT NULL,
        level TINYINT NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        status TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT '2024-01-01 00:00:00',
        updated_at DATETIME DEFAULT '2024-01-01 00:00:00',
        UNIQUE KEY uk_code (code),
        KEY idx_parent (parent_id),
        KEY idx_level (level)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='主材品类字典'
    `);
    await q(`
      CREATE TABLE IF NOT EXISTS material_brands (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        alias VARCHAR(500) DEFAULT '' COMMENT '别名，逗号分隔，检索用',
        logo VARCHAR(255) DEFAULT '',
        pinyin VARCHAR(120) DEFAULT '' COMMENT '品牌全拼，检索用',
        pinyin_abbr VARCHAR(40) DEFAULT '' COMMENT '品牌拼音首字母，检索用',
        sort_order INT NOT NULL DEFAULT 0,
        status TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT '2024-01-01 00:00:00',
        updated_at DATETIME DEFAULT '2024-01-01 00:00:00',
        UNIQUE KEY uk_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='主材品牌字典'
    `);
    log('[1] 字典表已就绪');
  } else {
    log('[1] [dry] 将建 material_categories / material_brands');
  }

  /* ---------- 2. 灌品类种子 ---------- */
  const catIdByCode = {};
  async function seedCats(nodes, parentId, parentCode, depth) {
    let sort = 0;
    for (const n of nodes) {
      sort += 10;
      const fullCode = n.code;
      if (!DRY) {
        await q(
          `INSERT INTO material_categories (code, name, parent_id, level, sort_order, created_at, updated_at)
           VALUES (?,?,?,?,?,NOW(),NOW())
           ON DUPLICATE KEY UPDATE name = VALUES(name), parent_id = VALUES(parent_id),
                                   level = VALUES(level), sort_order = VALUES(sort_order)`,
          [fullCode, n.name, parentId, depth, sort]
        );
        const [row] = await q(`SELECT id FROM material_categories WHERE code = ?`, [fullCode]);
        catIdByCode[fullCode] = row.id;
      } else {
        catIdByCode[fullCode] = -1;
      }
      if (n.children) await seedCats(n.children, DRY ? -1 : catIdByCode[fullCode], fullCode, depth + 1);
    }
  }
  await seedCats(CAT_TREE, null, '', 1);
  const catCount = Object.keys(catIdByCode).length;
  log(`[2] 品类种子 ${catCount} 个（类型 ${CAT_TREE.length} / 品类 ${CAT_TREE.reduce((a, t) => a + t.children.length, 0)} / 子类若干）`);

  /* ---------- 3. 灌品牌种子 ---------- */
  const brandIdByName = {};
  let bsort = 0;
  for (const b of BRANDS) {
    bsort += 10;
    if (!DRY) {
      const bpy = buildPinyin(b.name);
      await q(
        `INSERT INTO material_brands (name, alias, sort_order, pinyin, pinyin_abbr, created_at, updated_at)
         VALUES (?,?,?,?,?,NOW(),NOW())
         ON DUPLICATE KEY UPDATE alias = VALUES(alias), pinyin = VALUES(pinyin), pinyin_abbr = VALUES(pinyin_abbr)`,
        [b.name, b.alias || b.name, bsort, bpy.pinyin || '', bpy.pinyin_abbr || '']
      );
      const [row] = await q(`SELECT id FROM material_brands WHERE name = ?`, [b.name]);
      brandIdByName[b.name] = row.id;
    } else {
      brandIdByName[b.name] = -1;
    }
  }
  log(`[3] 品牌种子 ${BRANDS.length} 个`);

  /* ---------- 4. 加字段 ---------- */
  const newCols = [
    ['type_id', "INT DEFAULT NULL COMMENT '一级类型：主材/辅材/家具家电'"],
    ['category_id', "INT DEFAULT NULL COMMENT '二级品类'"],
    ['sub_id', "INT DEFAULT NULL COMMENT '三级子类'"],
    ['brand_id', "INT DEFAULT NULL COMMENT '品牌字典 id'"],
    ['series', "VARCHAR(255) DEFAULT NULL COMMENT '系列/套系，从原 category 迁入'"],
    ['gallery', "TEXT COMMENT '附加图 JSON 数组，商城多图'"],
    ['mall_status', "TINYINT NOT NULL DEFAULT 0 COMMENT '0未上架 1已上架 2已下架'"],
    ['mall_price', "DECIMAL(12,2) DEFAULT NULL COMMENT '商城零售价'"],
    ['mall_stock', "INT NOT NULL DEFAULT 0 COMMENT '商城可售库存'"],
    ['mall_sku_code', "VARCHAR(100) DEFAULT NULL COMMENT '对接外部商城的 SKU'"],
    ['pinyin', "VARCHAR(255) DEFAULT NULL COMMENT '名称全拼'"],
    ['pinyin_abbr', "VARCHAR(100) DEFAULT NULL COMMENT '名称拼音首字母'"],
  ];
  const existingCols = (await q(
    `SELECT column_name c FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'main_materials'`
  )).map(r => String(r.c).toLowerCase());

  let added = 0;
  for (const [name, ddl] of newCols) {
    if (existingCols.includes(name)) continue;
    if (!DRY) await q(`ALTER TABLE main_materials ADD COLUMN ${name} ${ddl}`);
    added++;
  }
  log(`[4] 新增列 ${added} 个${added < newCols.length ? `（已存在 ${newCols.length - added} 个，跳过）` : ''}`);

  // 索引
  const idxRows = await q(`SHOW INDEX FROM main_materials`);
  const idxNames = new Set(idxRows.map(r => r.Key_name));
  const wantIdx = [
    ['idx_type_cat', 'ADD INDEX idx_type_cat (type_id, category_id)'],
    ['idx_brand', 'ADD INDEX idx_brand (brand_id)'],
    ['idx_name', 'ADD INDEX idx_name (name(64))'],
    ['idx_pinyin_abbr', 'ADD INDEX idx_pinyin_abbr (pinyin_abbr(32))'],
  ];
  let idxAdded = 0;
  for (const [nm, ddl] of wantIdx) {
    if (idxNames.has(nm)) continue;
    if (!DRY) await q(`ALTER TABLE main_materials ${ddl}`);
    idxAdded++;
  }
  log(`[5] 新增索引 ${idxAdded} 个`);

  /* ---------- 5. 迁移 category → 品类 / 系列 / 品牌 ---------- */
  // dry-run 时 series 列还没建，不能 SELECT 它
  const hasSeriesCol = !DRY || existingCols.includes('series');
  const rows = await q(
    `SELECT id, name, brand, category${hasSeriesCol ? ', series' : ''} FROM main_materials`
  );

  const ruleMap = new Map(RULES.map(r => [r.k, r]));
  const report = { matched: 0, noRule: [], noBrand: [], brandFixed: 0, seriesSet: 0, pinSet: 0 };

  for (const r of rows) {
    const cat = (r.category || '').trim();
    const rule = ruleMap.get(cat);
    let typeId = null, categoryId = null, subId = null, series = r.series || null;
    let brandName = (r.brand || '').trim();

    // 品牌清洗
    if (BRAND_FIX[brandName]) {
      const fx = BRAND_FIX[brandName];
      brandName = fx.name;
      if (fx.series && !series) series = fx.series;
      report.brandFixed++;
    }

    if (rule) {
      report.matched++;
      if (rule.t) typeId = catIdByCode[rule.t] ?? null;
      if (rule.c) categoryId = catIdByCode[rule.c] ?? null;
      if (rule.s) subId = catIdByCode[rule.s] ?? null;
      if (rule.b) brandName = rule.b;
      if (rule.se === true) series = cat;
      else if (typeof rule.se === 'string') series = rule.se;
      // 开关面板：规则只到品类，子类靠商品名判
      if (rule.c === 'switch' && !rule.s) {
        subId = catIdByCode[switchSub(r.name)] ?? null;
      }
    } else if (cat) {
      report.noRule.push(cat);
    }

    const brandId = brandName ? (brandIdByName[brandName] ?? null) : null;
    if (brandName && !brandId) report.noBrand.push(brandName);
    if (series) report.seriesSet++;

    // 拼音
    const py = buildPinyin(r.name || '');
    if (py.pinyin) report.pinSet++;

    if (!DRY) {
      await q(
        `UPDATE main_materials
            SET type_id = ?, category_id = ?, sub_id = ?, brand_id = ?,
                series = ?, pinyin = ?, pinyin_abbr = ?
          WHERE id = ?`,
        [typeId, categoryId, subId, brandId, series, py.pinyin, py.pinyin_abbr, r.id]
      );
    }
  }

  log(`\n[6] 迁移 ${rows.length} 条`);
  log(`    命中映射规则：${report.matched} 条`);
  log(`    未命中规则：${rows.length - report.matched} 条${report.noRule.length ? '（category 为空）' : ''}`);
  log(`    品牌清洗：${report.brandFixed} 条`);
  log(`    写入系列：${report.seriesSet} 条`);
  log(`    生成拼音：${report.pinSet} 条`);

  const uniqNoRule = [...new Set(report.noRule)];
  if (uniqNoRule.length) {
    log(`\n    ⚠ 以下 category 值没有映射规则（${uniqNoRule.length} 种），商品会落「待定」：`);
    log('      ' + uniqNoRule.join(' / '));
  }
  const uniqNoBrand = [...new Set(report.noBrand)];
  if (uniqNoBrand.length) {
    log(`\n    ⚠ 以下品牌不在字典里，brand_id 留空：`);
    log('      ' + uniqNoBrand.join(' / '));
  }

  /* ---------- 6. 汇总 ---------- */
  if (!DRY) {
    const stat = await q(`
      SELECT
        SUM(type_id IS NOT NULL) has_type,
        SUM(category_id IS NOT NULL) has_cat,
        SUM(sub_id IS NOT NULL) has_sub,
        SUM(brand_id IS NOT NULL) has_brand,
        SUM(series IS NOT NULL AND series <> '') has_series,
        SUM(pinyin_abbr IS NOT NULL AND pinyin_abbr <> '') has_py,
        COUNT(*) total
      FROM main_materials
    `);
    log('\n[7] 结果分布：');
    console.table(stat);

    const byType = await q(`
      SELECT c.name AS 类型, COUNT(*) AS 数量
        FROM main_materials m JOIN material_categories c ON m.type_id = c.id
       GROUP BY c.name ORDER BY 数量 DESC
    `);
    console.table(byType);

    const topBrands = await q(`
      SELECT b.name AS 品牌, COUNT(*) AS 数量
        FROM main_materials m JOIN material_brands b ON m.brand_id = b.id
       GROUP BY b.name ORDER BY 数量 DESC LIMIT 12
    `);
    console.table(topBrands);
  }

  await conn.end();
  log(DRY ? '\n=== DRY RUN 结束，未写库 ===\n' : '\n=== 迁移完成 ===\n');
}

main().catch(e => { console.error('迁移失败:', e); process.exit(1); });
