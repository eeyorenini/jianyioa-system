<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">巡检列表</text>
      <view class="nav-placeholder"></view>
    </view>

</view>

    <view class="page-title">质量巡检</view>

    <!-- 筛选 -->
    <view class="filter-row">
      <view class="filter-tag" :class="{ active: curStatus === '' }" @click="curStatus = ''">全部</view>
      <view class="filter-tag danger" :class="{ active: curStatus === '待整改' }" @click="curStatus = '待整改'">待整改</view>
      <view class="filter-tag warning" :class="{ active: curStatus === '整改中' }" @click="curStatus = '整改中'">整改中</view>
      <view class="filter-tag success" :class="{ active: curStatus === '已关闭' }" @click="curStatus = '已关闭'">已关闭</view>
      <!-- 巡检列表 -->
    <view class="inspect-list" v-if="filteredList.length">
      <view class="inspect-card" v-for="item in filteredList" :key="item.id" @click="goDetail(item)">
        <view class="inspect-header">
          <view class="level-badge" :class="`level-${item.level}`">
            {{ item.level === 'stop' ? '停工整改' : item.level === 'serious' ? '严重' : '一般' }}
          </view>
          <view class="status-badge" :class="`status-${item.status}`">{{ item.statusText }}</view>
        </view>
        <text class="inspect-title">{{ item.title }}</text>
        <view class="inspect-meta">
          <text>📍 {{ item.location }}</text>
          <text>📅 {{ item.date }}</text>
        </view>
        <view class="inspect-footer">
          <text class="inspect-project">📁 {{ item.project }}</text>
          <text class="inspect-arrow">›</text>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <text class="empty-icon">🔍</text>
      <text class="empty-text">{{ curStatus ? '暂无' + curStatus + '问题' : '暂无巡检记录' }}</text>
    </view>

    <!-- 新建按钮 -->
    <view class="fab" @click="goAdd">
      <text>+</text>
    </view>
  </view>
</template>

<script setup >
import { ref, computed, onMounted } from "vue";

const curStatus = ref('');
const list = ref([
  { id: 1, title: '防水层局部破损', level: 'serious', location: '卫生间', status: 'pending', statusText: '待整改', date: '09-16', project: '十六局西区2-3-201' },
  { id: 2, title: '墙面空鼓', level: 'normal', location: '客厅', status: 'fixing', statusText: '整改中', date: '09-15', project: '十六局西区2-3-201' },
  { id: 3, title: '配电箱未接地', level: 'stop', location: '全屋', status: 'closed', statusText: '已关闭', date: '09-10', project: '新农村3301' },
]);

const filteredList = computed(() => {
  if (!curStatus.value) return list.value;
  return list.value.filter(i => i.statusText === curStatus.value);
});

const goDetail = (item) => {
  uni.navigateTo({ url: `/pages/inspection/detail?id=${item.id}` });
};

const goAdd = () => {
  uni.navigateTo({ url: '/pages/inspection/add' });
};

onMounted(() => {});




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
}

.filter-tag {
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 13px;
  background: #fff;
  color: #6B7280;
  cursor: pointer;
}

.filter-tag.active { background: #1E3A5F; color: #fff; }
.filter-tag.danger.active { background: #EF4444; }
.filter-tag.warning.active { background: #F59E0B; }
.filter-tag.success.active { background: #10B981; }

.inspect-list { display: flex; flex-direction: column; gap: 12px; }

.inspect-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  cursor: pointer;
}

.inspect-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.level-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.level-normal { background: #FEF3C7; color: #92400E; }
.level-serious { background: #FEE2E2; color: #991B1B; }
.level-stop { background: #7C3AED; color: #fff; }

.status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}

.status-pending { background: #FEE2E2; color: #991B1B; }
.status-fixing { background: #FEF3C7; color: #92400E; }
.status-closed { background: #D1FAE5; color: #065F46; }

.inspect-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 6px;
}

.inspect-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #9CA3AF;
  margin-bottom: 10px;
}

.inspect-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #F9FAFB;
}

.inspect-project { font-size: 12px; color: #6B7280; }
.inspect-arrow { font-size: 20px; color: #D1D5DB; }

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
  cursor: pointer;
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
