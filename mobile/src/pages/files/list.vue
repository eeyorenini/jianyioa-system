<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar" :style="navStyle">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">{{ projectName || '项目文件' }}</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 状态筛选（本地即时筛选） -->
    <view class="filter-row">
      <view
        v-for="s in STATUS_FILTERS"
        :key="s.value"
        class="filter-tag"
        :class="{ active: curStatus === s.value, danger: s.value === 'rejected', warning: s.value === 'pending', success: s.value === 'approved' }"
        @click="curStatus = s.value"
      >
        <text>{{ s.label }}</text>
        <text v-if="statusCounts[s.value]" class="filter-tag-count">{{ statusCounts[s.value] }}</text>
      </view>
    </view>

    <!-- 分类筛选（本地即时筛选，不重新请求；空分类也保留入口，避免整行消失） -->
    <view class="cat-row" v-if="projectId">
      <view
        class="cat-tag"
        :class="{ active: curCategory === '' }"
        @click="curCategory = ''"
      >
        <text class="cat-tag-emoji">📁</text>
        <text class="cat-tag-label">全部</text>
        <text class="cat-tag-count">{{ files.length }}</text>
      </view>
      <view
        v-for="c in categories"
        :key="c.key"
        class="cat-tag"
        :class="{ active: curCategory === c.key, 'is-empty': !catCounts[c.key] }"
        :style="curCategory === c.key ? { background: c.color, borderColor: c.color } : ''"
        @click="curCategory = c.key"
      >
        <text class="cat-tag-emoji">{{ c.icon }}</text>
        <text class="cat-tag-label">{{ c.label }}</text>
        <text v-if="catCounts[c.key]" class="cat-tag-count">{{ catCounts[c.key] }}</text>
      </view>
    </view>

    <!-- 加载中 -->
    <view class="loading-state" v-if="loading">
      <text>加载中...</text>
    </view>

    <!-- 文件列表 -->
    <view class="file-list" v-else-if="filteredList.length">
      <view class="file-item" v-for="f in filteredList" :key="f.id" @click="goDetail(f)">
        <!-- 顶部行：缩略图 + 文件名 + 状态徽章 -->
        <view class="file-row-top">
          <view class="file-thumb" :style="thumbBg(f)">
            <image
              v-if="isImage(f.file_ext)"
              :src="getPreviewUrl(f)"
              mode="aspectFill"
              class="file-thumb-img-el"
            />
            <text v-else class="file-thumb-emoji">{{ thumbIcon(f.file_ext) }}</text>
          </view>
          <view class="file-info">
            <text class="file-title">{{ f.title }}</text>
            <view class="file-meta">
              <text class="file-cat" :style="'background:' + catColor(f.category)">
                {{ catLabel(f.category) }}
              </text>
              <text class="file-size">{{ sizeText(f.file_size) }}</text>
            </view>
            <view class="file-meta-row">
              <text class="file-uploader">👤 {{ f.uploader_name || '员工' }}</text>
              <text class="file-time">{{ formatTime(f.uploaded_at) }}</text>
            </view>
          </view>
          <view class="file-status-badge" :style="'background:' + statusColor(f.status)">
            {{ statusText(f.status) }}
          </view>
        </view>

        <!-- 审核意见（已审的显示） -->
        <view v-if="f.status === 'approved' || f.status === 'rejected'" class="file-review">
          <text class="file-review-label">审核人：</text>
          <text class="file-review-name">{{ f.reviewer_name || '-' }}</text>
          <text v-if="f.review_comment" class="file-review-comment">「{{ f.review_comment }}」</text>
        </view>

        <!-- CAD / Office 文件 PDF 预览按钮（v2.3.6 hotfix 10-15：后端 convertToPdf 自动转 PDF，前端展示入口） -->
        <view
          v-if="isPreviewable(f.file_ext) && f.pdf_preview_url"
          class="file-preview-link"
          @click.stop="openCadPreview(f)"
        >
          <text class="preview-link-icon">📄</text>
          <text class="preview-link-text">预览 PDF</text>
          <text class="preview-link-arrow">›</text>
        </view>
        <view
          v-else-if="isPreviewable(f.file_ext) && f.preview_error"
          class="file-preview-error"
          @click.stop="showPreviewError(f)"
        >
          <text class="preview-error-icon">❌</text>
          <view class="preview-error-text-wrap">
            <text class="preview-error-text">PDF 转换失败</text>
            <text class="preview-error-hint">点击查看详情</text>
          </view>
        </view>
        <view
          v-else-if="isPreviewable(f.file_ext)"
          class="file-preview-pending"
        >
          <text class="preview-pending-icon">⏳</text>
          <text class="preview-pending-text">PDF 预览生成中...</text>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <text class="empty-icon">📎</text>
      <text class="empty-text">{{ emptyText }}</text>
      <text class="empty-hint">切换上方状态或分类查看其他文件</text>
    </view>

    <!-- 上传按钮（仅项目已选且有 write 权限显示） -->
    <view v-if="projectId && canWrite" class="fab" @click="goUpload">
      <text>+</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { useUserStore } from "@/stores/user";
import { pickProject } from "@/utils/projectPicker";
import {
  FILE_CATEGORIES, FILE_CATEGORY_MAP, projectFileUrl, authHeader,
  fileStatusText as statusText, fileStatusColor as statusColor,
  fileThumbIcon as thumbIcon, fileSizeText as sizeText,
} from "@/utils/permission";

const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" },
  { value: "revoked", label: "已撤销" },
];

const loading = ref(false);
const files = ref([]);
const curStatus = ref("");
const curCategory = ref("");
const projectId = ref(0);
const projectName = ref("");

const userStore = useUserStore();
const canWrite = computed(() => userStore.canSee("project_file:write") || userStore.canSee("project_file:approve"));

// 后端 /api/project-files 不分页、全量返回，因此一次拉全量数据，
// 状态/分类一律前端本地筛选：点 tab 零延迟、无"加载中"闪烁，且能算出各分类数量。
const filteredList = computed(() => {
  let list = files.value;
  if (curStatus.value) list = list.filter((f) => f.status === curStatus.value);
  if (curCategory.value) list = list.filter((f) => f.category === curCategory.value);
  return list;
});

// 各分类文件数（含 0，用于角标和空分类置灰）
const catCounts = computed(() => {
  const m = {};
  files.value.forEach((f) => { m[f.category] = (m[f.category] || 0) + 1; });
  return m;
});

// 各状态文件数（'' = 全部）
const statusCounts = computed(() => {
  const m = { '': files.value.length };
  files.value.forEach((f) => { m[f.status] = (m[f.status] || 0) + 1; });
  return m;
});

// 空状态文案（按当前筛选组合）
const emptyText = computed(() => {
  if (!projectId.value) return '请先选择项目';
  if (curCategory.value || curStatus.value) return '当前筛选条件下暂无文件';
  return '本项目暂无文件';
});

const categories = FILE_CATEGORIES;

const isImage = (ext) => ["jpg", "jpeg", "png", "gif", "webp"].includes((ext || "").toLowerCase());
// v2.3.6 hotfix 10-15：CAD + Office 文件都走 PDF 预览入口
const isPreviewable = (ext) => ['dwg','dxf','doc','docx','xls','xlsx','ppt','pptx'].includes((ext || '').toLowerCase());

const showPreviewError = (f) => {
  uni.showModal({
    title: 'PDF 预览生成失败',
    content: f.preview_error || '未知错误',
    showCancel: false,
    confirmText: '我知道了',
  });
};

const catLabel = (key) => {
  const c = FILE_CATEGORY_MAP[key];
  return c ? c.label : key;
};
const catColor = (key) => {
  const c = FILE_CATEGORY_MAP[key];
  return c ? c.color : "#F3F4F6";
};
const thumbBg = (f) => {
  const c = FILE_CATEGORY_MAP[f.category];
  return "background:" + (c ? c.color : "#F3F4F6");
};
const uid = computed(() => userStore.state.id || (uni.getStorageSync('userInfo') || {}).id || 0);
const getPreviewUrl = (f) => {
  // 图片缩略图：走 download 端点并内联返回；H5 的 <img> 不会带 x-user-id 请求头，
  // 故把用户 ID 拼进 query（后端 getUserId 支持从 query.user_id 取用户）
  // ⚠️ projectFileUrl 返回【绝对 URL】：uni-h5 的 <image> 会给以 "/" 开头的 src 拼上
  // router.base="/m/"，导致缩略图实际请求 /m/api/... 拿到 SPA 的 index.html 而裂图。
  return projectFileUrl(f.id, `?user_id=${uid.value}&inline=1`);
};

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(/-/g, '/'));
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${hh}:${mm}`;
};

async function loadData() {
  if (!projectId.value) return;
  loading.value = true;
  try {
    // 只按项目拉全量；status/category 由前端 computed 本地筛选
    const res = await uni.request({
      url: `/api/project-files?project_id=${projectId.value}`,
      header: authHeader(uid.value),
    });
    if (res.data && Array.isArray(res.data.list)) {
      files.value = res.data.list;
    } else {
      files.value = [];
    }
  } catch (e) {
    console.error('加载项目文件失败', e);
    files.value = [];
  } finally {
    loading.value = false;
  }
}

const goDetail = (f) => {
  uni.navigateTo({ url: `/pages/files/detail?id=${f.id}` });
};

// v2.3.6 hotfix 10-15：CAD 文件 PDF 预览入口
const openCadPreview = (f) => {
  if (!f.pdf_preview_url) return;
  // #ifdef H5
  // H5：开新窗口加载 PDF 预览
  window.open(f.pdf_preview_url, '_blank');
  // #endif
  // #ifndef H5
  // 小程序：跳详情页（详情页有完整 iframe 预览）
  uni.navigateTo({ url: `/pages/files/detail?id=${f.id}` });
  // #endif
};

const goUpload = async () => {
  if (!projectId.value) return;
  uni.navigateTo({
    url: `/pages/files/upload?projectId=${projectId.value}&projectName=${encodeURIComponent(projectName.value)}`,
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
  // 读 URL 参数
  const pages = getCurrentPages();
  const cur = pages[pages.length - 1];
  const opts = (cur && cur.options) || {};
  projectId.value = parseInt(opts.projectId || opts.project_id || 0);
  projectName.value = opts.projectName || opts.project_name || '';
  // 支持从项目详情"项目文件"tab 点分类进来：预选该分类
  if (opts.category && FILE_CATEGORY_MAP[opts.category]) {
    curCategory.value = opts.category;
  }
  // 如果 URL 没带 projectId，弹选项目
  if (!projectId.value) {
    pickProject('选择项目后查看文件').then((p) => {
      if (p) {
        projectId.value = p.id;
        projectName.value = p.name;
        loadData();
      }
    });
  } else {
    loadData();
  }
});

onShow(() => {
  // 审核/上传后返回，刷新列表
  if (projectId.value) loadData();
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
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.filter-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.filter-tag {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 13px;
  background: #fff;
  color: #6B7280;
  white-space: nowrap;
  flex-shrink: 0;
}
.filter-tag.active { background: #1E3A5F; color: #fff; }
.filter-tag.warning.active { background: #F59E0B; }
.filter-tag.danger.active { background: #EF4444; }
.filter-tag.success.active { background: #10B981; }
.filter-tag-count {
  min-width: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #F1F5F9;
  color: #64748B;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  font-weight: 600;
}
.filter-tag.active .filter-tag-count {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}

/* 分类筛选 tabs（横向滚动） */
.cat-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.cat-tag {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  background: #fff;
  color: #475569;
  border: 1px solid #E2E8F0;
  white-space: nowrap;
  flex-shrink: 0;
}
.cat-tag:active { border-color: #CBD5E1; }
.cat-tag-emoji {
  font-size: 13px;
  line-height: 1;
}
.cat-tag-label {
  line-height: 1.2;
}
.cat-tag-count {
  min-width: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #F1F5F9;
  color: #64748B;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  font-weight: 600;
}
.cat-tag.active {
  color: #1E3A5F;
  font-weight: 600;
  border-color: transparent;
}
.cat-tag.active .cat-tag-count {
  background: rgba(30, 58, 95, 0.12);
  color: #1E3A5F;
}
/* 该分类暂无文件：保留入口但置灰，不再是"整行消失" */
.cat-tag.is-empty { opacity: 0.45; }
.cat-tag.is-empty.active { opacity: 0.9; }

.loading-state {
  text-align: center;
  padding: 40px;
  color: #9CA3AF;
  font-size: 14px;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.file-item {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.file-row-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.file-thumb {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}
.file-thumb-emoji { font-size: 32px; }
.file-thumb-img { width: 100%; height: 100%; }
.file-thumb-img-el { width: 100%; height: 100%; display: block; }

.file-info { flex: 1; min-width: 0; }
.file-title {
  font-size: 15px;
  font-weight: 600;
  color: #1E3A5F;
  line-height: 1.4;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.file-meta {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  align-items: center;
}
.file-cat {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
  color: #1E3A5F;
}
.file-size {
  font-size: 11px;
  color: #9CA3AF;
}
.file-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
}
.file-uploader {
  font-size: 12px;
  color: #6B7280;
}
.file-time {
  font-size: 11px;
  color: #9CA3AF;
}

.file-status-badge {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 10px;
  color: #fff;
  flex-shrink: 0;
  margin-left: 6px;
}

.file-review {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #F3F4F6;
  font-size: 12px;
  color: #6B7280;
}
.file-review-label { color: #9CA3AF; }
.file-review-name { color: #1E3A5F; font-weight: 500; margin-right: 6px; }
.file-review-comment { color: #EF4444; }

/* CAD PDF 预览入口（v2.3.6 hotfix 10-15） */
.file-preview-link {
  display: flex; align-items: center; gap: 8px;
  margin-top: 10px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%);
  border-radius: 8px;
  border-left: 3px solid #3B82F6;
}
.preview-link-icon { font-size: 18px; }
.preview-link-text {
  flex: 1; font-size: 13px; font-weight: 600; color: #1E3A5F;
}
.preview-link-arrow { font-size: 18px; color: #6B7280; font-weight: 300; }
.file-preview-pending {
  display: flex; align-items: center; gap: 8px;
  margin-top: 10px;
  padding: 8px 14px;
  background: #FEF3C7;
  border-radius: 8px;
  font-size: 12px;
  color: #92400E;
}
.preview-pending-icon { font-size: 14px; }
.preview-pending-text { font-size: 12px; }

/* v2.3.6 hotfix 10-15：PDF 转换失败提示 */
.file-preview-error {
  display: flex; align-items: center; gap: 8px;
  margin-top: 10px;
  padding: 10px 14px;
  background: #FEE2E2;
  border-radius: 8px;
  border-left: 3px solid #EF4444;
}
.preview-error-icon { font-size: 16px; }
.preview-error-text-wrap { flex: 1; }
.preview-error-text {
  font-size: 13px; font-weight: 600; color: #B91C1C;
}
.preview-error-hint {
  font-size: 11px; color: #DC2626;
  margin-top: 2px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
}
.empty-icon { font-size: 50px; margin-bottom: 8px; opacity: 0.5; }
.empty-text { font-size: 14px; color: #9CA3AF; }
.empty-hint { font-size: 12px; color: #CBD5E1; margin-top: 6px; }

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
