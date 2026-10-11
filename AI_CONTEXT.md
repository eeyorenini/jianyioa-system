# 建亿 OA 系统 · AI 上下文文档（v2.3.1）

> 本文是给 AI agent 看的**机器可读**系统上下文。结构化优先、口语化最低。  
> 人类部署请看 `DEPLOY_GUIDE.md`。

---

## 0. 元数据

```yaml
name: jianyioa-system
version: 2.3.1
release_date: 2026-10-11
git:
  primary: git@github.com:eeyorenini/jianyioa-system.git
  pc_branch: main                 # PC 后端 + PC 前端（Vue3 + Express）
  mobile_branch: mobile           # 移动端 H5 + 小程序 + App 三端通用（独立分支）
  pc_head: 见 tag v2.3.1          # 本次备份提交
  mobile_head: 见 tag v2.3.1      # 本次备份提交
stack:
  backend: node + express + mysql2
  pc_web: vue3 + vite + element-plus + pinia + tiptap
  mobile: uni-app (vue3) + vite + pinia
  db: mysql 5.5+
mono_repo_layout:
  root:
    - server/                 # 后端 + API + 静态资源托管
    - web/                    # PC 前端（Vue3）
    - jianyioa-app/mobile/    # ⚠️ 本地组织（远端 mobile 分支的源码路径其实是 mobile/，本地多嵌一层）
  infrastructure_files:
    - server/.env             # 数据库/端口配置（不进 git）
    - frpc.ini                # 父仓库 FRP 客户端配置（旧；已弃用，改用 jianyioa-app/mobile/frpc.ini）
    - jianyioa-app/mobile/frpc.ini  # 移动端 FRP 客户端配置（当前在用）
    - server/init.sql         # 数据库初始化（46 张表 + 示例数据）
```

---

## 1. 进程模型（AI 必须先理清）

| 进程 | 启动命令 | 端口 | 监听谁 | 负责内容 |
|---|---|---|---|---|
| **后端** | `cd server && node server.js` | **3002** | `0.0.0.0:3002` | API（`/api/*`）；PC 前端生产构建静态托管（`../web/dist/`）；移动端生产构建托管（`server/public-mobile-h5/` → `/m/`）；tabBar 图标别名（`/static/*`） |
| **移动端 dev** | `cd jianyioa-app/mobile && npm run dev:h5` | **10086** | `0.0.0.0:10086` | uni-h5 Vite dev server，自动 302 → `/m/` |

**关键事实**：
- 后端 3002 **同时托管 PC 前端、移动端生产构建、API**——这是单一入口的"全网关"架构
- 移动端 dev（10086）与生产构建（3002/m/）**可同时跑**——互不影响
- 不需要单独部署前端，**改 web 端代码后必须 build 并让 3002 重启或热加载**

---

## 2. URL 与端口矩阵（部署前必须理解）

### 2.1 端口映射

| 类型 | 本机端口 | 外网端口（FRP） | 协议 | 路径 |
|---|---|---|---|---|
| 后端 API | 3002 | 7002 | tcp | — |
| PC 前端（生产） | 3002 | —（经 Apache 反代） | https | `erp.fujinwanjia.com` |
| 移动端生产构建 | 3002 | **7780** | http | `/` |
| 移动端 dev | 10086 | 7779 | tcp | — |
| PC 前端 dev（备用） | 5555 | 35189 | tcp | — |
| MySQL（仅调试） | 3306 | 13306 | tcp | — |

### 2.2 入口 URL

| 类型 | 本机 | 外网 |
|---|---|---|
| PC 管理后台 | `http://127.0.0.1:3002/` | `https://erp.fujinwanjia.com` |
| PC API | `http://127.0.0.1:3002/api/*` | `https://erp.fujinwanjia.com/api/*` |
| 移动端生产（推荐） | `http://127.0.0.1:3002/m/` | `http://116.204.19.53:7780/` |
| 移动端 dev | `http://127.0.0.1:10086/m/` | `http://116.204.19.53:7779/` |

### 2.3 端到端资源路径约定（base=/m/）

uni-app H5 dev 与 production 构建 **manifest.json** 都设置 `h5.router.base = "/m/"`：

- 所有资源路径**自动拼 `/m/` 前缀**：
  - `<image src="/uploads/xxx.png">` → 实际请求 `/m/uploads/xxx.png`
  - `<image src="static/tab-home.png">` → 经 uni-h5 `getRealPath` 后成 `/static/tab-home.png`（不带 /m/）
- **vite dev 的 proxy 必须双写**：
  - `/uploads` → `http://localhost:3002`（剥前缀后转发）
  - **`/m/uploads` → 同上**（rewrite `/m/`）
  - `/static` 同理 + `/m/static`
- **3002 后端的别名路由**：
  - `/m/*` → `server/public-mobile-h5/`（静态托管）
  - `/static` → `server/public-mobile-h5/static/`（**不带 /m**，兜底 tabBar 图标）
  - `/uploads` → `server/uploads/`（上传文件）

---

## 3. 关键事实（AI 必读）

### 3.1 数据库

```
DB_HOST=116.204.19.53
DB_PORT=3306
DB_USER=jianyioa
DB_PASSWORD=zpfbAsxyA76P2ZHw
DB_NAME=jianyioa
DB_POOL_LIMIT=10
```

**重要表**（46 张）：`projects`、`project_stages`、`contracts`、`contract_templates`、`inspections`、`dispatches`、`material_orders`、`employees`、`roles`、`departments`、`purchase_requests`、`notifications`、`system_logs`、`family_members` 等。

**重要字段**：
- `employees.password`：**明文存储**（登录响应也回传，待 v2.3.1 修复）
- `roles.permissions`：JSON 数组，权限码格式 `模块:动作`（如 `purchase:approve`）
- `roles.managed_department_ids`：JSON 数组，可管理部门的 id（已生效，含子部门）
- `roles.code`：角色码（`admin` / `project_manager` / `designer` / `supervisor` / `finance` / `customer`）

### 3.2 权限模型

**模块列表**（20 个 module key）：
`customer` / `contract` / `project_contract` / `project` / `contract_change` / `quote` / `inspection` / `acceptance` / `approval` / `notice` / `report` / `budget` / `finance` / `purchase` / `warehouse` / `supplier` / `invoice` / `dispatch` / `employee` / `role` / `department` / `sms` / `settings`

**动作后缀**：`:read` / `:write` / `:delete` / `:read_all` / `:approve` / `:finance` / `:salary` / `:reset_password`

**特殊权限码**：
- `*` → 全部权限（admin 等同）
- 模块名裸字段（兼容） → 表示该模块任意动作
- `purchase:finance` → 财务角色专属（报销受理、回执）
- `employee:salary` → 字段级敏感权限（薪资/身份证）
- `employee:read_all` → 员工模块 read_all 也含 salary 可见权
- `employee:reset_password` → 重置他人密码

### 3.3 服务端权威角色

`app.use(...)` 中间件（行 163-176）**服务端覆盖** `x-user-role` header：
```js
const info = await resolveAuthRole(uid);  // 查 DB，60 秒缓存
req.headers['x-user-role'] = isAdminRoleInfo(info) ? 'admin' : (info.role_code || '');
```
- **客户端伪造 x-user-role 一律无效**
- `isAdminRoleInfo`：role_code='admin' 或 username='admin'
- 缓存：`_authRoleCache`（userId → {username, role_code, ts}，TTL 60000ms）
- 失效：调用 `clearAuthRoleCache()`（员工/角色增删改后调用）

### 3.4 数据范围（GET /api/employees）

按以下顺序判定：

1. `admin` 或 `employee:read_all` → 全部员工（除 password 字段）
2. 角色配置 `managed_department_ids` 非空 → 这些部门（含子部门递归）的员工 + 自己
3. 默认 → 仅自己

子部门递归：`expandDepartmentIds(ids)` 把每个 id 展开成"自己+所有子部门 id"。

### 3.5 字段级敏感（薪资/身份证）

`canSeeEmployeeSensitive(userId)` 判定：admin / `employee:read_all` / `employee:salary` 任一满足可见。

`maskEmployeeSensitive(rows, canSee, selfId)`：
- canSee=true → 原样返回
- 否则把他人的 `salary` / `id_card` 字段置 null（**本人除外**）

**PUT 防御**（`PUT /api/employees/:id`）：无敏感权限者**走不含 salary/id_card 列的 UPDATE**，原值保留（防前端脱敏空值覆盖真实值）。

### 3.6 路由注册（server.js 关键行）

| 行 | 路由 |
|---|---|
| 8629-8644 | `/uploads` 静态托管；`/m` 静态托管（`public-mobile-h5/`）；`/static` 静态别名（兜底 tabBar） |
| 9208-9214 | SPA fallback：`/m/*` 返回移动端 index.html，其它返回 PC `web/dist/index.html` |

### 3.7 移动端权限设施（uni-h5 模式）

- **`stores/user.ts`**：工厂式（非 Pinia），`can/canAny/canSee/isAdminUser/isCustomer/hasPermission`
- **`utils/permission.ts`**：权限映射中心，`TAB_BAR_PERMS`、`HOME_QUICK_ENTRIES`、`MY_WORK_ITEMS`、`applyRoleTabBar()`、`guardTab(perm)`、`visibleEntries(items)`、`roleClass(code, name)`
- **`canSee` 宽容降级**：
  - admin → true
  - 未配置权限（空数组）→ true（兼容老角色）
  - 已配置 → 按权限码严格判定
- **H5 路由**：uni-h5 用 vue-router `createWebHashHistory(routerBase)`；当 `manifest.json` 设了 `h5.router.base = "/m/"`，实际 hash 是 `#/pages/...`

### 3.8 tabBar 图标来源

- **生产构建**：`jianyioa-app/mobile/dist/build/h5/static/*.png`（由 vite 构建生成）
- **dev 模式**：`jianyioa-app/mobile/static/*.png`（**需要手动从生产构建复制**，否则 404）
- **3002 别名**：`/static` → `server/public-mobile-h5/static/`（兜底）

### 3.9 数据库统计盲点（v2.2.4 修复）

`inProgress` 之前用 `WHERE status='进行中'` 字面匹配，会漏掉 `开工准备`、`施工中`、`暂停` 等非终止态项目。

**修复**：改为 `WHERE status NOT IN ('已完成','已交付','已取消','已完工','已结算','作废','archived','completed','cancelled') AND status IS NOT NULL AND status <> ''`。

涉及接口：
- `/api/mobile/home-stats`（死代码路由，顺手修了）
- `/api/todo/center`（真实在用，**首页卡片数据来源**）

---

## 4. 启动序列（AI 操作步骤）

### 4.1 全新部署

```bash
# 1. 拉代码（PC 端 main 分支 + 移动端 mobile 分支）
git clone https://github.com/eeyorenini/jianyioa-system.git
cd jianyioa-system
git checkout main                       # 默认在 main 分支（PC 端）
# 在独立的 mobile/ 目录拉取移动端代码（或你也可以把 mobile 分支 checkout 到 jianyioa-app/mobile/）
git clone -b mobile https://github.com/eeyorenini/jianyioa-system.git /tmp/jianyioa-mobile
# 复制 mobile/ 内容到 jianyioa-app/mobile/（注意：远端路径是 mobile/，本地组织是 jianyioa-app/mobile/）
mkdir -p jianyioa-app && cp -R /tmp/jianyioa-mobile/mobile jianyioa-app/mobile

# 2. 装依赖（必须 --legacy-peer-deps）
cd server && npm install --legacy-peer-deps && cd ..
cd web && npm install --legacy-peer-deps && cd ..
cd jianyioa-app/mobile && npm install --legacy-peer-deps && cd ../..

# 3. 数据库
#    宝塔面板建库 jianyioa (utf8mb4)
mysql -h 116.204.19.53 -u jianyioa -p jianyioa < server/init.sql

# 4. .env（关键）
cat > server/.env << EOF
DB_HOST=116.204.19.53
DB_PORT=3306
DB_USER=jianyioa
DB_PASSWORD=zpfbAsxyA76P2ZHw
DB_NAME=jianyioa
DB_POOL_LIMIT=10
PORT=3002
EOF

# 5. 上传目录
mkdir -p server/uploads/{contracts,logs,customer}

# 6. PC 前端构建（输出 web/dist/）
cd web && npm run build && cd ..

# 7. 移动端构建 + 复制产物
cd jianyioa-app/mobile && npm run build:h5 && cd ../..
mkdir -p server/public-mobile-h5
cp -R jianyioa-app/mobile/dist/build/h5/. server/public-mobile-h5/

# 8. 移动端 static 复制（dev 模式必需）
mkdir -p jianyioa-app/mobile/static
cp jianyioa-app/mobile/dist/build/h5/static/* jianyioa-app/mobile/static/

# 9. 启动（手动 / PM2 二选一）
cd server && node server.js &           # 或 PM2

# 10. FRP 客户端（启动 frpc，加载 frpc.ini）
frpc -c frpc.ini &                       # 父仓库 frpc.ini
frpc -c jianyioa-app/mobile/frpc.ini &   # 移动端 frpc.ini
```

### 4.2 增量升级（仅替换代码）

```bash
cd /path/to/jianyioa-system
git pull                                    # 拉 main 分支最新代码（PC 端）
# 同时拉 mobile 分支（移动端代码）
git pull origin mobile:refs/remotes/origin/mobile --ff-only 2>/dev/null || \
  echo "mobile 分支单独在 jianyioa-app/mobile/ 维护，不需要从这里 pull"
cd web && npm run build && cd ..        # PC 端必须重新构建
cd jianyioa-app/mobile && npm run build:h5 && cd ../..
mkdir -p server/public-mobile-h5
rm -rf server/public-mobile-h5/*
cp -R jianyioa-app/mobile/dist/build/h5/. server/public-mobile-h5/
rm -rf jianyioa-app/mobile/static/*
cp jianyioa-app/mobile/dist/build/h5/static/* jianyioa-app/mobile/static/

# 后端代码改动 → 必须重启 server.js
# 前端代码改动 → 只需 web/dist/ 替换，3002 不重启也加载新文件
pm2 restart jianyioa-api                 # 如果用 PM2
# 或 kill + nohup
```

---

## 5. 决策树（AI 诊断用）

### 5.1 用户报"图片/资源 404"

```
症状: 浏览器 console 报 Failed to load resource 404
  │
  ├─ 是 /m/uploads/* 路径?
  │   │
  │   ├─ 走的是 3002 (生产) → 检查 server.js 是否在跑
  │   │   └─ lsof -iTCP:3002 → 进程在 → 上传目录 server/uploads 是否存在?
  │   │       └─ 文件本身是否真上传了? SELECT * FROM ... WHERE image LIKE '%xxx%'
  │   │
  │   └─ 走的是 10086 (dev) → 检查 vite.config.ts 是否有 /m/uploads proxy
  │       └─ 改完需要重启 npm run dev:h
  │
  ├─ 是 /static/* 路径?
  │   │
  │   ├─ 走 3002 → 检查 server/public-mobile-h5/static/ 是否存在文件
  │   │   └─ 跑过一次 npm run build:h5 + cp 到 public-mobile-h5 即可
  │   │
  │   └─ 走 10086 → 检查 jianyioa-app/mobile/static/ 是否存在文件
  │       └─ 从 dist/build/h5/static/ 复制 14 个 png/svg
  │
  └─ 是 /assets/* 文件
        └─ vite 构建产物，web/dist 部署过即可；浏览器需强刷
```

### 5.2 用户报"页面没跳转 / 白屏"

```
症状: 点击某链接后页面不动 / 一直白屏
  │
  ├─ 看 location.href
  │   ├─ 没变 → uni.navigateTo 没执行 / 抛错
  │   │   └─ 看 goTodoUrl switch case (purchase/detail 不在 tabBar 白名单)
  │   │       └─ 应该走 navigateTo，确认 fail 回调是否触发
  │   │
  │   └─ 变了 → 页面组件加载失败
  │       └─ 看 console 报错
  │           ├─ "page `xxx` is not found" → pages.json 没注册
  │           ├─ 编译报错 → 文件有 syntax error
  │           └─ 资源 404 致组件挂载中断 → 跳 5.1
  │
  └─ dev 模式才发生? → vite cache / HMR socket 失联
       └─ 浏览器 Cmd+Shift+R 强刷
```

### 5.3 用户报"权限不生效 / 菜单全空"

```
症状: 非 admin 角色登录后菜单空白 / 按钮不显示
  │
  ├─ 该用户角色 permissions 数组是什么?
  │   ├─ 空 [] → 老角色未配权限 → 进入宽容降级路径(全显示)
  │   │       若想精确: 在 /pages/Roles.vue 的 Roles 模块勾权限
  │   │
  │   └─ 非空 → 检查 store.permissions 是否拉到
  │       └─ 浏览器 console: 检查 /api/me 返回的 permissions
  │           └─ userStore.loadPermissions() 是否在 login() 后调用
  │               └─ 修复: 重新登录（login 已不存 token-only 状态）
  │
  └─ 移动端首页 quick-item 全空?
      ├─ HOME_QUICK_ENTRIES 的 perm 字段是否齐全 → utils/permission.ts
      └─ 重建产物: npm run build:h5 + cp 到 server/public-mobile-h5/
```

### 5.4 用户报"登录 success: false"

```
症状: 登录接口返 success: false
  │
  ├─ 看 server init.sql 里 admin 账号的 password 字段
  │   └─ init.sql 里是明文，但登录校验可能也用明文比对
  │
  └─ 看服务端日志: 'employees/login error: ...'
      └─ 密码错 / DB 连接失败
```

### 5.5 后端启动失败

```
原因:
  1. .env 没配 → 报 DB_HOST undefined
  2. MySQL 连不上 → ECONNREFUSED 127.0.0.1:3306（PORT 配错）或 116.004.x（HOST 配错）
  3. 端口 3002 被占 → EADDRINUSE
     └─ lsof -iTCP:3002 → 杀进程 / 改 PORT
  4. node_modules 缺 → Cannot find module 'xxx'
     └─ npm install --legacy-peer-deps
```

---

## 6. 接口速查（高频）

| 接口 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/api/employees/login` | POST | 否 | 登录入；**响应含 password 明文**（待修） |
| `/api/me` | GET | header `x-user-id` | 权威身份 + permissions |
| `/api/employees` | GET | header | 三档数据范围 + 字段脱敏 |
| `/api/employees/:id` | PUT | `employee:write` | PUT 防御：缺敏感权限者原值保留 |
| `/api/employees/grouped-by-department` | GET | header | 选人下拉；无鉴权时 401 |
| `/api/todo/center?limit=10` | GET | header | 待办中心；返回 `home.stats.inProgress` 等 |
| `/api/dashboard/stats` | GET | header | PC 端驾驶舱 |
| `/api/projects` | GET | header | 项目列表 |
| `/api/roles` | GET/POST/PUT | header | 角色管理；PUT 走局部更新（不再整行覆盖） |
| `/api/departments` | GET | header | 部门列表 |
| `/api/notifications/unread-count` | GET | header | 未读消息 |

**所有 `/api/*` 路由都在 server.js 内联**（除 `server/routes/` 14 文件外，那是死代码从未 require）。

---

## 7. 已知问题（待修）

| 问题 | 影响 | 计划版本 |
|---|---|---|
| `/api/employees/login` 响应包含明文 password | 敏感信息泄露 | v2.3.1 |
| `app.use(cors())` 允许所有 origin | 生产环境 CSRF 风险 | v2.3.1 |
| `server/routes/*.js`（14 文件）+ `server/middleware/auth.js` 死代码 | 误导后来人 | 建议清理（破坏性，不影响功能） |
| GET 列表接口普遍不加 `:read` 校验 | 数据范围只由 `read_all`/部门范围控制 | 不建议改（避免把没配权限的角色全部挡在列表外） |
| MySQL 13306 FRP 暴露 | 仅调试，**生产应关** | 部署时关 |

---

## 8. 改动文件清单（v2.2.4，git diff）

### 8.1 父仓库 main 分支（commit `08b3d50b`）

```
M  .gitignore
A  DEPLOY_GUIDE.md           (13058 字节)
A  AI_CONTEXT.md              (本文档)
M  README.md
M  package.json               (v2.2.4)
M  server/package.json        (v2.2.4)
M  web/package.json           (v2.2.4)
M  server/server.js
M  web/src/App.vue
M  web/src/router/index.js
M  web/src/stores/user.js
M  web/src/utils/api.js
M  web/src/views/Employees.vue
M  web/src/views/PersonalCenter.vue
M  web/src/views/PurchaseRequests.vue
M  web/src/views/Roles.vue
```

### 8.2 子模块 jianyioa-app mobile 分支（commit `351b7a0`）

```
M  mobile/frpc.ini
M  mobile/package.json       (v2.2.4)
M  mobile/src/App.vue
M  mobile/src/manifest.json
D  mobile/src/pages/customer/home.vue.bak
M  mobile/src/pages/dispatch/list.vue
M  mobile/src/pages/home/index.vue
M  mobile/src/pages/inspection/list.vue
M  mobile/src/pages/mine/index.vue
M  mobile/src/pages/projects/detail.vue
M  mobile/src/pages/purchase/list.vue
M  mobile/src/stores/user.ts
M  mobile/vite.config.ts
A  mobile/src/utils/permission.ts       (新增 5243 字节 / 104 行)
A  mobile/static/*.png,*.svg            (14 个 tabBar 图标)
```

---

## 9. 进程管理建议

| 场景 | 推荐 |
|---|---|
| 开发调试 | `node server.js` + `npm run dev:h5` 各开终端 |
| 本地后台 | `nohup node server.js > /tmp/api.log 2>&1 &`（沙箱注意：会被回收）|
| 生产 | PM2：`pm2 start server/server.js --name jianyioa-api && pm2 startup && pm2 save` |
| 进程健康监控 | `lsof -iTCP:3002` 与 `lsof -iTCP:10086`；FRP：`ps aux | grep frpc` |

**沙箱注意**：在沙箱/CI 流水线中启动的 node 进程**会在当前命令退出后被回收**。生产用 PM2/systemd。

---

## 10. 关键代码片段索引（AI 调试时定位用）

| 关注点 | 文件:行 |
|---|---|
| 安全中间件（x-user-role 服务端覆盖） | server/server.js:163-176 |
| `resolveAuthRole` + 缓存 | server/server.js:139-161 |
| `isAdminRoleInfo` 判定 | server/server.js:154-156 |
| `getUserPermissions` | server/server.js:1802-1826 |
| `canSeeEmployeeSensitive` | server/server.js:1837-1847 |
| `maskEmployeeSensitive` | server/server.js:1853-1862 |
| `getManagedDepartmentIds` | server/server.js:1868-1898 |
| `expandDepartmentIds` | server/server.js:1900-1928 |
| `/api/employees` 三档数据范围 | server/server.js:3567-3592 |
| `/api/employees/grouped-by-department` 401 | server/server.js:3594-3615 |
| `PUT /api/employees/:id` 防御 | server/server.js:3618-3641 |
| `/api/mobile/home-stats` | server/server.js:8790-8879 |
| `/api/todo/center` inProgress | server/server.js:9157-9162 |
| 静态托管（`/uploads`、`/m`、`/static`） | server/server.js:8629-8644 |
| SPA fallback | server/server.js:9208-9222 |
| mobile 权限 store | jianyioa-app/mobile/src/stores/user.ts |
| mobile 权限映射中心 | jianyioa-app/mobile/src/utils/permission.ts |
| vite dev proxy（含 /m 前缀） | jianyioa-app/mobile/vite.config.ts |
| manifest base | jianyioa-app/mobile/src/manifest.json |

---

## 11. 升级到 v2.2.4（从 v2.2.x）

```bash
# 1. 拉代码
git pull                                    # 拉 main 分支（PC 端）
# mobile 分支独立演进，本地 jianyioa-app/mobile/ 自行维护（详见 §4.1）

# 2. 装新增依赖（无新增，按需重装）
cd server && npm install --legacy-peer-deps && cd ..
cd web && npm install --legacy-peer-deps && cd ..
cd jianyioa-app/mobile && npm install --legacy-peer-deps && cd ../..

# 3. 重新构建 PC + 移动端
cd web && npm run build && cd ..
cd jianyioa-app/mobile && npm run build:h5 && cd ../..

# 4. 部署构建产物
rm -rf server/public-mobile-h5/*
cp -R jianyioa-app/mobile/dist/build/h5/. server/public-mobile-h5/
rm -rf jianyioa-app/mobile/static/*
cp jianyioa-app/mobile/dist/build/h5/static/* jianyioa-app/mobile/static/

# 5. 数据库无 schema 变更（无 migration 步骤）

# 6. 重启后端
pm2 restart jianyioa-api

# 7. 验证（按部署文档第八节）
curl http://127.0.0.1:3002/m/static/tab-home.png
curl http://127.0.0.1:3002/api/me
curl -H "x-user-id: 1" http://127.0.0.1:3002/api/todo/center | grep inProgress
```

---

## 12. 反模式（不要做的事）

| 反模式 | 后果 |
|---|---|
| ❌ 改完 server.js 不重启 | 改动不生效 |
| ❌ 改完 web/src 不 build | 前端不更新（3002 仍 serve 旧 dist） |
| ❌ 改完 mobile/src 不 build:h5 + cp 到 server/public-mobile-h5 | 移动端生产构建不更新 |
| ❌ 删掉 server/public-mobile-h5/ | 移动端 500（3002 找不到产物） |
| ❌ 在 jianyioa-app/mobile/static/ 加 png 但不重新 build | dev 模式可，生产构建不带 |
| ❌ 把 .env 提交到 git | 密码泄露 |
| ❌ 修改 server/routes/* 或 server/middleware/auth.js | 死代码，不会生效 |
| ❌ 改 vite.config.ts 后不重启 npm run dev:h5 | HMR 不会重载配置 |
| ❌ 直接 vite build 在 dev server 跑 | dev server 会清空目录，构建失败（safe-delete 拦截） |
| ❌ 把 web/dist、jianyioa-app/mobile/dist 入 git | 仓库爆掉 |