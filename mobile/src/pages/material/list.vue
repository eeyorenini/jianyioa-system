<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">材料台账</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 项目名称横幅 -->
    <view class="project-banner" v-if="projectName">
      📁 {{ projectName }}
    </view>

    <!-- 统计卡片 -->
    <view class="stats-row">
      <view class="stat-item">
        <text class="stat-num">{{ summary.total }}</text>
        <text class="stat-label">材料种类</text>
      </view>
      <view class="stat-divider"></view>
      <view class="stat-item">
        <text class="stat-num accent">{{ summary.used }}</text>
        <text class="stat-label">已用项</text>
      </view>
    </view>

    <!-- 分类 -->
    <view class="cat-tabs">
      <view class="cat-tab" :class="{ active: curCat === '' }" @click="curCat = ''">全部</view>
      <view class="cat-tab" :class="{ active: curCat === '瓷砖' }" @click="curCat = '瓷砖'">瓷砖</view>
      <view class="cat-tab" :class="{ active: curCat === '地板' }" @click="curCat = '地板'">地板</view>
      <view class="cat-tab" :class="{ active: curCat === '门' }" @click="curCat = '门'">门</view>
      <view class="cat-tab" :class="{ active: curCat === '橱柜' }" @click="curCat = '橱柜'">橱柜</view>
    </view>

    <!-- 加载中 -->
    <view class="loading-state" v-if="loading">
      <text>加载中...</text>
    </view>

    <!-- 材料列表 -->
    <view class="material-list" v-else-if="filteredList.length">
      <view class="material-card" v-for="item in filteredList" :key="item.id">
        <view class="material-info">
          <text class="material-name">{{ item.name }}</text>
          <text class="material-spec">{{ item.spec || item.model || '-' }}</text>
        </view>
        <view class="material-stats">
          <view class="m-stat">
            <text class="m-label">库存</text>
            <text class="m-val">{{ item.quantity }}{{ item.unit }}</text>
          </view>
          <view class="m-stat">
            <text class="m-label">已用</text>
            <text class="m-val used">{{ item.used || 0 }}{{ item.unit }}</text>
          </view>
          <view class="m-stat">
            <text class="m-label">剩余</text>
            <text class="m-val left">{{ item.left || item.quantity }}{{ item.unit }}</text>
          </view>
          <view class="m-stat">
            <text class="m-label">单价</text>
            <text class="m-val cost">¥{{ item.price || item.unit_price || '-' }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <text class="empty-icon">🧱</text>
      <text class="empty-text">暂无主材记录</text>
    </view>

    <!-- 快捷入口 -->
    <view class="material-actions">
      <view class="m-action" @click="goPage('/pages/material/purchase')">
        <text>📦</text> 采购申请
      </view>
      <view class="m-action" @click="goPage('/pages/material/inbound')">
        <text>🚚</text> 到货验收
      </view>
      <view class="m-action" @click="goPage('/pages/material/outbound')">
        <text>📤</text> 领用记录
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useUserStore } from "@/stores/user";

const userStore = useUserStore();
const projectId = ref('');
const projectName = ref('');
const curCat = ref('');
const loading = ref(false);
const list = ref([]);

const summary = computed(() => {
  const total = list.value.length;
  const used = list.value.filter(i => Number(i.used) > 0).length;
  return { total, used };
});

const filteredList = computed(() => {
  if (!curCat.value) return list.value;
  return list.value.filter(i => i.category === curCat.value);
});

const fetchList = async () => {
  loading.value = true;
  try {
    const token = uni.getStorageSync("token");
    const params = new URLSearchParams();
    if (projectId.value) params.set('project_id', projectId.value);
    if (curCat.value) params.set('category', curCat.value);

    const res = await uni.request({
      url: `/api/main-materials?${params.toString()}`,
      header: { Authorization: token },
    });
    if (res.data && Array.isArray(res.data.list)) {
      list.value = res.data.list;
    } else if (Array.isArray(res.data)) {
      list.value = res.data;
    }
  } catch (e) {
    console.error('加载主材列表失败:', e);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

const goPage = (url) => {
  if (projectId.value) {
    url += (url.includes('?') ? '&' : '?') + `projectId=${projectId.value}&projectName=${encodeURIComponent(projectName.value)}`;
  }
  uni.navigateTo({ url });
};

const goBack = () => {
  uni.navigateBack();
};

onMounted(() => {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = (current).options || {};
  projectId.value = options.projectId || '';
  projectName.value = options.projectName ? decodeURIComponent(options.projectName) : '';
  fetchList();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding: 16px;
  padding-bottom: 80px;
}

.project-banner {
  background: #E8F4FF;
  color: #1E3A5F;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1A1F36;
  margin-bottom: 14px;
}

.stats-row {
  display: flex;
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.stat-item {
  flex: 1;
  text-align: center;
}

.stat-divider {
  width: 1px;
  background: #F3F4F6;
}

.stat-num {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #1E3A5F;
}

.stat-num.accent { color: #FF6B35; }

.stat-label {
  display: block;
  font-size: 12px;
  color: #9CA3AF;
  margin-top: 2px;
}

.cat-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  overflow-x: auto;
}

.cat-tab {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px;
  background: #fff;
  color: #6B7280;
  cursor: pointer;
  white-space: nowrap;
}

.cat-tab.active {
  background: #1E3A5F;
  color: #fff;
}

.loading-state {
  text-align: center;
  padding: 40px;
  color: #9CA3AF;
}

.material-list { display: flex; flex-direction: column; gap: 12px; }

.material-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.material-name {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 2px;
}

.material-spec {
  font-size: 12px;
  color: #9CA3AF;
}

.material-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.m-stat {
  text-align: center;
}

.m-label {
  display: block;
  font-size: 10px;
  color: #9CA3AF;
  margin-bottom: 2px;
}

.m-val {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #1A1F36;
}

.m-val.used { color: #F59E0B; }
.m-val.left { color: #10B981; }
.m-val.cost { color: #EF4444; }

.material-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 16px;
}

.m-action {
  background: #fff;
  border-radius: 12px;
  padding: 14px 8px;
  text-align: center;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.m-action text {
  display: block;
  font-size: 20px;
  margin-bottom: 4px;
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

.empty-state {
  text-align: center;
  padding: 60px 20px;
}
.empty-icon { display: block; font-size: 48px; margin-bottom: 12px; }
.empty-text { font-size: 14px; color: #9CA3AF; }
</style>
