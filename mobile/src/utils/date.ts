/**
 * 跨端安全的日期解析
 *
 * 背景：后端返回的时间字符串是 `YYYY-MM-DD HH:mm:ss`（MySQL DATETIME 原样）。
 * Chrome / Android 的 `new Date()` 能解析，但 **iOS 的 JavaScriptCore 不行** ——
 * 它只认 `yyyy/MM/dd`、`yyyy/MM/dd HH:mm:ss`、`yyyy-MM-dd`、
 * `yyyy-MM-ddTHH:mm:ss`、`yyyy-MM-ddTHH:mm:ss+HH:mm` 这几种格式。
 * 传 `2026-10-12 11:38:06` 会得到 Invalid Date，开发者工具报：
 *   new Date("2026-10-12 11:38:06") 在部分 iOS 下无法正常使用
 *
 * 处理：把日期部分的 `-` 换成 `/` 再解析（与项目里既有的
 * `new Date(str.replace(/-/g, '/'))` 写法保持一致）。
 * 已经带 `T` 的 ISO 8601 串（含时区）iOS 原生支持，原样交给 Date，避免误伤 `+08:00` 里的 `-`。
 */
export function toDate(input: any): Date {
  if (input instanceof Date) return input;
  if (input === null || input === undefined || input === '') return new Date(NaN);
  if (typeof input === 'number') return new Date(input);

  const s = String(input).trim();
  // ISO 8601（2026-10-12T11:38:06 / 带 Z 或 +08:00）iOS 原生支持
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s);

  // 其余情况统一把 `-` 换成 `/`：2026-10-12 11:38:06 → 2026/10/12 11:38:06
  return new Date(s.replace(/-/g, '/'));
}

/** 解析失败返回 true，用于兜底展示原始字符串 */
export function isInvalidDate(d: Date): boolean {
  return !(d instanceof Date) || isNaN(d.getTime());
}

/** 相对时间：刚刚 / x分钟前 / x小时前 / x天前，超过 7 天返回空串由调用方决定 */
export function timeAgo(input: any): string {
  const d = toDate(input);
  if (isInvalidDate(d)) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  return '';
}
