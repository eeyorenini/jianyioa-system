import { defineConfig } from "vite";
import type { Plugin } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAIN_PAGES, PAGE_DIR_TO_PKG } from "./src/utils/pageMap";

// 版本号单一来源：package.json 的 version。
// 构建时注入为全局常量 __APP_VERSION__，页面里直接引用即可，
// 避免以后发版时手写版本号与 package.json 漂移。
const pkg = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf-8")
) as { version?: string };

// ============================================================
// 分包路径自动改写（2026-10-22）
//
// 为什么要做：小程序拆了 5 个分包，页面真实路径是 /pkg-xxx/yyy，
// 而 H5 / App 没有分包，路径是 /pages/yyy。如果业务代码按平台各写一套，
// 两端源码就会漂移（之前就是这样：小程序 /pkg-、H5 /pages/，改一边漏一边）。
//
// 约定：**源码统一写 /pages/yyy**，只有小程序构建时在这里自动改写成分包路径。
// 这样业务代码两端逐行一致，导出 App 时直接用 H5 那份源码即可。
//
// 运行期由后端返回的 url 不经过构建，走 utils/pageUrl.ts 的 resolvePageUrl。
// 映射表与 utils/pageMap.ts 共用，不重复维护。
// ============================================================
function subpackagePaths(): Plugin {
  const MAIN = new Set(MAIN_PAGES);
  // 只匹配「引号/反引号紧跟 /pages/」的形式，避免误伤 URL 或注释里的普通文本
  const RE = /(['"`])\/pages\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_/-]+)/g;
  return {
    name: "jianyioa-subpackage-paths",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0];
      if (!/\.(vue|ts|js)$/.test(file)) return null;
      if (file.includes("node_modules")) return null;
      let hit = false;
      const out = code.replace(RE, (m, quote: string, dir: string, rest: string) => {
        if (MAIN.has(`/pages/${dir}/${rest}`)) return m;
        const pkgRoot = PAGE_DIR_TO_PKG[dir];
        if (!pkgRoot) return m;
        hit = true;
        return `${quote}/${pkgRoot}/${dir}/${rest}`;
      });
      return hit ? { code: out, map: null } : null;
    },
  };
}

// 仅小程序端需要分包改写；H5 / App 保持 /pages/yyy 不变
const IS_MP_WEIXIN = process.env.UNI_PLATFORM === "mp-weixin";

export default defineConfig({
  plugins: [uni(), ...(IS_MP_WEIXIN ? [subpackagePaths()] : [])],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || "0.0.0"),
  },
  // 关键修复：uni-h5 的 manifest.json 设了 h5.router.base = "/m/"，
  // dev 模式也走这套路由前缀。但 vite 默认从 10086 根路径起服务，
  // 不加这个 rewrite 用户访问 http://localhost:10086/ 会 404，
  // 访问 /m/ 才会显示空壳。需要让 vite 把 /m/* 重写到根，
  // 让 uni 自己接管路由。
  base: "/m/",
  server: {
    port: 10086,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: "localhost",
      },
      "/uploads": {
        target: "http://localhost:3002",
        changeOrigin: true,
      },
      // tabBar 图标：pages.json 里是相对路径 'static/tab-home.png'，
      // uni-h5 dev 模式下 getRealPath() 会拼成 '/static/...'。这里 proxy 到 3002 的 /static 路由，
      // 3002 端有别名指向移动端产物 static（见 server.js）。
      "/static": {
        target: "http://localhost:3002",
        changeOrigin: true,
      },
      // 由于 base=/m/，uni-app 发出的 /uploads/* 与 /static/* 实际是 /m/uploads/* /m/static/*。
      // vite proxy 是绝对前缀匹配，不匹配带 /m 的路径——加一对 rewrite 把 /m 前缀剥掉。
      "/m/uploads": {
        target: "http://localhost:3002",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/m/, ''),
      },
      "/m/static": {
        target: "http://localhost:3002",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/m/, ''),
      },
    },
  },
});

