<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar" :style="navStyle">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">验收详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="loading-state" v-if="loading">
      <text>加载中...</text>
    </view>

    <view v-else-if="!record.id" class="empty-state">
      <text class="empty-icon">📦</text>
      <text class="empty-text">记录不存在或已被删除</text>
    </view>

    <block v-else>
      <!-- 抬头 -->
      <view class="head-card">
        <view class="head-top">
          <text class="head-no">{{ record.accept_no || ('#' + record.id) }}</text>
          <text class="status-pill" :class="'tone-' + resultTone(record.result)">{{ record.result || '未填结论' }}</text>
        </view>
        <text class="head-project">📁 {{ record.project_name_display || record.project_name || ('项目ID ' + record.project_id) }}</text>
        <view class="head-stats">
          <view class="stat-cell">
            <text class="stat-num">{{ record.item_count || 0 }}</text>
            <text class="stat-label">验收项</text>
          </view>
          <view class="stat-divider"></view>
          <view class="stat-cell">
            <text class="stat-num pass">{{ record.pass_count || 0 }}</text>
            <text class="stat-label">合格</text>
          </view>
          <view class="stat-divider"></view>
          <view class="stat-cell">
            <text class="stat-num fail">{{ record.fail_count || 0 }}</text>
            <text class="stat-label">不合格</text>
          </view>
        </view>
      </view>

      <!-- 单据信息 -->
      <view class="card">
        <view class="card-title">单据信息</view>
        <view class="info-row">
          <text class="info-label">验收日期</text>
          <text class="info-value">{{ record.accept_date || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">施工阶段</text>
          <text class="info-value">{{ record.stage || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">验收人</text>
          <text class="info-value">{{ record.foreman_name || record.creator_name || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">供应商</text>
          <text class="info-value">{{ record.supplier_name || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">送货单号</text>
          <text class="info-value">{{ record.delivery_no || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">提交人</text>
          <text class="info-value">{{ record.creator_name || '-' }}</text>
        </view>
      </view>

      <!-- 材料明细 -->
      <view class="card">
        <view class="card-title">材料明细（{{ items.length }}）</view>
        <view class="item-card" v-for="(it, idx) in items" :key="it.id">
          <view class="item-head">
            <text class="item-idx">{{ idx + 1 }}</text>
            <view class="item-title-wrap">
              <text class="item-name">{{ it.material_name || '-' }}</text>
              <text class="item-spec">{{ [it.brand, it.spec].filter(Boolean).join(' · ') || '无规格信息' }}</text>
            </view>
            <text class="verdict-pill" :class="'tone-' + verdictTone(it.verdict)">{{ it.verdict || '合格' }}</text>
          </view>
          <view class="item-qty">
            <text class="qty-text">应到 {{ fmtQty(it.plan_qty) }}{{ it.unit || '' }}</text>
            <text class="qty-text">实到 {{ fmtQty(it.actual_qty) }}{{ it.unit || '' }}</text>
            <text class="qty-diff" v-if="qtyDiff(it) !== ''">差 {{ qtyDiff(it) }}</text>
          </view>
          <view class="tag-wrap" v-if="parseArr(it.problem_tags).length">
            <text class="tag-chip" v-for="t in parseArr(it.problem_tags)" :key="t">{{ t }}</text>
          </view>
          <text class="item-remark" v-if="it.remark">{{ it.remark }}</text>
        </view>
      </view>

      <!-- 结论 -->
      <view class="card">
        <view class="card-title">验收结论</view>
        <view class="info-row">
          <text class="info-label">随货资料</text>
          <text class="info-value">{{ parseArr(record.docs).join('、') || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">堆放与保护</text>
          <text class="info-value">{{ record.storage || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">结论</text>
          <text class="info-value strong">{{ record.result || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">不合格处理</text>
          <text class="info-value">{{ record.handling || '-' }}</text>
        </view>
        <view class="info-row" v-if="record.remark">
          <text class="info-label">备注</text>
          <text class="info-value">{{ record.remark }}</text>
        </view>
      </view>

      <!-- 照片 -->
      <view class="card" v-if="photos.length">
        <view class="card-title">现场照片（{{ photos.length }}）</view>
        <view class="photo-grid">
          <view class="photo-item" v-for="(p, idx) in photos" :key="idx" @click="previewPhoto(idx)">
            <image class="photo-img" :src="p" mode="aspectFill" />
          </view>
        </view>
      </view>

      <!-- 底部操作 -->
      <view class="bottom-bar" v-if="canDelete">
        <view class="btn-del" @click="handleDelete">删除此记录</view>
      </view>
    </block>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { absAsset } from '@/utils/api';
import { resultTone, verdictTone, parseArr } from './dict';

const record = ref({});
const items = ref([]);
const loading = ref(false);
const photos = computed(() => parseArr(record.value.photos).map(absAsset));

const myId = (() => {
  try { return (uni.getStorageSync('userInfo') || {}).id || 0; } catch (e) { return 0; }
})();
const canDelete = computed(() => record.value.id && Number(record.value.creator_id) === Number(myId));

const fmtQty = (v) => (v === null || v === undefined || v === '' ? '-' : Number(v));
const qtyDiff = (it) => {
  if (it.plan_qty == null || it.actual_qty == null) return '';
  const d = Number(it.actual_qty) - Number(it.plan_qty);
  if (!d) return '';
  return (d > 0 ? '+' : '') + d;
};

async function loadData(id) {
  loading.value = true;
  try {
    const res = await uni.request({
      url: `/api/material-acceptances/${id}`,
      header: { Authorization: uni.getStorageSync('token') },
    });
    // ⚠️ 404 响应体是 { error }，truthy，不能只判 res.data
    if ((res.statusCode === 200) && res.data && res.data.id) {
      record.value = res.data;
      items.value = Array.isArray(res.data.items) ? res.data.items : [];
    } else {
      record.value = {};
      items.value = [];
    }
  } catch (e) {
    record.value = {};
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

const previewPhoto = (idx) => {
  uni.previewImage({ urls: photos.value, current: photos.value[idx] });
};

const handleDelete = () => {
  uni.showModal({
    title: '删除确认',
    content: '删除后不可恢复，是否继续？',
    confirmText: '删除',
    confirmColor: '#EF4444',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        const res = await uni.request({
          url: `/api/material-acceptances/${record.value.id}`,
          method: 'DELETE',
          header: { Authorization: uni.getStorageSync('token') },
        });
        if (res.statusCode === 200) {
          uni.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => uni.navigateBack(), 1200);
        } else {
          uni.showToast({ title: (res.data && res.data.error) || '删除失败', icon: 'none' });
        }
      } catch (e) {
        uni.showToast({ title: '删除失败', icon: 'none' });
      }
    },
  });
};

// ⚠️ 用 onLoad 而不是 onMounted + getCurrentPages()：H5 首屏 mounted 阶段页面栈可能还没就绪
onLoad((options) => {
  const opts = options || {};
  const id = parseInt(opts.id || '0') || 0;
  if (!id) { uni.showToast({ title: '缺少记录 id', icon: 'none' }); return; }
  loadData(id);
});

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

.loading-state { text-align: center; color: #9CA3AF; font-size: 13px; padding: 40px 0; }
.empty-state { text-align: center; padding: 60px 0; }
.empty-icon { font-size: 36px; display: block; margin-bottom: 10px; }
.empty-text { font-size: 14px; color: #6B7280; }

.head-card {
  background: linear-gradient(135deg, #1E3A5F 0%, #2C5282 100%);
  border-radius: 14px;
  padding: 16px;
  margin: 12px 0;
  color: #fff;
}
.head-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.head-no { font-size: 15px; font-weight: 600; letter-spacing: 0.5px; }
.status-pill {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.24);
  color: #fff;
}
.head-project { font-size: 13px; color: rgba(255, 255, 255, 0.85); margin-top: 8px; display: block; }
.head-stats {
  display: flex;
  align-items: center;
  margin-top: 14px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 10px 0;
}
.stat-cell { flex: 1; text-align: center; }
.stat-num { font-size: 18px; font-weight: 700; display: block; }
.stat-num.pass { color: #6EE7B7; }
.stat-num.fail { color: #FCA5A5; }
.stat-label { font-size: 11px; color: rgba(255, 255, 255, 0.7); }
.stat-divider { width: 1px; height: 24px; background: rgba(255, 255, 255, 0.2); }

.card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
}
.card-title { font-size: 15px; font-weight: 600; color: #1A1F36; margin-bottom: 10px; }

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #F7F8FA;
  font-size: 13px;
}
.info-row:last-child { border-bottom: none; }
.info-label { color: #8A93A3; flex-shrink: 0; margin-right: 12px; }
.info-value { color: #1A1F36; text-align: right; flex: 1; }
.info-value.strong { font-weight: 600; }

.item-card {
  border: 1px solid #EEF1F5;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
  background: #FCFDFF;
}
.item-head { display: flex; align-items: flex-start; }
.item-idx {
  width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  border-radius: 50%;
  background: #1E3A5F;
  color: #fff;
  font-size: 11px;
  margin-right: 8px;
  flex-shrink: 0;
}
.item-title-wrap { flex: 1; min-width: 0; }
.item-name { font-size: 14px; color: #1A1F36; font-weight: 600; display: block; }
.item-spec { font-size: 11px; color: #8A93A3; margin-top: 2px; display: block; }
.verdict-pill {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 10px;
  color: #fff;
  background: #9CA3AF;
  flex-shrink: 0;
}
.verdict-pill.tone-pass { background: #0E9F6E; }
.verdict-pill.tone-fail { background: #DC2626; }
.verdict-pill.tone-warn { background: #D97706; }

.item-qty { display: flex; flex-wrap: wrap; margin-top: 8px; }
.qty-text { font-size: 12px; color: #6B7280; margin-right: 14px; }
.qty-diff { font-size: 12px; color: #D97706; }

.tag-wrap { display: flex; flex-wrap: wrap; margin-top: 8px; }
.tag-chip {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 10px;
  background: #FDECEC;
  color: #DC2626;
  margin: 0 8px 6px 0;
}
.item-remark { font-size: 12px; color: #6B7280; margin-top: 4px; display: block; }

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.photo-item {
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: #F3F4F6;
}
.photo-img { width: 100%; height: 100%; display: block; }

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
  z-index: 100;
}
.btn-del {
  text-align: center;
  font-size: 15px;
  color: #DC2626;
  border: 1.5px solid #FCA5A5;
  border-radius: 10px;
  padding: 12px 0;
  background: #FFF7F7;
}
</style>
