<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">验收详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="loading-state" v-if="loading"><text>加载中...</text></view>

    <template v-else-if="record">
      <!-- 概要 -->
      <view class="card">
        <view class="card-top">
          <text class="card-title">{{ record.stage || '验收项' }}</text>
          <text class="status-pill" :class="statusClass(record.accept_status)">{{ record.accept_status || '待验收' }}</text>
        </view>
        <view class="info-row"><text class="info-label">项目</text><text class="info-val">📁 {{ record.project_name || ('项目ID ' + (record.project_id || '-')) }}</text></view>
        <view class="info-row"><text class="info-label">验收日期</text><text class="info-val">{{ record.accept_date || '-' }}</text></view>
        <view class="info-row"><text class="info-label">质量评分</text><text class="info-val">{{ record.quality_score != null ? record.quality_score + ' 分' : '-' }}</text></view>
        <view class="info-row"><text class="info-label">提交人</text><text class="info-val">{{ record.creator_name || '-' }}</text></view>
        <view class="info-row"><text class="info-label">提交时间</text><text class="info-val">{{ record.created_at || '-' }}</text></view>
      </view>

      <!-- 问题说明 -->
      <view class="card" v-if="record.issues">
        <text class="card-section-title">问题 / 说明</text>
        <text class="desc-text">{{ record.issues }}</text>
      </view>

      <!-- 现场照片 -->
      <view class="card" v-if="photos.length">
        <text class="card-section-title">现场照片</text>
        <view class="log-photos">
          <view class="log-photo" v-for="(photo, idx) in photos" :key="idx" @click.stop="previewPhoto(idx)">
            <image class="log-photo-img" :src="photo" mode="aspectFill" />
          </view>
        </view>
      </view>

      <!-- 状态处理 -->
      <view class="card">
        <text class="card-section-title">更新验收结果</text>
        <view class="status-actions">
          <view
            v-for="s in statusOptions"
            :key="s"
            class="status-btn"
            :class="{ active: editForm.accept_status === s, [statusClass(s)]: true }"
            @click="editForm.accept_status = s"
          >{{ s }}</view>
        </view>
        <view class="edit-item">
          <text class="info-label">质量评分</text>
          <input class="edit-input" type="number" v-model="editForm.quality_score" placeholder="0-100" />
        </view>
        <view class="edit-item">
          <text class="info-label">问题 / 说明</text>
          <textarea class="edit-textarea" v-model="editForm.issues" placeholder="填写验收情况" />
        </view>
      </view>

      <view class="bottom-bar">
        <view class="btn-submit" :class="{ loading: saving }" @click="save">
          <text v-if="!saving">保存</text>
          <text v-else>保存中...</text>
        </view>
      </view>
    </template>

    <view class="empty-state" v-else>
      <text class="empty-icon">✅</text>
      <text class="empty-text">未找到该验收记录</text>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import { absAsset } from "@/utils/api";

const record = ref(null);
const photos = ref([]);
const loading = ref(true);
const saving = ref(false);
const id = ref(0);
const statusOptions = ['待验收', '已通过', '整改中', '不通过'];

const editForm = reactive({ accept_status: '', quality_score: '', issues: '' });

const statusClass = (s) => {
  if (s === '已通过') return 's-pass';
  if (s === '整改中' || s === '不通过') return 's-rework';
  return 's-pending';
};

const parsePhotos = (att) => {
  if (!att) return [];
  try {
    let p = att;
    if (typeof p === 'string') p = JSON.parse(p);
    if (typeof p === 'string') p = JSON.parse(p);
    return Array.isArray(p) ? p.filter((x) => x && String(x).trim()).map(absAsset) : [];
  } catch { return []; }
};

const previewPhoto = (idx) => {
  uni.previewImage({ urls: photos.value, current: photos.value[idx] });
};

const load = async () => {
  loading.value = true;
  try {
    const res = await uni.request({ url: `/api/acceptance/${id.value}`, header: { Authorization: uni.getStorageSync('token') } });
    const data = res.data;
    if (data && data.id) {
      record.value = data;
      photos.value = parsePhotos(data.attachment);
      editForm.accept_status = data.accept_status || '待验收';
      editForm.quality_score = data.quality_score != null ? String(data.quality_score) : '';
      editForm.issues = data.issues || '';
    } else {
      record.value = null;
    }
  } catch (e) {
    record.value = null;
  } finally {
    loading.value = false;
  }
};

const save = () => {
  if (saving.value) return;
  saving.value = true;
  const payload = {
    accept_status: editForm.accept_status,
    quality_score: editForm.quality_score === '' ? null : Number(editForm.quality_score),
    issues: editForm.issues,
  };
  uni.request({
    url: `/api/acceptance/${id.value}`,
    method: 'PUT',
    header: { 'Content-Type': 'application/json', Authorization: uni.getStorageSync('token') },
    data: payload,
  }).then((res) => {
    const ok = res.statusCode === 200;
    if (ok) {
      uni.showToast({ title: '已保存', icon: 'success' });
      load();
    } else {
      uni.showToast({ title: (res.data && res.data.error) || '保存失败', icon: 'none' });
    }
  }).catch(() => {
    uni.showToast({ title: '保存失败', icon: 'none' });
  }).finally(() => {
    saving.value = false;
  });
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
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = (current && current.options) || {};
  id.value = parseInt(options.id || '0');
  if (id.value) load();
  else loading.value = false;
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding: 16px;
  padding-bottom: 100px;
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

.loading-state { text-align: center; padding: 40px; color: #9CA3AF; }

.card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-top: 12px;
}

.card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.card-title { font-size: 16px; font-weight: 600; color: #1A1F36; flex: 1; margin-right: 10px; }

.status-pill { font-size: 11px; padding: 2px 10px; border-radius: 10px; white-space: nowrap; }
.s-pass { background: #D1FAE5; color: #065F46; }
.s-rework { background: #FEE2E2; color: #991B1B; }
.s-pending { background: #FEF3C7; color: #92400E; }

.info-row { display: flex; padding: 6px 0; border-bottom: 1px solid #F9FAFB; }
.info-row:last-child { border-bottom: none; }
.info-label { width: 80px; font-size: 13px; color: #6B7280; flex-shrink: 0; }
.info-val { flex: 1; font-size: 14px; color: #1A1F36; word-break: break-all; }

.card-section-title { font-size: 14px; font-weight: 600; color: #1A1F36; display: block; margin-bottom: 10px; }
.desc-text { font-size: 14px; color: #333; line-height: 1.6; word-break: break-all; }

.log-photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.log-photo { aspect-ratio: 1; border-radius: 8px; overflow: hidden; }
.log-photo-img { width: 100%; height: 100%; display: block; }

.status-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.status-btn {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px;
  background: #F3F4F6;
  color: #6B7280;
  border: 1.5px solid transparent;
}
.status-btn.s-pass.active { background: #10B981; color: #fff; }
.status-btn.s-rework.active { background: #EF4444; color: #fff; }
.status-btn.s-pending.active { background: #F59E0B; color: #fff; }

.edit-item { margin-bottom: 12px; }
.edit-input {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid #E5E7EB;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}
.edit-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid #E5E7EB;
  border-radius: 8px;
  font-size: 14px;
  min-height: 80px;
  box-sizing: border-box;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
  z-index: 100;
}
.btn-submit {
  background: #1E3A5F;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  padding: 14px 0;
  border-radius: 10px;
  letter-spacing: 2px;
}
.btn-submit.loading { opacity: 0.7; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 80px 20px; }
.empty-icon { font-size: 40px; margin-bottom: 8px; opacity: 0.5; }
.empty-text { font-size: 14px; color: #9CA3AF; }
</style>
