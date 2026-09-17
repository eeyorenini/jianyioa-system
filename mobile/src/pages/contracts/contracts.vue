<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">合同管理</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="page-title">合同管理</view>
    <view class="list">
      <view
        class="list-item"
        v-for="item in list"
        :key="item.id"
      >
        <view class="item-header">
          <view class="item-name">{{ item.title }}</view>
          <view class="tag" :class="getStatusClass(item.status)">{{ item.status || '未知' }}</view>
        </view>
        <view class="item-body">
          <text class="item-amount">¥{{ formatAmount(item.amount) }}</text>
          <text class="item-date">{{ item.sign_date || item.created_at?.substring(0, 10) }}</text>
        </view>
      </view>
      <view v-if="list.length === 0" class="empty">
        <view class="empty-icon">📋</view>
        <view class="empty-text">暂无合同</view>
        <view class="empty-sub">在PC端添加合同后即可在此查看</view>
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, onMounted } from "vue";

const list = ref([]);

const formatAmount = (amount) => {
  const val = parseFloat(amount || 0);
  return val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getStatusClass = (status) => {
  if (!status) return 'tag-default';
  if (status.includes('已签订') || status.includes('完成')) return 'tag-done';
  if (status.includes('草稿') || status.includes('待')) return 'tag-pending';
  if (status.includes('终止')) return 'tag-stop';
  return 'tag-default';
};

const fetchList = async () => {
  try {
    uni.showLoading({ title: "加载中..." });
    const token = uni.getStorageSync("token");
    const res = await uni.request({
      url: "/api/contracts",
      header: { Authorization: token },
    });
    uni.hideLoading();
    const data = res.data;
    // contracts 接口返回 { list: [], total, page, pageSize }
    if (data.list && Array.isArray(data.list)) {
      list.value = data.list;
    } else if (Array.isArray(data)) {
      list.value = data;
    }
  } catch (e) {
    uni.hideLoading();
    console.log("加载失败", e);
  }
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e8f4ff;
  color: #3c9cff;
  flex-shrink: 0;
  margin-left: 8px;
}

.tag-done {
  background: #e8f8f0;
  color: #52c41a;
}

.tag-pending {
  background: #fff7e6;
  color: #ff9f43;
}

.tag-stop {
  background: #ffebee;
  color: #ff5252;
}

.tag-default {
  background: #f0f0f0;
  color: #999;
}

.item-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-amount {
  font-size: 16px;
  color: #ff6b6b;
  font-weight: bold;
}

.item-date {
  font-size: 12px;
  color: #999;
}

.empty {
  padding: 50px 0;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 15px;
  color: #333;
  margin-bottom: 6px;
}

.empty-sub {
  font-size: 13px;
  color: #999;
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
