<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">上传文件</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 所属项目 -->
    <view class="section">
      <view class="section-label">所属项目</view>
      <view class="project-card">
        <text class="project-name">📁 {{ projectName || '未选择' }}</text>
      </view>
    </view>

    <!-- 文件分类 -->
    <view class="section">
      <view class="section-label">文件分类 <text class="required">*</text></view>
      <view class="cat-grid">
        <view
          v-for="c in categories"
          :key="c.key"
          class="cat-cell"
          :class="{ active: curCategory === c.key }"
          :style="curCategory === c.key ? 'background:' + c.color + ';border-color:#1E3A5F' : ''"
          @click="curCategory = c.key"
        >
          <text class="cat-icon">{{ c.icon }}</text>
          <text class="cat-label">{{ c.label }}</text>
        </view>
      </view>
    </view>

    <!-- 选择文件 -->
    <view class="section">
      <view class="section-label">选择文件 <text class="required">*</text></view>
      <view v-if="!fileInfo" class="upload-btn" @click="chooseFile">
        <text class="upload-icon">📎</text>
        <text class="upload-text">点击选择文件</text>
        <text class="upload-hint">支持 PDF/图片/Word/Excel/PPT/CAD/压缩包，单文件 ≤ 100MB</text>
      </view>
      <view v-else class="file-preview">
        <text class="file-preview-icon">{{ fileThumbIcon(fileInfo.ext) }}</text>
        <view class="file-preview-info">
          <text class="file-preview-name">{{ fileInfo.name }}</text>
          <text class="file-preview-size">{{ sizeText(fileInfo.size) }} · {{ fileInfo.ext.toUpperCase() }}</text>
        </view>
        <text class="file-preview-del" @click="removeFile">✕</text>
      </view>
    </view>

    <!-- 描述 -->
    <view class="section">
      <view class="section-label">备注（可选）</view>
      <textarea
        v-model="description"
        class="desc-input"
        placeholder="比如：与客户确认过的最终版本 v2"
        maxlength="200"
      />
    </view>

    <!-- 提交按钮 -->
    <view class="submit-bar">
      <view v-if="uploading" class="progress-wrap">
        <view class="progress-bar"><view class="progress-fill" :style="'width:' + progress + '%'"></view></view>
        <text class="progress-text">上传中... {{ progress }}%</text>
      </view>
      <button
        v-else
        class="btn-submit"
        :disabled="!canSubmit"
        :class="{ disabled: !canSubmit }"
        @click="submit"
      >提交上传</button>
    </view>

    <!-- 提示 -->
    <view class="tip">
      <text>📌 提交后文件进入「待审核」状态，由有审核权限的同事（项目经理/财务）审核通过后才正式归档。</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from "vue";
import {
  FILE_CATEGORIES, fileThumbIcon, fileSizeText as sizeText,
} from "@/utils/permission";

// 用临时 path 存文件（H5 用 blob URL，小程序用 tempFilePath）
const projectId = ref(0);
const projectName = ref("");
const curCategory = ref("");
const description = ref("");
const fileInfo = ref(null); // { path, name, size, ext }
const uploading = ref(false);
const progress = ref(0);

const categories = FILE_CATEGORIES;
const canSubmit = computed(() => projectId.value && curCategory.value && fileInfo.value);

const chooseFile = () => {
  // #ifdef H5
  // H5 端 chooseFile 走 web 原生 input
  uni.chooseFile({
    count: 1,
    extension: ['pdf','jpg','jpeg','png','gif','webp','doc','docx','xls','xlsx','ppt','pptx','dwg','dxf','zip','rar'],
    success: (res) => {
      const f = res.tempFiles[0];
      onFileChosen({
        path: f.path,
        name: f.name,
        size: f.size,
      });
    },
    fail: (e) => {
      console.warn('选择文件失败', e);
    }
  });
  // #endif
  // #ifdef MP-WEIXIN
  // 小程序走 chooseMessageFile 也支持；这里简单用 chooseImage（图片）+ 文字提示走 PC 端
  uni.chooseMessageFile({
    count: 1,
    extension: ['pdf','jpg','jpeg','png','doc','docx','xls','xlsx','ppt','pptx','dwg','dxf','zip','rar'],
    success: (res) => {
      const f = res.tempFiles[0];
      onFileChosen({
        path: f.path,
        name: f.name,
        size: f.size,
      });
    },
    fail: () => {
      // 退到图片选择
      uni.chooseImage({
        count: 1,
        success: (res2) => {
          const f = res2.tempFilePaths[0];
          const name = f.split('/').pop() || 'image.jpg';
          uni.getFileInfo({
            filePath: f,
            success: (info) => onFileChosen({ path: f, name, size: info.size }),
          });
        }
      });
    }
  });
  // #endif
};

const onFileChosen = (f) => {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (f.size > 100 * 1024 * 1024) {
    uni.showToast({ title: '文件超过 100MB', icon: 'none' });
    return;
  }
  fileInfo.value = { path: f.path, name: f.name, size: f.size, ext };
};

const removeFile = () => {
  fileInfo.value = null;
};

const submit = () => {
  if (!canSubmit.value) return;
  uploading.value = true;
  progress.value = 0;

  // H5 端：先用 uni.request 拿临时上传 URL 走 form-data（H5 没有原生 uni.uploadFile 进度）
  // 这里简单用 fetch + XMLHttpRequest 监听进度
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  // H5 file path 是 blob URL，需要先 fetch 转 Blob
  fetch(fileInfo.value.path).then((r) => r.blob()).then((blob) => {
    formData.append('file', blob, fileInfo.value.name);
    formData.append('project_id', String(projectId.value));
    formData.append('category', curCategory.value);
    if (description.value) formData.append('description', description.value);

    xhr.open('POST', '/api/project-files');
    xhr.setRequestHeader('x-user-id', uni.getStorageSync('userId') || '');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        progress.value = Math.round((e.loaded / e.total) * 100);
      }
    };
    xhr.onload = () => {
      uploading.value = false;
      try {
        const resp = JSON.parse(xhr.responseText);
        if (xhr.status === 200 && resp.id) {
          uni.showToast({ title: '上传成功，待审核', icon: 'success' });
          setTimeout(() => uni.navigateBack(), 800);
        } else {
          uni.showToast({ title: resp.error || '上传失败', icon: 'none' });
        }
      } catch (e) {
        uni.showToast({ title: '上传失败', icon: 'none' });
      }
    };
    xhr.onerror = () => {
      uploading.value = false;
      uni.showToast({ title: '网络错误', icon: 'none' });
    };
    xhr.send(formData);
  }).catch((e) => {
    uploading.value = false;
    uni.showToast({ title: '文件读取失败', icon: 'none' });
  });
};

const goBack = () => {
  uni.navigateBack();
};

// onLoad
const pages = getCurrentPages();
const cur = pages[pages.length - 1];
const opts = (cur && cur.options) || {};
projectId.value = parseInt(opts.projectId || 0);
projectName.value = opts.projectName || '';
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding: 16px;
  padding-bottom: 120px;
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

.section {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
}
.section-label {
  font-size: 14px;
  font-weight: 600;
  color: #1E3A5F;
  margin-bottom: 10px;
}
.required { color: #EF4444; }

.project-card {
  background: #F5F7FA;
  padding: 12px;
  border-radius: 8px;
}
.project-name { font-size: 14px; color: #1E3A5F; }

.cat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.cat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 6px;
  border-radius: 10px;
  background: #F9FAFB;
  border: 2px solid transparent;
  transition: all 0.15s;
}
.cat-icon { font-size: 24px; margin-bottom: 4px; }
.cat-label { font-size: 12px; color: #1E3A5F; }

.upload-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30px 20px;
  border: 2px dashed #D1D5DB;
  border-radius: 12px;
  background: #F9FAFB;
}
.upload-icon { font-size: 40px; margin-bottom: 8px; }
.upload-text { font-size: 15px; color: #1E3A5F; font-weight: 600; margin-bottom: 4px; }
.upload-hint { font-size: 11px; color: #9CA3AF; text-align: center; }

.file-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #F9FAFB;
  border-radius: 10px;
}
.file-preview-icon { font-size: 32px; }
.file-preview-info { flex: 1; min-width: 0; }
.file-preview-name {
  font-size: 14px;
  color: #1E3A5F;
  font-weight: 600;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.file-preview-size { font-size: 11px; color: #9CA3AF; margin-top: 2px; }
.file-preview-del {
  font-size: 18px;
  color: #EF4444;
  padding: 4px 8px;
}

.desc-input {
  width: 100%;
  min-height: 80px;
  padding: 10px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  font-size: 14px;
  background: #F9FAFB;
  box-sizing: border-box;
}

.submit-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  background: #fff;
  border-top: 1px solid #F3F4F6;
  z-index: 50;
}
.btn-submit {
  width: 100%;
  height: 48px;
  background: linear-gradient(135deg, #1E3A5F, #3B82F6);
  color: #fff;
  border-radius: 24px;
  font-size: 16px;
  font-weight: 600;
  border: none;
}
.btn-submit.disabled { background: #D1D5DB; color: #fff; }

.progress-wrap { display: flex; flex-direction: column; gap: 6px; }
.progress-bar {
  height: 8px;
  background: #E5E7EB;
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1E3A5F, #3B82F6);
  transition: width 0.2s;
}
.progress-text { font-size: 12px; color: #6B7280; text-align: center; }

.tip {
  margin-top: 16px;
  padding: 10px;
  background: #FEF3C7;
  border-radius: 8px;
  font-size: 12px;
  color: #92400E;
  line-height: 1.5;
}
</style>
