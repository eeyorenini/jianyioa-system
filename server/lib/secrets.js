'use strict';
/**
 * 系统设置敏感字段打码
 * ---------------------------------------------------------------
 * 从 server.js 抽出的零依赖纯函数模块（2026-10-29，渐进拆分第 1 步）。
 *
 * 口径：敏感字段读取时一律打码，只回末 4 位；前端留空（或原样回传打码串）
 *       视为「不修改」，保留库中原值。
 *
 * 依赖：无。不碰数据库、不碰 req/res，纯字符串处理。
 * 故障影响面：只影响 system_settings 的读取与保存，不影响其他模块。
 */

// 需要打码的字段名（按 key 匹配，大小写敏感）
const SETTINGS_SECRET_KEYS = [
  'access_key_secret',
  'app_secret',
  'smtp_password',
  'aes_key',
  'token',
  'secret',
];

function maskSecretValue(v) {
  if (typeof v !== 'string' || v === '') return v;
  if (v.length <= 4) return '****';
  return '****' + v.slice(-4);
}

// 递归打码：对象/数组都能处理，非字符串值原样返回
function maskSettingsSecrets(input) {
  if (Array.isArray(input)) return input.map(maskSettingsSecrets);
  if (!input || typeof input !== 'object') return input;
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string' && SETTINGS_SECRET_KEYS.includes(k)) {
      out[k] = maskSecretValue(v);
    } else if (v && typeof v === 'object') {
      out[k] = maskSettingsSecrets(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// 空值或仍是打码串 → 视为「不修改」
function isMaskedOrEmpty(v) {
  return v === undefined || v === null || v === '' ||
    (typeof v === 'string' && v.startsWith('****'));
}

module.exports = {
  SETTINGS_SECRET_KEYS,
  maskSecretValue,
  maskSettingsSecrets,
  isMaskedOrEmpty,
};
