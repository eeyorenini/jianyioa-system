<template>
  <!-- 统一顶部导航栏 -->
  <view class="top-nav">
    <view class="nav-left" @click="goBack">
      <text class="nav-back">‹</text>
    </view>
    <text class="nav-title">{{ title }}</text>
    <view class="nav-right"></view>
  </view>
</template>

<script setup >
const props = defineProps<{ title? }>();

const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped>
.top-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  height: 44px;
  background: #1E3A5F;
  color: #fff;
  padding-top: env(safe-area-inset-top);
  box-sizing: content-box;
}

.nav-left {
  width: 50px;
  height: 44px;
  display: flex;
  align-items: center;
  padding-left: 12px;
  cursor: pointer;
}

.nav-back {
  font-size: 30px;
  font-weight: 400;
  color: #fff;
  line-height: 1;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 500;
  padding: 0 50px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-right {
  width: 50px;
}
</style>
