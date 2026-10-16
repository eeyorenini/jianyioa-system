/**
 * 顶部导航栏安全区（状态栏）适配
 *
 * 背景：
 *  - 本项目所有页面都用了 `navigationStyle: custom`（自定义导航栏），页面会**全屏**渲染，
 *    内容从屏幕最顶部开始，必须自己给状态栏留出高度。
 *  - 原先全项目统一写的是 `padding-top: max(12px, env(safe-area-inset-top))`。
 *    但 **`env(safe-area-inset-*)` 只在浏览器里有效**（需要 viewport-fit=cover），
 *    微信小程序 / App 的 WebView 里它**恒为 0**，于是实际 padding 只有 12px，
 *    远小于 iPhone 刘海屏的状态栏高度（约 44~59px）→ 标题、消息图标被时间和刘海压住。
 *  - 小程序里拿状态栏高度只能靠 `uni.getWindowInfo().statusBarHeight`，
 *    再以内联 style 的方式作用到 `.nav-bar` 上。
 *
 * 用法：全局 mixin 已提供 `navStyle` 计算属性，模板里直接写
 *   <view class="nav-bar" :style="navStyle">
 * H5 端返回空对象，不覆盖 CSS 里的 env() 写法，两端各走各的。
 */

let cachedHeight = -1;

/** 状态栏高度（px）。小程序/App 返回真实值；H5 恒返回 0（H5 交给 CSS 的 env()） */
export function getStatusBarHeight(): number {
  if (cachedHeight >= 0) return cachedHeight;

  let h = 0;

  // #ifndef H5
  try {
    // 优先用新 API。
    // wx.getSystemInfoSync 已被微信官方标记 deprecated，直接调它会在开发者工具里
    // 刷出 "getSystemInfoSync is deprecated" 警告；状态栏高度在 wx.getWindowInfo() 里
    // （基础库 2.20.1+ 提供）。uni 运行时自身也是「新 API 优先、旧 API 兜底」的写法。
    const u = uni as unknown as {
      getWindowInfo?: () => { statusBarHeight?: number };
    };
    const info =
      typeof u.getWindowInfo === 'function' ? u.getWindowInfo() : uni.getSystemInfoSync();
    h = (info && info.statusBarHeight) || 0;
  } catch (_) {
    h = 0;
  }
  // #endif

  cachedHeight = h;
  return cachedHeight;
}

/**
 * `.nav-bar` 的额外内联样式。
 * - 小程序 / App：`{ paddingTop: '状态栏高度 + 12px' }`，覆盖 CSS 里的 12px
 * - H5：返回 `{}`（空对象），保留 CSS 的 `max(12px, env(safe-area-inset-top))`
 */
export function navBarStyle(): Record<string, string> {
  const h = getStatusBarHeight();
  if (!h) return {};
  return { paddingTop: `${h + 12}px` };
}

/** 状态栏 + 导航栏总高度（px），供需要做吸顶偏移的页面用 */
export function navBarTotalHeight(navBarContentHeight = 44): number {
  return getStatusBarHeight() + navBarContentHeight;
}
