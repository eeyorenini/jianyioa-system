'use strict';
/**
 * 轻量解析工具
 * ---------------------------------------------------------------
 * 从 server.js 抽出的零依赖纯函数模块（2026-10-29，渐进拆分第 4 步）。
 *
 * 依赖：无。不碰数据库、不碰 req/res。
 */

/**
 * 从 HTML 正文里抽出所有 /uploads/ 下的本地文件路径（去重）。
 *
 * 用途：删除合同时清理孤儿文件。原逻辑只删数据库行，content 里的 base64 图片
 * 随行消失，但 /uploads/ 下的真实文件没人清，长期堆积。
 *
 * ⚠️ 调用方还要再确认「没有其他合同在用这张图」才能真删——见 cleanupContractFiles，
 *    不能拿这个函数的返回值直接删文件。
 */
function extractUploadPaths(html) {
  if (!html || typeof html !== 'string') return [];
  const m = html.match(/\/uploads\/[A-Za-z0-9_\-\/\.]+\.(?:jpg|jpeg|png|gif|webp|bmp|pdf|doc|docx)/gi) || [];
  return [...new Set(m)];
}

/**
 * 把「数组 / 逗号分隔字符串 / 单个值」统一解析成整数数组。
 * 非法项（NaN）直接丢弃。主材的多选字段（品类、品牌、系列）用它。
 */
function mmParseIds(v) {
  if (v == null || v === '') return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return arr.map(x => parseInt(x, 10)).filter(n => Number.isFinite(n));
}

module.exports = {
  extractUploadPaths,
  mmParseIds,
};
