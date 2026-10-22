/**
 * 页面路径映射表（两端共用，纯数据，无副作用）
 *
 * 用途：小程序拆了 5 个分包，页面真实路径是 `/pkg-xxx/yyy`；
 * 而 H5 / App 没有分包，路径是 `/pages/yyy`。
 *
 * 为了「源码两端完全一致」，约定：
 *   - **业务代码统一写 `/pages/yyy`**
 *   - 小程序构建时由 vite 插件（见 vite.config.ts 的 subpackagePaths）自动改写成 `/pkg-xxx/yyy`
 *   - 后端接口在运行期返回的 url（不进构建流程）由 utils/pageUrl.ts 的 resolvePageUrl 做同样映射
 *
 * ⚠️ 本文件两端必须保持完全一致。新增页面时先改这里（如果需要进分包），再改 pages.json。
 */

/** 主包页面：分包后路径未变，构建期与运行期都不能映射 */
export const MAIN_PAGES = [
  '/pages/landing/index',
  '/pages/showcase/index',
  '/pages/login/login',
  '/pages/bind/index',
  '/pages/bind/phone',
  '/pages/bind/scan',
  '/pages/home/index',
  '/pages/mine/index',
  '/pages/projects/list',
  '/pages/inspection/list',
  '/pages/purchase/list',
  '/pages/customer/home',
  '/pages/customer/projects',
  '/pages/customer/messages',
  '/pages/customer/mine',
  '/pages/customer/logs',
  '/pages/customer/project-detail',
  '/pages/customer/family',
]

/** 首段目录 → 分包 root（须与 pages.json 的 subPackages.root 一致） */
export const PAGE_DIR_TO_PKG: Record<string, string> = {
  projects: 'pkg-project',
  inspection: 'pkg-inspect',
  dispatch: 'pkg-inspect',
  acceptance: 'pkg-inspect',
  change: 'pkg-inspect',
  purchase: 'pkg-purchase',
  material: 'pkg-purchase',
  finance: 'pkg-finance',
  contract: 'pkg-finance',
  contracts: 'pkg-finance',
  report: 'pkg-finance',
  approval: 'pkg-misc',
  message: 'pkg-misc',
  mine: 'pkg-misc',
  notices: 'pkg-misc',
  addressbook: 'pkg-misc',
  customers: 'pkg-misc',
  settings: 'pkg-misc',
  files: 'pkg-misc',
  gallery: 'pkg-misc',
  todo: 'pkg-misc',
}

/** tabBar 原生页面：只能 switchTab，且不能带 query */
export const TAB_BAR_PAGES = [
  '/pages/home/index',
  '/pages/projects/list',
  '/pages/inspection/list',
  '/pages/purchase/list',
  '/pages/mine/index',
]

/**
 * 把 `/pages/<dir>/<rest>` 映射成分包路径。
 * 主包页面、非 /pages/ 开头、未知目录 → 返回 null（调用方保持原样）。
 */
export function mapToSubPackage(url: string): string | null {
  if (!url || !url.startsWith('/pages/')) return null
  const path = url.split('?')[0]
  if (MAIN_PAGES.indexOf(path) !== -1) return null
  const segs = path.split('/') // ['', 'pages', dir, ...rest]
  const dir = segs[2]
  if (!dir) return null
  const pkg = PAGE_DIR_TO_PKG[dir]
  if (!pkg) return null
  const rest = segs.slice(3).join('/')
  const mapped = `/${pkg}/${dir}${rest ? '/' + rest : ''}`
  return mapped + url.slice(path.length)
}
