import { createSSRApp } from "vue";
import App from "./App.vue";
import { navBarStyle, navBarStyleCapsule } from "./utils/navbar";

export function createApp() {
  const app = createSSRApp(App);

  // 全局注入两个导航栏计算属性：
  //
  //  navStyle        —— 「状态栏高度 + 12px」，60+ 个普通页面用。
  //                     右侧没有按钮时，胶囊压在空白处，不需要额外处理。
  //
  //  navStyleCapsule —— 「胶囊底边 + 8px」，**仅右侧有操作按钮的页面用**
  //                     （全部已读 / 提交 / + / 🔔 / 设置 / 登录 …）。
  //                     把整条导航内容下移到胶囊下方，按钮才点得上，
  //                     标题照常居中，不会和按钮挤在一起。
  //
  // 为什么不在 CSS 里解决：env(safe-area-inset-top) 在小程序端恒为 0
  // （那是浏览器 viewport-fit=cover 才有的东西），只能靠 JS 动态算。
  // 计算属性是惰性的 —— 没用到的组件不会产生开销。
  app.mixin({
    computed: {
      navStyle(): Record<string, string> {
        return navBarStyle();
      },
      navStyleCapsule(): Record<string, string> {
        return navBarStyleCapsule();
      },
    },
  });

  return {
    app,
  };
}
