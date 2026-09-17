<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">系统设置</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="page-title">设置</view>
    <view class="menu-list">
      <view class="menu-item">
        <text class="menu-text">账号安全</text>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item">
        <text class="menu-text">消息通知</text>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item">
        <text class="menu-text">关于我们</text>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="handleClear">
        <text class="menu-text">清除缓存</text>
        <text class="arrow">›</text>
      </view>
    </view>
    <view class="version">简逸OA v1.0.0</view>
  </view>
</template>

<script setup >
const handleClear = () => {
  uni.showModal({
    title: "提示",
    content: "确定清除缓存？",
    success: (res) => {
      if (res.confirm) {
        uni.clearStorageSync();
        uni.showToast({ title: "清除成功", icon: "success" });
      }
    },
  });
};


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

.page-title {
  font-size: 20px;
  font-weight: bold;
  color: #333;
  margin-bottom: 15px;
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

.menu-text {
  flex: 1;
  font-size: 15px;
  color: #333;
}

.arrow {
  font-size: 18px;
  color: #ccc;
}

.version {
  text-align: center;
  color: #999;
  font-size: 12px;
  margin-top: 30px;
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
