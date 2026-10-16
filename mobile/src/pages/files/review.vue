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

      <!-- 文件预览：图片内联 / PDF 内嵌 / 其他给打开按钮 -->
      <view class="section preview-card">
        <view class="section-label">文件预览</view>

        <!-- 图片：内联显示，点击全屏 -->
        <image
          v-if="previewType === 'image'"
          :src="previewUrl"
          mode="widthFix"
          class="preview-image"
          @click="openPreview"
        />

        <!-- PDF：H5 下用 iframe 内嵌 -->
        <!-- #ifdef H5 -->
        <iframe
          v-if="previewType === 'pdf'"
          :src="previewUrl"
          class="preview-pdf"
        ></iframe>
        <!-- #endif -->

        <!-- 其他格式 / 非 H5 的 PDF：无法内嵌，给出提示 -->
        <view
          v-if="previewType === 'other' || (previewType === 'pdf' && !isH5)"
          class="preview-fallback"
        >
          <text class="preview-fallback-icon">{{ thumbIcon(file.file_ext) }}</text>
          <text class="preview-fallback-text">
            {{ (file.file_ext || '').toUpperCase() }} 文件
          </text>
          <text class="preview-fallback-hint">该格式暂不支持内嵌预览，请打开查看</text>
        </view>

        <!-- 打开 / 下载 -->
        <view class="preview-actions">
          <view class="preview-btn" @click="openFile">
            <text class="preview-btn-icon">⬇️</text>
            <text class="preview-btn-text">下载 / 打开查看</text>
          </view>
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
  FILE_CATEGORY_MAP, projectFileUrl, authHeader,
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

// ===== 文件预览 =====
// H5 下 <img>/<iframe> 发起的请求无法携带 x-user-id 请求头，会导致下载接口 401。
// 后端 getUserId 支持从 query.user_id 取用户，故这里把用户 ID 拼进 URL。
// ⚠️ projectFileUrl 返回【绝对 URL】：uni-h5 的 <image>/uni.previewImage 会给以 "/" 开头的
// src 拼上 router.base="/m/"，导致实际请求 /m/api/... 拿到 SPA 的 index.html 而裂图。
const uid = computed(() => userStore.state.id || (uni.getStorageSync('userInfo') || {}).id || 0);
const isCad = (ext) => ['dwg', 'dxf'].includes((ext || '').toLowerCase());
const previewUrl = computed(() => {
  const ext = (file.value && file.value.file_ext) || '';
  // v2.3.6：CAD 文件用后端 FreeCAD 转好的 PDF 预览（list/detail 接口都返 pdf_preview_url）
  if (isCad(ext) && file.value && file.value.pdf_preview_url) {
    return file.value.pdf_preview_url;
  }
  return projectFileUrl(fileId.value, `?user_id=${uid.value}&inline=1`);
});
const downloadUrl = computed(() => projectFileUrl(fileId.value, `?user_id=${uid.value}`));

// 平台标记：仅 H5 支持 iframe 内嵌 PDF
// #ifdef H5
const isH5 = true;
// #endif
// #ifndef H5
const isH5 = false;
// #endif

const previewType = computed(() => {
  const ext = (file.value && file.value.file_ext) || '';
  if (isImage(ext)) return 'image';
  if (ext.toLowerCase() === 'pdf') return 'pdf';
  // v2.3.6：CAD 转 PDF 成功 → 走 iframe 内嵌预览
  if (isCad(ext) && file.value && file.value.pdf_preview) return 'pdf';
  return 'other';
});

const openPreview = () => {
  if (!file.value) return;
  uni.previewImage({ urls: [previewUrl.value], current: previewUrl.value });
};

const openFile = () => {
  if (!file.value) return;
  // #ifdef H5
  window.open(downloadUrl.value, '_blank');
  // #endif
  // #ifdef MP-WEIXIN
  uni.downloadFile({
    url: downloadUrl.value,
    success: (res) => {
      if (res.tempFilePath) uni.openDocument({ filePath: res.tempFilePath, showMenu: true });
    },
  });
  // #endif
};

async function loadDetail() {
  loading.value = true;
  try {
    // 必须带 x-user-id，否则后端 getUserId 取不到用户直接 401
    const res = await uni.request({
      url: `/api/project-files/${fileId.value}`,
      header: authHeader(uid.value),
    });
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
      header: authHeader(uid.value),
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

/* ===== 文件预览 ===== */
.preview-card { padding: 14px; }
.preview-image { width: 100%; border-radius: 8px; background: #F3F4F6; display: block; }
.preview-pdf {
  width: 100%; height: 60vh; border: 1px solid #E5E7EB;
  border-radius: 8px; background: #F9FAFB;
}
.preview-fallback {
  display: flex; flex-direction: column; align-items: center;
  padding: 28px 12px; background: #F9FAFB; border-radius: 8px;
}
.preview-fallback-icon { font-size: 46px; margin-bottom: 8px; }
.preview-fallback-text { font-size: 14px; font-weight: 600; color: #1E3A5F; }
.preview-fallback-hint { font-size: 12px; color: #9CA3AF; margin-top: 4px; }
.preview-actions { margin-top: 12px; }
.preview-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  height: 44px; background: #EFF6FF; border-radius: 10px;
}
.preview-btn-icon { font-size: 16px; }
.preview-btn-text { font-size: 14px; color: #1E3A5F; font-weight: 600; }

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
