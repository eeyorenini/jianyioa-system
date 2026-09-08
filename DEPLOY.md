# 建亿 OA 系统 - 宝塔 Windows 面板部署手册

## 准备工作（已完成）

- ✅ 项目代码已打包：`jianyioa-system.zip`（321KB）
- ✅ 已通过 FTP 上传到服务器根目录：`ftp://116.204.19.53:21/jianyioa-system.zip`
- ✅ 数据库：MySQL（替换原 SQLite）
- ✅ 服务端口：3001

## 一、宝塔面板新建 MySQL 数据库

1. 登录宝塔面板：`http://116.204.19.53:8888/72bs0Yzp`
2. 左侧菜单 → **数据库** → **添加数据库**
3. 填写：
   - 数据库名：`jianyioa`
   - 用户名：`jianyioa`（或自定义，记下来）
   - 密码：点击 **生成** 按钮（**记下来**）
   - 字符集：`utf8mb4`
   - 排序规则：`utf8mb4_unicode_ci`
4. 点 **提交**

## 二、宝塔面板新建 Node 项目

1. 左侧菜单 → **网站** → **添加站点**
2. 类型选 **Node 项目**（不是 PHP 站点）
3. 填写：
   - 域名：`jianyioa.yourdomain.com`（或先用 IP 访问，先填 `116.204.19.53`）
   - 端口：`3001`
   - 项目路径：先随便填，下面会改
   - 运行方式：`PM2`
   - 项目入口：`server.js`
   - Node 版本：`18.x` 或更高（宝塔软件商店装）
   - 启动命令：`node server.js`
4. 点 **提交**（先让它创建目录）

## 三、解压项目代码

1. 宝塔面板 → **文件** → 进入项目目录（你刚填的路径）
2. 删除里面的占位文件
3. 上传 FTP 文件 jianyioa-system.zip 到这个目录
4. 选中 zip → 右键 → **解压**
5. 解压后你会看到 `jianyioa-system/server/`、`jianyioa-system/web/` 等
6. 把 `jianyioa-system/server/` 里的**所有文件**剪切到项目根目录（这样启动命令 `node server.js` 才直接生效）

最终目录结构应该是：
```
项目根/
├── server.js
├── package.json
├── init.sql
├── db-mysql.js
├── .env
├── node_modules/        (待安装)
├── uploads/             (新建)
└── ... 其他文件
```

## 四、安装项目依赖

1. 宝塔面板 → **终端**（或 SSH 工具）
2. 进入项目目录：
   ```bash
   cd /你的项目路径
   ```
3. 安装依赖（只装生产依赖，更快）：
   ```bash
   npm install --omit=dev
   ```

## 五、配置数据库连接

1. 在项目根目录创建 `.env` 文件（参考 `.env.example`）：
   ```
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=jianyioa                ← 填第一步设置的用户名
   DB_PASSWORD=刚才生成的密码     ← 填第一步设置的密码
   DB_NAME=jianyioa
   PORT=3001
   ```

2. 或者直接编辑 `.env.example` 改名为 `.env`

## 六、初始化数据库表

1. 宝塔面板 → **数据库** → 选中 jianyioa 数据库 → **导入**
2. 选择本地文件：`项目根/init.sql`
3. 点 **导入**（46 张表会一次性建好）

或者用终端：
```bash
cd /你的项目路径
mysql -u jianyioa -p jianyioa < init.sql
```

## 七、创建 uploads 目录

```bash
cd /你的项目路径
mkdir uploads
```

（用于客户头像、合同附件上传）

## 八、启动 Node 项目

回到宝塔面板 → **网站** → 选中你的项目：
1. 状态应该是 **已停止**
2. 点 **启动** 按钮
3. 等几秒，PM2 会自动加载
4. 查看日志确认无报错

**首次启动日志会显示**：
```
✅ 数据库表结构初始化完成（init.sql）
🚀 建亿OA系统后端运行在 http://localhost:3001
```

## 九、配置前端 web 站点（Vue3）

前端 web 单独跑（端口 5173 或 80），需要新建另一个站点：

1. 宝塔面板 → **网站** → **添加站点**
2. 类型 **Node 项目**（Vite 预览模式）
3. 端口：`5173`
4. 项目路径：`/www/wwwroot/jianyioa-web`
5. 把本地 `jianyioa-system/web/` 的文件传到这个目录（不含 node_modules）
6. 在这个目录下创建 `.env` 或修改 `vite.config.js`：
   ```js
   server: {
     proxy: {
       '/api': 'http://localhost:3001'
     }
   }
   ```
7. 终端进入该目录：
   ```bash
   cd /www/wwwroot/jianyioa-web
   npm install --omit=dev
   npm run build
   ```
8. 把 `dist/` 里的文件复制到上层，或改宝塔站点类型为 **静态站点**

## 十、绑定域名 erp.fujinwanjia.com

DNS 已指向 116.204.19.53 ✅（dig 验证通过）

### 1. 添加站点

1. 宝塔面板 → **网站** → **添加站点**
2. 填写：
   - 域名：`erp.fujinwanjia.com`
   - 根目录：`/www/wwwroot/erp.fujinwanjia.com`
   - PHP 版本：**纯静态**（不选 PHP，项目用 Node 跑）
   - 数据库：**不创建**
3. 点 **提交**

### 2. 配置反向代理（让 Apache 把请求转发给 Node）

1. 选中刚建的站点 → **设置** → **反向代理** → **添加反向代理**
2. 填写：
   - 代理名称：`node-backend`
   - 目标 URL：`http://127.0.0.1:3001`
   - 发送域名：`$host`（默认即可）
3. 点 **提交**

### 3. 申请 SSL 证书

1. 同站点设置页面 → **SSL** → **Let's Encrypt**
2. 域名列表里勾选 `erp.fujinwanjia.com`
3. 点 **申请**（1-2 分钟）
4. 申请成功后，开启 **强制 HTTPS**

### 4. 验证

- 浏览器打开 `https://erp.fujinwanjia.com/api/health`
- 应返回后端健康检查 JSON
- 再打开 `https://erp.fujinwanjia.com/` 应是前端登录页

### 5. 跨域问题排查

如果前端报 `CORS` 错误：
- 后端 server.js 已经有 `app.use(cors())` 全局允许，正常应无 CORS 问题
- 如果走反向代理，前端请求 `/api/xxx` 同源，不会跨域
- 检查 vite.config.js 的 proxy 配置（前端用的端口决定是否需要 proxy）

## 十一、测试访问

浏览器打开：
- 后端 API 健康检查：`http://116.204.19.53:3001/api/health`
- 前端站点：`http://116.204.19.53:5173/` 或 `http://jianyioa.yourdomain.com/`

## 常见问题

### Q: 启动报错 "ECONNREFUSED 127.0.0.1:3306"
- 检查 `.env` 里 `DB_PASSWORD` 是否正确
- 检查宝塔 → 数据库 → 用户权限里 `jianyioa` 用户绑定的数据库是 `jianyioa`

### Q: 报错 "Access denied for user"
- 密码输错。宝塔 → 数据库 → 修改密码，重启 Node 项目

### Q: 前端跨域报错
- 后端已经 `app.use(cors())` 允许所有来源，生产环境应该限制

### Q: PM2 显示 "errored"
- 看宝塔 → 项目 → 日志
- 99% 是 `.env` 没配对

## 安全建议（部署完必做）

1. **关闭宝塔面板 API 接口**（设置 → API接口 → 关闭）
2. **改 SSH/面板密码**
3. **限制 MySQL 远程连接**（数据库 → 修改权限 → 只允许 localhost）
4. **数据库用户密码**用强密码
5. **`.env` 文件不要传到公网仓库**

---

## 部署完成后告诉我

- ✅ 后端能跑：能 ping 通 `http://116.204.19.53:3001/api/health`
- ✅ 前端能访问：浏览器能打开登录页
- ✅ 登录能进：默认账号 `admin` / `admin123`（如有）

有问题随时找我。
