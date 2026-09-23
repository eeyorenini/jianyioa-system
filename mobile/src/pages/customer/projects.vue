<template>
  <view class="page">
    <!-- 搜索栏 -->
    <view class="search-bar">
      <view class="search-input-wrap">
        <text class="search-icon">🔍</text>
        <input class="search-input" v-model="keyword" placeholder="搜索项目名称..." confirm-type="search" @confirm="doSearch" />
      </view>
    </view>

    <!-- 项目列表 -->
    <view class="project-list" v-if="filteredList.length">
      <view class="project-card" v-for="p in filteredList" :key="p.id" @click="goDetail(p)">
        <view class="card-header">
          <view class="card-title-row">
            <text class="card-name">{{ p.name }}</text>
            <view class="status-badge" :class="getStatusClass(p.status)">{{ p.status || '未知' }}</view>
          </view>
          <view class="card-meta">
            <text class="meta-item">📍 {{ p.customer_address || p.address || '未设置地址' }}</text>
          </view>
        </view>

        <view class="card-progress">
          <view class="progress-row">
            <text class="progress-label">整体进度</text>
            <text class="progress-pct" :class="getProgressClass(p.progress)">{{ p.progress || 0 }}%</text>
          </view>
          <view class="progress-bar">
            <view class="progress-fill" :class="getProgressClass(p.progress)"
              :style="{ width: (p.progress || 0) + '%' }"></view>
          </view>
        </view>

        <view class="card-footer">
          <text class="footer-item">👤 {{ p.customer_name || '无关联客户' }}</text>
          <text class="footer-arrow">›</text>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <text class="empty-icon">🏠</text>
      <text class="empty-text">{{ keyword ? '未找到匹配项目' : '暂无关联项目' }}</text>
    </view>

    <!-- 客户专属底部导航 -->
    <customer-tabbar />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import customerTabbar from "@/components/customer-tabbar.vue";

const keyword = ref('');
const list = ref([]);

const filteredList = computed(() => {
  if (!keyword.value.trim()) return list.value;
  const kw = keyword.value.trim().toLowerCase();
  return list.value.filter(p =>
    (p.name || '').toLowerCase().includes(kw)
  );
});

const doSearch = () => {};

const getStatusClass = (status) => {
  if (!status) return 's-default';
  if (status.includes('竣工') || status.includes('完结') || status.includes('验收')) return 's-done';
  if (status.includes('进行') || status.includes('施工')) return 's-progress';
  if (status.includes('暂停')) return 's-paused';
  return 's-default';
};

const getProgressClass = (progress) => {
  if (!progress || progress < 30) return 'p-low';
  if (progress < 70) return 'p-mid';
  return 'p-high';
};

const goDetail = (p) => {
  uni.navigateTo({ url: `/pages/projects/detail?id=${p.id}` });
};

const fetchList = async () => {
  try {
    const userInfo = uni.getStorageSync('userInfo');
    // 家庭成员用主账户ID查项目，主账户用自己的ID
    const customerId = uni.getStorageSync('masterCustomerId') || userInfo?.id;
    // 客户通过 customer_id 参数查询项目
    const res = await uni.request({
      url: `/api/projects${customerId ? '?customer_id=' + customerId : ''}`,
    });
    const data = res.data;
    if (Array.isArray(data)) {
      list.value = data;
    }
  } catch (e) {
    console.error('加载项目失败', e);
  }
};

onMounted(() => {
  fetchList();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 20px;
}

.search-bar {
  padding: 12px 16px;
  background: #fff;
}

.search-input-wrap {
  display: flex;
  align-items: center;
  background: #F5F7FA;
  border-radius: 10px;
  padding: 8px 12px;
  gap: 8px;
}

.search-icon {
  font-size: 14px;
  opacity: 0.5;
}

.search-input {
  flex: 1;
  font-size: 14px;
  color: #1A1F36;
  background: transparent;
  height: 28px;
}

.search-input::placeholder {
  color: #9CA3AF;
}

.project-list {
  padding: 12px 16px;
}

.project-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  cursor: pointer;
  transition: all 0.15s;
}

.project-card:active {
  transform: scale(0.985);
}

.card-header {
  margin-bottom: 12px;
}

.card-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6px;
}

.card-name {
  font-size: 16px;
  font-weight: 600;
  color: #1A1F36;
  flex: 1;
  margin-right: 10px;
}

.status-badge {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 20px;
  font-weight: 500;
}

.s-default { background: #F3F4F6; color: #6B7280; }
.s-done { background: #D1FAE5; color: #065F46; }
.s-progress { background: #DBEAFE; color: #1E40AF; }
.s-paused { background: #FEF3C7; color: #92400E; }

.card-meta {
  margin-top: 4px;
}

.meta-item {
  font-size: 12px;
  color: #9CA3AF;
}

.card-progress {
  margin-bottom: 12px;
}

.progress-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.progress-label {
  font-size: 12px;
  color: #6B7280;
}

.progress-pct {
  font-size: 13px;
  font-weight: 700;
}

.p-low { color: #9CA3AF; }
.p-mid { color: #F59E0B; }
.p-high { color: #10B981; }

.progress-bar {
  height: 6px;
  background: #E5E7EB;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
}

.progress-fill.p-low { background: #D1D5DB; }
.progress-fill.p-mid { background: linear-gradient(90deg, #F59E0B, #FBBF24); }
.progress-fill.p-high { background: linear-gradient(90deg, #10B981, #34D399); }

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #F9FAFB;
}

.footer-item {
  font-size: 12px;
  color: #6B7280;
}

.footer-arrow {
  font-size: 22px;
  color: #D1D5DB;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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
