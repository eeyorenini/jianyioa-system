<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">文件详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <view v-if="loading" class="loading-state"><text>加载中...</text></view>

    <view v-else-if="!file" class="empty-state">
      <text class="empty-icon">⚠️</text>
      <text class="empty-text">文件不存在或已删除</text>
    </view>

    <view v-else class="content">
      <!-- 顶部：分类色块 + 文件名 + 状态 -->
      <view class="hero" :style="'background:' + catColor(file.category)">
        <text class="hero-icon">{{ thumbIcon(file.file_ext) }}</text>
        <text class="hero-title">{{ file.title }}</text>
        <view class="hero-status" :style="'background:' + statusColor(file.status)">
          {{ statusText(file.status) }}
        </view>
      </view>

      <!-- 预览区：图片内联 / PDF 内嵌（H5）/ 其他给提示 -->
      <view v-if="previewType === 'image'" class="preview-block">
        <image :src="previewUrl" mode="widthFix" class="preview-image-el" @click="previewImage" />
      </view>
      <!-- #ifdef H5 -->
      <view v-if="previewType === 'pdf' && !file.preview_error" class="preview-block">
        <iframe :src="previewUrl" class="preview-pdf-el"></iframe>
      </view>
      <!-- #endif -->

      <!-- v2.3.6 hotfix 10-15：PDF 转换失败提示（红底卡片） -->
      <view v-if="file.preview_error" class="preview-block preview-error-card">
        <text class="preview-error-card-icon">❌</text>
        <text class="preview-error-card-title">PDF 预览生成失败</text>
        <text class="preview-error-card-detail">{{ file.preview_error }}</text>
        <text class="preview-error-card-hint">请在服务器安装 FreeCAD / LibreOffice 后重试，或联系管理员</text>
      </view>
      <view
        v-if="previewType === 'other' || (previewType === 'pdf' && !isH5)"
        class="preview-block preview-fallback"
      >
        <text class="preview-fallback-icon">{{ thumbIcon(file.file_ext) }}</text>
        <text class="preview-fallback-text">{{ (file.file_ext || '').toUpperCase() }} 文件</text>
        <text class="preview-fallback-hint">该格式暂不支持内嵌预览，请点击下方「下载 / 打开」查看</text>
      </view>

      <!-- 元信息 -->
      <view class="info-card">
        <view class="info-row">
          <text class="info-label">分类</text>
          <text class="info-value">{{ catLabel(file.category) }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">大小</text>
          <text class="info-value">{{ sizeText(file.file_size) }} · {{ (file.file_ext || '').toUpperCase() }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">上传人</text>
          <text class="info-value">{{ file.uploader_name || '员工' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">上传时间</text>
          <text class="info-value">{{ formatTime(file.uploaded_at) }}</text>
        </view>
        <view v-if="file.description" class="info-row">
          <text class="info-label">备注</text>
          <text class="info-value desc">{{ file.description }}</text>
        </view>
        <view v-if="file.reviewed_by" class="info-row">
          <text class="info-label">审核人</text>
          <text class="info-value">{{ file.reviewer_name }}</text>
        </view>
        <view v-if="file.reviewed_at" class="info-row">
          <text class="info-label">审核时间</text>
          <text class="info-value">{{ formatTime(file.reviewed_at) }}</text>
        </view>
        <view v-if="file.review_comment" class="info-row">
          <text class="info-label">审核意见</text>
          <text class="info-value" :style="file.status === 'rejected' ? 'color:#EF4444' : ''">
            「{{ file.review_comment }}」
          </text>
        </view>
      </view>

      <!-- 底部操作栏 -->
      <view class="action-bar">
        <view class="action-btn" @click="downloadFile">
          <text class="action-icon">⬇️</text>
          <text class="action-text">下载/打开</text>
        </view>
        <!-- 审核入口：仅 approve 权限 + pending 显示 -->
        <view
          v-if="canApprove && file.status === 'pending'"
          class="action-btn primary"
          @click="goReview"
        >
          <text class="action-icon">✅</text>
          <text class="action-text">审核</text>
        </view>
        <!-- 撤销：仅上传人自己 + pending -->
        <view
          v-if="canRevoke"
          class="action-btn"
          @click="onRevoke"
        >
          <text class="action-icon">↩</text>
          <text class="action-text">撤销</text>
        </view>
        <!-- 删除：仅未通过审核的文件可删（审核通过即归档，任何人不可删） -->
        <view
          v-if="canDelete"
          class="action-btn danger"
          @click="onDelete"
        >
          <text class="action-icon">🗑</text>
          <text class="action-text">删除</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { useUserStore } from "@/stores/user";
import {
  FILE_CATEGORY_MAP, projectFileUrl, authHeader,
  fileStatusText as statusText, fileStatusColor as statusColor,
  fileThumbIcon as thumbIcon, fileSizeText as sizeText,
} from "@/utils/permission";

const file = ref(null);
const loading = ref(true);
const userStore = useUserStore();
// 注意：store 暴露的是 state（含 id），并没有 userId 字段；旧的 userStore.userId /
// getStorageSync('userId') 恒为 undefined → 导致 canRevoke / canDelete 判定失效。
const userId = computed(() => userStore.state.id || (uni.getStorageSync('userInfo') || {}).id || 0);
const isAdmin = computed(() => userStore.isAdminUser ? userStore.isAdminUser() : false);

const fileId = ref(0);
// H5 下 <img>/<iframe>/window.open 无法携带 x-user-id 请求头，会 401；把用户 ID 拼进 query
// （后端 getUserId 支持从 query.user_id 取用户，见 server.js）。
// ⚠️ projectFileUrl 会返回【绝对 URL】：uni-h5 的 <image>/uni.previewImage 会给以 "/" 开头的
// src 拼上 router.base="/m/"，导致 <image> 实际请求 /m/api/... 拿到 SPA 的 index.html 而裂图。
const downloadUrl = computed(() => projectFileUrl(fileId.value, `?user_id=${userId.value}`));
const previewUrl = computed(() => {
  const ext = (file.value && file.value.file_ext) || '';
  // v2.3.6 hotfix 10-15：CAD 文件用后端自动拼的 pdf_preview_url（list/detail 接口都返）
  if (['dwg', 'dxf'].includes(ext.toLowerCase()) && file.value && file.value.pdf_preview_url) {
    return file.value.pdf_preview_url;
  }
  return projectFileUrl(fileId.value, `?user_id=${userId.value}&inline=1`);
});
const canApprove = computed(() => userStore.canSee("project_file:approve"));
const canRevoke = computed(() =>
  file.value && file.value.uploaded_by === userId.value && file.value.status === 'pending'
);
const canDelete = computed(() => {
  if (!file.value) return false;
  // 规则（v2.3.11）：已通过审核的文件视为归档凭证，任何人（含 admin）都不可删除
  if (file.value.status === 'approved') return false;
  if (isAdmin.value) return true;
  return file.value.uploaded_by === userId.value;
});

const isImage = (ext) => ["jpg", "jpeg", "png", "gif", "webp"].includes((ext || "").toLowerCase());
const catLabel = (key) => (FILE_CATEGORY_MAP[key] ? FILE_CATEGORY_MAP[key].label : key);
const catColor = (key) => (FILE_CATEGORY_MAP[key] ? FILE_CATEGORY_MAP[key].color : "#F3F4F6");

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
  // CAD 文件如果有 pdf_preview 字段，用 PDF 预览
  if (['dwg', 'dxf'].includes(ext.toLowerCase()) && file.value && file.value.pdf_preview) return 'pdf';
  return 'other';
});
const formatTime = (s) => {
  if (!s) return '';
  const d = new Date(s.replace(/-/g, '/'));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

async function loadDetail() {
  loading.value = true;
  try {
    // 必须带 x-user-id，否则后端 getUserId 取不到用户直接 401（页面会误报"文件不存在"）
    const res = await uni.request({
      url: `/api/project-files/${fileId.value}`,
      header: authHeader(userId.value),
    });
    if (res.data && res.data.id) {
      file.value = res.data;
    }
  } catch (e) {
    console.error('加载文件详情失败', e);
  } finally {
    loading.value = false;
  }
}

const previewImage = () => {
  if (!file.value) return;
  uni.previewImage({ urls: [previewUrl.value], current: previewUrl.value });
};

const downloadFile = () => {
  if (!file.value) return;
  // H5：直接新窗口打开 / 小程序：downloadFile 后 openDocument
  // #ifdef H5
  window.open(downloadUrl.value, '_blank');
  // #endif
  // #ifdef MP-WEIXIN
  uni.downloadFile({
    url: downloadUrl.value,
    success: (res) => {
      if (res.tempFilePath) {
        uni.openDocument({ filePath: res.tempFilePath, showMenu: true });
      }
    }
  });
  // #endif
};

const goReview = () => {
  uni.navigateTo({ url: `/pages/files/review?id=${fileId.value}` });
};

const onRevoke = () => {
  uni.showModal({
    title: '确认撤销',
    content: '撤销后该文件将标记为「已撤销」，可重新上传。',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        const r = await uni.request({ url: `/api/project-files/${fileId.value}/revoke`, method: 'POST', header: authHeader(userId.value) });
        if (r.statusCode === 200) {
          uni.showToast({ title: '已撤销', icon: 'success' });
          setTimeout(() => uni.navigateBack(), 600);
        } else {
          uni.showToast({ title: r.data.error || '操作失败', icon: 'none' });
        }
      } catch (e) {
        uni.showToast({ title: '网络错误', icon: 'none' });
      }
    }
  });
};

const onDelete = () => {
  uni.showModal({
    title: '确认删除',
    content: '删除后无法恢复，确定吗？',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        const r = await uni.request({ url: `/api/project-files/${fileId.value}`, method: 'DELETE', header: authHeader(userId.value) });
        if (r.statusCode === 200) {
          uni.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => uni.navigateBack(), 600);
        } else {
          uni.showToast({ title: r.data.error || '删除失败', icon: 'none' });
        }
      } catch (e) {
        uni.showToast({ title: '网络错误', icon: 'none' });
      }
    }
  });
};

const goBack = () => uni.navigateBack();

const pages = getCurrentPages();
const cur = pages[pages.length - 1];
const opts = (cur && cur.options) || {};
fileId.value = parseInt(opts.id || 0);

onShow(() => {
  if (fileId.value) loadDetail();
});
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

.hero {
  border-radius: 12px;
  padding: 24px 20px;
  text-align: center;
  position: relative;
  margin-bottom: 12px;
}
.hero-icon { font-size: 48px; display: block; margin-bottom: 8px; }
.hero-title {
  font-size: 16px; font-weight: 700; color: #1E3A5F;
  word-break: break-all; display: block; padding: 0 10px;
}
.hero-status {
  position: absolute; top: 12px; right: 12px;
  font-size: 11px; padding: 3px 10px; border-radius: 10px; color: #fff;
}

.preview-block {
  background: #fff;
  border-radius: 12px;
  padding: 8px;
  margin-bottom: 12px;
}
.preview-image-el {
  width: 100%;
  border-radius: 8px;
  display: block;
}
.preview-pdf-el {
  width: 100%;
  height: 60vh;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  background: #F9FAFB;
}
.preview-block.preview-fallback {
  display: flex; flex-direction: column; align-items: center;
  padding: 28px 12px; background: #F9FAFB;
}

/* v2.3.6 hotfix 10-15：PDF 转换失败卡片 */
.preview-block.preview-error-card {
  display: flex; flex-direction: column; align-items: center;
  padding: 32px 16px; background: #FEF2F2;
  border: 1px solid #FECACA;
}
.preview-error-card-icon { font-size: 40px; margin-bottom: 8px; }
.preview-error-card-title {
  font-size: 16px; font-weight: 700; color: #B91C1C; margin-bottom: 6px;
}
.preview-error-card-detail {
  font-size: 12px; color: #7F1D1D; line-height: 1.5;
  text-align: center; word-break: break-all; max-width: 90%;
  font-family: 'SF Mono', Menlo, monospace;
  background: #fff; padding: 8px 12px; border-radius: 4px;
  margin: 8px 0;
}
.preview-error-card-hint { font-size: 12px; color: #DC2626; opacity: 0.8; }
.preview-fallback-icon { font-size: 46px; margin-bottom: 8px; }
.preview-fallback-text { font-size: 14px; font-weight: 600; color: #1E3A5F; }
.preview-fallback-hint { font-size: 12px; color: #9CA3AF; margin-top: 4px; text-align: center; }

.info-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}
.info-row {
  display: flex;
  padding: 8px 0;
  border-bottom: 1px solid #F3F4F6;
  font-size: 14px;
}
.info-row:last-child { border-bottom: none; }
.info-label {
  width: 80px;
  color: #9CA3AF;
  font-size: 13px;
  flex-shrink: 0;
}
.info-value { flex: 1; color: #1E3A5F; word-break: break-all; }
.info-value.desc { white-space: pre-wrap; }

.action-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; gap: 10px; padding: 12px 16px;
  background: #fff; border-top: 1px solid #F3F4F6;
  z-index: 50;
}
.action-btn {
  flex: 1;
  display: flex; flex-direction: column; align-items: center;
  padding: 10px 6px;
  background: #F3F4F6;
  border-radius: 10px;
}
.action-btn.primary { background: linear-gradient(135deg, #1E3A5F, #3B82F6); }
.action-btn.primary .action-text, .action-btn.primary .action-icon { color: #fff; }
.action-btn.danger { background: #FEE2E2; }
.action-btn.danger .action-text, .action-btn.danger .action-icon { color: #EF4444; }
.action-icon { font-size: 18px; margin-bottom: 2px; }
.action-text { font-size: 12px; color: #1E3A5F; font-weight: 600; }
</style>
