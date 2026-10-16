<script setup >
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import { useUserStore } from "./stores/user";
import { applyRoleTabBar } from "./utils/permission";
import { API_ORIGIN, absUrl, absAsset } from "./utils/api";

onLaunch(() => {
  console.log("App Launch");

  // 包装 uni.request / uploadFile / downloadFile，做三件事：
  //   1) 自动注入 x-user-id 和 x-user-role（用于后端权限过滤）
  //   2) 把相对路径 `/api/xxx` 补成绝对地址（微信小程序不支持相对路径）
  //   3) 兜底补 Content-Type（见下方说明）
  //
  // ⚠️ 关于 Content-Type：uni 运行时在小程序端**不会**给请求补默认 Content-Type
  //    （全产物里搜不到任何默认值，只有少数页面自己手写了 header）。
  //    后端用 bodyParser.json() 解析请求体，拿不到 Content-Type 就解析不出 body，
  //    req.body 变成空对象 → 登录接口 `WHERE username=? AND password=?` 匹配不到任何行
  //    → 一直返回"用户名或密码错误"。这里统一兜底，省得每个页面都手写。
  const hasContentType = (headers) =>
    Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');

  /** 注入身份头 + 兜底 Content-Type（调用方已显式指定的绝不覆盖） */
  const buildHeaders = (options, allowJsonDefault) => {
    const headers = options.header || {};
    const userInfo = uni.getStorageSync('userInfo');
    if (userInfo?.id) headers['x-user-id'] = userInfo.id;
    if (userInfo?.role_code || userInfo?.role_name) {
      headers['x-user-role'] = userInfo.role_code || userInfo.role_name || '';
    }
    const method = String(options.method || 'GET').toUpperCase();
    const d = options.data;
    const isBinary = typeof ArrayBuffer !== 'undefined' && d instanceof ArrayBuffer;
    if (
      allowJsonDefault &&
      !hasContentType(headers) &&
      method !== 'GET' &&
      method !== 'HEAD' &&
      d !== undefined && d !== null &&
      typeof d === 'object' &&
      !isBinary
    ) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  };

  const _origRequest = uni.request.bind(uni);
  uni.request = (options) => {
    options.header = buildHeaders(options, true);
    options.url = absUrl(options.url);
    return _origRequest(options);
  };

  // 上传：补绝对地址 + 注入身份头。
  // 注意不能补 application/json —— uploadFile 是 multipart，Content-Type 由框架自己带 boundary。
  const _origUpload = uni.uploadFile.bind(uni);
  uni.uploadFile = (options) => {
    options.header = buildHeaders(options, false);
    options.url = absUrl(options.url);
    return _origUpload(options);
  };

  // 下载：补绝对地址
  const _origDownload = uni.downloadFile.bind(uni);
  uni.downloadFile = (options) => {
    options.url = absUrl(options.url);
    return _origDownload(options);
  };

  // 图片预览：统一把相对路径补成绝对地址。
  // 全项目约 40 处 uni.previewImage 调用，逐个改成本高且易漏；在此统一兜底。
  // absAsset 对已是绝对地址的字符串原样返回，因此重复调用无副作用。
  const _origPreview = uni.previewImage.bind(uni);
  uni.previewImage = (options) => {
    if (options && Array.isArray(options.urls)) {
      options.urls = options.urls.map((u) => absAsset(u));
      if (options.current) options.current = absAsset(options.current);
    }
    return _origPreview(options);
  };

  if (API_ORIGIN) {
    console.log('[api] 后端基址:', API_ORIGIN);
  }

  // 全局兜底：捕获未处理的 Promise 拒绝（H5 下 navigator.onLine 抖动 /
  // 第三方库副作用冒出的 reject），避免污染控制台（之前用户反馈"登录后控制台报错"）。
  // 仅记录到 console.warn，不弹 toast，不影响业务 UX。
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      try {
        const reason = event && event.reason;
        const msg = (reason && (reason.message || reason.msg || reason.errMsg)) || (typeof reason === 'string' ? reason : 'unknown');
        console.warn('[unhandledrejection]', msg);
        event.preventDefault();
      } catch (_) { /* 忽略 */ }
    });
  }
});

onShow(() => {
  const { checkAuth } = useUserStore();
  checkAuth();
  // 已登录时按角色应用底部 tabBar（未登录会被 checkAuth 重定向到登录页，此处跳过）
  if (uni.getStorageSync("token")) {
    try {
      applyRoleTabBar();
    } catch (e) {
      console.warn('[applyRoleTabBar] failed:', (e && e.message) || e);
    }
  }
});

onHide(() => {
  console.log("App Hide");
});
</script>

<style>
/* ==================== 全局变量 ==================== */
page {
  --color-primary: #1E3A5F;
  --color-primary-light: #2D5A8E;
  --color-primary-dark: #152B47;
  --color-accent: #FF6B35;
  --color-success: #10B981;
  --color-danger: #EF4444;
  --color-warning: #F59E0B;
  --color-bg: #F5F7FA;
  --color-bg-white: #FFFFFF;
  --color-text: #1A1F36;
  --color-text-secondary: #6B7280;
  --color-border: #E5E7EB;
  --color-border-light: #F3F4F6;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.12);

  background-color: var(--color-bg);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
  font-size: 14px;
  color: var(--color-text);
  box-sizing: border-box;
}

/* ==================== 通用工具类 ==================== */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.justify-center { justify-content: center; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.gap-4 { gap: 16px; }
.flex-1 { flex: 1; }
.flex-wrap { flex-wrap: wrap; }

/* ==================== 通用卡片 ==================== */
.card {
  background: var(--color-bg-white);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: 16px;
  margin-bottom: 12px;
}

/* ==================== 按钮 ==================== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  min-height: 44px;
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
}

.btn-primary:active {
  background: var(--color-primary-dark);
  transform: scale(0.98);
}

.btn-accent {
  background: var(--color-accent);
  color: #fff;
}

.btn-outline {
  background: transparent;
  border: 1.5px solid var(--color-border);
  color: var(--color-text-secondary);
}

.btn-success {
  background: var(--color-success);
  color: #fff;
}

.btn-danger {
  background: var(--color-danger);
  color: #fff;
}

.btn-block {
  width: auto;
  min-width: 160px;
}

/* ==================== 状态标签 ==================== */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.tag-success { background: #D1FAE5; color: #065F46; }
.tag-warning { background: #FEF3C7; color: #92400E; }
.tag-danger { background: #FEE2E2; color: #991B1B; }
.tag-info { background: #DBEAFE; color: #1E40AF; }
.tag-default { background: #F3F4F6; color: #6B7280; }
.tag-accent { background: #FFE4D6; color: #C2410C; }

/* ==================== 表单 ==================== */
.form-item {
  margin-bottom: 16px;
}

.form-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
  display: block;
  font-weight: 500;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-bg-white);
  box-sizing: border-box;
  transition: border-color 0.2s;
  min-height: 44px;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.form-input::placeholder {
  color: #CBD5E1;
}

/* ==================== 空状态 ==================== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--color-text-secondary);
}

.empty-state .empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.4;
}

.empty-state .empty-text {
  font-size: 14px;
}

/* ==================== 页面容器 ==================== */
.page {
  min-height: 100vh;
  background: var(--color-bg);
  padding: 16px;
}

.page-header {
  padding: 20px 16px 16px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 16px;
}

/* ==================== 分割线 ==================== */
.divider {
  height: 1px;
  background: var(--color-border-light);
  margin: 12px 0;
}

/* ==================== 列表项 ==================== */
.list-item {
  background: var(--color-bg-white);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  margin-bottom: 10px;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: all 0.15s;
}

.list-item:active {
  transform: scale(0.99);
  box-shadow: var(--shadow-md);
}

/* ==================== 底部操作栏 ==================== */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-bg-white);
  padding: 12px 16px;
  display: flex;
  gap: 12px;
  box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
  z-index: 100;
}

.bottom-bar .btn {
  flex: 1;
}

/* ==================== 数字动画 ==================== */
.stat-num {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-primary);
}

.stat-num.danger { color: var(--color-danger); }
.stat-num.success { color: var(--color-success); }
.stat-num.warning { color: var(--color-warning); }
</style>
