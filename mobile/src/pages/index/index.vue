<template>
  <view class="index-container">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">首页</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="header">
      <view class="greeting">你好，{{ userState.name || '用户' }}</view>
      <view class="date">{{ currentDate }}</view>
    </view>

    <view class="stats">
      <view class="stat-item">
        <view class="stat-num">{{ stats.customerCount }}</view>
        <view class="stat-label">客户数</view>
      </view>
      <view class="stat-item">
        <view class="stat-num">{{ stats.projectCount }}</view>
        <view class="stat-label">进行中项目</view>
      </view>
      <view class="stat-item">
        <view class="stat-num">{{ stats.contractCount }}</view>
        <view class="stat-label">已签合同</view>
      </view>
    </view>

    <view class="section">
      <view class="section-title">快捷操作</view>
      <view class="quick-actions">
        <view class="action-item" @click="goTo('/pages/contracts/contracts')">
          <text class="action-icon">📄</text>
          <text class="action-text">合同管理</text>
        </view>
        <view class="action-item" @click="goTo('/pages/projects/projects')">
          <text class="action-icon">📁</text>
          <text class="action-text">项目管理</text>
        </view>
        <view class="action-item" @click="goTo('/pages/customers/customers')">
          <text class="action-icon">👥</text>
          <text class="action-text">客户管理</text>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-title">公告通知</view>
      <view class="notice-list">
        <view
          class="notice-item"
          v-for="item in noticeList"
          :key="item.id"
          @click="showNotice(item)"
        >
          <view class="notice-title">{{ item.title }}</view>
          <view class="notice-time">{{ formatTime(item.publish_time) }}</view>
        </view>
        <view v-if="noticeList.length === 0" class="empty">暂无公告</view>
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, onMounted } from "vue";
import { useUserStore } from "../../stores/user";

const { state: userState, loadUser } = useUserStore();

const currentDate = ref("");

const updateDate = () => {
  const d = new Date();
  currentDate.value = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

const stats = ref({
  customerCount: 0,
  contractCount: 0,
  projectCount: 0,
  pendingQuote: 0,
  totalIncome: 0,
  totalExpense: 0,
  balance: 0,
  lowStock: 0,
});

const noticeList = ref([]);

const goTo = (url) => {
  if (url.includes('/contracts') || url.includes('/projects') || url.includes('/customers')) {
    uni.switchTab({ url });
  } else {
    uni.navigateTo({ url });
  }
};

const formatTime = (time) => {
  if (!time) return '';
  return time.substring(0, 10);
};

const showNotice = (item) => {
  uni.showModal({
    title: item.title,
    content: item.content || '暂无内容',
    showCancel: false,
  });
};

const fetchData = async () => {
  loadUser();
  try {
    const token = uni.getStorageSync("token");
    const [statsRes, noticesRes] = await Promise.all([
      uni.request({ url: "/api/dashboard/stats", header: { Authorization: token } }),
      uni.request({ url: "/api/notices", header: { Authorization: token } }),
    ]);

    const sData = statsRes.data;
    if (sData.customerCount !== undefined) {
      stats.value = sData;
    }

    const nData = noticesRes.data;
    if (Array.isArray(nData)) {
      noticeList.value = nData.slice(0, 5);
    }
  } catch (e) {
    console.log("数据加载失败", e);
  }
};

onMounted(() => {
  loadUser();
  updateDate();
  fetchData();
});


const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped>
.index-container {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 20px;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  padding: 30px 20px 40px;
}

.greeting {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 8px;
}

.date {
  font-size: 14px;
  opacity: 0.8;
}

.stats {
  display: flex;
  background: #fff;
  margin: -20px 15px 0;
  border-radius: 12px;
  padding: 20px 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.stat-item {
  flex: 1;
  text-align: center;
  border-right: 1px solid #eee;
}

.stat-item:last-child {
  border-right: none;
}

.stat-num {
  font-size: 28px;
  font-weight: bold;
  color: #667eea;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 13px;
  color: #999;
}

.section {
  margin: 20px 15px 0;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin-bottom: 12px;
}

.quick-actions {
  background: #fff;
  border-radius: 12px;
  padding: 15px;
  display: flex;
  gap: 15px;
}

.action-item {
  flex: 1;
  text-align: center;
  padding: 15px 0;
  background: #f8f8ff;
  border-radius: 8px;
}

.action-icon {
  font-size: 28px;
  display: block;
  margin-bottom: 8px;
}

.action-text {
  font-size: 13px;
  color: #666;
}

.notice-list {
  background: #fff;
  border-radius: 12px;
  padding: 0 15px;
}

.notice-item {
  padding: 14px 0;
  border-bottom: 1px solid #f0f0f0;
}

.notice-item:last-child {
  border-bottom: none;
}

.notice-title {
  font-size: 14px;
  color: #333;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-time {
  font-size: 12px;
  color: #999;
}

.empty {
  text-align: center;
  color: #999;
  padding: 20px;
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
