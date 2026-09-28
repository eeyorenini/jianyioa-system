<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">我的</text>
      <view class="msg-icon" @click="goMessage">
        <text>🔔</text>
        <view class="msg-badge" v-if="unreadCount > 0">{{ unreadCount > 99 ? '99+' : unreadCount }}</view>
      </view>
    </view>

    <!-- 个人信息卡片 -->
    <view class="profile-card">
      <view class="profile-avatar">{{ avatarText }}</view>
      <view class="profile-info">
        <text class="profile-name">{{ userName }}</text>
        <view class="role-badge" :class="getRoleClass(roleName)">{{ roleName }}</view>
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
        <view class="menu-row" @click="goPage('/pages/message/list')">
          <text class="menu-row-icon">🔔</text>
          <text class="menu-row-label">消息通知</text>
          <text class="menu-row-arrow">›</text>
        </view>
        <view class="menu-row" @click="goPage('/pages/report/index')">
          <text class="menu-row-icon">📊</text>
          <text class="menu-row-label">数据报表</text>
          <text class="menu-row-arrow">›</text>
        </view>
        <view class="menu-row" @click="showRolePicker">
          <text class="menu-row-icon">👤</text>
          <text class="menu-row-label">切换角色</text>
          <text class="menu-row-arrow">›</text>
        </view>
        <view class="menu-row" @click="logout">
          <text class="menu-row-icon">🚪</text>
          <text class="menu-row-label logout">退出登录</text>
          <text class="menu-row-arrow">›</text>
        </view>
      </view>
    </view>

    <!-- 版本信息 -->
    <view class="version-info">
      <text>简逸装饰 · 工地管理系统 v1.0</text>
    </view>

    <!-- 角色选择弹窗 -->
    <BottomPicker
      v-model:visible="rolePicker.visible"
      :title="rolePicker.title"
      :items="rolePicker.items"
      @select="onRoleSelect"
      @cancel="rolePicker.visible = false"
    />
  </view>
</template>

<script setup >
import { ref, computed, onMounted } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { useUserStore } from "@/stores/user";
import BottomPicker from "@/components/bottom-picker.vue";

const userStore = useUserStore();
const userName = computed(() => userStore.state.name || '用户');
const roleName = computed(() => userStore.state.position || userStore.state.role_name || '未知');
const avatarText = computed(() => (userName.value || 'U').substring(0, 1).toUpperCase());
const unreadCount = ref(0);

// TODO: 临时注释掉 loadUnread 排查超时问题
// const loadUnread = () => {
//   const token = uni.getStorageSync('token');
//   if (!token) return;
//   const userId = uni.getStorageSync('userInfo')?.id;
//   if (!userId) return;
//   uni.request({
//     url: '/api/notifications/unread-count',
//     header: {
//       'Authorization': token,
//       'x-user-id': String(userId)
//     },
//     success: (res) => {
//       if (res.statusCode === 200 && res.data) {
//         unreadCount.value = res.data.count || 0;
//       }
//     },
//     fail: (err) => {
//       console.log('loadUnread fail', err);
//     }
//   });
// };

// onMounted(() => loadUnread());
// onShow(() => loadUnread());

const goMessage = () => {
  uni.navigateTo({ url: '/pages/message/list' });
};

const myWork = computed(() => {
  const role = roleName.value;
  const base = [
    { label: '我的项目', icon: '📁', bg: '#DBEAFE', url: '/pages/projects/list' },
    { label: '我的派工', icon: '👷', bg: '#FEF3C7', url: '/pages/dispatch/list' },
    { label: '我的日志', icon: '📝', bg: '#D1FAE5', url: '/pages/mine/my-logs' },
    { label: '我的巡检', icon: '🔍', bg: '#FEE2E2', url: '/pages/mine/my-inspections' },
  ];
  if (role === '财务') {
    return [{ label: '收支管理', icon: '💰', bg: '#DBEAFE', url: '/pages/finance/list' }];
  }
  if (role === '业主') {
    return [
      { label: '我的项目', icon: '📁', bg: '#DBEAFE', url: '/pages/projects/list' },
      { label: '验收确认', icon: '✅', bg: '#D1FAE5', url: '/pages/projects/list' },
      { label: '我的账单', icon: '💰', bg: '#FEF3C7', url: '/pages/finance/list' },
    ];
  }
  return base;
});

const getRoleClass = (role) => {
  if (role.includes('管理')) return 'role-admin';
  if (role.includes('设计')) return 'role-designer';
  if (role.includes('工长')) return 'role-worker';
  if (role.includes('监理')) return 'role-supervisor';
  if (role.includes('业主')) return 'role-owner';
  return 'role-default';
};

const goPage = (url) => {
  if (url.startsWith('/pages')) {
    uni.navigateTo({ url });
  }
};

const showRolePicker = () => {
  rolePicker.value = {
    visible: true,
    title: '切换角色',
    items: [
      { name: '管理员', icon: '👑', value: '管理员' },
      { name: '设计师', icon: '✏️', value: '设计师' },
      { name: '工长', icon: '👷', value: '工长' },
      { name: '监理', icon: '🔍', value: '监理' },
      { name: '业主', icon: '🏠', value: '业主' },
      { name: '主材', icon: '🧱', value: '主材' },
      { name: '财务', icon: '💰', value: '财务' },
      { name: '助理', icon: '📋', value: '助理' },
    ],
  };
};

const rolePicker = ref({
  visible: false,
  title: '切换角色',
  items: [],
});

const onRoleSelect = ({ item }) => {
  rolePicker.value.visible = false;
  userStore.state.role_name = item.value;
  userStore.state.position = item.value;
  uni.showToast({ title: `已切换为 ${item.value}`, icon: 'none' });
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
