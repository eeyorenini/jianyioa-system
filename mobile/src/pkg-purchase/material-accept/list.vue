<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar" :style="navStyle">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">主材验收</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 项目横幅 -->
    <view class="project-banner" v-if="projectName">
      <text>📁 {{ projectName }}</text>
    </view>

    <!-- 筛选 -->
    <view class="filter-row">
      <view
        class="filter-tag"
        v-for="f in filters"
        :key="f.key"
        :class="[f.cls, { active: curFilter === f.key }]"
        @click="curFilter = f.key"
      >{{ f.label }}</view>
    </view>

    <view class="loading-state" v-if="loading">
      <text>加载中...</text>
    </view>

    <!-- 列表 -->
    <view class="record-list" v-else-if="filteredList.length">
      <view class="record-card" v-for="item in filteredList" :key="item.id" @click="goDetail(item)">
        <view class="card-top">
          <text class="card-title">{{ item.stage || '材料进场' }}</text>
          <text class="status-pill" :class="'tone-' + resultTone(item.result)">{{ shortResult(item.result) }}</text>
        </view>

        <view class="card-meta">
          <text v-if="item.accept_no">#{{ item.accept_no }}</text>
          <text v-if="item.accept_date">📅 {{ item.accept_date }}</text>
          <text>👤 {{ item.foreman_name || item.creator_name || '员工' }}</text>
        </view>

        <view class="card-mid">
          <text class="mid-count">共 {{ item.item_count || 0 }} 项</text>
          <text class="mid-pass" v-if="item.pass_count">合格 {{ item.pass_count }}</text>
          <text class="mid-fail" v-if="item.fail_count">不合格 {{ item.fail_count }}</text>
          <text class="mid-supplier" v-if="item.supplier_name">· {{ item.supplier_name }}</text>
        </view>

        <view class="log-photos" v-if="photosOf(item).length">
          <view class="log-photo" v-for="(photo, idx) in photosOf(item)" :key="idx" @click.stop="previewPhoto(item, idx)">
            <image class="log-photo-img" :src="photo" mode="aspectFill" />
          </view>
        </view>

        <view class="card-footer">
          <text class="card-project">📁 {{ item.project_name_display || item.project_name || ('项目ID ' + (item.project_id || '-')) }}</text>
          <text class="card-arrow">›</text>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <text class="empty-icon">📦</text>
      <text class="empty-text">{{ curFilter === 'all' ? '暂无材料验收记录' : '该结论下暂无记录' }}</text>
      <text class="empty-hint">点右下角 + 提交第一单</text>
    </view>

    <!-- 新建 -->
    <view class="fab" @click="goAdd">
      <text>+</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { absAsset } from '@/utils/api';
import { pickProject } from '@/utils/projectPicker';
import { resultTone, parseArr } from './dict';

const projectId = ref(0);
const projectName = ref('');
const curFilter = ref('all');
const list = ref([]);
const loading = ref(false);

const filters = [
  { key: 'all', label: '全部', cls: '' },
  { key: 'pass', label: '全部合格', cls: 'success' },
  { key: 'part', label: '部分合格', cls: 'warning' },
  { key: 'fail', label: '退场', cls: 'danger' },
];

const shortResult = (r) => {
  if (!r) return '未填结论';
  if (r.indexOf('全部合格') === 0) return '全部合格';
  if (r.indexOf('部分合格') === 0) return '部分合格';
  if (r.indexOf('全部不合格') === 0) return '退场';
  if (r.indexOf('让步') >= 0) return '让步接收';
  if (r.indexOf('待复检') >= 0) return '待复检';
  return r;
};

const filteredList = computed(() => {
  if (curFilter.value === 'all') return list.value;
  return list.value.filter((i) => {
    const r = i.result || '';
    if (curFilter.value === 'pass') return r.indexOf('全部合格') === 0;
    if (curFilter.value === 'part') return r.indexOf('部分合格') === 0;
    if (curFilter.value === 'fail') return r.indexOf('全部不合格') === 0;
    return true;
  });
});

function photosOf(item) {
  return parseArr(item && item.photos).map(absAsset);
}

function previewPhoto(item, idx) {
  const urls = photosOf(item);
  uni.previewImage({ urls, current: urls[idx] });
}

const authHeader = () => ({ Authorization: uni.getStorageSync('token') });

async function loadData() {
  loading.value = true;
  try {
    const q = [];
    if (projectId.value) q.push('project_id=' + projectId.value);
    const url = '/api/material-acceptances' + (q.length ? '?' + q.join('&') : '');
    const res = await uni.request({ url, header: authHeader() });
    const d = res.data || {};
    const rows = Array.isArray(d) ? d : (Array.isArray(d.list) ? d.list : []);
    list.value = rows;
  } catch (e) {
    list.value = [];
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

// ⚠️ 必须用 onLoad 拿参数：onMounted 里 getCurrentPages() 在 H5 首屏不一定就绪，
// 拿不到 projectId 会走进"选项目"分支，取消后 navigateBack 直接把用户弹回首页。
onLoad(async (options) => {
  const opts = options || {};
  projectId.value = parseInt(opts.projectId || '0') || 0;
  if (opts.projectName) projectName.value = decodeURIComponent(opts.projectName);
  // 首页进来没带项目 → 先选项目（取消则留在本页显示空态，不再自动返回）
  if (!projectId.value) {
    const p = await pickProject('选择项目后查看材料验收');
    if (p) {
      projectId.value = p.id;
      projectName.value = p.name || '';
    }
  }
  await loadData();
});

// 从新增页返回后刷新（首次 onShow 与 onMounted 的加载重复，跳过第一次）
let firstShow = true;
onShow(() => {
  if (firstShow) { firstShow = false; return; }
  if (projectId.value) loadData();
});

const goAdd = () => {
  if (!projectId.value) { uni.showToast({ title: '请先选择项目', icon: 'none' }); return; }
  uni.navigateTo({
    url: `/pages/material-accept/add?projectId=${projectId.value}&projectName=${encodeURIComponent(projectName.value)}`,
  });
};

const goDetail = (item) => {
  uni.navigateTo({ url: `/pages/material-accept/detail?id=${item.id}` });
};

const goBack = () => uni.navigateBack();
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding: 16px;
  padding-top: 0;
  padding-bottom: 100px;
  box-sizing: border-box;
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
  margin: 0 -16px;
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
  margin: 12px 0 8px;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  margin: 4px 0 12px;
}
.filter-tag {
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 14px;
  background: #fff;
  color: #6B7280;
  margin: 0 8px 8px 0;
  border: 1px solid #E5E7EB;
}
.filter-tag.active { background: #1E3A5F; color: #fff; border-color: #1E3A5F; }
.filter-tag.success.active { background: #0E9F6E; border-color: #0E9F6E; }
.filter-tag.warning.active { background: #D97706; border-color: #D97706; }
.filter-tag.danger.active { background: #DC2626; border-color: #DC2626; }

.loading-state { text-align: center; color: #9CA3AF; font-size: 13px; padding: 40px 0; }

.record-card {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 12px;
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-title { font-size: 15px; font-weight: 600; color: #1A1F36; flex: 1; }
.status-pill {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  color: #fff;
  background: #9CA3AF;
  flex-shrink: 0;
}
.status-pill.tone-pass { background: #0E9F6E; }
.status-pill.tone-fail { background: #DC2626; }
.status-pill.tone-warn { background: #D97706; }
.status-pill.tone-info { background: #6B7280; }

.card-meta {
  display: flex;
  flex-wrap: wrap;
  font-size: 11px;
  color: #8A93A3;
  margin-top: 6px;
}
.card-meta text { margin-right: 10px; }

.card-mid {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 8px;
  font-size: 12px;
}
.mid-count { color: #374151; margin-right: 10px; }
.mid-pass { color: #0E9F6E; margin-right: 8px; }
.mid-fail { color: #DC2626; margin-right: 8px; }
.mid-supplier { color: #9CA3AF; }

.log-photos { display: flex; flex-wrap: wrap; margin-top: 10px; }
.log-photo {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  margin: 0 8px 8px 0;
  background: #F3F4F6;
}
.log-photo-img { width: 100%; height: 100%; display: block; }

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #F3F4F6;
}
.card-project { font-size: 12px; color: #6B7280; flex: 1; }
.card-arrow { font-size: 16px; color: #C7CBD3; }

.empty-state { text-align: center; padding: 60px 0; }
.empty-icon { font-size: 36px; display: block; margin-bottom: 10px; }
.empty-text { font-size: 14px; color: #6B7280; display: block; }
.empty-hint { font-size: 12px; color: #B0B7C3; display: block; margin-top: 6px; }

.fab {
  position: fixed;
  right: 20px;
  bottom: 28px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #1E3A5F;
  color: #fff;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(30, 58, 95, 0.3);
  z-index: 90;
}
</style>
