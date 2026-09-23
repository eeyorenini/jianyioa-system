<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">施工日志</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 施工日志列表 -->
    <scroll-view class="log-list" scroll-y>
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>
      <view v-else-if="logs.length === 0" class="empty-state">
        <text class="empty-icon">📝</text>
        <text class="empty-text">暂无施工日志</text>
      </view>
      <view v-else>
        <view class="log-item" v-for="log in logs" :key="log.id">
          <view class="log-dot"></view>
          <view class="log-content">
            <view class="log-header">
              <text class="log-date">{{ formatDate(log.created_at) }}</text>
              <text class="log-author">{{ log.operator || '未知' }}</text>
            </view>
            <text class="log-text">{{ log.content }}</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 客户专属底部导航 -->
    <customer-tabbar />
  </view>
</template>

<script setup>
import { ref, onMounted } from "vue";
import customerTabbar from "@/components/customer-tabbar.vue";

const projectId = ref(0);
const logs = ref([]);
const loading = ref(false);

onMounted(() => {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = current.options || {};
  projectId.value = parseInt(options.projectId || '0');
  fetchLogs();
});

function fetchLogs() {
  if (!projectId.value) return;
  loading.value = true;
  uni.request({
    url: `/api/project-logs/${projectId.value}`,
    success: (res) => {
      if (Array.isArray(res.data)) {
        logs.value = res.data;
      } else {
        logs.value = [];
      }
    },
    fail: () => {
      logs.value = [];
    },
    complete: () => {
      loading.value = false;
    }
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 70px;
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

.log-list {
  padding: 16px;
  height: calc(100vh - 120px);
}

.loading-state {
  text-align: center;
  padding: 60px;
  color: #9CA3AF;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 20px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 14px;
  color: #9CA3AF;
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.log-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #1E3A5F;
  margin-top: 6px;
  flex-shrink: 0;
}

.log-content {
  flex: 1;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.log-date {
  font-size: 12px;
  color: #9CA3AF;
}

.log-author {
  font-size: 13px;
  color: #1E3A5F;
  font-weight: 600;
}

.log-text {
  font-size: 14px;
  color: #1A1F36;
  line-height: 1.5;
}
</style>
