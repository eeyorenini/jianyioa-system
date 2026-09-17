<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">变更单</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 项目信息 -->
    <view class="project-banner" v-if="projectName">
      <text class="banner-icon">📁</text>
      <text class="banner-name">{{ projectName }}</text>
    </view>

    <!-- 筛选 -->
    <view class="filter-row">
      <view class="filter-tag" :class="{ active: curStatus === '' }" @click="curStatus = ''">全部</view>
      <view class="filter-tag" :class="{ active: curStatus === '待审核' }" @click="curStatus = '待审核'">待审核</view>
      <view class="filter-tag success" :class="{ active: curStatus === '已通过' }" @click="curStatus = '已通过'">已通过</view>
      <view class="filter-tag danger" :class="{ active: curStatus === '已驳回' }" @click="curStatus = '已驳回'">已驳回</view>
    </view>

    <!-- 列表 -->
    <scroll-view class="list-area" scroll-y @scrolltolower="loadMore">
      <view v-if="loading && list.length === 0" class="empty-state">
        <text class="empty-text">加载中...</text>
      </view>
      <view v-else-if="list.length === 0" class="empty-state">
        <text class="empty-icon">📄</text>
        <text class="empty-text">暂无变更单</text>
      </view>
      <view v-else>
        <view class="record-card" v-for="item in filteredList" :key="item.id" @click="goDetail(item)">
          <view class="card-top">
            <view class="card-title">{{ item.title || item.change_title || '变更申请' }}</view>
            <view class="status-pill" :class="getStatusClass(item.status)">{{ item.statusText }}</view>
          </view>
          <view class="card-meta">
            <text>📋 {{ item.change_type || '设计变更' }}</text>
            <text>💰 {{ item.amount > 0 ? '¥' + item.amount : '-' }}</text>
            <text>📅 {{ formatDate(item.change_date || item.created_at) }}</text>
          </view>
          <view class="card-project" v-if="item.project_name">
            📁 {{ item.project_name }}
          </view>
        </view>
        <view v-if="loadingMore" class="loading-more"><text>加载中...</text></view>
        <view v-else-if="noMore && list.length > 5" class="loading-more"><text>没有更多了</text></view>
      </view>
    </scroll-view>

    <!-- 新建按钮 -->
    <view class="fab" @click="goAdd">
      <text>+</text>
    </view>
  </view>
</template>

<script setup >
import { ref, computed, onMounted } from "vue";

const projectId = ref(0);
const projectName = ref('');
const curStatus = ref('');
const list = ref([]);
const loading = ref(false);
const loadingMore = ref(false);
const page = ref(1);
const pageSize = 20;
const noMore = ref(false);

const filteredList = computed(() => {
  if (!curStatus.value) return list.value;
  return list.value.filter(i => i.statusText === curStatus.value);
});

const getStatusClass = (status) => {
  if (status === 'approved' || status === '已通过') return 's-pass';
  if (status === 'rejected' || status === '已驳回') return 's-reject';
  return 's-pending';
};

const formatDate = (str) => {
  if (!str) return '-';
  return str.substring(0, 10);
};

const fetchList = async () => {
  loading.value = true;
  page.value = 1;
  noMore.value = false;
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      url: '/api/change-orders/list',
      data: { project_id: projectId.value, page: 1, page_size: pageSize },
      header: { Authorization: token },
    });
    const data = res.data;
    if (Array.isArray(data)) list.value = data;
    else if (data.list) list.value = data.list;
  } catch (e) {
    list.value = [];
  } finally {
    loading.value = false;
  }
};

const loadMore = async () => {
  if (loadingMore.value || noMore.value) return;
  loadingMore.value = true;
  page.value++;
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      url: '/api/change-orders/list',
      data: { project_id: projectId.value, page: page.value, page_size: pageSize },
      header: { Authorization: token },
    });
    const data = res.data;
    const arr = Array.isArray(data) ? data : (data.list || []);
    list.value = [...list.value, ...arr];
    if (arr.length < pageSize) noMore.value = true;
  } catch (e) {
    noMore.value = true;
  } finally {
    loadingMore.value = false;
  }
};

const goDetail = (item) => {
  uni.navigateTo({ url: `/pages/change/detail?id=${item.id}&projectId=${projectId.value}` });
};

const goAdd = () => {
  uni.navigateTo({ url: `/pages/change/add?projectId=${projectId.value}` });
};

onMounted(() => {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = (current).options || {};
  projectId.value = parseInt(options.projectId || '0');
  if (options.projectName) {
    projectName.value = decodeURIComponent(options.projectName);
  }
  if (projectId.value) {
    fetchList();
  }
});

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
  padding-bottom: 80px;
}

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
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.project-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fff;
  padding: 10px 16px;
  font-size: 13px;
  color: #1E3A5F;
  font-weight: 500;
}

.filter-row {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #F3F4F6;
}

.filter-tag {
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 13px;
  background: #F3F4F6;
  color: #6B7280;
}
.filter-tag.active { background: #1E3A5F; color: #fff; }
.filter-tag.success.active { background: #10B981; }
.filter-tag.danger.active { background: #EF4444; }

.list-area {
  height: calc(100vh - 180px);
  padding: 12px 16px;
}

.record-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
  flex: 1;
  margin-right: 10px;
}

.status-pill {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 10px;
  white-space: nowrap;
}

.s-pass { background: #D1FAE5; color: #065F46; }
.s-reject { background: #FEE2E2; color: #991B1B; }
.s-pending { background: #FEF3C7; color: #92400E; }

.card-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #6B7280;
  margin-bottom: 6px;
}

.card-project {
  font-size: 12px;
  color: #9CA3AF;
  padding-top: 6px;
  border-top: 1px solid #F9FAFB;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 0;
}
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-text { font-size: 14px; color: #9CA3AF; }
.loading-more { text-align: center; padding: 20px; font-size: 12px; color: #9CA3AF; }

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
</style>
