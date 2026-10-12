<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">审核文件</text>
      <view class="nav-placeholder"></view>
    </view>

    <view v-if="loading" class="loading-state"><text>加载中...</text></view>

    <view v-else-if="!file" class="empty-state">
      <text class="empty-icon">⚠️</text>
      <text class="empty-text">文件不存在</text>
    </view>

    <view v-else class="content">
      <!-- 文件基本信息（只读） -->
      <view class="file-card" :style="'background:' + catColor(file.category)">
        <text class="file-icon">{{ thumbIcon(file.file_ext) }}</text>
        <view class="file-info">
          <text class="file-title">{{ file.title }}</text>
          <text class="file-meta">
            {{ catLabel(file.category) }} · {{ sizeText(file.file_size) }} · {{ file.uploader_name }}
          </text>
        </view>
      </view>

      <!-- 备注（如果有） -->
      <view v-if="file.description" class="desc-card">
        <text class="desc-label">上传人备注</text>
        <text class="desc-text">{{ file.description }}</text>
      </view>

      <!-- 审核动作：approve / reject -->
      <view class="section">
        <view class="section-label">审核结果 <text class="required">*</text></view>
        <view class="action-grid">
          <view
            class="action-cell approve"
            :class="{ active: curAction === 'approve' }"
            @click="curAction = 'approve'; comment = ''"
          >
            <text class="action-icon">✅</text>
            <text class="action-label">通过</text>
          </view>
          <view
            class="action-cell reject"
            :class="{ active: curAction === 'reject' }"
            @click="curAction = 'reject'"
          >
            <text class="action-icon">❌</text>
            <text class="action-label">拒绝</text>
          </view>
        </view>
      </view>

      <!-- 审核意见（拒绝必填，通过可选） -->
      <view v-if="curAction" class="section">
        <view class="section-label">
          审核意见
          <text v-if="curAction === 'reject'" class="required">*</text>
          <text v-else class="optional">（可选）</text>
        </view>
        <textarea
          v-model="comment"
          class="comment-input"
          :placeholder="curAction === 'approve' ? '可填写通过说明（选填）' : '请说明拒绝原因，将通知上传人'"
          maxlength="200"
        />
        <text class="char-count">{{ comment.length }} / 200</text>
      </view>

      <!-- 提交按钮 -->
      <view class="submit-bar">
        <button
          class="btn-submit"
          :class="{ disabled: !canSubmit, approve: curAction === 'approve', reject: curAction === 'reject' }"
          :disabled="!canSubmit"
          @click="submit"
        >
          {{ curAction === 'approve' ? '确认通过' : curAction === 'reject' ? '确认拒绝' : '请选择审核结果' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from "vue";
import { useUserStore } from "@/stores/user";
import {
  FILE_CATEGORY_MAP,
  fileThumbIcon as thumbIcon, fileSizeText as sizeText,
} from "@/utils/permission";

const file = ref(null);
const loading = ref(true);
const fileId = ref(0);
const curAction = ref(""); // 'approve' | 'reject' | ''
const comment = ref("");
const submitting = ref(false);

const userStore = useUserStore();
const canSubmit = computed(() => {
  if (!curAction.value) return false;
  if (curAction.value === 'reject' && !comment.value.trim()) return false;
  return true;
});

const isImage = (ext) => ["jpg", "jpeg", "png", "gif", "webp"].includes((ext || "").toLowerCase());
const catLabel = (key) => (FILE_CATEGORY_MAP[key] ? FILE_CATEGORY_MAP[key].label : key);
const catColor = (key) => (FILE_CATEGORY_MAP[key] ? FILE_CATEGORY_MAP[key].color : "#F3F4F6");

async function loadDetail() {
  loading.value = true;
  try {
    const res = await uni.request({ url: `/api/project-files/${fileId.value}` });
    if (res.data && res.data.id) {
      file.value = res.data;
      if (file.value.status !== 'pending') {
        uni.showToast({ title: '该文件已审核', icon: 'none' });
      }
    }
  } catch (e) {
    console.error('加载文件失败', e);
  } finally {
    loading.value = false;
  }
}

const submit = async () => {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    const res = await uni.request({
      url: `/api/project-files/${fileId.value}/review`,
      method: 'POST',
      data: {
        action: curAction.value,
        comment: comment.value.trim() || null,
      },
    });
    if (res.statusCode === 200) {
      uni.showToast({
        title: curAction.value === 'approve' ? '已通过' : '已拒绝',
        icon: 'success',
      });
      setTimeout(() => uni.navigateBack(), 800);
    } else {
      uni.showToast({ title: res.data.error || '操作失败', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};

const goBack = () => uni.navigateBack();

const pages = getCurrentPages();
const cur = pages[pages.length - 1];
const opts = (cur && cur.options) || {};
fileId.value = parseInt(opts.id || 0);

if (fileId.value) loadDetail();
</script>

<style scoped>
.page { min-height: 100vh; background: #F5F7FA; padding-bottom: 100px; }
.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.loading-state, .empty-state {
  display: flex; flex-direction: column; align-items: center; padding: 60px 20px;
}
.empty-icon { font-size: 50px; margin-bottom: 8px; }
.empty-text { font-size: 14px; color: #9CA3AF; }
.loading-state { color: #9CA3AF; font-size: 14px; }

.content { padding: 16px; }

.file-card {
  display: flex; align-items: center; gap: 12px;
  padding: 14px; border-radius: 12px; margin-bottom: 12px;
}
.file-icon { font-size: 36px; }
.file-info { flex: 1; min-width: 0; }
.file-title {
  font-size: 15px; font-weight: 700; color: #1E3A5F;
  word-break: break-all;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.file-meta { font-size: 12px; color: #6B7280; margin-top: 4px; }

.desc-card {
  background: #FEF3C7; border-radius: 10px; padding: 10px 12px; margin-bottom: 12px;
}
.desc-label { font-size: 11px; color: #92400E; display: block; margin-bottom: 4px; }
.desc-text { font-size: 13px; color: #92400E; line-height: 1.5; white-space: pre-wrap; }

.section {
  background: #fff; border-radius: 12px; padding: 14px; margin-bottom: 12px;
}
.section-label { font-size: 14px; font-weight: 600; color: #1E3A5F; margin-bottom: 10px; }
.required { color: #EF4444; }
.optional { color: #9CA3AF; font-size: 12px; font-weight: 400; }

.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.action-cell {
  display: flex; flex-direction: column; align-items: center;
  padding: 18px 10px; border-radius: 12px;
  border: 2px solid #E5E7EB; background: #F9FAFB;
}
.action-cell.approve.active { background: #D1FAE5; border-color: #10B981; }
.action-cell.reject.active { background: #FEE2E2; border-color: #EF4444; }
.action-icon { font-size: 32px; margin-bottom: 4px; }
.action-label { font-size: 14px; font-weight: 600; color: #1E3A5F; }

.comment-input {
  width: 100%; min-height: 100px; padding: 10px;
  border: 1px solid #E5E7EB; border-radius: 8px;
  font-size: 14px; background: #F9FAFB; box-sizing: border-box;
}
.char-count { font-size: 11px; color: #9CA3AF; text-align: right; margin-top: 4px; }

.submit-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  padding: 16px; background: #fff; border-top: 1px solid #F3F4F6; z-index: 50;
}
.btn-submit {
  width: 100%; height: 48px;
  background: #D1D5DB; color: #fff;
  border-radius: 24px; font-size: 16px; font-weight: 600; border: none;
}
.btn-submit.approve { background: linear-gradient(135deg, #10B981, #059669); }
.btn-submit.reject { background: linear-gradient(135deg, #EF4444, #DC2626); }
.btn-submit.disabled { background: #D1D5DB; }
</style>
