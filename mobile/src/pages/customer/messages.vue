<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-title">消息通知</text>
      <view class="nav-right" v-if="list.length > 0" @click="markAllRead">
        <text class="mark-all-btn">全部已读</text>
      </view>
    </view>

    <!-- 消息列表 -->
    <scroll-view
      class="message-list"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
      @scrolltolower="loadMore"
    >
      <view v-if="loading && list.length === 0" class="loading-state">
        <text class="loading-text">加载中...</text>
      </view>

      <view v-else-if="list.length === 0" class="empty-state">
        <text class="empty-icon">🔔</text>
        <text class="empty-text">暂无消息通知</text>
      </view>

      <view
        v-else
        class="message-card"
        :class="{ unread: !item.is_read }"
        v-for="item in list"
        :key="item.id"
        @click="openMessage(item)"
      >
        <view class="card-left">
          <view class="type-icon">{{ getTypeIcon(item.type) }}</view>
          <view class="unread-dot" v-if="!item.is_read"></view>
        </view>
        <view class="card-body">
          <view class="card-title-row">
            <text class="card-title">{{ item.title }}</text>
            <text class="card-time">{{ formatTime(item.created_at) }}</text>
          </view>
          <text class="card-content">{{ item.content }}</text>
          <text class="card-project" v-if="item.related_type === 'project' || item.source_type === 'project'">点击查看项目详情</text>
        </view>
      </view>

      <view v-if="loadingMore" class="loading-more">
        <text class="loading-more-text">加载更多...</text>
      </view>
      <view v-if="noMore && list.length > 0" class="no-more">
        <text class="no-more-text">没有更多了</text>
      </view>
    </scroll-view>

    <!-- 客户专属底部导航 -->
    <customer-tabbar />
  </view>
</template>

<script setup>
import { ref, onMounted } from "vue";
import customerTabbar from "@/components/customer-tabbar.vue";

const list = ref([]);
const loading = ref(false);
const loadingMore = ref(false);
const refreshing = ref(false);
const page = ref(1);
const pageSize = 20;
const noMore = ref(false);
const phone = ref('');

// 获取当前客户手机号
const getPhone = () => {
  try {
    const userInfo = uni.getStorageSync('userInfo');
    if (userInfo) {
      const info = typeof userInfo === 'string' ? JSON.parse(userInfo) : userInfo;
      return info.phone || '';
    }
  } catch {}
  return '';
};

// 格式化时间
const formatTime = (timeStr) => {
  if (!timeStr) return '';
  const d = new Date(timeStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// 获取类型图标
const getTypeIcon = (type) => {
  const iconMap = {
    'inspection_submit': '🔍',
    'inspection_complete': '✅',
    'log_submit': '📋',
    'node_update': '📌',
    'node_completed': '✅',
    'node_in_progress': '🔄',
    'node_pending': '⏳',
    'node_skipped': '⏭️',
    'project_progress': '📝',
    'approval': '📝',
    'system': '⚙️',
  };
  return iconMap[type] || '🔔';
};

// 加载消息列表
const fetchList = async (reset = false) => {
  if (reset) {
    page.value = 1;
    noMore.value = false;
  }
  const p = phone.value || getPhone();
  if (!p) return;

  const url = `/api/notifications?phone=${encodeURIComponent(p)}&page=${page.value}&pageSize=${pageSize}`;
  try {
    const res = await uni.request({ url });
    if (res.data && res.data.list) {
      if (reset) {
        list.value = res.data.list;
      } else {
        list.value.push(...res.data.list);
      }
      if (res.data.list.length < pageSize) {
        noMore.value = true;
      }
    }
  } catch (e) {
    console.error('加载消息失败', e);
  }
};

// 刷新
const onRefresh = async () => {
  refreshing.value = true;
  await fetchList(true);
  refreshing.value = false;
};

// 加载更多
const loadMore = async () => {
  if (loadingMore.value || noMore.value) return;
  loadingMore.value = true;
  page.value++;
  await fetchList();
  loadingMore.value = false;
};

// 标记全部已读
const markAllRead = async () => {
  const p = phone.value || getPhone();
  if (!p) return;
  try {
    await uni.request({
      url: `/api/notifications/read-all?phone=${encodeURIComponent(p)}`,
      method: 'PUT',
    });
    list.value.forEach(item => item.is_read = 1);
  } catch (e) {
    console.error('标记已读失败', e);
  }
};

// 打开消息
const openMessage = async (item) => {
  // 标记已读
  if (!item.is_read) {
    try {
      await uni.request({
        url: `/api/notifications/${item.id}/read`,
        method: 'PUT',
      });
      item.is_read = 1;
    } catch (e) {}
  }

  // 跳转到项目详情（所有通知最终都跳到项目详情）
  if (item.source_type === 'project_log') {
    // 施工日志：查日志拿到 project_id
    try {
      const res = await uni.request({ url: `/api/project-logs/${item.source_id}` });
      if (res.data && res.data.project_id) {
        uni.navigateTo({ url: `/pages/customer/project-detail?id=${res.data.project_id}` });
      }
    } catch (e) {}
  } else if (item.source_type === 'node') {
    // 节点变更：跳项目详情（由详情页查节点状态）
    if (item.source_id) {
      uni.navigateTo({ url: `/pages/customer/project-detail?id=${item.source_id}` });
    }
  } else if (item.source_type === 'rectification_issue') {
    // 巡检问题：查 issue 拿到 project_id
    if (item.source_id) {
      uni.navigateTo({ url: `/pages/customer/project-detail?id=${item.source_id}` });
    }
  } else if (item.source_type === 'approval') {
    uni.navigateTo({ url: `/pages/approval/detail?id=${item.source_id}` });
  }
};

onMounted(() => {
  phone.value = getPhone();
  loading.value = true;
  fetchList(true).finally(() => { loading.value = false; });
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f6f8;
  display: flex;
  flex-direction: column;
}

.nav-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 44px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  z-index: 100;
}

.nav-title {
  font-size: 17px;
  font-weight: 600;
  color: #1a1a1a;
}

.nav-right {
  position: absolute;
  right: 16px;
}

.mark-all-btn {
  font-size: 14px;
  color: #1890ff;
}

.message-list {
  flex: 1;
  padding: 60px 12px 70px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 80px;
}

.loading-text,
.empty-text {
  font-size: 14px;
  color: #8E9BBA;
  margin-top: 12px;
}

.empty-icon {
  font-size: 48px;
}

.message-card {
  background: #fff;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 10px;
  display: flex;
  align-items: flex-start;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}

.message-card.unread {
  background: #e8f4ff;
}

.card-left {
  position: relative;
  margin-right: 12px;
  flex-shrink: 0;
}

.type-icon {
  font-size: 24px;
  line-height: 1;
}

.unread-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  background: #ff4d4f;
  border-radius: 50%;
}

.card-body {
  flex: 1;
  min-width: 0;
}

.card-title-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-time {
  font-size: 12px;
  color: #8E9BBA;
  flex-shrink: 0;
  margin-left: 8px;
}

.card-content {
  font-size: 14px;
  color: #555;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-project {
  font-size: 12px;
  color: #1890ff;
  margin-top: 6px;
}

.loading-more,
.no-more {
  text-align: center;
  padding: 12px 0;
}

.loading-more-text,
.no-more-text {
  font-size: 13px;
  color: #8E9BBA;
}
</style>
