<template>
  <view class="page">
    <view class="page-title-bar">
      <text class="page-title">消息通知</text>
    </view>

    <view class="msg-list" v-if="messages.length">
      <view class="msg-item" v-for="m in messages" :key="m.id" :class="`msg-${m.type || 'default'}`">
        <view class="msg-icon">{{ getMsgIcon(m.type) }}</view>
        <view class="msg-body">
          <view class="msg-header">
            <text class="msg-title">{{ m.title }}</text>
            <text class="msg-time">{{ formatTime(m.created_at) }}</text>
          </view>
          <text class="msg-content">{{ m.content }}</text>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <text class="empty-icon">🔔</text>
      <text class="empty-text">暂无消息通知</text>
    </view>

    <!-- 客户专属底部导航 -->
    <customer-tabbar />
  </view>
</template>

<script setup>
import { ref, onMounted } from "vue";
import customerTabbar from "@/components/customer-tabbar.vue";

const messages = ref([]);

const getMsgIcon = (type) => {
  const map = {
    node_completed: '📋',
    project_progress: '📝',
    inspection_submit: '🔍',
    system: '📢',
  };
  return map[type] || '📢';
};

const formatTime = (str) => {
  if (!str) return '';
  const d = new Date(str);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

const fetchMessages = async () => {
  try {
    const userInfo = uni.getStorageSync('userInfo');
    const phone = userInfo?.phone || '';
    const res = await uni.request({
      url: `/api/notifications?phone=${phone}`,
    });
    const data = res.data;
    if (data && data.list) {
      messages.value = data.list || [];
    } else if (Array.isArray(data)) {
      messages.value = data;
    } else {
      messages.value = [];
    }
  } catch (e) {
    messages.value = [];
  }
};

onMounted(() => {
  fetchMessages();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 20px;
}

.page-title-bar {
  background: #fff;
  padding: 16px;
  border-bottom: 1px solid #F3F4F6;
}

.page-title {
  font-size: 17px;
  font-weight: 700;
  color: #1A1F36;
}

.msg-list {
  padding: 12px 16px;
}

.msg-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.msg-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #F3F4F6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.msg-inspection_submit .msg-icon { background: #FEE2E2; }
.msg-node_completed .msg-icon { background: #FEF3C7; }
.msg-project_progress .msg-icon { background: #DBEAFE; }

.msg-body {
  flex: 1;
}

.msg-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.msg-title {
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
}

.msg-time {
  font-size: 11px;
  color: #9CA3AF;
}

.msg-content {
  font-size: 13px;
  color: #6B7280;
  line-height: 1.5;
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
</style>
