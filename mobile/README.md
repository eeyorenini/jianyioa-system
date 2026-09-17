# 建亿OA移动端

**uni-app + Vue 3 + Vite**，H5/小程序/App 三端通用

- 📱 H5 开发：http://localhost:10086
- 🌐 外网访问：通过 FRP 穿透（端口 7778）
- 🔧 API 后端：http://116.204.19.53:3002

---

## 技术栈

- uni-app（Vue 3）
- Vite 构建
- Pinia 状态管理
- TypeScript（仅类型声明，禁止泛型/类型注解语法）

---

## 目录结构

```
mobile/
├── src/
│   ├── pages/          # 页面
│   │   ├── home/       # 首页仪表盘
│   │   ├── projects/   # 项目、节点、甘特图
│   │   ├── inspection/ # 巡检验收
│   │   ├── dispatch/   # 派工管理
│   │   ├── contract/   # 合同
│   │   ├── customers/  # 客户管理
│   │   ├── material/   # 材料管理
│   │   └── ...
│   ├── stores/         # Pinia 状态
│   └── ...
├── package.json
├── vite.config.ts
└── README.md
```

## 启动

```bash
npm install
npm run dev:h5
```

## 版本历史

| 版本 | 日期 | 主要内容 |
|------|------|---------|
| v1.0.0 | 2026-09-17 | 初始移动端备份 |
