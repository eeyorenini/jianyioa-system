<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar" :style="navStyleCapsule">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">我的</text>
      <view class="msg-icon" @click="goMessage">
        <text>🔔</text>
        <view class="msg-badge" v-if="unreadCount > 0">{{ unreadCount > 99 ? '99+' : unreadCount }}</view>
      </view>
    </view>

    <!-- 借权模式横幅 -->
    <view v-if="imp.impersonating" class="imp-banner">
      <text class="imp-icon">🔑</text>
      <view class="imp-text">
        <text class="imp-title">借权模式中</text>
        <text class="imp-sub">当前身份：{{ imp.targetName }}（{{ imp.targetRole || '无角色' }}）</text>
      </view>
      <view class="imp-exit" @click="exitImpersonate">结束</view>
    </view>

    <!-- 个人信息卡片 -->
    <view class="profile-card">
      <view class="profile-avatar">{{ avatarText }}</view>
      <view class="profile-info">
        <text class="profile-name">{{ userName }}</text>
        <view class="role-badge" :class="roleBadgeClass">{{ roleName }}</view>
      </view>
    </view>

    <!-- 角色专属快捷 -->
    <view class="menu-section">
      <view class="menu-title">我的工作</view>
      <view class="menu-grid">
        <view class="menu-item" v-for="item in myWork" :key="item.label" @click="goPage(item.url)">
          <view class="menu-icon" :style="{ background: item.bg }">{{ item.icon }}</view>
          <text class="menu-label">{{ item.label }}</text>
        </view>
      </view>
    </view>

    <!-- 系统功能 -->
    <view class="menu-section">
      <view class="menu-title">系统</view>
      <view class="menu-list">
        <view class="menu-row" @click="goPage('/pages/mine/signature')">
          <text class="menu-row-icon">✍️</text>
          <text class="menu-row-label">我的签名</text>
          <text class="sign-tag" :class="signTagClass">{{ signTagText }}</text>
          <text class="menu-row-arrow">›</text>
        </view>
        <view class="menu-row" @click="goPage('/pages/todo/index')">
          <text class="menu-row-icon">📥</text>
          <text class="menu-row-label">待办中心</text>
          <text class="menu-row-arrow">›</text>
        </view>
        <view class="menu-row" @click="goPage('/pages/message/list')">
          <text class="menu-row-icon">🔔</text>
          <text class="menu-row-label">消息通知</text>
          <text class="menu-row-arrow">›</text>
        </view>
        <view v-if="canSeeReport" class="menu-row" @click="goPage('/pages/report/index')">
          <text class="menu-row-icon">📊</text>
          <text class="menu-row-label">数据报表</text>
          <text class="menu-row-arrow">›</text>
        </view>
        <view v-if="imp.isAdmin && !imp.impersonating" class="menu-row" @click="showBorrowPicker">
          <text class="menu-row-icon">🔑</text>
          <text class="menu-row-label">借权测试（管理员）</text>
          <text class="menu-row-arrow">›</text>
        </view>
        <view v-if="imp.impersonating" class="menu-row" @click="exitImpersonate">
          <text class="menu-row-icon">↩️</text>
          <text class="menu-row-label">结束借权（回到管理员）</text>
          <text class="menu-row-arrow">›</text>
        </view>
        <!-- #ifdef MP-WEIXIN -->
        <!-- 员工自查微信绑定：让员工自己看到「这台手机能不能一键登录」，
             不用每次都去问管理员。H5 没有 wx.login，不显示。 -->
        <view class="menu-row" @click="onWxBindTap">
          <text class="menu-row-icon">💬</text>
          <text class="menu-row-label">微信登录</text>
          <text class="wx-bind-tag" :class="wxBindTagClass">{{ wxBindTagText }}</text>
          <text class="menu-row-arrow">›</text>
        </view>
        <!-- #endif -->
        <view class="menu-row" @click="logout">
          <text class="menu-row-icon">🚪</text>
          <text class="menu-row-label logout">退出登录</text>
          <text class="menu-row-arrow">›</text>
        </view>
      </view>
    </view>

    <!-- 版本信息 -->
    <view class="version-info">
      <text>简逸ERP · 工地管理系统 v{{ APP_VERSION }}</text>
    </view>

    <!-- 借权对象选择弹窗（员工列表） -->
    <BottomPicker
      v-model:visible="borrowPicker.visible"
      :title="borrowPicker.title"
      :items="borrowPicker.items"
      @select="onBorrowSelect"
      @cancel="borrowPicker.visible = false"
    />
  </view>
</template>

<script setup >
import { ref, computed, onMounted } from "vue";
import { onShow, onPullDownRefresh } from "@dcloudio/uni-app";
import { useUserStore } from "@/stores/user";
import BottomPicker from "@/components/bottom-picker.vue";
import { MY_WORK_ITEMS, visibleEntries, roleClass, applyRoleTabBar, authHeader } from "@/utils/permission";
import { resolvePageUrl, isTabBarPage } from "@/utils/pageUrl";
import { syncMessageBadge } from "@/utils/tabbar";
import { miniBindStatus } from "@/utils/wechat";
import { runPullRefresh } from "@/utils/listPager";

const userStore = useUserStore();
// 版本号来自 package.json（vite define 注入），不再手写
const APP_VERSION = __APP_VERSION__;
const imp = userStore.imp;
const userName = computed(() => userStore.state.name || '用户');
const roleName = computed(() => userStore.state.position || userStore.state.role_name || '未知');
const avatarText = computed(() => (userName.value || 'U').substring(0, 1).toUpperCase());
const unreadCount = ref(0);

const loadUnread = () => {
  // 2026-10-21 修复：原来 userId 为空时直接 return，导致下面 removeTabBarBadge 永远不会执行，
  // 底部「我的」tab 上的原生徽标会一直留着旧数字（用户反馈"刷新小程序还是 48"）。
  // uni.setTabBarBadge 是原生持久化徽标，页面刷新/代码更新都不会自动消失，必须显式移除。
  uni.request({
    url: '/api/messages/unread-count',
    header: authHeader(),
    success: (res) => {
      const count = Number(res.data?.count || 0);
      unreadCount.value = count;
      // 设置 TabBar「我的」tab 的 badge —— tabBar 共5项（小程序上限5）：
      // 首页0 项目1 巡检2 采购3 我的4。
      // ⚠️ 这里必须是 4：原代码按 6 项写成 5，小程序直接报
      //   "setTabBarBadge:fail tabbar item not found"
      // 2026-10-22：统一走 utils/tabbar，内部会判断当前页是否 tabBar 页并静默 fail
      syncMessageBadge(count);
    },
    fail: () => {
      // 请求失败（未登录/断网）也把徽标清掉，宁可不显示也不显示错数字
      unreadCount.value = 0;
      syncMessageBadge(0);
    }
  });
};

// ====== 微信绑定状态（仅小程序，员工自查） ======
// is_current 语义：true=本机微信已绑定 / false=绑的是别的微信 / null=查不到（无 code）
const wxBind = ref({ loaded: false, bound: false, isCurrent: null, bindTime: "", nickname: "" });
let wxBindAt = 0; // 上次查询时间戳，60 秒内不重复打 jscode2session

/** 库里是 UTC 字符串，补 Z 再转本地，否则少 8 小时 */
const fmtBindTime = (s) => {
  if (!s) return "";
  const raw = String(s).trim();
  const iso = raw.indexOf("T") > 0 ? raw : raw.replace(" ", "T");
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const loadWxBind = async () => {
  // #ifdef MP-WEIXIN
  if (!userStore.state.id) return;
  if (Date.now() - wxBindAt < 60 * 1000) return;
  wxBindAt = Date.now();
  const d = await miniBindStatus();
  if (!d || !d.success) return;
  wxBind.value = {
    loaded: true,
    bound: !!d.bound,
    isCurrent:
      d.is_current === null || d.is_current === undefined ? null : !!d.is_current,
    bindTime: d.bind_time || "",
    nickname: d.nickname || "",
  };
  // #endif
};

const wxBindTagText = computed(() => {
  if (!wxBind.value.loaded) return "检测中";
  if (!wxBind.value.bound) return "未绑定";
  if (wxBind.value.isCurrent === true) return "已绑本机";
  if (wxBind.value.isCurrent === false) return "已绑其他机";
  return "已绑定";
});

const wxBindTagClass = computed(() => {
  if (!wxBind.value.loaded || !wxBind.value.bound) return "is-none";
  if (wxBind.value.isCurrent === true) return "is-ok";
  if (wxBind.value.isCurrent === false) return "is-warn";
  return "is-none";
});

const onWxBindTap = () => {
  const b = wxBind.value;
  if (!b.loaded) {
    uni.showToast({ title: "正在检测…", icon: "none" });
    return;
  }
  const when = fmtBindTime(b.bindTime);

  if (!b.bound) {
    uni.showModal({
      title: "微信未绑定",
      content: "请联系管理员在电脑端「员工管理」里生成绑定码，扫码后即可用微信一键登录。",
      showCancel: false,
    });
    return;
  }

  if (b.isCurrent === true) {
    uni.showModal({
      title: "已绑定本机",
      content: `下次打开小程序可直接「微信一键登录」，无需输入密码。${when ? "\n绑定时间：" + when : ""}`,
      showCancel: false,
    });
    return;
  }

  if (b.isCurrent === false) {
    uni.showModal({
      title: "当前微信未绑定",
      content: `该账号已绑定其他微信${when ? "（" + when + "）" : ""}。如需换成本机，请让管理员先在电脑端解绑。`,
      showCancel: false,
    });
    return;
  }

  uni.showModal({
    title: "已绑定微信",
    content: when ? "绑定时间：" + when : "该账号已绑定微信。",
    showCancel: false,
  });
};

const syncUser = () => {
  loadUnread();
  loadWxBind();
  loadSignature();
  // 权限以服务端为准：刷新后重新应用 tabBar（角色/借权变化即时生效）
  userStore.fetchMe().then(() => applyRoleTabBar());
};

// ====== 手写签名状态（验收签字要用，没签就提示） ======
const signState = ref({ loaded: false, exists: false });
const signTagText = computed(() => {
  if (!signState.value.loaded) return '检测中';
  return signState.value.exists ? '已保存' : '未签写';
});
const signTagClass = computed(() => (signState.value.exists ? 'is-ok' : 'is-warn'));

const loadSignature = () => {
  uni.request({
    url: '/api/signatures/me',
    header: authHeader(),
    success: (res) => {
      const d = res.data || {};
      signState.value = { loaded: true, exists: !!d.exists };
    },
    fail: () => { signState.value = { loaded: true, exists: false }; },
  });
};
onMounted(syncUser);
onShow(syncUser);

// 下拉刷新：重拉未读数 / 微信绑定状态 / 用户信息（与 onShow 同一套逻辑）
onPullDownRefresh(() => runPullRefresh(syncUser));

const goMessage = () => {
  // 过一层 resolvePageUrl：小程序端该页在 pkg-misc 分包，构建期虽然会改写字面量，
  // 但运行期归一化更保险（导出 App / H5 两端一致）
  uni.navigateTo({
    url: resolvePageUrl('/pages/message/list'),
    fail: () => uni.showToast({ title: '页面打开失败', icon: 'none' })
  });
};

// 「我的工作」按权限过滤（配置集中在 utils/permission.ts，不再硬编码角色名）
const myWork = computed(() => visibleEntries(MY_WORK_ITEMS));

// 角色标签样式（统一到 utils/permission）
const roleBadgeClass = computed(() => roleClass(userStore.state.role_code, roleName.value));

// 数据报表入口：按 report:read 权限显示
const canSeeReport = computed(() => userStore.canSee('report:read'));

const goPage = (url) => {
  if (!url) return;
  // ⚠️ 2026-10-23 修复「我的」里点待办中心/消息通知没任何反应：
  // 原来用 `url.startsWith('/pages')` 做前置判断，但小程序构建期 vite 的
  // subpackagePaths 插件会把源码里的 '/pages/xxx' 字面量改写成 '/pkg-xxx/xxx'，
  // 运行时这个判断恒为 false → 函数体整段跳过 → 点击静默无反应。
  // 现在统一走 utils/pageUrl：先归一化路径，再按「tabBar 页 / 普通页」分流，失败给提示。
  const target = url.startsWith('/pages/') ? resolvePageUrl(url) : url;
  const path = target.split('?')[0];
  const fail = () => uni.showToast({ title: '页面打开失败', icon: 'none' });
  if (isTabBarPage(path)) {
    // tabBar 页面只能用 switchTab，且不能带 query
    uni.switchTab({ url: path, fail });
  } else {
    uni.navigateTo({ url: target, fail });
  }
};

// ====== 管理员借权（仅 admin 可用；按"具体员工账号"借权） ======
const borrowPicker = ref({ visible: false, title: '选择借权对象', items: [] });
const borrowLoading = ref(false);

const showBorrowPicker = async () => {
  if (borrowLoading.value) return;
  borrowLoading.value = true;
  uni.showLoading({ title: '加载中...' });
  try {
    const res = await uni.request({ url: '/api/admin/impersonate-targets' });
    uni.hideLoading();
    const list = Array.isArray(res.data) ? res.data : [];
    if (!list.length) {
      uni.showToast({ title: '暂无可借权员工', icon: 'none' });
      return;
    }
    borrowPicker.value = {
      visible: true,
      title: '选择借权的员工账号',
      items: list.map((e) => ({
        name: `${e.name}（${e.role_name || '无角色'}）`,
        desc: `${e.username}${e.position ? ' · ' + e.position : ''}`,
        icon: e.role_code === 'admin' ? '👑' : '👤',
        value: e.id,
      })),
    };
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    borrowLoading.value = false;
  }
};

const onBorrowSelect = async ({ item }) => {
  borrowPicker.value.visible = false;
  const targetId = item.value;
  if (!targetId) return;
  uni.showLoading({ title: '切换中...' });
  try {
    const res = await uni.request({
      url: '/api/admin/impersonate',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { target_employee_id: targetId },
    });
    uni.hideLoading();
    const d = res.data || {};
    if (!d.success || !d.user) {
      uni.showToast({ title: d.error || '借权失败', icon: 'none' });
      return;
    }
    userStore.startImpersonate(d.user);
    uni.showToast({ title: `已借权为 ${d.user.name}`, icon: 'none' });
    setTimeout(() => { uni.reLaunch({ url: '/pages/home/index' }); }, 600);
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: '借权失败', icon: 'none' });
  }
};

const exitImpersonate = () => {
  uni.showModal({
    title: '结束借权',
    content: '确定回到管理员身份？',
    success: (r) => {
      if (!r.confirm) return;
      uni.request({
        url: '/api/admin/impersonate/stop',
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: { target_employee_id: userStore.state.id },
        complete: () => {
          userStore.stopImpersonate();
          uni.showToast({ title: '已结束借权', icon: 'none' });
          setTimeout(() => { uni.reLaunch({ url: '/pages/home/index' }); }, 500);
        },
      });
    },
  });
};

const logout = () => {
  uni.showModal({
    title: '退出登录',
    content: '确定退出当前账号？',
    success: (res) => {
      if (res.confirm) {
        uni.clearStorageSync();
        uni.reLaunch({ url: '/pages/login/login' });
      }
    },
  });
};




const goBack = () => {
  const pages = getCurrentPages();
  if (pages.length <= 1) {
    uni.switchTab({ url: '/pages/home/index' });
  } else {
    uni.navigateBack();
  }
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 30px;
}

.profile-card {
  background: linear-gradient(135deg, #1E3A5F, #2D5A8E);
  padding: 30px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  color: #fff;
}

.profile-avatar {
  width: 60px;
  height: 60px;
  background: rgba(255,255,255,0.15);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.profile-info {
  flex: 1;
}

.profile-name {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 6px;
}

/* 借权模式横幅 */
.imp-banner {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #F59E0B, #EF4444);
  color: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.25);
}
.imp-banner .imp-icon { font-size: 20px; margin-right: 10px; }
.imp-banner .imp-text { flex: 1; display: flex; flex-direction: column; }
.imp-banner .imp-title { font-size: 14px; font-weight: 700; }
.imp-banner .imp-sub { font-size: 12px; opacity: 0.9; margin-top: 2px; }
.imp-banner .imp-exit {
  font-size: 13px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 16px;
  padding: 5px 14px;
}

.role-badge {
  display: inline-block;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 20px;
  background: rgba(255,255,255,0.15);
  color: #fff;
}

.menu-section {
  margin: 16px;
}

.menu-title {
  font-size: 13px;
  font-weight: 600;
  color: #9CA3AF;
  margin-bottom: 10px;
  padding-left: 4px;
}

.menu-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.menu-item {
  background: #fff;
  border-radius: 14px;
  padding: 16px 8px;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.menu-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  margin: 0 auto 8px;
}

.menu-label {
  font-size: 12px;
  color: #374151;
}

.menu-list {
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
}

.menu-row {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #F9FAFB;
  cursor: pointer;
}

.menu-row:last-child { border-bottom: none; }

.menu-row-icon {
  font-size: 18px;
  margin-right: 12px;
}

.menu-row-label {
  flex: 1;
  font-size: 14px;
  color: #1A1F36;
}

.menu-row-label.logout { color: #EF4444; }

.menu-row-arrow {
  font-size: 20px;
  color: #D1D5DB;
}

/* 签名状态标签 */
.sign-tag {
  font-size: 22rpx;
  line-height: 1;
  padding: 8rpx 14rpx;
  border-radius: 20rpx;
  margin-right: 12rpx;
  flex-shrink: 0;
}

.sign-tag.is-ok {
  background: #E8F8F0;
  color: #10B981;
}

.sign-tag.is-warn {
  background: #FEF6E7;
  color: #D97706;
}

/* 微信绑定状态标签（仅小程序「我的」页） */
.wx-bind-tag {
  font-size: 11px;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 10px;
  margin-right: 6px;
  flex-shrink: 0;
}

.wx-bind-tag.is-ok {
  background: #E8F8F0;
  color: #10B981;
}

.wx-bind-tag.is-warn {
  background: #FEF6E7;
  color: #D97706;
}

.wx-bind-tag.is-none {
  background: #F3F4F6;
  color: #9CA3AF;
}

.version-info {
  text-align: center;
  padding: 20px;
  font-size: 11px;
  color: #D1D5DB;
}

/* 导航栏 */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1E3A5F;
  color: #fff;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-back {
  font-size: 28px;
  font-weight: 300;
  width: 40px;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
}

.msg-icon {
  position: relative;
  font-size: 20px;
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.msg-badge {
  position: absolute;
  top: -4px;
  right: 0px;
  background: #EF4444;
  color: #fff;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

</style>
