<template>
  <view class="page">
    <!-- 用户信息卡片 -->
    <view class="profile-card">
      <view class="profile-avatar">👤</view>
      <view class="profile-info">
        <text class="profile-name">{{ userInfo?.name || '业主' }}</text>
        <text class="profile-phone">{{ userInfo?.phone || '' }}</text>
      </view>
    </view>

    <!-- 关联项目 -->
    <view class="menu-section">
      <view class="menu-item" @click="goProjects">
        <view class="menu-left">
          <text class="menu-icon">🏠</text>
          <text class="menu-text">我的项目</text>
        </view>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-item" @click="goMessages">
        <view class="menu-left">
          <text class="menu-icon">🔔</text>
          <text class="menu-text">消息通知</text>
        </view>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <!-- 其他 -->
    <view class="menu-section">
      <view class="menu-item">
        <view class="menu-left">
          <text class="menu-icon">📞</text>
          <text class="menu-text">联系电话</text>
        </view>
        <text class="menu-value">400-888-8888</text>
      </view>
    </view>

    <!-- 退出登录 -->
    <view class="logout-btn" @click="handleLogout">
      退出登录
    </view>

    <!-- 客户专属底部导航 -->
    <customer-tabbar />
  </view>
</template>

<script setup >
import customerTabbar from "@/components/customer-tabbar.vue";

<script setup >
import { computed } from "vue";

const userInfo = computed(() => uni.getStorageSync('userInfo'));

const goProjects = () => {
  uni.switchTab({ url: '/pages/customer/home' });
};

const goMessages = () => {
  uni.navigateTo({ url: '/pages/customer/messages' });
};

const handleLogout = () => {
  uni.showModal({
    title: '提示',
    content: '确定退出登录？',
    success: (res) => {
      if (res.confirm) {
        uni.clearStorageSync();
        uni.reLaunch({ url: '/pages/login/login' });
      }
    }
  });
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 40px;
}

.profile-card {
  background: linear-gradient(135deg, #1E3A5F 0%, #2D5A8E 100%);
  padding: 30px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.profile-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-name {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}

.profile-phone {
  font-size: 13px;
  color: rgba(255,255,255,0.65);
}

.menu-section {
  margin: 16px;
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #F5F7FA;
  cursor: pointer;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:active {
  background: #F9FAFB;
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-icon {
  font-size: 20px;
}

.menu-text {
  font-size: 15px;
  color: #1A1F36;
}

.menu-arrow {
  font-size: 20px;
  color: #D1D5DB;
}

.menu-value {
  font-size: 14px;
  color: #9CA3AF;
}

.logout-btn {
  margin: 24px 16px 0;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  text-align: center;
  font-size: 15px;
  color: #EF4444;
  cursor: pointer;
}

.logout-btn:active {
  background: #FEF2F2;
}
</style>
