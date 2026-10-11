# 建亿 OA · 本地运行说明（本机部署于 2026-10-11）

## 当前状态

| 项 | 状态 |
|---|---|
| 后端 3002 | ✅ 运行中（API + PC 前端 + 移动端 H5 托管） |
| PC 管理后台 | ✅ http://127.0.0.1:3002/ （生产构建） |
| PC 前端 dev | ✅ http://127.0.0.1:5555/ （热更新开发模式） |
| 移动端 H5 生产 | ✅ http://127.0.0.1:3002/m/ |
| 移动端 H5 dev | ✅ http://127.0.0.1:10086/m/ （热更新开发模式） |
| 数据库 | ✅ 远程生产库 116.204.19.53:3306/jianyioa（已加本机 IP 白名单） |
| FRP 外网穿透 | ✅ 已安装（v0.61.1 @ `~/bin/frpc`）+ 开机自启 + PM2 托管（jianyioa-frpc） |
| PM2 看门狗 | ✅ 4 进程 online（backend / frontend / mobile / frpc）+ launchd 开机自启 |

## 端口总表

### 本机端口（PM2 托管）

| 端口 | PM2 进程名 | 服务 | 访问 |
|---|---|---|---|
| **3002** | jianyioa-backend | Node 后端（API + 托管 web/dist + 移动端生产构建 /m/） | http://127.0.0.1:3002/ |
| **5555** | jianyioa-frontend | PC 前端 Vite dev（热更新） | http://127.0.0.1:5555/ |
| **10086** | jianyioa-mobile | 移动端 uni dev:h5（热更新，自动 302 → /m/） | http://127.0.0.1:10086/m/ |

### FRP 外网端口（其他设备经 116.204.19.53 访问，需 frpc 运行）

| 外网端口 | 穿透到 | 用途 |
|---|---|---|
| 7002 | 本机 3002 | 外网访问后端 API |
| 7780 | 本机 3002 | 外网访问移动端生产构建 |
| 7779 | 本机 10086 | 外网访问移动端 dev |
| 35189 | 本机 5555 | 外网访问 PC dev |
| 13306 | 本机/服务器 3306 | 外网连 MySQL（仅调试） |

## PM2 看门狗管理（重要）

✅ PM2 已配置（v7.0.4，全局装在 nvm 下）：
- 配置文件：`~/Desktop/jianyioa-system/ecosystem.config.js`（绝对路径版）
- 看门狗进程：4 个（backend / frontend / mobile / frpc）
- 开机自启：macOS launchd 通过 `~/Library/LaunchAgents/com.PM2.plist` + `pm2 resurrect`
- 一键脚本：`bash ~/Desktop/jianyioa-system/start-pm2.sh {install|start|stop|restart|status|logs|save|startup}`

注：ecosystem.config.js 里的 `jianyioa-frpc` 条目检测 `~/bin/frpc` 是否存在，
不存在就自动 skip（`enabled=false`）。装 frpc：`bash ~/Desktop/jianyioa-system/install-frpc.sh`

```bash
# 常用命令速查
pm2 ls                        # 状态列表
pm2 logs jianyioa-backend     # 看后端日志
pm2 restart jianyioa-backend  # 重启某个服务
pm2 stop all                  # 全停
pm2 save                      # 固化进程列表
```

## 日常启动 / 停止

```bash
# 启动（后台）
cd ~/Desktop/jianyioa-system/server
nohup node server.js > /tmp/jianyioa-api.log 2>&1 &

# 停止
lsof -nP -iTCP:3002 -sTCP:LISTEN   # 找到 PID
kill <PID>

# 查日志
tail -f /tmp/jianyioa-api.log
```

## 改代码后的更新流程

- 改 `web/src/*` → `cd web && npm run build`（3002 无需重启，自动加载新 dist）
- 改 `server/server.js` → 重启后端进程
- PDF 导出（puppeteer）：本机未下载 Chromium，此功能不可用。如需要：
  `cd server && npx puppeteer browsers install chrome`

## 已知限制 / 注意事项

1. **移动端代码源**：本地 `jianyioa-app/mobile/` 来自 GitHub `jianyioa-system` 仓库的 **`mobile` 分支**（与 main 并列的真实分支，**不是 submodule**），HEAD = `351b7a0b` (v2.3.0 mobile)。
   ⚠️ 注意：**远端 mobile 分支路径是 `mobile/`，本地组织路径是 `jianyioa-app/mobile/`**（多嵌一层）。
   同步方法：`git fetch origin mobile` 然后用 rsync / cp 对比两个目录。
   
   更新流程（生产构建）：`cd jianyioa-app/mobile && npm run build:h5`，然后
   `cp -R dist/build/h5/. ../../server/public-mobile-h5/`（3002 无需重启）。
   移动端 dev：`cd jianyioa-app/mobile && npm run dev:h5`（端口 10086）。
2. **连的是生产库**：本机所有写操作直接落在生产数据上，谨慎操作。
3. **家宽 IP 会变**：如果哪天连不上数据库报 `Host 'x.x.x.x' not allowed`，
   是你本机出口 IP 变了，去宝塔把 `jianyioa` 库的白名单更新成新 IP。
4. **admin 密码**：见生产库 `employees` 表（本仓库 init.sql 未含该账号初始数据）。
5. **Node 用 nvm**：`/Users/gtamer/.nvm/versions/node/v24.21.0/`，pm2 全局装在 nvm bin 下；PATH 默认不含 nvm，启动脚本里要 `export NVM_DIR=... && \. $NVM_DIR/nvm.sh`。
6. **frpc 装在 `~/bin/frpc`**（不是 `/usr/local/bin/frpc`），已经加进 `~/.zshrc` PATH。
7. **AI 沙箱注意**：后台进程在沙箱里跑能跑但会话结束会被回收。要服务真正在你 Mac 上跑，必须在**你自己的终端**跑启动命令（参考 `start-pm2.sh install`）。
