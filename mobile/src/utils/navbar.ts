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
 * 微信右上角胶囊（···）的矩形，用于**垂直避让**。
 *
 * 背景（2026-10-26 修正）：胶囊是原生绘制的，永远压在最右上角。
 * 一开始尝试左右避让（padding-right 把内容挤到胶囊左边），结果是标题被挤、
 * 和「全部已读」叠在一起，很难看 —— 已废弃。
 * 正解是**把整条导航内容下移到胶囊下方**：padding-top 取胶囊底边 + 8px，
 * 内容行自然落在胶囊下方，标题照常居中、按钮照常在右，互不干扰。
 *
 * 各机型胶囊位置不同（iPhone 13：top 51 / bottom 83 / 状态栏 47），只能运行时取。
 * 注意 bottom 在部分基础库上可能缺，用 top + height 兜底。
 */
type CapsuleRect = { top: number; bottom: number; left: number; width: number };

let cachedCapsuleRect: CapsuleRect | null | undefined;

function readCapsuleRect(): CapsuleRect | null {
  if (cachedCapsuleRect !== undefined) return cachedCapsuleRect;
  cachedCapsuleRect = null;

  // #ifdef MP-WEIXIN
  try {
    const u = uni as unknown as {
      getMenuButtonBoundingClientRect?: () => {
        top?: number;
        bottom?: number;
        left?: number;
        width?: number;
        height?: number;
      };
    };
    const r =
      typeof u.getMenuButtonBoundingClientRect === 'function'
        ? u.getMenuButtonBoundingClientRect()
        : null;
    if (r && r.height) {
      const top = r.top || 0;
      cachedCapsuleRect = {
        top,
        bottom: r.bottom || top + (r.height as number),
        left: r.left || 0,
        width: r.width || 0,
      };
    }
  } catch (_) {
    cachedCapsuleRect = null;
  }
  // #endif

  return cachedCapsuleRect;
}

/**
 * `.nav-bar` 的额外内联样式（**默认版**，60+ 个普通页面用）。
 * 只补状态栏高度，内容与胶囊在同一水平线上。
 * 右侧没有操作按钮的页面用这个就够 —— 胶囊压在右边空白处，不影响任何东西。
 *
 * - 小程序 / App：`{ paddingTop: 状态栏高度 + 12px }`
 * - H5：返回 `{}`（空对象），保留 CSS 的 `max(12px, env(safe-area-inset-top))`
 */
export function navBarStyle(): Record<string, string> {
  const style: Record<string, string> = {};
  const h = getStatusBarHeight();
  if (h) style.paddingTop = `${h + 12}px`;
  return style;
}

/**
 * `.nav-bar` 的额外内联样式（**加高版**，仅右侧有操作按钮的页面用）。
 *
 * 为什么要加高：胶囊（···）占了右上角，右侧的「全部已读」「提交」「+」「🔔」
 * 这些按钮跟它处在同一水平线上 → 被原生胶囊盖住，点不上。
 * 把整条导航内容下移到胶囊**下方**（padding-top = 胶囊底边 + 8px），
 * 按钮就露出来了，标题照常 flex 居中、按钮照常在右，两者不会挤在一起。
 *
 * ⚠️ 不要改成"左右避让"（padding-right）—— 试过，标题会被挤得和按钮重叠。
 *
 * - 小程序（有胶囊）：`{ paddingTop: 胶囊底边 + 8px }`
 * - 取不到胶囊 / H5：退回 `navBarStyle()`
 */
export function navBarStyleCapsule(): Record<string, string> {
  const capsule = readCapsuleRect();
  if (capsule) return { paddingTop: `${capsule.bottom + 8}px` };
  return navBarStyle();
}

/** 状态栏 + 导航栏总高度（px），供需要做吸顶偏移的页面用 */
export function navBarTotalHeight(navBarContentHeight = 44): number {
  const capsule = readCapsuleRect();
  if (capsule) return capsule.bottom + 8 + navBarContentHeight;
  return getStatusBarHeight() + navBarContentHeight;
}
