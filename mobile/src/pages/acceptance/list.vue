<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">验收记录</text>
      <text class="nav-right" @click="goNew">+ 新建</text>
    </view>

    <!-- 项目筛选 -->
    <view class="filter-bar">
      <view class="filter-item" @click="chooseProject">
        <text class="fi-label">项目</text>
        <text class="fi-value" :class="{ empty: !projectName }">{{ projectName || '全部项目' }}</text>
        <text class="fi-arrow">›</text>
      </view>
      <view class="filter-clear" v-if="projectId" @click="clearProject">清除</view>
    </view>

    <!-- 结果筛选 -->
    <view class="chips">
      <text
        v-for="c in resultChips"
        :key="c.value"
        class="chip"
        :class="{ on: resultFilter === c.value }"
        @click="setResult(c.value)"
      >{{ c.label }}</text>
    </view>

    <view class="loading-state" v-if="loading"><text>加载中...</text></view>

    <view class="rec-list" v-else-if="list.length">
      <view class="rec-card" v-for="r in list" :key="r.id" @click="goReport(r)">
        <view class="rc-top">
          <text class="rc-name">{{ r.template_name }}</text>
          <text class="rc-result" :class="'rr-' + r.result">{{ resultText(r.result) }}</text>
        </view>
        <text class="rc-project">{{ r.project_name }}</text>
        <view class="rc-meta">
          <text>{{ r.sheet_no }}</text>
          <text>{{ r.accept_date }}</text>
          <text v-if="r.area">{{ r.area }}</text>
          <text v-if="r.batch_no">第{{ r.batch_no }}批</text>
        </view>
        <view class="rc-stat">
          <text>共 {{ r.item_count }} 项 · 合格 {{ r.pass_count }} · 不合格 {{ r.fail_count }}</text>
          <text class="rc-sign" v-if="r.foreman_name">项目经理 {{ r.foreman_name }}</text>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <text class="empty-icon">✅</text>
      <text class="empty-text">{{ errorMsg || '暂无验收记录' }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { authHeader, guardTab } from '@/utils/permission';
import { pickProject } from '@/utils/projectPicker';

const projectId = ref(0);
const projectName = ref('');
const list = ref([]);
const loading = ref(true);
const errorMsg = ref('');
const resultFilter = ref('');

const resultChips = [
  { value: '', label: '全部' },
  { value: 'pass', label: '合格' },
  { value: 'rectify', label: '整改中' },
  { value: 'fail', label: '不合格' },
];

function resultText(r) {
  return { pass: '合格', fail: '不合格', rectify: '整改中', pending: '未完成' }[r] || r || '';
}

async function chooseProject() {
  const p = await pickProject('选择项目');
  if (p) { projectId.value = p.id; projectName.value = p.name; load(); }
}

function clearProject() {
  projectId.value = 0;
  projectName.value = '';
  load();
}

function setResult(v) {
  resultFilter.value = v;
  load();
}

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const qs = [];
    if (projectId.value) qs.push(`project_id=${projectId.value}`);
    if (resultFilter.value) qs.push(`result=${resultFilter.value}`);
    const res = await uni.request({
      url: '/api/acceptance-sheets' + (qs.length ? '?' + qs.join('&') : ''),
      header: authHeader(),
    });
    const d = res.data || {};
    if (Array.isArray(d.list)) list.value = d.list;
    else { list.value = []; errorMsg.value = d.error || '加载失败'; }
  } catch (e) {
    list.value = [];
    errorMsg.value = '网络异常';
  } finally {
    loading.value = false;
  }
}

function goReport(r) {
  uni.navigateTo({ url: `/pages/acceptance/report?id=${r.id}` });
}

function goNew() {
  const q = projectId.value
    ? `?projectId=${projectId.value}&projectName=${encodeURIComponent(projectName.value)}`
    : '';
  uni.navigateTo({ url: `/pages/acceptance/types${q}` });
}

const goBack = () => {
  const pages = getCurrentPages();
  if (pages.length <= 1) uni.switchTab({ url: '/pages/home/index' });
  else uni.navigateBack();
};

onLoad((options) => {
  if (!guardTab('acceptance:read')) return;
  const pid = parseInt((options && options.projectId) || '0', 10);
  if (pid) {
    projectId.value = pid;
    projectName.value = (options && options.projectName) ? decodeURIComponent(options.projectName) : '';
  }
});

onShow(() => { load(); });
</script>

<style scoped>
.page { min-height: 100vh; background: #F5F7FA; padding: 16px; padding-bottom: 40px; }

.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100; margin: -16px -16px 0 -16px;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 16px; font-weight: 600; }
.nav-right { width: 56px; text-align: right; font-size: 14px; color: #93C5FD; }

.filter-bar { display: flex; align-items: center; background: #fff; border-radius: 12px; padding: 0 14px; margin-top: 12px; }
.filter-item { flex: 1; display: flex; align-items: center; padding: 12px 0; }
.fi-label { font-size: 13px; color: #6B7280; width: 48px; }
.fi-value { flex: 1; font-size: 14px; color: #1A1F36; font-weight: 500; }
.fi-value.empty { color: #9CA3AF; font-weight: 400; }
.fi-arrow { font-size: 20px; color: #D1D5DB; }
.filter-clear { font-size: 12px; color: #2563EB; padding: 6px 0 6px 12px; }

.chips { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.chip { font-size: 12px; padding: 5px 14px; border-radius: 15px; background: #fff; color: #6B7280; }
.chip.on { background: #1E3A5F; color: #fff; }

.loading-state { text-align: center; padding: 40px; color: #9CA3AF; font-size: 14px; }

.rec-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.rec-card { background: #fff; border-radius: 10px; padding: 12px 14px; }
.rc-top { display: flex; justify-content: space-between; align-items: center; }
.rc-name { font-size: 14px; font-weight: 600; color: #1A1F36; }
.rc-result { font-size: 11px; padding: 2px 9px; border-radius: 9px; }
.rr-pass { background: #D1FAE5; color: #065F46; }
.rr-fail { background: #FEE2E2; color: #991B1B; }
.rr-rectify { background: #FEF3C7; color: #92400E; }
.rr-pending { background: #F3F4F6; color: #6B7280; }
.rc-project { display: block; font-size: 12px; color: #4B5563; margin-top: 5px; }
.rc-meta { display: flex; gap: 12px; margin-top: 5px; font-size: 11px; color: #9CA3AF; }
.rc-stat { display: flex; justify-content: space-between; font-size: 11px; color: #9CA3AF; margin-top: 5px; }
.rc-sign { color: #6B7280; }

.empty-state { text-align: center; padding: 70px 20px; }
.empty-icon { display: block; font-size: 40px; margin-bottom: 10px; }
.empty-text { font-size: 13px; color: #9CA3AF; }
</style>
