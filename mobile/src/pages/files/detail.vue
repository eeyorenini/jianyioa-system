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

      <!-- 缩略图（图片类型显示原图） -->
      <view v-if="isImage(file.file_ext)" class="image-preview">
        <image :src="downloadUrl" mode="widthFix" class="image-preview-el" @click="previewImage" />
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
        <!-- 删除：未审前可删，admin 通杀 -->
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
  FILE_CATEGORY_MAP,
  fileStatusText as statusText, fileStatusColor as statusColor,
  fileThumbIcon as thumbIcon, fileSizeText as sizeText,
} from "@/utils/permission";

const file = ref(null);
const loading = ref(true);
const userStore = useUserStore();
const userId = computed(() => userStore.userId || uni.getStorageSync('userId') || 0);
const isAdmin = computed(() => userStore.isAdmin ? userStore.isAdmin() : false);

const fileId = ref(0);
const downloadUrl = computed(() => `/api/project-files/${fileId.value}/download`);

const canApprove = computed(() => userStore.canSee("project_file:approve"));
const canRevoke = computed(() =>
  file.value && file.value.uploaded_by === userId.value && file.value.status === 'pending'
);
const canDelete = computed(() => {
  if (!file.value) return false;
  if (isAdmin.value) return true;
  if (file.value.status === 'approved') return false; // 已通过审核非 admin 不能删
  return file.value.uploaded_by === userId.value;
});

const isImage = (ext) => ["jpg", "jpeg", "png", "gif", "webp"].includes((ext || "").toLowerCase());
const catLabel = (key) => (FILE_CATEGORY_MAP[key] ? FILE_CATEGORY_MAP[key].label : key);
const catColor = (key) => (FILE_CATEGORY_MAP[key] ? FILE_CATEGORY_MAP[key].color : "#F3F4F6");

const formatTime = (s) => {
  if (!s) return '';
  const d = new Date(s.replace(/-/g, '/'));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

async function loadDetail() {
  loading.value = true;
  try {
    const res = await uni.request({ url: `/api/project-files/${fileId.value}` });
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
  uni.previewImage({ urls: [downloadUrl.value], current: downloadUrl.value });
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
        const r = await uni.request({ url: `/api/project-files/${fileId.value}/revoke`, method: 'POST' });
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
        const r = await uni.request({ url: `/api/project-files/${fileId.value}`, method: 'DELETE' });
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

.image-preview {
  background: #fff;
  border-radius: 12px;
  padding: 8px;
  margin-bottom: 12px;
  text-align: center;
}
.image-preview-el {
  width: 100%;
  border-radius: 8px;
}

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
