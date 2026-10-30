/**
 * 验收类型模板库（纯数据，零依赖）
 *
 * 内容来源：《施工服务手册》附件A OCR 全文 P12/P17/P18/P19/P20/P21/P22/P23/P25/P26/P27、
 *          《施工标准手册》P7/P8（形象标准 9 条）
 * 表单清单编号对应 附件D-表单数字化需求清单.csv 序号 9/12/13/14/15/16/17/18/20/21/22/4
 *
 * 设计原则：
 * 1. 验收类型从手册出，不从节点出 —— 员工在移动端选「项目 + 验收类型」即可填单
 * 2. 每个类型内分 group（对应纸质表的「电路验收项目 / 水路验收项目」分组）
 * 3. item.kind：check（合格/不合格，默认）| number（录数值，用于时长/厚度）| rating（优/良/一般）| photo（拍照存档）
 * 4. item.severity：red（红线，不合格直接判整单不合格并阻断）| normal（一般项，判整改中）
 * 5. 业主签字字段在数据层已预留（signRoles 含 customer），当前版本界面不启用
 */

const SHEET_TEMPLATES = [
  {
    code: 'materials_in',
    name: '轻辅材料进场验收单',
    trade: '综合',
    source: '施工服务手册 P12（印刷 11）',
    intro: '以上材料验收均为业主轻辅报价所有材料。品牌、规格、数量须与报价单一致，不符不得进场使用。',
    signRoles: ['foreman', 'supervisor', 'customer'],
    groups: [
      {
        name: '水电材料验收',
        items: [
          { code: 'mi_e_1', title: '线管、电线品牌规格与报价单一致', standard: 'BV2.5 / BV4.0 铜芯线、PP-R 给水管、PVC 线管', severity: 'red' },
          { code: 'mi_e_2', title: '阻燃性能符合要求（线管、接线盒）', standard: '塑料电线保护管及接线盒必须是阻燃产品，外观无破损变形', severity: 'red' },
          { code: 'mi_e_3', title: '数量与送货单一致', standard: '按报价单数量逐项点验', severity: 'normal' },
          { code: 'mi_e_4', title: '外观无破损、附件备件齐全', standard: '包装完好，材料外观无破损', severity: 'normal' },
        ],
      },
      {
        name: '瓦工材料验收',
        items: [
          { code: 'mi_m_1', title: '瓷砖品牌、型号、色号与合同一致', standard: '同批次无肉眼色差', severity: 'red' },
          { code: 'mi_m_2', title: '水泥、砂浆、防水材料在保质期内', standard: '防水材料须为合同约定品牌型号', severity: 'red' },
          { code: 'mi_m_3', title: '数量与送货单一致', standard: '含损耗量核对', severity: 'normal' },
          { code: 'mi_m_4', title: '瓷砖无崩边、缺角、裂纹', standard: '抽检开箱', severity: 'normal' },
        ],
      },
      {
        name: '木工材料验收',
        items: [
          { code: 'mi_w_1', title: '板材品牌、环保等级与合同一致', standard: '石膏板、细木工板、龙骨规格符合设计', severity: 'red' },
          { code: 'mi_w_2', title: '龙骨壁厚符合要求', standard: '轻钢龙骨无变形锈蚀', severity: 'normal' },
          { code: 'mi_w_3', title: '数量与送货单一致', standard: '按报价单点验', severity: 'normal' },
          { code: 'mi_w_4', title: '防火防腐涂料已到场', standard: '木制品须刷防火防腐涂料', severity: 'normal' },
        ],
      },
      {
        name: '油工材料验收',
        items: [
          { code: 'mi_p_1', title: '腻子、乳胶漆品牌与合同一致', standard: '禁止使用原建筑腻子直接施工', severity: 'red' },
          { code: 'mi_p_2', title: '网格带、牛皮纸、防锈漆已到场', standard: '用于缝隙处理与钉帽防锈', severity: 'normal' },
          { code: 'mi_p_3', title: '数量与送货单一致', standard: '按报价单点验', severity: 'normal' },
          { code: 'mi_p_4', title: '包装完好、在保质期内', standard: '开桶检查无结块', severity: 'normal' },
        ],
      },
    ],
  },

  {
    code: 'water_electric',
    name: '水电改造验收单',
    trade: '水电',
    source: '施工服务手册 P17（印刷 16）',
    intro: '电路 6 项 + 水路 4 项，逐项判定。左零右火接地与打压保压为红线项。',
    signRoles: ['foreman', 'supervisor', 'customer'],
    groups: [
      {
        name: '电路验收项目',
        items: [
          { code: 'we_e_1', title: '线路走向合理规范（横平竖直）', standard: '承重墙不允许开横槽，管内导线严禁有接头', severity: 'normal' },
          { code: 'we_e_2', title: '电线灯头处已加套波纹管', standard: '顶面楼板开槽使用 PVC 管或黄腊管', severity: 'normal' },
          { code: 'we_e_3', title: '插座线路左零右火接地', standard: '面向插座左侧接 N，右侧接 L，上方接 PE', severity: 'red' },
          { code: 'we_e_4', title: '吊顶分线处已加装分线盒', standard: '管线超 15m 或两个直角弯须增设拉线盒', severity: 'normal' },
          { code: 'we_e_5', title: '线管与暗盒连接已加装锁母', standard: '管口平整无毛刺', severity: 'normal' },
          { code: 'we_e_6', title: '线管与线管搭接采用护套线', standard: '强弱电并排时弱电管包锡箔纸', severity: 'normal' },
        ],
      },
      {
        name: '水路验收项目',
        items: [
          { code: 'we_w_1', title: '水管走向合理规范（横平竖直）', standard: '冷热水管上下平行，热水管在上', severity: 'normal' },
          { code: 'we_w_2', title: '水管并列左热右冷', standard: '面向水管左热右冷', severity: 'red' },
          { code: 'we_w_3', title: '试压 0.8MPa 观察 30 分钟无掉压', standard: '压力下降不大于 0.02MPa，保压不少于 30min', metric: '0.8MPa / 30min', severity: 'red', kind: 'number', unit: 'MPa·min' },
          { code: 'we_w_4', title: '混水器冷热水水平一致，中心距 150mm', standard: '两管口高度一致且与墙面垂直，管口高出墙面 2cm', metric: '150mm', severity: 'normal', kind: 'number', unit: 'mm' },
        ],
      },
    ],
  },

  {
    code: 'water_test',
    name: '防水工程闭水试验记录单',
    trade: '瓦工',
    source: '施工服务手册 P18（印刷 17）',
    intro: '四周墙面防水层卷起 300 毫米，淋浴墙满足 1800 毫米。回填层须做二级防水，两级各做一次记录。',
    signRoles: ['foreman', 'supervisor', 'customer'],
    groups: [
      {
        name: '闭水试验记录',
        items: [
          { code: 'wt_1', title: '蓄水深度不小于 20mm', standard: '地面普遍蓄水，不得只浇湿表面', metric: '≥20mm', severity: 'red', kind: 'number', unit: 'mm' },
          { code: 'wt_2', title: '蓄水时间不少于 24 小时', standard: '记录开始时间与验收时间，实验时长按实际小时数填写', metric: '≥24h', severity: 'red', kind: 'number', unit: 'h' },
          { code: 'wt_3', title: '四周墙面防水卷起 300mm', standard: '淋浴墙 1800mm', metric: '300 / 1800mm', severity: 'red', kind: 'number', unit: 'mm' },
          { code: 'wt_4', title: '楼下顶板无渗漏、无湿渍', standard: '须到楼下对应位置实地查看并拍照', severity: 'red' },
          { code: 'wt_5', title: '防水层无起鼓、开裂、脱落', standard: '门口石材处 3-5mm 收口到位', severity: 'normal' },
          { code: 'wt_6', title: '拍照存档（蓄水全景 + 楼下顶板）', standard: '至少 2 张，含时间水印', severity: 'normal', kind: 'photo' },
        ],
      },
    ],
  },

  {
    code: 'mason',
    name: '瓦工验收单',
    trade: '瓦工',
    source: '施工服务手册 P19（印刷 18）',
    intro: '部分项目未合格时，在备注栏注明整改项目并约定整改期限，其他工程可继续进行，工期相应延续。',
    signRoles: ['foreman', 'supervisor', 'customer'],
    groups: [
      {
        name: '瓦工分项验收',
        items: [
          { code: 'ma_1', title: '墙地砖铺贴平整，空鼓率符合要求', standard: '空鼓率 ≤5%，1:2.5 砂浆 6-10mm', metric: '空鼓 ≤5%', severity: 'red', kind: 'number', unit: '%' },
          { code: 'ma_2', title: '墙地面花型与拼花正确', standard: '非整砖 ≤2 列且 ≥1/3 砖宽', severity: 'normal' },
          { code: 'ma_3', title: '门窗瓷砖收口平齐', standard: '收口顺直、无崩边', severity: 'normal' },
          { code: 'ma_4', title: '地面找平满足地板/地毯铺设要求', standard: '按地板、地毯厚度确定找平标高；地漏坡度 ≥1%', metric: '坡度 ≥1%', severity: 'normal', kind: 'number', unit: '%' },
          { code: 'ma_5', title: '拍照存档', standard: '每间至少 1 张全景', severity: 'normal', kind: 'photo' },
        ],
      },
    ],
  },

  {
    code: 'wood_concealed',
    name: '木工隐蔽工程验收单',
    trade: '木工',
    source: '施工服务手册 P20（印刷 19）',
    intro: '封板前验收，由设计师与工程监理签字，业主不参与。',
    signRoles: ['designer', 'supervisor'],
    groups: [
      {
        name: '木工隐蔽验收',
        items: [
          { code: 'wc_1', title: '木材、板材已粉刷防火防腐涂料', standard: '所有木制品接触面满刷', severity: 'red' },
          { code: 'wc_2', title: '龙骨间距合理规范', standard: '吊件 ≤300mm，次龙骨 ≤400mm，板中钉距 ≤200mm', metric: '≤300/400/200mm', severity: 'normal', kind: 'number', unit: 'mm' },
          { code: 'wc_3', title: '封板方式正确（立板压平板、回型顶）', standard: '禁止平板压立板', severity: 'normal' },
          { code: 'wc_4', title: '板与板接缝采用 V 型槽对接', standard: '缝隙宽度均匀', severity: 'normal' },
          { code: 'wc_5', title: '拍照存档', standard: '封板前拍龙骨与管线', severity: 'normal', kind: 'photo' },
        ],
      },
    ],
  },

  {
    code: 'wood',
    name: '木工验收单',
    trade: '木工',
    source: '施工服务手册 P21（印刷 20）',
    intro: '木工完工验收，项目经理自检、工程监理自检、业主签字。',
    signRoles: ['foreman', 'supervisor', 'customer'],
    groups: [
      {
        name: '木工分项验收',
        items: [
          { code: 'wo_1', title: '吊顶水平，连接处无明显高低，表面光洁', standard: '2m 靠尺检查', severity: 'normal' },
          { code: 'wo_2', title: '轻钢龙骨隔断墙水平、垂直，封板平整无露钉', standard: '连接处无明显高低', severity: 'normal' },
          { code: 'wo_3', title: '钉距控制在 150-170mm', standard: '防锈钉、钉帽不突出板面', metric: '150-170mm', severity: 'normal', kind: 'number', unit: 'mm' },
          { code: 'wo_4', title: '现场定制家具表面光滑、线条顺直、不露钉帽', standard: '表面无刨削、毛刺', severity: 'normal' },
          { code: 'wo_5', title: '拍照存档', standard: '完工全景 + 细节', severity: 'normal', kind: 'photo' },
        ],
      },
    ],
  },

  {
    code: 'paint_concealed',
    name: '油工隐蔽工程验收单',
    trade: '油工',
    source: '施工服务手册 P22（印刷 21）',
    intro: '刮腻子前验收，由设计师与工程监理签字，业主不参与。',
    signRoles: ['designer', 'supervisor'],
    groups: [
      {
        name: '油工隐蔽验收',
        items: [
          { code: 'pc_1', title: '缝隙连接处已粘贴牛皮纸、网格带或白布', standard: '基层差须满铺玻纤布或钢网', severity: 'red' },
          { code: 'pc_2', title: '所有钉帽已粉刷防锈漆', standard: '不得漏刷', severity: 'red' },
          { code: 'pc_3', title: '表面平整度达到 3mm', standard: '2m 靠尺 + 塞尺检查', metric: '≤3mm', severity: 'normal', kind: 'number', unit: 'mm' },
          { code: 'pc_4', title: '阴阳角垂直偏差不大于 4mm', standard: '2m 靠尺检查', metric: '≤4mm', severity: 'normal', kind: 'number', unit: 'mm' },
        ],
      },
    ],
  },

  {
    code: 'paint',
    name: '油工验收单',
    trade: '油工',
    source: '施工服务手册 P23（印刷 22）',
    intro: '油工完工验收。颜色均匀度与手感为观感项，须 1.5m 正视检查。',
    signRoles: ['foreman', 'supervisor', 'customer'],
    groups: [
      {
        name: '油工分项验收',
        items: [
          { code: 'pa_1', title: '颜色均匀一致，无明显泛碱返色及坠流', standard: '1.5m 正视无明显色差；分色线偏差 2mm/1mm', severity: 'red' },
          { code: 'pa_2', title: '墙面粉刷后手感光滑无毛糙感', standard: '无砂眼、无刷痕', severity: 'normal' },
          { code: 'pa_3', title: '阴阳角顺直', standard: '偏差 ≤4mm', metric: '≤4mm', severity: 'normal', kind: 'number', unit: 'mm' },
          { code: 'pa_4', title: '拍照存档', standard: '每面墙至少 1 张', severity: 'normal', kind: 'photo' },
        ],
      },
    ],
  },

  {
    code: 'image',
    name: '形象工程验收（物品保护）',
    trade: '综合',
    source: '施工服务手册 P7（印刷 6）+ 施工标准手册 P8 形象标准 9 条',
    intro: '开工前形象核验，缺项不得开工。灭火器：面积 >80㎡ 配 2 个 4 升，别墅不少于 3 个。',
    signRoles: ['foreman', 'supervisor'],
    groups: [
      {
        name: '形象与保护',
        items: [
          { code: 'im_1', title: '地固已刷、地面保护膜已铺', standard: '公共区域至入户门', severity: 'normal' },
          { code: 'im_2', title: '窗贴、门贴、水平线已到位', standard: '入户门套保护完整', severity: 'normal' },
          { code: 'im_3', title: '材料码放整齐、分类挂牌', standard: '不得占用公共通道', severity: 'normal' },
          { code: 'im_4', title: '灭火器配备数量符合面积要求', standard: '>80㎡ 配 2 个 4 升，别墅 ≥3 个', metric: '2 个 / ≥3 个', severity: 'red', kind: 'number', unit: '个' },
          { code: 'im_5', title: '临时小便器、专用配电箱已设', standard: '全部工人用电走专用电箱', severity: 'red' },
          { code: 'im_6', title: '展示架、标牌、施工铭牌已挂', standard: '含工期与责任人信息', severity: 'normal' },
          { code: 'im_7', title: '工人穿工服、现场禁烟', standard: '发现吸烟即红线', severity: 'red' },
          { code: 'im_8', title: '工具已做护膜保护', standard: '电动工具绝缘完好', severity: 'normal' },
          { code: 'im_9', title: '电表配电箱、弱电箱已做保护标识', standard: '箱内无杂物', severity: 'normal' },
        ],
      },
    ],
  },

  {
    code: 'main_material',
    name: '主材进场确认单',
    trade: '主材',
    source: '施工服务手册 P26（印刷 25）',
    intro: '主材进场业主必须验收方可施工。按批填写，同一项目可分别做第 1-4 批共 4 张单。',
    signRoles: ['foreman', 'customer'],
    groups: [
      {
        name: '本批进场主材',
        items: [
          { code: 'mm_1', title: '主材品牌、型号、颜色与合同一致', standard: '与订购单逐项核对', severity: 'red' },
          { code: 'mm_2', title: '数量与订购单一致', standard: '含备货损耗', severity: 'normal' },
          { code: 'mm_3', title: '外观无破损、无色差', standard: '同批次同色号', severity: 'red' },
          { code: 'mm_4', title: '规格尺寸与现场预留洞口匹配', standard: '重点核对门、柜、台面', severity: 'normal' },
          { code: 'mm_5', title: '拍照存档（实物 + 包装标签）', standard: '须能看清品牌与型号', severity: 'normal', kind: 'photo' },
        ],
      },
    ],
  },

  {
    code: 'final_rating',
    name: '竣工验收评价表',
    trade: '综合',
    source: '施工服务手册 P25（印刷 24）轻辅竣工 / P27（印刷 26）整体竣工',
    intro: '轻辅竣工按四工种分别评价，整体竣工做总体验收评定。评价结果作为绩效与提佣挂钩依据。',
    signRoles: ['foreman', 'supervisor', 'customer'],
    ratingScale: ['优', '良', '一般'],
    groups: [
      {
        name: '分项评价',
        items: [
          { code: 'fr_1', title: '水电工程', standard: '按本工程施工质量与配合度评价', kind: 'rating' },
          { code: 'fr_2', title: '瓦工工程', standard: '按本工程施工质量与配合度评价', kind: 'rating' },
          { code: 'fr_3', title: '木工工程', standard: '按本工程施工质量与配合度评价', kind: 'rating' },
          { code: 'fr_4', title: '油工工程', standard: '按本工程施工质量与配合度评价', kind: 'rating' },
        ],
      },
      {
        name: '总体评价',
        items: [
          { code: 'fr_5', title: '业主总体验收评定', standard: '优 / 良 / 一般', kind: 'rating' },
          { code: 'fr_6', title: '是否有遗留问题需整改', standard: '如有，须逐条列入整改单并约定完成日期', severity: 'normal' },
        ],
      },
    ],
  },
];

/** 验收类型 code → 模板 */
const TEMPLATE_MAP = SHEET_TEMPLATES.reduce((m, t) => { m[t.code] = t; return m; }, {});

/** 模板内所有条款拍平（含 group / seq），供填单页直接渲染 */
function flattenItems(code) {
  const tpl = TEMPLATE_MAP[code];
  if (!tpl) return [];
  const out = [];
  let seq = 0;
  tpl.groups.forEach((g) => {
    g.items.forEach((it) => {
      seq += 1;
      out.push({
        seq,
        group_name: g.name,
        item_code: it.code,
        title: it.title,
        standard: it.standard || '',
        metric: it.metric || '',
        severity: it.severity || 'normal',
        kind: it.kind || 'check',
        unit: it.unit || '',
      });
    });
  });
  return out;
}

/** 列表页用的精简形态（不含逐项，减小报文） */
function templateSummary() {
  return SHEET_TEMPLATES.map((t) => ({
    code: t.code,
    name: t.name,
    trade: t.trade,
    source: t.source,
    intro: t.intro,
    signRoles: t.signRoles,
    itemCount: flattenItems(t.code).length,
  }));
}

module.exports = { SHEET_TEMPLATES, TEMPLATE_MAP, flattenItems, templateSummary };
