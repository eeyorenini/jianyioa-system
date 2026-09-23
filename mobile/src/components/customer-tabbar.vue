<template>
  <view class="customer-tabbar">
    <view class="tab-item" :class="{ active: current === '/pages/customer/home' }" @click="switchTab('/pages/customer/home')">
      <text class="tab-icon">{{ current === '/pages/customer/home' ? '🏠' : '🏡' }}</text>
      <text class="tab-text">首页</text>
    </view>
    <view class="tab-item" :class="{ active: current === '/pages/customer/projects' }" @click="switchTab('/pages/customer/projects')">
      <text class="tab-icon">📋</text>
      <text class="tab-text">项目</text>
    </view>
    <view class="tab-item" :class="{ active: current === '/pages/customer/messages' }" @click="switchTab('/pages/customer/messages')">
      <text class="tab-icon">🔔</text>
      <text class="tab-text">消息</text>
    </view>
    <view class="tab-item" :class="{ active: current === '/pages/customer/mine' }" @click="switchTab('/pages/customer/mine')">
      <text class="tab-icon">{{ current === '/pages/customer/mine' ? '👤' : '👥' }}</text>
      <text class="tab-text">我的</text>
    </view>
  </view>
</template>

<script setup >
import { ref, onMounted } from "vue";

const current = ref('/pages/customer/home');
const isTabBarPage = ref(false);

onMounted(() => {
  const pages = getCurrentPages();
  if (pages.length > 0) {
    current.value = '/' + pages[pages.length - 1].route;
    // 判断是否是 tabBar 页面
    isTabBarPage.value = ['/pages/home/index', '/pages/projects/list', '/pages/inspection/list', '/pages/dispatch/list', '/pages/mine/index'].includes(current.value);
  }
  
  // 只在非 tabBar 页面隐藏原生 tabBar
  if (!isTabBarPage.value) {
    uni.hideTabBar({ animation: false }).catch(() => {});
  }
});

const switchTab = (url) => {
  if (current.value !== url) {
    uni.redirectTo({ url });
  }
};
</script>

<style scoped>
.customer-tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  background: #fff;
  box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 999;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0;
  cursor: pointer;
}

.tab-icon {
  font-size: 22px;
  margin-bottom: 2px;
}

.tab-text {
  font-size: 11px;
  color: #8E9BBA;
}

.tab-item.active .tab-text {
  color: #1E3A5F;
}
</style>
