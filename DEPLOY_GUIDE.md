# 建亿OA 系统部署指南（v2.3.0）

> 本文档面向**部署到新机器**或**从 GitHub 拉代码完整部署**。覆盖 PC 端、移动端、数据库、FRP 内网穿透。

---

## 一、GitHub 仓库

```
HTTPS:  https://github.com/eeyorenini/jianyioa-system.git
SSH:    git@github.com:eeyorenini/jianyioa-system.git
分支:
  - main    (PC 后端 + PC 前端 + 文档)
  - mobile (移动端 H5 + 小程序 + App 三端通用)
```

**克隆（main 分支装 PC 端，mobile 分支装移动端）**：

```bash
# 1. 拉 PC 端（main 分支）
git clone https://github.com/eeyorenini/jianyioa-system.git
cd jianyioa-system
git checkout main   # 默认就在 main

# 2. 拉移动端（mobile 分支）到 jianyioa-app/mobile/
git clone -b mobile https://github.com/eeyorenini/jianyioa-system.git /tmp/jianyioa-mobile
mkdir -p jianyioa-app
cp -R /tmp/jianyioa-mobile/mobile jianyioa-app/mobile
# （远端 mobile 分支的源码在 mobile/ 根目录；本地组织路径是 jianyioa-app/mobile/）
```

---

## 二、端口与入口（当前线上实例，**所有 v2.3.x 都要这么列**）

| 端口        | 进程 / 服务                          | 用途                                      | 谁访问        |
| --------- | -------------------------------- | --------------------------------------- | ---------- |
| **3002**  | `node server/server.js`          | 后端 API + 托管 PC 前端生产构建 + 托管移动端生产构建 `/m/` | 内网         |
| **10086** | `npm run dev:h5`（uni/Vite dev）   | 移动端开发模式（带 HMR）                          | 开发调试       |
| **7779**  | FRP → 本机 10086                   | **外网访问移动端 dev**                         | 测试者浏览器     |
| **7780**  | FRP → 本机 3002                    | **外网访问移动端生产构建**（**必须带 `/m/`**，见下方说明）  | 生产环境用户     |
| **7002**  | FRP → 本机 3002                    | **外网访问后端 API**（推荐调试用，绕过域名反代）          | 调试/直接打 API |
| **35189** | FRP → 本机 5555                    | PC 前端 dev (Vite dev 5555)               | 开发调试（备用）   |
| ~~13306~~ | ~~FRP → 本机 3306~~                  | **已禁用**（MySQL 不再暴露到外网，安全考虑）          | —          |

> **⚠️ 7780 必须带 `/m/` 路径**：v2.3.2 起 `mobile_h5_prod` 用 `type = tcp`（不是 http+vhost），不能做路径重写，所以访问 `http://116.204.19.53:7780/` 会落到 3002 根路由（PC 后台 SPA fallback），**外网要看移动端必须访问 `/m/`**。给外人发链接用 `http://116.204.19.53:7780/m/`。

**入口 URL 总览**：

| 类型             | 本机                            | 外网                                              |
| -------------- | ----------------------------- | ----------------------------------------------- |
| PC 管理后台        | `http://127.0.0.1:3002/`      | `https://erp.fujinwanjia.com`（Apache 反代 3001，**当前打到服务器老代码**，见 §11 部署策略说明） |
| PC API         | `http://127.0.0.1:3002/api/*` | `https://erp.fujinwanjia.com/api/*`（**当前打到 3001 老服务**，见 §11）|
| 移动端生产构建（推荐）    | `http://127.0.0.1:3002/m/`    | `http://116.204.19.53:7780/m/`（**必须带 /m/**）         |
| 移动端 dev（带 HMR） | `http://127.0.0.1:10086/m/`   | `http://116.204.19.53:7779/`                       |
| MySQL          | `127.0.0.1:3306`              | **不再外露**（13306 已禁用）                              |

---

## 三、数据库（MySQL）

```
HOST:     116.204.19.53:3306  (生产)
USER:     jianyioa
PASSWORD: zpfbAsxyA76P2ZHw  (生产环境主密码)
DB_NAME:  jianyioa
POOL:     10
```

**初始化脚本**：`server/init.sql`（46 张表，含示例数据）

**导入**（在能连到 MySQL 的机器上）：

```bash
mysql -h 116.204.19.53 -u jianyioa -p jianyioa < server/init.sql
```

> **新机器部署**：建议先在宝塔面板建好同名库 `jianyioa`（字符集 `utf8mb4` / 排序规则 `utf8mb4_unicode_ci`），再导 SQL。

---

## 四、FRP 客户端配置

**两处**都需要正确配置：

### 4.1 仓库根 `frpc.ini`（标准版）

```ini
[common]
server_addr = 116.204.19.53
server_port = 7000
token = 123456

[oa_system_backend]
type = tcp
local_ip = 127.0.0.1
local_port = 3002
remote_port = 33001

[oa_system_frontend]
type = tcp
local_ip = 127.0.0.1
local_port = 5555
remote_port = 35189

[oa_system_mobile]
type = tcp
local_ip = 127.0.0.1
local_port = 10086
remote_port = 7777
```

### 4.2 移动端 `jianyioa-app/mobile/frpc.ini`（**实际生效的 FRP 客户端配置**）

> **根目录的 `frpc.ini` 已在 v2.3.2 删除**——那是历史残留（remote 端口 33001/35189/7777，跟实际对不上），PM2 跑的是这份 `mobile/frpc.ini`，**所有新机器部署只用这一份**。

```ini
[common]
server_addr = 116.204.19.53
server_port = 7000
token = 123456

# 移动端 dev（带 HMR）
[jianyioa_mobile_h5]
type = tcp
local_ip = 127.0.0.1
local_port = 10086
remote_port = 7779

# 移动端生产构建（v2.3.2 起改用 tcp 透传，不用 http+vhost）
# 因为 type=tcp 不能做路径重写，访问 7780 时会落到 3002 的 "/"，
# 而 3002 根路由是 PC 后台 SPA fallback。**外网必须访问 /m/** 才能命中移动端。
[jianyioa_mobile_h5_prod_v232]
type = tcp
local_ip = 127.0.0.1
local_port = 3002
remote_port = 7780

[jianyioa_frontend_5555]
type = tcp
local_ip = 127.0.0.1
local_port = 5555
remote_port = 35189

[jianyioa_backend_3002]
type = tcp
local_ip = 127.0.0.1
local_port = 3002
remote_port = 7002

# === 已禁用：MySQL 端口不应暴露到外网 ===
# [jianyioa_mysql_3306]
# type = tcp
# local_ip = 127.0.0.1
# local_port = 3306
# remote_port = 13306
```

**注意**：frpc.ini 中 `local_port` 必须与实际运行的端口一致。新机器部署时：

- 如果同时跑后端 + 移动端 dev，**端口 3002 与 10086 必须都可用**
- `type = http` 的条目需要服务端支持；旧的 `type = tcp` 通用

---

## 五、后端部署（Node.js）

### 5.1 启动命令

```bash
cd server
npm install --omit=dev  # 或 npm install --legacy-peer-deps
# 启动（生产）
node server.js
# 启动（开发，热重启可用 nodemon）
npx nodemon server.js
```

**关键环境变量**（在 `server/.env` 里配置）：

```env
DB_HOST=116.204.19.53
DB_PORT=3306
DB_USER=jianyioa
DB_PASSWORD=zpfbAsxyA76P2ZHw
DB_NAME=jianyioa
DB_POOL_LIMIT=10
PORT=3002
```

### 5.2 监听端口

`server.js` 启动后：

- 监听 `PORT`（默认 3002）
- 同时托管 PC 前端：`http://localhost:3002/` ← 从 `../web/dist/` serve
- 同时托管移动端生产构建：`http://localhost:3002/m/` ← 从 `server/public-mobile-h5/` serve
- 静态别名：`/static` 指向移动端 `static/` 资源（tabBar 图标）

### 5.3 上传目录

```bash
# 启动前确保存在
mkdir -p server/uploads/{contracts,logs,customer}
```

### 5.4 进程管理（PM2 示例）

```bash
npm install -g pm2
pm2 start server/server.js --name jianyioa-api
pm2 save
pm2 startup
```

### 5.5 健康检查

```bash
curl http://127.0.0.1:3002/api/me
# 预期：401 未登录（说明后端活了）

curl -H "x-user-id: 1" http://127.0.0.1:3002/api/me
# 预期：JSON 含 is_admin, permissions, role_name
```

---

## 六、PC 前端构建与部署

### 6.1 本机构建

```bash
cd web
npm install --legacy-peer-deps
npm run build  # 输出到 web/dist/
```

### 6.2 部署

**后端 3002 已经自动 serve** `../web/dist/`，**无需单独部署前端**。

如果外网经域名 `erp.fujinwanjia.com` 访问，**Apache 反代**（已在生产服务器配好）即可。

### 6.3 关键代码改动（v2.3.0）

| 文件                                   | 说明                                                |
| ------------------------------------ | ------------------------------------------------- |
| `web/src/stores/user.js`             | Pinia store；登录即拉取权限；`can()` / `canAction()` 判定    |
| `web/src/App.vue`                    | 左侧菜单按权限渲染（`menuConfig` + `visibleMenus`）          |
| `web/src/router/index.js`            | 路由 meta + 守卫，无权限重定向                               |
| `web/src/utils/api.js`               | `/api/my-permissions`、`/api/me` 接口                |
| `web/src/views/Roles.vue`            | 权限矩阵新增「薪资」列与 finance/department/quote 行；回填 bug 修复 |
| `web/src/views/Employees.vue`        | 薪资/身份证按 `canSeeSensitive` 显隐                      |
| `web/src/views/PersonalCenter.vue`   | 用户信息读取走 user store（不再读错的 `userInfo` key）          |
| `web/src/views/PurchaseRequests.vue` | 权限从 store 读（不再读空的 `permissions` key）              |

---

## 七、移动端（uni-app H5）部署

### 7.1 生产构建（推荐用于外网）

```bash
cd jianyioa-app/mobile
npm install --legacy-peer-deps
npm run build:h5  # 输出到 dist/build/h5/
```

**复制到后端托管目录**：

```bash
mkdir -p server/public-mobile-h5
cp -R jianyioa-app/mobile/dist/build/h5/. server/public-mobile-h5/
```

**为什么这样做**：后端 `server.js` 已注册 `app.use('/m', express.static('server/public-mobile-h5'))`，**避免每次更新都要重启后端**——只需把新构建复制过去即可。

**生产构建的路由 base**：`manifest.json` 里的 `h5.router.base = "/m/"` 已配置好，所以构建产物的所有静态资源引用都带 `/m/` 前缀。

### 7.2 开发模式（带 HMR）

```bash
cd jianyioa-app/mobile
npm run dev:h5  # 监听 10086
```

**访问**：

- 本机：`http://127.0.0.1:10086/`（自动 302 → `/m/`）
- 外网：`http://116.204.19.53:7779/`（FRP 透传）

### 7.3 关键代码改动（v2.3.0）

| 文件                                     | 说明                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `mobile/src/utils/permission.ts`       | **新增**：权限映射中心；`applyRoleTabBar()`、`guardTab()`、`visibleEntries()`、`roleClass()`             |
| `mobile/src/stores/user.ts`            | 改用 factory 函数（非 Pinia）；`isAdminUser()`/`can()`/`canAny()`/`canSee()`；`imp` 借权机制             |
| `mobile/src/App.vue`                   | `onShow` 调 `applyRoleTabBar()`；`onLaunch` 包装 `uni.request` 注入 `x-user-id`                   |
| `mobile/src/pages/home/index.vue`      | 13 个快捷入口按权限过滤；角色样式从工具引入                                                                     |
| `mobile/src/pages/mine/index.vue`      | myWork 按权限计算；「数据报表」按 `report:read` 控制；删字符串硬编码                                               |
| `mobile/src/pages/purchase/list.vue`   | 权限走 `userStore.can()`；`guardTab` 兜底                                                         |
| `mobile/src/pages/inspection/list.vue` | `guardTab` 兜底                                                                               |
| `mobile/src/pages/dispatch/list.vue`   | `guardTab` 兜底                                                                               |
| `mobile/src/pages/projects/detail.vue` | 合同/增减项审核权限改 `can()`                                                                         |
| `mobile/src/manifest.json`             | 加 `h5.router.base = "/m/"`、`h5.devServer` proxy 配置                                          |
| `mobile/vite.config.ts`                | `/api`、`/uploads`、`/static` 三个 proxy + **新增** `/m/uploads`、`/m/static` proxy（`rewrite` 剥前缀） |

---

## 八、端口冲突与排错

### 8.1 必查端口

```bash
# 本机
lsof -nP -iTCP:3002 -sTCP:LISTEN
lsof -nP -iTCP:10086 -sTCP:LISTEN
```

### 8.2 必查 URL

| URL                                            | 预期                   |
| ---------------------------------------------- | -------------------- |
| `http://127.0.0.1:3002/`                       | 200，PC 登录页           |
| `http://127.0.0.1:3002/m/`                     | 200，移动端生产构建入口        |
| `http://127.0.0.1:3002/api/me`                 | 401（未登录）             |
| `http://127.0.0.1:3002/static/tab-home.png`    | 200，~175B（tabBar 真图） |
| `http://127.0.0.1:10086/m/`                    | 200，dev 模式（带 HMR）    |
| `http://127.0.0.1:10086/m/static/tab-home.png` | 200，~175B（dev 真图）    |

### 8.3 常见错误

| 症状                                       | 原因                          | 修法                                                                    |
| ---------------------------------------- | --------------------------- | --------------------------------------------------------------------- |
| `ERR_CONNECTION_REFUSED 3002`            | 后端没跑                        | `cd server && node server.js`                                         |
| `Cannot find module 'uni-h5-vue'`        | 移动端没装依赖                     | `cd jianyioa-app/mobile && npm install`                               |
| `ECONNREFUSED 127.0.0.1:3306`            | DB_HOST 配错                  | 检查 `.env` 里的 `DB_HOST`                                                |
| 移动端 dev `/m/uploads/xxx.png` 返 821B HTML | vite.config proxy 没生效       | 重启 `npm run dev:h5`                                                   |
| 移动端 dev 404 tabBar 图标                    | Desktop `mobile/static/` 缺失 | 从 `server/public-mobile-h5/static/` 复制到 `jianyioa-app/mobile/static/` |
| 登录返 `success: false`                     | admin 密码错（不是默认的 `admin123`） | 看 `server/init.sql` 里 admin 账号的初始 password 字段                         |
| 角色菜单全空                                   | 没点"个人中心"刷新权限                | 重新登录或调用 `/api/me`                                                     |

---

## 九、关键账号（init.sql 默认）

| 角色      | 用户名                | 初始密码                                               | 备注                           |
| ------- | ------------------ | -------------------------------------------------- | ---------------------------- |
| 超级管理员   | admin              | 看 `server/init.sql` 的 `employees.password` 字段（明文存） | 第一次登录后建议改密码                  |
| 项目经理    | project_manager\_* | 同上                                                 |                              |
| 设计师     | designer\_*        | 同上                                                 |                              |
| 监理      | supervisor\_*      | 同上                                                 |                              |
| 财务      | finance\_*         | 同上                                                 |                              |
| 业主（客户端） | 手机号                | 手机号后 6 位                                           | 通过 `/api/customers/login` 登录 |

**注意**：v2.3.0 之前登录响应回传明文 password（已修复/待修复，登录响应目前仍包含 password 字段，但建议生产前剔除）。

---

## 十、安全建议

1. **`server/.env` 绝不能进 git** —— 已加进 `.gitignore`。
2. **宝塔面板**改默认密码、关闭 API 接口、限制 MySQL 远程访问。
3. **PC 前端 cors** —— `app.use(cors())` 当前允许所有 origin，生产应改为白名单。
4. **登录响应剔除 password** —— 大王本机 3002 server.js 已修（响应里无 password 字段），但 **erp.fujinwanjia.com 域名打到的 3001 老服务还在回传明文 password**（见 §11）。
5. **数据库最小权限** —— jianyioa 账号只给 `jianyioa` 库，不给 `mysql` 系统库权限。
6. **SSL** —— `erp.fujinwanjia.com` 域名已配 Let's Encrypt；移动端 FRP 仍是 http（生产建议加证书）。

---

## 十一、已知问题与陷阱（运维必看，2026-10-12 探活发现 + 10-12 20:50 修正）

> 2026-10-12 14:30 探活 4 个外网入口发现 erp 域名行为异常，原误判为"Apache 反代错配上游"（**错的**）。20:50 大王澄清：服务器跑的是 v2.3.0 之前的老代码，**不是反代配置错配**，是部署策略——大王一直在**本机测试**，服务器独立跑老代码，计划上线时再同步。
> 真实陷阱名称改为"**服务器代码未同步陷阱**"。

### 11.1 ⚠️ 服务器代码未同步陷阱（不是反代错配！）

**症状**（curl 实测，2026-10-12 14:30）：

| 端点 | `erp.fujinwanjia.com` | `116.204.19.53:3001` | `116.204.19.53:7002`（FRP→本机 3002）|
|---|---|---|---|
| `/api/health` | 200 0.13s | 200 0.04s | 200 0.12s |
| `/api/projects` | 200 0.12s | 200 0.03s | 200 0.06s |
| `/api/me` | **5s 超时** | **4s 超时** | 401 0.07s |
| `/api/employees/login` GET | **5s 超时** | **4s 超时** | 404 0.07s |
| `/api/employees/login` POST | 200 带 `password:admin123` | 200 带 `password:admin123` | 200 **无 password 字段** |

**根因**（修正后）：
- 服务器上 Apache vhost 把 `/api/*` 反代到 `http://127.0.0.1:3001/api/`（**配置正确**——3001 跑着老 server.js）
- 服务器本机 3001 跑的是 **v2.3.0 之前**的 server.js，跟大王本机 3002 跑的 v2.3.2+ 代码差几个版本
- **这是部署策略，不是配置错配**——大王本机是开发/测试环境，服务器是生产环境，独立部署，计划未来同步

**影响**：
- PC 前端登录后调 `/api/me` 拿用户信息 → 浏览器卡 5s 后失败 → 角色菜单全空
- PC 借权（`/api/admin/impersonate*`）→ 3001 老服务没这端点 → 不可用
- 登录响应**仍回传明文 password**（v2.3.2 大王本机 3002 已修，3001 没修）
- 任何 v2.3.0+ 新加的端点（/api/me、借权、`/api/permissions`、v2.3.4 项目文件等）→ 服务器都不可用

**为什么一直没察觉**：
- 3001 老服务有完整的 CRUD 主接口（projects / customers / contracts / dispatches 等），**80% 业务功能正常**
- 大王本机调试 127.0.0.1:3002 一切正常，**从未真正通过 ERP 域名验证过新功能**
- 移动端生产构建走 7780/m/ → FRP 透传大王本机 3002，**移动端不受影响**
- 浏览器不展示 password 字段 → 明文泄露前端感知不到

**修法**（= 上线流程）：
- 把最新代码同步到服务器（rsync 或 git pull，看大王习惯）
- 跑 `server/migrations/v2_3_1_*.js` + `v2_3_4_*.js`（按版本号顺序）
- 服务器 `npm install --legacy-peer-deps`
- 停老 3001，起新 3002（或把 server.js 复制到 3001 目录重启）
- 反代配置**不用改**（vhost 仍指 127.0.0.1:3001，只是 3001 跑新代码）
- 验证：`curl https://erp.fujinwanjia.com/api/me` 应该 401 不再超时

**临时调试绕过**：
- 调试时直接用 `http://116.204.19.53:7002/api/...`（FRP 透传路径，已验证完全通）
- 或 `http://127.0.0.1:3002/api/...`（本机直连）

### 11.2 ⚠️ 7780 移动端必须带 `/m/`

`mobile/frpc.ini` 的 `mobile_h5_prod_v232` 用 `type = tcp`（不是 http+vhost），不能做路径重写。访问 `http://116.204.19.53:7780/` 会落到本机 3002 根路由（PC 后台 SPA fallback），**外网访问移动端必须用 `http://116.204.19.53:7780/m/`**。给外人发链接要带 /m/。

### 11.3 🔒 MySQL 13306 已禁用

`mobile/frpc.ini` 里 `[jianyioa_mysql_3306]` 已注释掉（2026-10 月安全决定）。**外网不能再直连 MySQL**；调试用 SSH 隧道进服务器本机 3306。

### 11.4 🗑️ 根目录 `frpc.ini` 已删除

2026-10-12 14:30 删。它写的 `33001 / 35189 / 7777` 跟实际 `7002 / 35189 / 7779` 对不上，PM2 跑的是 `mobile/frpc.ini`，根目录那份是历史残留。**新机器部署只用 `mobile/frpc.ini` 一份**。

---

## 十二、版本历史

| 版本         | 日期            | 主要内容                          |
| ---------- | ------------- | ----------------------------- |
| **v2.3.2** | 2026-10-12    | 登录响应剔除明文 password / 7780 改 tcp 透传 / 13306 禁用 / 删根目录 frpc.ini / 文档同步实际部署 |
| **v2.3.0** | 2026-10-11    | 权限链路完整化 + 移动端生产构建托管 + 端到端性能修复 |
| v2.2.2     | 2026-10-10    | 管理员借权 / 待办中心 / 采购报销流程         |
| v2.2.1     | 2026-10-10    | x-user-role 信任头修复 / 借权登录      |
| v2.1.x     | 2026-09-20 之前 | 派工 / 节点模板 / 甘特图等              |
| v1.0.1     | 2026-06-18    | 初始版本                          |

---

## 十三、第一次部署 checklist

- [ ] 克隆 main 分支 + 单独拉 mobile 分支（见 §一）
- [ ] 三个端分别 `npm install --legacy-peer-deps`（server / web / jianyioa-app/mobile）
- [ ] 宝塔面板建 `jianyioa` 库（utf8mb4），导入 `server/init.sql`
- [ ] 创建 `server/.env`，填好 DB 密码与 PORT
- [ ] `mkdir -p server/uploads/{contracts,logs,customer}`
- [ ] `cd web && npm run build`
- [ ] `mkdir -p jianyioa-app/mobile/static && cp jianyioa-app/mobile/dist/build/h5/static/* jianyioa-app/mobile/static/`（让 dev 模式也能用）
- [ ] `cd jianyioa-app/mobile && npm run build:h5`
- [ ] `mkdir -p server/public-mobile-h5 && cp -R jianyioa-app/mobile/dist/build/h5/. server/public-mobile-h5/`
- [ ] 启动后端：`cd server && node server.js`（或 PM2）
- [ ] 启动移动端 dev（如需）：`cd jianyioa-app/mobile && npm run dev:h5`
- [ ] 配 FRP 客户端（按第四节），重启 frpc
- [ ] 验证所有 URL（第八节）
- [ ] 浏览器登录 admin，看 PC 端、移动端、角色权限、报销详情（带凭证图片）都正常
