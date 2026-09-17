<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">项目管理</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="page-title">项目管理</view>
    <view class="list">
      <view
        class="list-item"
        v-for="item in list"
        :key="item.id"
        @click="goDetail(item)"
      >
        <view class="item-header">
          <view class="item-name">{{ item.name }}</view>
          <view class="tag" :class="getStatusClass(item.status)">{{ item.status || '未知' }}</view>
        </view>
        <view class="item-body">
          <text class="item-customer">👤 {{ item.customer_name || '无关联客户' }}</text>
        </view>
        <view class="item-footer">
          <text class="item-date">📅 {{ item.start_date }} ~ {{ item.end_date }}</text>
          <view class="progress-wrap">
            <view class="progress-bar">
              <view class="progress-fill" :style="{ width: (item.progress || 0) + '%' }"></view>
            </view>
            <text class="progress-text">{{ item.progress || 0 }}%</text>
          </view>
        </view>
      </view>
      <view v-if="list.length === 0" class="empty">暂无项目</view>
    </view>
  </view>
</template>

<script setup >
import { ref, onMounted } from "vue";

const list = ref([]);

const getStatusClass = (status) => {
  if (!status) return 'tag-default';
  if (status.includes('竣工') || status.includes('完成') || status.includes('已验收')) return 'tag-done';
  if (status.includes('准备') || status.includes('进行')) return 'tag-progress';
  if (status.includes('暂停')) return 'tag-pause';
  return 'tag-default';
};

const fetchList = async () => {
  try {
    uni.showLoading({ title: "加载中..." });
    const token = uni.getStorageSync("token");
    const res = await uni.request({
      url: "/api/projects",
      header: { Authorization: token },
    });
    uni.hideLoading();
    const data = res.data;
    if (Array.isArray(data)) {
      list.value = data;
    }
  } catch (e) {
    uni.hideLoading();
    console.log("加载失败", e);
  }
};

// 点击进入项目详情
const goDetail = (item) => {
  uni.navigateTo({ url: `/pages/projects/detail?id=${item.id}` });
};

onMounted(() => {
  fetchList();
});


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

.list {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}

.list-item {
  padding: 15px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}

.list-item:last-child {
  border-bottom: none;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.item-name {
  font-size: 15px;
  font-weight: bold;
  color: #333;
  flex: 1;
}

.tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e8f4ff;
  color: #3c9cff;
}

.tag-progress {
  background: #fff7e6;
  color: #ff9f43;
}

.tag-done {
  background: #e8f8f0;
  color: #52c41a;
}

.tag-pause {
  background: #fff3e6;
  color: #ff6600;
}

.tag-default {
  background: #f0f0f0;
  color: #999;
}

.item-body {
  margin-bottom: 8px;
}

.item-customer {
  font-size: 13px;
  color: #666;
}

.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-date {
  font-size: 12px;
  color: #999;
}

.progress-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.progress-bar {
  width: 80px;
  height: 6px;
  background: #eee;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  border-radius: 3px;
  transition: width 0.3s;
}

.progress-text {
  font-size: 12px;
  color: #667eea;
  font-weight: bold;
}

.empty {
  text-align: center;
  color: #999;
  padding: 40px;
  font-size: 14px;
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
