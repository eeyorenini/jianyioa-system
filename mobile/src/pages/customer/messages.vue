<template>
  <view class="page">
    <view class="page-title-bar">
      <text class="page-title">消息通知</text>
    </view>

    <view class="msg-list" v-if="messages.length">
      <view class="msg-item" v-for="m in messages" :key="m.id" :class="`msg-${m.type}`">
        <view class="msg-icon">{{ getMsgIcon(m.type) }}</view>
        <view class="msg-body">
          <view class="msg-header">
            <text class="msg-title">{{ m.title }}</text>
            <text class="msg-time">{{ m.created_at }}</text>
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

<script setup >
import customerTabbar from "@/components/customer-tabbar.vue";

<script setup >
import { ref, onMounted } from "vue";

const messages = ref([]);

const getMsgIcon = (type) => {
  const map = {
    inspect: '🔍', log: '📝', payment: '💰', node: '📋', system: '📢'
  };
  return map[type] || '📢';
};

const fetchMessages = async () => {
  try {
    const userInfo = uni.getStorageSync('userInfo');
    const customerId = userInfo?.id;
    const res = await uni.request({
      url: `/api/notifications?customer_id=${customerId || 0}`,
    });
    const data = res.data;
    if (Array.isArray(data)) {
      messages.value = data;
    }
  } catch (e) {
    // 接口不存在时显示空
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

.msg-inspect .msg-icon { background: #FEE2E2; }
.msg-log .msg-icon { background: #DBEAFE; }
.msg-payment .msg-icon { background: #D1FAE5; }
.msg-node .msg-icon { background: #FEF3C7; }

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
