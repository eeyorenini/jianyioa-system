<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">派工管理</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="page-title">派工管理</view>

    <!-- 状态筛选 -->
    <view class="filter-row">
      <view class="filter-tag" :class="{ active: curStatus === '' }" @click="curStatus = ''">全部</view>
      <view class="filter-tag" :class="{ active: curStatus === '待接单' }" @click="curStatus = '待接单'">待接单</view>
      <view class="filter-tag accent" :class="{ active: curStatus === '施工中' }" @click="curStatus = '施工中'">施工中</view>
      <view class="filter-tag success" :class="{ active: curStatus === '已完工' }" @click="curStatus = '已完工'">已完工</view>
    </view>

    <!-- 派工列表 -->
    <view class="dispatch-list" v-if="filteredList.length">
      <view class="dispatch-card" v-for="item in filteredList" :key="item.id" @click="goDetail(item)">
        <view class="card-top">
          <view class="dispatch-title">{{ item.content }}</view>
          <view class="status-pill" :class="getStatusClass(item.status)">{{ item.status }}</view>
        </view>
        <view class="dispatch-meta">
          <text v-if="item.worker">👷 {{ item.worker }}</text>
          <text v-if="item.start_date">📅 {{ item.start_date }}</text>
          <text v-if="item.fee">💰 {{ item.fee }}</text>
        </view>
        <view class="dispatch-project" v-if="item.project_name">
          📁 {{ item.project_name }}
        </view>
      </view>
    </view>

    <view class="empty-state" v-else-if="!loading">
      <text class="empty-icon">👷</text>
      <text class="empty-text">暂无派工单</text>
    </view>

    <view class="fab" @click="goAdd">
      <text>+</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from "vue";

const curStatus = ref('');
const loading = ref(false);
const list = ref([]);

const filteredList = computed(() => {
  if (!curStatus.value) return list.value;
  return list.value.filter(i => i.status === curStatus.value);
});

const getStatusClass = (status) => {
  if (status === '待接单') return 's-pending';
  if (status === '施工中') return 's-working';
  if (status === '已完工') return 's-done';
  return 's-pending';
};

const fetchList = async () => {
  loading.value = true;
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      url: '/api/dispatches',
      header: { Authorization: token },
    });
    list.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    list.value = [];
  } finally {
    loading.value = false;
  }
};

const goDetail = (item) => uni.navigateTo({ url: `/pages/dispatch/detail?id=${item.id}` });
const goAdd = () => uni.navigateTo({ url: '/pages/dispatch/add' });

const goBack = () => {
  const pages = getCurrentPages();
  if (pages.length <= 1) {
    uni.switchTab({ url: '/pages/home/index' });
  } else {
    uni.navigateBack();
  }
};

uni.$on('dispatch-refresh', () => fetchList());
uni.$on('tab-refresh', () => fetchList());

// onMounted 改为 page show 时刷新
uni.$on('page-show', () => fetchList());
fetchList();
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding: 16px;
  padding-bottom: 80px;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1A1F36;
  margin-bottom: 14px;
}

.filter-row {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.filter-tag {
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 13px;
  background: #fff;
  color: #6B7280;
}

.filter-tag.active { background: #1E3A5F; color: #fff; }
.filter-tag.accent.active { background: #F59E0B; }
.filter-tag.success.active { background: #10B981; }

.dispatch-list { display: flex; flex-direction: column; gap: 12px; }

.dispatch-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.dispatch-title {
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
  flex: 1;
  margin-right: 10px;
}

.status-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

.s-pending { background: #FEF3C7; color: #92400E; }
.s-working { background: #DBEAFE; color: #1E40AF; }
.s-done { background: #D1FAE5; color: #065F46; }

.dispatch-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #6B7280;
  margin-bottom: 8px;
}

.dispatch-project {
  font-size: 12px;
  color: #9CA3AF;
  padding-top: 8px;
  border-top: 1px solid #F9FAFB;
}

.fab {
  position: fixed;
  right: 20px;
  bottom: 90px;
  width: 52px;
  height: 52px;
  background: linear-gradient(135deg, #1E3A5F, #3B82F6);
  color: #fff;
  border-radius: 50%;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(30,58,95,0.4);
  z-index: 100;
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
