<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">进度验收</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 项目信息 -->
    <view class="project-banner" v-if="projectName">
      <text>📁 {{ projectName }}</text>
    </view>

    <!-- 筛选 -->
    <view class="filter-row">
      <view class="filter-tag" :class="{ active: curStatus === '' }" @click="curStatus = ''">全部</view>
      <view class="filter-tag warning" :class="{ active: curStatus === '待验收' }" @click="curStatus = '待验收'">待验收</view>
      <view class="filter-tag success" :class="{ active: curStatus === '已通过' }" @click="curStatus = '已通过'">已通过</view>
      <view class="filter-tag danger" :class="{ active: curStatus === '整改中' }" @click="curStatus = '整改中'">整改中</view>
      <view class="filter-tag danger" :class="{ active: curStatus === '不通过' }" @click="curStatus = '不通过'">不通过</view>
    </view>

    <!-- 加载中 -->
    <view class="loading-state" v-if="loading">
      <text>加载中...</text>
    </view>

    <!-- 列表 -->
    <view class="record-list" v-else-if="filteredList.length">
      <view class="record-card" v-for="item in filteredList" :key="item.id" @click="goDetail(item)">
        <view class="card-top">
          <text class="card-title">{{ item.stage || '验收项' }}</text>
          <text class="status-pill" :class="statusClass(item.accept_status)">{{ item.accept_status || '待验收' }}</text>
        </view>

        <view class="card-meta">
          <text v-if="item.accept_date">📅 {{ item.accept_date }}</text>
          <text v-if="item.quality_score != null">⭐ {{ item.quality_score }} 分</text>
          <text>👤 {{ item.creator_name || '员工' }}</text>
        </view>

        <view class="card-desc" v-if="item.issues">
          <view class="tag-box">问题</view>
          <text class="desc-text">{{ item.issues }}</text>
        </view>

        <view class="log-photos" v-if="getPhotos(item).length">
          <view class="log-photo" v-for="(photo, idx) in getPhotos(item)" :key="idx" @click.stop="previewPhoto(item, idx)">
            <image class="log-photo-img" :src="photo" mode="aspectFill" />
          </view>
        </view>

        <view class="card-footer">
          <text class="card-project">📁 {{ item.project_name || ('项目ID ' + (item.project_id || '-')) }}</text>
          <text class="card-arrow">›</text>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <text class="empty-icon">✅</text>
      <text class="empty-text">{{ curStatus ? '暂无' + curStatus + '记录' : '暂无验收记录' }}</text>
    </view>

    <!-- 新建按钮 -->
    <view class="fab" @click="goAdd">
      <text>+</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { absAsset } from "@/utils/api";
import { guardTab } from "@/utils/permission";
import { pickProject } from "@/utils/projectPicker";

const projectId = ref(0);
const projectName = ref('');
const curStatus = ref('');
const list = ref([]);
const loading = ref(false);

const statusClass = (s) => {
  if (s === '已通过') return 's-pass';
  if (s === '整改中' || s === '不通过') return 's-rework';
  return 's-pending';
};

const filteredList = computed(() => {
  if (!curStatus.value) return list.value;
  return list.value.filter((i) => (i.accept_status || '待验收') === curStatus.value);
});

// 附件图片（后端存 JSON 字符串数组）
function getPhotos(item) {
  if (!item || !item.attachment) return [];
  try {
    let p = item.attachment;
    if (typeof p === 'string') p = JSON.parse(p);
    if (typeof p === 'string') p = JSON.parse(p);
    if (Array.isArray(p)) return p.filter((x) => x && String(x).trim()).map(absAsset);
    return [];
  } catch { return []; }
}

function previewPhoto(item, idx) {
  const photos = getPhotos(item);
  uni.previewImage({ urls: photos, current: photos[idx] });
}

async function loadData() {
  loading.value = true;
  try {
    const query = [];
    if (projectId.value) query.push('project_id=' + projectId.value);
    const url = '/api/acceptance' + (query.length ? '?' + query.join('&') : '');
    const res = await uni.request({ url, header: { Authorization: uni.getStorageSync('token') } });
    const data = res.data;
    if (Array.isArray(data)) list.value = data;
    else if (data && Array.isArray(data.list)) list.value = data.list;
    else list.value = [];
  } catch (e) {
    console.error('加载验收失败', e);
    list.value = [];
  } finally {
    loading.value = false;
  }
}

const goDetail = (item) => {
  uni.navigateTo({ url: `/pages/acceptance/detail?id=${item.id}` });
};

const goAdd = async () => {
  if (projectId.value) {
    uni.navigateTo({ url: `/pages/acceptance/add?projectId=${projectId.value}&projectName=${encodeURIComponent(projectName.value)}` });
    return;
  }
  // 从首页/入口进来没有指定项目时，先选项目（与巡检/派工一致）
  const p = await pickProject('选择项目后添加验收');
  if (p) {
    uni.navigateTo({ url: `/pages/acceptance/add?projectId=${p.id}&projectName=${encodeURIComponent(p.name)}` });
  }
};

const goBack = () => {
  const pages = getCurrentPages();
  if (pages.length <= 1) {
    uni.switchTab({ url: '/pages/home/index' });
  } else {
    uni.navigateBack();
  }
};

onMounted(() => {
  if (!guardTab('acceptance:read')) return;
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = (current && current.options) || {};
  projectId.value = parseInt(options.projectId || '0');
  if (options.projectName) projectName.value = decodeURIComponent(options.projectName);
  loadData();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding: 16px;
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
  margin: -16px -16px 0 -16px;
}

.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.project-banner {
  font-size: 13px;
  color: #1E3A5F;
  background: #DBEAFE;
  padding: 8px 14px;
  font-weight: 500;
  border-radius: 8px;
  margin: 12px 0;
}

.filter-row {
  display: flex;
  gap: 8px;
  margin: 12px 0 14px;
  flex-wrap: wrap;
}

.filter-tag {
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 13px;
  background: #fff;
  color: #6B7280;
}

.filter-tag.active { background: #1E3A5F; color: #fff; }
.filter-tag.danger.active { background: #EF4444; }
.filter-tag.warning.active { background: #F59E0B; }
.filter-tag.success.active { background: #10B981; }

.loading-state { text-align: center; padding: 40px; color: #9CA3AF; font-size: 14px; }

.record-list { display: flex; flex-direction: column; gap: 12px; }

.record-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.card-title { font-size: 15px; font-weight: 600; color: #1A1F36; flex: 1; margin-right: 10px; }

.status-pill {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 10px;
  white-space: nowrap;
}
.s-pass { background: #D1FAE5; color: #065F46; }
.s-rework { background: #FEE2E2; color: #991B1B; }
.s-pending { background: #FEF3C7; color: #92400E; }

.card-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #6B7280;
  margin-bottom: 6px;
}

.card-desc { display: flex; align-items: flex-start; margin-bottom: 8px; }
.tag-box {
  background: rgba(217, 246, 0, 0.11);
  color: #1E3A5F;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 12px;
  min-width: 42px;
  text-align: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.desc-text { flex: 1; font-size: 14px; color: #333; line-height: 1.5; word-break: break-all; padding-left: 12px; }

.log-photos {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-top: 6px;
}
.log-photo { aspect-ratio: 1; border-radius: 6px; overflow: hidden; }
.log-photo-img { width: 100%; height: 100%; display: block; }

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #F9FAFB;
  margin-top: 6px;
}
.card-project { font-size: 12px; color: #6B7280; }
.card-arrow { font-size: 20px; color: #D1D5DB; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; }
.empty-icon { font-size: 40px; margin-bottom: 8px; opacity: 0.5; }
.empty-text { font-size: 14px; color: #9CA3AF; }

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
