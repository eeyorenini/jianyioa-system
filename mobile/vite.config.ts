import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

export default defineConfig({
  plugins: [uni()],
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
