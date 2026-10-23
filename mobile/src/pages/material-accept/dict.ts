/**
 * 主材验收 · 字典（H5 / 小程序 / PC 三端口径一致）
 *
 * ⚠️ 放页面目录里而不是 utils/：小程序按「构建产物 require 可达性」判定主包未用文件，
 *    只被分包引用的常量单独留主包会触发微信「主包内不应存在主包未使用的 JS 文件」告警。
 *    改这里请同步：jianyioa-mpweixin/mobile/src/pages/material-accept/dict.ts 与 PC 端 MaterialAcceptance.vue
 */

/** 施工阶段（材料进场跟着工序走） */
export const MA_STAGES = [
  '开工材料进场',
  '水电材料进场',
  '瓦工材料进场',
  '木工材料进场',
  '油漆涂料进场',
  '主材安装进场',
  '竣工前补货',
  '其他',
];

/** 单行结论 */
export const MA_VERDICTS = ['合格', '不合格', '让步接收'];

/** 不合格/让步时可选的问题标签（多选） */
export const MA_PROBLEM_TAGS = [
  '外观破损',
  '色差明显',
  '规格型号不符',
  '数量短缺',
  '无合格证',
  '无检测报告',
  '环保等级不符',
  '尺寸偏差',
  '包装破损',
];

/** 随货资料（多选，"无"与其他互斥） */
export const MA_DOCS = ['合格证', '检测报告', '环保检测报告', '保修卡', '送货单', '说明书', '无'];

/** 堆放与保护 */
export const MA_STORAGE = ['室内指定材料区', '室内待安装区', '室外覆盖堆放', '临时堆放待整理', '不涉及'];

/** 整体验收结论 */
export const MA_RESULTS = [
  '全部合格，同意进场',
  '部分合格，合格品进场',
  '全部不合格，退场',
  '让步接收（降级使用）',
  '待复检',
];

/** 不合格处理方式 */
export const MA_HANDLINGS = ['退货换货', '降级使用', '现场整改', '报备甲方与设计', '不涉及'];

/** 结论配色（列表/详情 pill） */
export function resultTone(result = '') {
  if (result.indexOf('全部合格') === 0) return 'pass';
  if (result.indexOf('全部不合格') === 0) return 'fail';
  if (result.indexOf('部分合格') >= 0) return 'warn';
  if (result.indexOf('让步') >= 0) return 'warn';
  return 'info';
}

/** 单行结论配色 */
export function verdictTone(verdict = '') {
  if (verdict === '合格') return 'pass';
  if (verdict === '不合格') return 'fail';
  if (verdict === '让步接收') return 'warn';
  return 'info';
}

/** 安全解析后端返回的 JSON 字符串字段（terms/photos 都可能是字符串或已解析数组） */
export function parseArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x) => x != null && String(x).trim() !== '');
  if (typeof v === 'string') {
    let s = v;
    try { s = JSON.parse(s); } catch { return s ? [s] : []; }
    if (typeof s === 'string') {
      try { s = JSON.parse(s); } catch { return s ? [s] : []; }
    }
    return Array.isArray(s) ? s.filter((x) => x != null && String(x).trim() !== '') : [];
  }
  return [];
}

/** 今天日期 YYYY-MM-DD（iOS 不认 2026-10-23 10:00，统一只取日期段） */
export function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
