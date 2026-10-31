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
  // ⚠️ 2026-10-31 修复：mine 目录横跨两包（index/signature 在主包，
  // my-logs/my-inspections 在 pkg-misc）。本表下面有 `mine: 'pkg-misc'` 的
  // 目录级映射，若签名页不在此列出，构建期会被误改写成 /pkg-misc/mine/signature，
  // 而 pages.json 实际注册在主包 /pages/mine/signature → 点击必报「页面打开失败」。
  '/pages/mine/signature',
  // 横屏手写签名页：同样在 mine 目录下，同样必须豁免（否则被改写成 pkg-misc）
  '/pages/mine/signature-fs',
  '/pages/projects/list',
  '/pages/inspection/list',
  '/pages/purchase/list',
  // 以下 6 页同属主包，此前漏列。它们所在目录当前没有 PAGE_DIR_TO_PKG 映射，
  // 所以暂时不会被改写；但一旦后续给 identity/customer/agreement 加了分包映射，
  // 就会立刻踩同一个坑。按「主包页面必须全量列出」的语义补齐。
  '/pages/identity/select',
  '/pages/customer/home',
  '/pages/customer/projects',
  '/pages/customer/messages',
  '/pages/customer/mine',
  '/pages/customer/logs',
  '/pages/customer/project-detail',
  '/pages/customer/family',
  '/pages/customer/mall',
  '/pages/customer/mall-cart',
  '/pages/customer/mall-orders',
  '/pages/agreement/service',
  '/pages/agreement/privacy',
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
  // v2.4.1 主材验收：跟 material 同包，现场验收常从台账/采购页跳转，同包免下载
  'material-accept': 'pkg-purchase',
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
