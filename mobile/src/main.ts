import { createSSRApp } from "vue";
import App from "./App.vue";
import { navBarStyle } from "./utils/navbar";

export function createApp() {
  const app = createSSRApp(App);

  // 全局注入 navStyle 计算属性。
  // 所有页面的自定义导航栏（.nav-bar）都能直接写 :style="navStyle" 拿到
  // 「状态栏高度 + 12px」的 padding-top，从而不被刘海/时间压住。
  //
  // 为什么不在 CSS 里解决：env(safe-area-inset-top) 在小程序端恒为 0
  // （那是浏览器 viewport-fit=cover 才有的东西），只能靠 JS 动态算。
  // 计算属性是惰性的 —— 没用到的组件不会产生开销。
  app.mixin({
    computed: {
      navStyle(): Record<string, string> {
        return navBarStyle();
      },
    },
  });

  return {
    app,
  };
}
