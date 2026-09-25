<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">项目列表</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 搜索栏 -->
    <view class="search-bar">
      <view class="search-input-wrap">
        <text class="search-icon">🔍</text>
        <input
          class="search-input"
          v-model="keyword"
          placeholder="搜索项目名称、小区..."
          confirm-type="search"
          @confirm="doSearch"
        />
        <text class="search-clear" v-if="keyword" @click="keyword = ''; doSearch()">✕</text>
      </view>
      <!-- 筛选栏 -->
    <view class="filter-bar">
      <scroll-view class="filter-scroll" scroll-x>
        <view class="filter-tags">
          <view
            class="filter-tag"
            :class="{ active: curStatus === '' }"
            @click="setStatus('')"
          >全部</view>
          <view
            class="filter-tag"
            :class="{ active: curStatus === '未开工' }"
            @click="setStatus('未开工')"
          >未开工</view>
          <view
            class="filter-tag"
            :class="{ active: curStatus === '进行中' }"
            @click="setStatus('进行中')"
          >进行中</view>
          <view
            class="filter-tag"
            :class="{ active: curStatus === '已竣工' }"
            @click="setStatus('已竣工')"
          >已竣工</view>
          <view
            class="filter-tag"
            :class="{ active: curStatus === '已完结' }"
            @click="setStatus('已完结')"
          >已完结</view>
          <view
            class="filter-tag warning-tag"
            :class="{ active: curStatus === '延期' }"
            @click="setStatus('延期')"
          >⚠ 延期</view>
        </view>
      </scroll-view>
    </view>

    <!-- 项目列表 -->
    <view class="project-list" v-if="filteredList.length">
      <view
        class="project-card"
        v-for="p in filteredList"
        :key="p.id"
        @click="goDetail(p)"
      >
        <!-- 卡片头部 -->
        <view class="card-header">
          <view class="card-title-row">
            <text class="card-name">{{ p.name }}</text>
            <view class="status-badge" :class="getStatusClass(p.status)">
              {{ p.status || '未知' }}
            </view>
          </view>
          <view class="card-meta">
            <text class="meta-item">📍 {{ p.customer_address || p.address || '未设置地址' }}</text>
          </view>
        </view>

        <!-- 进度条 -->
        <view class="card-progress">
          <view class="progress-row">
            <text class="progress-label">整体进度</text>
            <text class="progress-pct" :class="getProgressClass(p.computedProgress)">{{ p.computedProgress }}%</text>
          </view>
          <view class="progress-bar">
            <view class="progress-fill" :style="{ width: p.computedProgress + '%' }" :class="getProgressClass(p.computedProgress)"></view>
          </view>
        </view>

        <!-- 节点横条 -->
        <view class="node-track" v-if="p.nodes && p.nodes.length">
          <view
            class="node-dot"
            v-for="(node, idx) in p.nodes.slice(0, 8)"
            :key="node.id"
            :class="`dot-${node.status || 'pending'}`"
            :title="node.node_name || node.stage_name"
          ></view>
          <text class="node-more" v-if="p.nodes.length > 8">+{{ p.nodes.length - 8 }}</text>
        </view>
        <view class="node-track" v-else>
          <text class="no-node">暂无节点</text>
        </view>

        <!-- 卡片底部信息 -->
        <view class="card-footer">
          <view class="footer-left">
            <text class="footer-item">👤 {{ p.customer_name || '无关联客户' }}</text>
            <text class="footer-item">📅 {{ p.start_date || '?' }} ~ {{ p.end_date || '?' }}</text>
          </view>
          <view class="footer-arrow">›</view>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view class="empty-state" v-else>
      <text class="empty-icon">📂</text>
      <text class="empty-text">{{ keyword ? '未找到匹配项目' : '暂无项目' }}</text>
    </view>
  </view>
</view>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useUserStore } from "@/stores/user";

const keyword = ref('');
const curStatus = ref('');
const userStore = useUserStore();
const list = ref([]);
const loading = ref(false);

// 筛选后的列表
const filteredList = computed(() => {
  let result = list.value;
  if (curStatus.value) {
    result = result.filter(p => p.status === curStatus.value);
  }
  if (keyword.value.trim()) {
    const kw = keyword.value.trim().toLowerCase();
    result = result.filter(p =>
      (p.name || '').toLowerCase().includes(kw) ||
      (p.customer_name || '').toLowerCase().includes(kw) ||
      (p.customer_address || '').toLowerCase().includes(kw)
    );
  }
  // 计算每个项目的进度
  return result.map(p => ({
    ...p,
    computedProgress: computeProgress(p)
  }));
});

// 计算项目进度：已完成节点 / 总节点数（不含跳过）
const computeProgress = (project) => {
  if (!project.nodes || project.nodes.length === 0) return 0;
  const done = project.nodes.filter(n =>
    n.status === 'completed' || n.status === '已完成'
  ).length;
  return Math.round((done / project.nodes.length) * 100);
};

const setStatus = (status) => {
  curStatus.value = status;
};

const doSearch = () => {
  // 触发 computed 重新计算
};

const getStatusClass = (status) => {
  if (!status) return 's-default';
  if (status.includes('竣工') || status.includes('完结') || status.includes('完成')) return 's-done';
  if (status.includes('进行') || status.includes('施工')) return 's-progress';
  if (status.includes('未开工')) return 's-pending';
  if (status.includes('延期')) return 's-overdue';
  return 's-default';
};

const getProgressClass = (progress) => {
  if (!progress || progress < 30) return 'p-low';
  if (progress < 70) return 'p-mid';
  return 'p-high';
};

const goDetail = (p) => {
  // 进入项目详情页（再点击"管理节点"进入节点管理）
  uni.navigateTo({ url: `/pages/projects/detail?id=${p.id}` });
};

const fetchList = async () => {
  loading.value = true;
  try {
    const token = uni.getStorageSync("token");
    const userInfo = uni.getStorageSync('userInfo');
    const res = await uni.request({
      url: "/api/projects",
      header: { 
        Authorization: token,
        'x-user-role': userStore.state.role_name,
        'x-user-id': String(userStore.state.id),
      },
    }).catch((err) => {
      console.error("请求异常", err);
      return { data: [] };
    });
    if (!res || !res.data) {
      loading.value = false;
      return;
    }
    const data = res.data;
    if (Array.isArray(data)) {
      list.value = data;
    }
  } catch (e) {
    console.error("加载项目失败", e);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchList();
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
  padding-bottom: 20px;
}

/* 搜索栏 */
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

.search-clear {
  font-size: 12px;
  color: #9CA3AF;
  cursor: pointer;
  padding: 2px 4px;
}

/* 筛选栏 */
.filter-bar {
  padding: 10px 0;
  background: #fff;
  border-bottom: 1px solid #F3F4F6;
}

.filter-scroll {
  white-space: nowrap;
}

.filter-tags {
  display: inline-flex;
  padding: 0 16px;
  gap: 8px;
}

.filter-tag {
  display: inline-block;
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 13px;
  color: #6B7280;
  background: #F3F4F6;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-tag.active {
  background: #1E3A5F;
  color: #fff;
}

.filter-tag.warning-tag.active {
  background: #EF4444;
}

/* 项目卡片 */
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
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
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
  line-height: 1.3;
}

.status-badge {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 20px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.s-default { background: #F3F4F6; color: #6B7280; }
.s-done { background: #D1FAE5; color: #065F46; }
.s-progress { background: #DBEAFE; color: #1E40AF; }
.s-pending { background: #FEF3C7; color: #92400E; }
.s-overdue { background: #FEE2E2; color: #991B1B; }

.card-meta {
  margin-top: 4px;
}

.meta-item {
  font-size: 12px;
  color: #9CA3AF;
}

/* 进度 */
.card-progress {
  margin-bottom: 12px;
}

.progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  transition: width 0.3s;
}

.progress-fill.p-low { background: #D1D5DB; }
.progress-fill.p-mid { background: linear-gradient(90deg, #F59E0B, #FBBF24); }
.progress-fill.p-high { background: linear-gradient(90deg, #10B981, #34D399); }

/* 节点横条 */
.node-track {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
  min-height: 10px;
}

.node-dot {
  width: 24px;
  height: 8px;
  border-radius: 4px;
  flex-shrink: 0;
}

.dot-pending { background: #E5E7EB; }
.dot-in_progress { background: #3B82F6; }
.dot-completed { background: #10B981; }
.dot-skipped { background: #F59E0B; }

.node-more {
  font-size: 11px;
  color: #9CA3AF;
  margin-left: 2px;
}

.no-node {
  font-size: 12px;
  color: #D1D5DB;
}

/* 底部 */
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #F9FAFB;
}

.footer-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.footer-item {
  font-size: 12px;
  color: #6B7280;
}

.footer-arrow {
  font-size: 22px;
  color: #D1D5DB;
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
