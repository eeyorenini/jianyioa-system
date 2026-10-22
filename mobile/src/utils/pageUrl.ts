/**
 * 页面路径归一化（跨端统一入口）
 *
 * 背景：小程序自 v2.4.3 起拆了 5 个分包，页面真实路径是 `/pkg-xxx/yyy`；
 * H5 / App 没有分包，路径仍是 `/pages/yyy`。
 *
 * 为了业务代码两端完全一致，约定：**源码统一写 `/pages/yyy`**。
 *   - 源码里写死的跳转 → 小程序由 vite 插件在构建期改写（见 vite.config.ts）
 *   - 后端接口运行期返回的 url → 用本文件的 resolvePageUrl 在运行期改写
 *
 * 本函数在小程序端做映射，H5 / App 端原样返回（条件编译剔除映射逻辑）。
 *
 * ⚠️ 本文件与 utils/pageMap.ts 两端必须保持完全一致。
 */

import { mapToSubPackage, TAB_BAR_PAGES } from './pageMap'

/**
 * 把 `/pages/a/b` 归一化成当前平台可用的路径。
 * 小程序 → `/pkg-x/a/b`；H5 / App → 原样返回。
 */
export function resolvePageUrl(url?: string | null): string {
  if (!url) return ''
  const raw = String(url)
  // #ifdef MP-WEIXIN
  const mapped = mapToSubPackage(raw)
  if (mapped) return mapped
  // #endif
  return raw
}

/** 该页面是否为原生 tabBar 页（决定用 switchTab 还是 navigateTo） */
export function isTabBarPage(url?: string | null): boolean {
  if (!url) return false
  const path = String(url).split('?')[0]
  return TAB_BAR_PAGES.indexOf(path) !== -1
}
