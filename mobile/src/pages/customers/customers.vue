<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">客户管理</text>
      <text class="nav-add" @click="goAdd">+</text>
    </view>

    <view class="page-title">客户管理</view>
    <view class="list">
      <view
        class="list-item"
        v-for="item in list"
        :key="item.id"
      >
        <view class="item-header">
          <view class="item-name">{{ item.name }}</view>
          <view class="level-badge" :class="getLevelClass(item.level)">{{ item.level || '普通' }}</view>
        </view>
        <view class="item-body">
          <text class="item-phone">📞 {{ item.phone || '暂无电话' }}</text>
          <text class="item-source">来源：{{ item.source || '未知' }}</text>
        </view>
        <view class="item-footer">
          <text class="item-status" :class="getStatusClass(item.status)">{{ item.status || '未知' }}</text>
          <text class="item-date">录入：{{ item.entry_date || item.created_at?.substring(0, 10) }}</text>
        </view>
      </view>
      <view v-if="list.length === 0" class="empty">暂无客户</view>
    </view>
  </view>
</template>

<script setup >
import { ref, onMounted } from "vue";

const list = ref([]);

const getLevelClass = (level) => {
  if (level === 'VIP') return 'level-vip';
  if (level === '重点') return 'level-important';
  return 'level-normal';
};

const getStatusClass = (status) => {
  if (status === '新客户') return 'status-new';
  if (status === '跟进中') return 'status-follow';
  if (status === '已成交') return 'status-done';
  return 'status-default';
};

const fetchList = async () => {
  try {
    uni.showLoading({ title: "加载中..." });
    const token = uni.getStorageSync("token");
    const res = await uni.request({
      url: "/api/customers",
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

onMounted(() => {
  fetchList();
});


const goBack = () => {
  uni.switchTab({ url: '/pages/home/index' });
};

const goAdd = () => {
  uni.navigateTo({ url: '/pages/customers/add' });
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
}

.level-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
}

.level-vip {
  background: #fff3e6;
  color: #ff6a00;
}

.level-important {
  background: #fff7e6;
  color: #ff9f43;
}

.level-normal {
  background: #f0f0f0;
  color: #999;
}

.item-body {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
}

.item-phone {
  font-size: 13px;
  color: #666;
}

.item-source {
  font-size: 12px;
  color: #999;
}

.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
}

.status-new {
  background: #e8f4ff;
  color: #3c9cff;
}

.status-follow {
  background: #fff7e6;
  color: #ff9f43;
}

.status-done {
  background: #e8f8f0;
  color: #52c41a;
}

.status-default {
  background: #f0f0f0;
  color: #999;
}

.item-date {
  font-size: 12px;
  color: #999;
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

.nav-add {
  font-size: 26px;
  font-weight: bold;
  width: 40px;
  text-align: center;
}

</style>
