import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 版本号单一来源：package.json 的 version。
// 构建时注入为全局常量 __APP_VERSION__，页面里直接引用即可，
// 避免以后发版时手写版本号与 package.json 漂移。
const pkg = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf-8")
) as { version?: string };

export default defineConfig({
  plugins: [uni()],
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

