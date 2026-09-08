# 建亿OA系统 v1.0.1 - 部署说明

## 包内容
- `package.json` - 根目录启动配置
- `install.bat` - Windows 一键安装脚本
- `server/` - 后端代码（包含 server.js, db-mysql.js, db-mysql-async.js, .env, package.json）
- `web/dist/` - **预编译好的前端**（不需要再 npm install 或 build）
- `web/package.json` + `web/vite.config.js` - 前端源码（备用，要重 build 时用）

## 部署步骤

### 第一步：上传并解压
1. 把整个 `jianyioa-v1.0.1` 文件夹上传到服务器 `D:\wwwroot\`
2. 双击运行 `install.bat`（或手动执行下方命令）

### 第二步：MySQL 用户授权（关键！）
服务器第一次连接会报 "Host not allowed"，因为 MySQL 的 jianyioa 用户只授权给特定主机。

**宝塔面板 → 数据库 → jianyioa → 管理（phpMyAdmin）→ 用 root 登录 → SQL 标签执行：**

```sql
CREATE USER 'jianyioa'@'%' IDENTIFIED BY 'zpfbAsxyA76P2ZHw';
GRANT ALL PRIVILEGES ON jianyioa.* TO 'jianyioa'@'%';
FLUSH PRIVILEGES;
```

### 第三步：宝塔里创建 Node 项目
1. 宝塔面板 → Node项目 → 添加项目
2. **项目目录** = `D:\wwwroot\jianyioa-v1.0.1\server`
3. **启动选项** = `start`（从下拉框里选，不要手敲）
4. **Node 版本** = v18.20.8
5. **包管理器** = npm
6. 保存 → 启动

### 第四步：验证
浏览器打开 `https://erp.fujinwanjia.com`
- 能看到登录页 = 部署成功
- 侧边栏底部看到 `v 1.0.1` = 前端版本正确
- 登录后看到合同 = 后端+数据库 OK

## 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `Cannot find module 'dotenv'` | 没装依赖 | 跑 `npm install --legacy-peer-deps` |
| `Cannot find module 'db-mysql-async.js'` | 文件没传全 | 重新解压整个 zip |
| `ERR_REQUIRE_ESM` puppeteer | puppeteer 装到 v25 | 跑 `npm install puppeteer@22 --legacy-peer-deps` |
| `Host not allowed` | MySQL 没授权 | 跑上面的 SQL |
| `port 3001 already in use` | 端口被占 | 改 .env 的 PORT 字段 |

## 端口说明
- 后端默认 3001（与 Apache 代理一致）
- Apache 已经配置 `/api/` 和 `/uploads/` 代理到 3001
- 修改端口要同步改 Apache 配置 `D:\BtSoft\apache\conf\vhost\erp.fujinwanjia.com.conf`

## 重启服务
```cmd
cd D:\wwwroot\jianyioa-v1.0.1\server
taskkill /F /IM node.exe
npm start
```

或者在宝塔里点「重启项目」。
