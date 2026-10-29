'use strict';
/**
 * 手机号与初始密码
 * ---------------------------------------------------------------
 * 从 server.js 抽出的零依赖纯函数模块（2026-10-29，渐进拆分第 2 步）。
 *
 * ⚠️ 业务约定（不要随手改）：
 *   · normalizePhone 只保留数字并取最后 11 位 —— 兼容「+86 137xxxx」这类输入
 *   · isPhone 只认 1[3-9] 开头的 11 位，虚拟号段（170/171）在 3-9 范围内，可通过
 *   · passwordFromPhone 取电话后 6 位作为初始密码；电话为空时兜底 '123456'
 *     （员工新建时用，改这里等于改所有新员工的初始密码）
 *
 * 依赖：无。不碰数据库、不碰 req/res。
 */

/** 归一化手机号：去除非数字，取末 11 位 */
const normalizePhone = (p) => String(p || '').replace(/[^\d]/g, '').slice(-11);

/** 是否中国大陆手机号 */
const isPhone = (p) => /^1[3-9]\d{9}$/.test(p);

/** 初始密码 = 手机号后 6 位；无手机号时用 123456 */
function passwordFromPhone(phone) {
  return phone ? phone.slice(-6) : '123456';
}

/**
 * 生成 6 位随机数字密码
 * ⚠️ 目前 server.js 里没有调用点（2026-10-29 扫描确认），保留是为了不改变行为。
 *    后续若要清理可直接删掉本函数。
 */
function generateRandomPassword() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = {
  normalizePhone,
  isPhone,
  passwordFromPhone,
  generateRandomPassword,
};
