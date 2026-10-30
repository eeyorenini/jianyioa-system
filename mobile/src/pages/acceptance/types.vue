<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">验收中心</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 项目 -->
    <view class="project-bar" @click="chooseProject">
      <text class="pb-label">项目</text>
      <text class="pb-name" :class="{ empty: !projectName }">{{ projectName || '点击选择项目' }}</text>
      <text class="pb-arrow">›</text>
    </view>

    <view class="sec-title">
      <text>按手册验收（{{ templates.length }} 类）</text>
      <text class="sec-sub">依据《施工服务手册》</text>
    </view>

    <view class="loading-state" v-if="loading"><text>加载中...</text></view>

    <view class="type-list" v-else>
      <view class="type-card" v-for="t in templates" :key="t.code" @click="goFill(t)">
        <view class="tc-left">
          <view class="tc-title-row">
            <text class="tc-name">{{ t.name }}</text>
            <text class="tc-done" v-if="t.count">已做 {{ t.count }}</text>
          </view>
          <text class="tc-source">{{ t.source }} · {{ t.itemCount }} 项</text>
          <text class="tc-intro">{{ t.intro }}</text>
          <view class="tc-tags" v-if="t.count">
            <text class="mini-tag pass" v-if="t.pass">合格 {{ t.pass }}</text>
            <text class="mini-tag fail" v-if="t.fail">不合格 {{ t.fail }}</text>
            <text class="mini-tag rectify" v-if="t.rectify">整改中 {{ t.rectify }}</text>
          </view>
        </view>
        <text class="tc-arrow">›</text>
      </view>
    </view>

    <!-- 最近验收单 -->
    <view class="sec-title" v-if="records.length">
      <text>最近验收单</text>
      <text class="sec-sub" @click="loadAll">全部 ›</text>
    </view>
    <view class="rec-list" v-if="records.length">
      <view class="rec-card" v-for="r in records" :key="r.id" @click="goReport(r.id)">
        <view class="rc-top">
          <text class="rc-name">{{ r.template_name }}</text>
          <text class="rc-result" :class="'rr-' + r.result">{{ resultText(r.result) }}</text>
        </view>
        <view class="rc-meta">
          <text>{{ r.sheet_no }}</text>
          <text>{{ r.accept_date }}</text>
          <text v-if="r.area">{{ r.area }}</text>
          <text v-if="r.batch_no">第{{ r.batch_no }}批</text>
        </view>
        <view class="rc-stat">
          <text>共 {{ r.item_count }} 项 · 合格 {{ r.pass_count }} · 不合格 {{ r.fail_count }}</text>
        </view>
      </view>
    </view>

    <view class="empty-state" v-if="!loading && !templates.length">
      <text class="empty-text">{{ errorMsg || '暂无验收类型' }}</text>
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
const templates = ref([]);
const records = ref([]);
const loading = ref(true);
const errorMsg = ref('');

function resultText(r) {
  return { pass: '合格', fail: '不合格', rectify: '整改中', pending: '未完成' }[r] || r;
}

async function chooseProject() {
  const p = await pickProject('选择验收项目');
  if (p) {
    projectId.value = p.id;
    projectName.value = p.name;
    loadSummary();
    loadRecords();
  }
}

async function loadSummary() {
  if (!projectId.value) { templates.value = []; loading.value = false; return; }
  loading.value = true;
  try {
    const res = await uni.request({
      url: `/api/acceptance-sheets/project/${projectId.value}/summary`,
      header: authHeader(),
    });
    const d = res.data || {};
    if (Array.isArray(d.templates)) templates.value = d.templates;
    else errorMsg.value = d.error || '加载失败';
  } catch (e) {
    errorMsg.value = '网络异常';
  } finally {
    loading.value = false;
  }
}

async function loadRecords() {
  if (!projectId.value) return;
  try {
    const res = await uni.request({
      url: `/api/acceptance-sheets?project_id=${projectId.value}`,
      header: authHeader(),
    });
    const d = res.data || {};
    records.value = (d.list || []).slice(0, 10);
  } catch (e) { records.value = []; }
}

async function loadAll() {
  const q = projectId.value
    ? `?projectId=${projectId.value}&projectName=${encodeURIComponent(projectName.value)}`
    : '';
  uni.navigateTo({ url: `/pages/acceptance/list${q}` });
}

function goFill(t) {
  if (!projectId.value) {
    uni.showToast({ title: '请先选择项目', icon: 'none' });
    return;
  }
  uni.navigateTo({
    url: `/pages/acceptance/fill?code=${t.code}&projectId=${projectId.value}&projectName=${encodeURIComponent(projectName.value)}`,
  });
}

function goReport(id) {
  uni.navigateTo({ url: `/pages/acceptance/report?id=${id}` });
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
  loadSummary();
  loadRecords();
});

// 从填单页返回时刷新计数
onShow(() => {
  if (projectId.value) { loadSummary(); loadRecords(); }
});
</script>

<style scoped>
.page { min-height: 100vh; background: #F5F7FA; padding: 16px; padding-bottom: 60px; }

.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100; margin: -16px -16px 0 -16px;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.project-bar { display: flex; align-items: center; background: #fff; border-radius: 12px; padding: 13px 14px; margin-top: 12px; }
.pb-label { font-size: 13px; color: #6B7280; width: 48px; }
.pb-name { flex: 1; font-size: 14px; color: #1A1F36; font-weight: 600; }
.pb-name.empty { color: #9CA3AF; font-weight: 400; }
.pb-arrow { font-size: 20px; color: #D1D5DB; }

.sec-title { display: flex; justify-content: space-between; align-items: baseline; margin: 16px 2px 10px; }
.sec-title text:first-child { font-size: 14px; font-weight: 600; color: #1A1F36; }
.sec-sub { font-size: 11px; color: #9CA3AF; }

.loading-state { text-align: center; padding: 40px; color: #9CA3AF; font-size: 14px; }

.type-list { display: flex; flex-direction: column; gap: 10px; }
.type-card { display: flex; align-items: center; background: #fff; border-radius: 12px; padding: 13px 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
.tc-left { flex: 1; }
.tc-title-row { display: flex; align-items: center; gap: 8px; }
.tc-name { font-size: 15px; font-weight: 600; color: #1A1F36; }
.tc-done { font-size: 10px; color: #1D4ED8; background: #DBEAFE; padding: 1px 7px; border-radius: 8px; }
.tc-source { display: block; font-size: 11px; color: #2563EB; margin-top: 4px; }
.tc-intro { display: block; font-size: 11px; color: #9CA3AF; line-height: 1.5; margin-top: 4px; }
.tc-tags { display: flex; gap: 6px; margin-top: 6px; }
.mini-tag { font-size: 10px; padding: 1px 7px; border-radius: 8px; }
.mini-tag.pass { background: #D1FAE5; color: #065F46; }
.mini-tag.fail { background: #FEE2E2; color: #991B1B; }
.mini-tag.rectify { background: #FEF3C7; color: #92400E; }
.tc-arrow { font-size: 20px; color: #D1D5DB; margin-left: 8px; }

.rec-list { display: flex; flex-direction: column; gap: 8px; }
.rec-card { background: #fff; border-radius: 10px; padding: 12px 14px; }
.rc-top { display: flex; justify-content: space-between; align-items: center; }
.rc-name { font-size: 14px; font-weight: 600; color: #1A1F36; }
.rc-result { font-size: 11px; padding: 2px 9px; border-radius: 9px; }
.rr-pass { background: #D1FAE5; color: #065F46; }
.rr-fail { background: #FEE2E2; color: #991B1B; }
.rr-rectify { background: #FEF3C7; color: #92400E; }
.rr-pending { background: #F3F4F6; color: #6B7280; }
.rc-meta { display: flex; gap: 12px; margin-top: 6px; font-size: 11px; color: #6B7280; }
.rc-stat { font-size: 11px; color: #9CA3AF; margin-top: 4px; }

.empty-state { text-align: center; padding: 60px 20px; }
.empty-text { font-size: 13px; color: #9CA3AF; }
</style>
