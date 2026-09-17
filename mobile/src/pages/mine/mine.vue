<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">个人中心</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="user-card">
      <view class="avatar">{{ (userState.name || 'U')[0] }}</view>
      <view class="user-info">
        <view class="nickname">{{ userState.name || '用户' }}</view>
        <view class="position">{{ userState.position || '暂无职位' }}</view>
      </view>
    </view>

    <view class="info-list">
      <view class="info-item">
        <text class="info-label">账号</text>
        <text class="info-value">{{ userState.username }}</text>
      </view>
      <view class="info-item">
        <text class="info-label">角色</text>
        <text class="info-value">{{ userState.role_name || '暂无' }}</text>
      </view>
      <view class="info-item">
        <text class="info-label">电话</text>
        <text class="info-value">{{ userState.phone || '暂无' }}</text>
      </view>
    </view>

    <view class="menu-list">
      <view class="menu-item" @click="goTo('/pages/settings/settings')">
        <text class="menu-icon">⚙️</text>
        <text class="menu-text">设置</text>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="handleLogout">
        <text class="menu-icon">🚪</text>
        <text class="menu-text menu-text-danger">退出登录</text>
        <text class="arrow">›</text>
      </view>
    </view>
  </view>
</template>

<script setup >
import { useUserStore } from "../../stores/user";

const { state: userState, logout, loadUser } = useUserStore();

const goTo = (url) => {
  uni.navigateTo({ url });
};

const handleLogout = () => {
  uni.showModal({
    title: "提示",
    content: "确定要退出登录吗？",
    success: (res) => {
      if (res.confirm) {
        logout();
      }
    },
  });
};

// 每次进入页面刷新用户信息
loadUser();


const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 15px;
}

.user-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  padding: 24px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  color: #fff;
  font-size: 26px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-info {
  flex: 1;
}

.nickname {
  font-size: 20px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 6px;
}

.position {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.info-list {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 15px;
}

.info-item {
  display: flex;
  align-items: center;
  padding: 14px 15px;
  border-bottom: 1px solid #f0f0f0;
}

.info-item:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 14px;
  color: #999;
  width: 50px;
}

.info-value {
  font-size: 14px;
  color: #333;
}

.menu-list {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #f0f0f0;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-icon {
  font-size: 20px;
  margin-right: 12px;
}

.menu-text {
  flex: 1;
  font-size: 15px;
  color: #333;
}

.menu-text-danger {
  color: #ff5252;
}

.arrow {
  font-size: 18px;
  color: #ccc;
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

.nav-placeholder {
  width: 40px;
}

</style>
