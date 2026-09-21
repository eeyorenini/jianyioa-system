<script setup >
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import { useUserStore } from "./stores/user";

onLaunch(() => {
  console.log("App Launch");

  // 包装 uni.request，自动注入 x-user-id 和 x-user-role（用于后端权限过滤）
  const _origRequest = uni.request.bind(uni);
  uni.request = (options) => {
    const userInfo = uni.getStorageSync('userInfo');
    const headers = options.header || {};
    if (userInfo?.id) {
      headers['x-user-id'] = userInfo.id;
    }
    if (userInfo?.role_code || userInfo?.role_name) {
      headers['x-user-role'] = userInfo.role_code || userInfo.role_name || '';
    }
    options.header = headers;
    return _origRequest(options);
  };
});

onShow(() => {
  const { checkAuth } = useUserStore();
  checkAuth();
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
  width: 100%;
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
