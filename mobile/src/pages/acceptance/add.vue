<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">新建验收</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 项目信息 -->
    <view class="project-banner" v-if="projectName">📁 {{ projectName }}</view>

    <!-- 表单 -->
    <view class="form-card">
      <!-- 验收阶段 -->
      <view class="form-item">
        <text class="form-label">验收阶段 <text class="required">*</text></text>
        <picker :range="stageOptions" @change="onStageChange">
          <view class="picker-wrap">
            <text :class="form.stage ? 'picker-value' : 'picker-placeholder'">
              {{ form.stage || '请选择验收阶段' }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 验收日期 -->
      <view class="form-item">
        <text class="form-label">验收日期</text>
        <picker mode="date" :value="form.accept_date" @change="onDateChange">
          <view class="picker-wrap">
            <text :class="form.accept_date ? 'picker-value' : 'picker-placeholder'">
              {{ form.accept_date || '请选择日期' }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 验收结果 -->
      <view class="form-item">
        <text class="form-label">验收结果</text>
        <picker :range="statusOptions" @change="onStatusChange">
          <view class="picker-wrap">
            <text :class="form.accept_status ? 'picker-value' : 'picker-placeholder'">
              {{ form.accept_status || '请选择验收结果' }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 质量评分 -->
      <view class="form-item">
        <text class="form-label">质量评分（0-100）</text>
        <input class="form-input" type="number" v-model="form.quality_score" placeholder="如：95" />
      </view>

      <!-- 问题说明 -->
      <view class="form-item">
        <text class="form-label">问题 / 说明</text>
        <textarea class="form-textarea" v-model="form.issues" placeholder="验收情况说明、整改要求等" />
      </view>
    </view>

    <!-- 现场照片 -->
    <view class="form-card">
      <text class="form-label">现场照片</text>
      <view class="photo-grid">
        <view class="photo-item" v-for="(img, idx) in photos" :key="img.id || ('p_' + idx)">
          <image
            class="photo-img"
            :src="photoSrc(img)"
            mode="aspectFill"
            @error="onPhotoImgError(img)"
            @click="previewPhoto(idx)"
          />
          <view class="photo-del" @click.stop="delPhoto(idx)">✕</view>
          <view class="photo-uploading" v-if="img.status === 'uploading'">
            <text>⟳</text>
          </view>
          <view v-else-if="img.status === 'failed'" class="photo-status-badge badge-failed">未上传</view>
          <view v-else-if="img.status === 'local-only'" class="photo-status-badge badge-warn">仅预览</view>
        </view>
        <view class="photo-add" v-if="photos.length < 9" @click="choosePhoto">
          <text class="photo-add-icon">📷</text>
          <text class="photo-add-text">添加照片</text>
        </view>
      </view>
    </view>

    <!-- 上传进度遮罩 -->
    <view class="upload-mask" v-if="uploadProgress.visible">
      <view class="upload-box">
        <text class="upload-title">正在上传图片</text>
        <view class="upload-bar-bg">
          <view class="upload-bar-fill" :style="{ width: uploadProgress.percent + '%' }"></view>
        </view>
        <text class="upload-text">{{ uploadProgress.text }}</text>
      </view>
    </view>

    <!-- 提交按钮 -->
    <view class="bottom-bar">
      <view class="btn-submit" :class="{ loading: submitting }" @click="submit">
        <text v-if="!submitting">提 交</text>
        <text v-else>提交中...</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";

const projectId = ref(0);
const projectName = ref('');
const photos = ref([]);
const submitting = ref(false);
const choosingPhoto = ref(false);
const uploadProgress = reactive({ visible: false, total: 0, done: 0, percent: 0, text: '' });

const stageOptions = ['材料进场验收', '隐蔽工程验收', '节点验收', '竣工验收', '其他'];
const statusOptions = ['待验收', '已通过', '整改中', '不通过'];

const form = reactive({
  stage: '',
  accept_date: '',
  accept_status: '待验收',
  quality_score: '',
  issues: '',
});

const onStageChange = (e) => { form.stage = stageOptions[e.detail.value]; };
const onDateChange = (e) => { form.accept_date = e.detail.value; };
const onStatusChange = (e) => { form.accept_status = statusOptions[e.detail.value]; };

// ===== 照片上传（与「巡检 / 施工日志」同一套稳健逻辑）=====
let _photoSeq = 0;
const nextPhotoId = () => 'p_' + Date.now().toString(36) + '_' + (++_photoSeq).toString(36);

const photoSrc = (p) => {
  if (!p) return '';
  return p.url || p.localUrl || '';
};

const onPhotoImgError = (img) => {
  // serverUrl 加载失败时回退到本地预览
  if (img && img.localUrl && img.url !== img.localUrl) {
    img.url = img.localUrl;
  }
};

const choosePhoto = () => {
  if (choosingPhoto.value) return;
  const remain = 9 - photos.value.length;
  if (remain <= 0) { uni.showToast({ title: '最多9张', icon: 'none' }); return; }
  choosingPhoto.value = true;
  uni.chooseImage({
    count: remain,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const paths = res.tempFilePaths || [];
      if (!paths.length) { choosingPhoto.value = false; return; }
      // 先插入本地占位，缩略图立刻可见；localUrl 兜底
      const placeholders = paths.map((p) => ({
        id: nextPhotoId(),
        localUrl: p,
        url: p,
        serverUrl: '',
        status: 'uploading',
      }));
      photos.value.push(...placeholders);

      uploadProgress.visible = true;
      uploadProgress.total = paths.length;
      uploadProgress.done = 0;
      uploadProgress.percent = 0;
      uploadProgress.text = '正在上传 0/' + paths.length;

      await Promise.all(paths.map((path, i) => uploadOne(path, placeholders[i])));
      uploadProgress.visible = false;
      choosingPhoto.value = false;
    },
    fail: () => { choosingPhoto.value = false; },
  });
};

const uploadOne = (filePath, placeholder) => {
  return new Promise((resolve) => {
    uni.uploadFile({
      url: '/api/upload-image',
      filePath,
      name: 'file',
      header: { Authorization: uni.getStorageSync('token') },
      success: (res) => {
        let serverUrl = '';
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          serverUrl = data?.url || data?.path || '';
        } catch (e) { /* 忽略 */ }
        const idx = photos.value.findIndex((p) => p.id === placeholder.id);
        if (idx >= 0) {
          if (serverUrl) {
            photos.value[idx] = { ...photos.value[idx], url: serverUrl, serverUrl, status: 'done' };
          } else {
            photos.value[idx] = { ...photos.value[idx], status: 'local-only' };
            uni.showToast({ title: '有图片返回异常，仅本地预览', icon: 'none' });
          }
        }
        bumpProgress();
        resolve(true);
      },
      fail: () => {
        const idx = photos.value.findIndex((p) => p.id === placeholder.id);
        if (idx >= 0) photos.value[idx] = { ...photos.value[idx], status: 'failed' };
        uni.showToast({ title: '有图片上传失败，已跳过', icon: 'none' });
        bumpProgress();
        resolve(false);
      },
    });
  });
};

const bumpProgress = () => {
  uploadProgress.done++;
  uploadProgress.percent = uploadProgress.total ? Math.round((uploadProgress.done / uploadProgress.total) * 100) : 100;
  uploadProgress.text = '正在上传 ' + uploadProgress.done + '/' + uploadProgress.total;
};

const delPhoto = (idx) => { photos.value.splice(idx, 1); };

const previewPhoto = (idx) => {
  const urls = photos.value.map((p) => photoSrc(p)).filter(Boolean);
  uni.previewImage({ urls, current: urls[idx] });
};

const submit = () => {
  if (submitting.value) return;
  if (!projectId.value) { uni.showToast({ title: '未指定项目', icon: 'none' }); return; }
  if (!form.stage) { uni.showToast({ title: '请选择验收阶段', icon: 'none' }); return; }

  submitting.value = true;
  const imageUrls = photos.value
    .map((p) => p.serverUrl || (p.url && !String(p.url).startsWith('blob:') ? p.url : null))
    .filter(Boolean);

  uni.request({
    url: '/api/acceptance',
    method: 'POST',
    header: { 'Content-Type': 'application/json', Authorization: uni.getStorageSync('token') },
    data: {
      project_id: projectId.value,
      project_name: projectName.value,
      stage: form.stage,
      accept_status: form.accept_status || '待验收',
      accept_date: form.accept_date,
      quality_score: form.quality_score === '' ? null : Number(form.quality_score),
      issues: form.issues,
      attachment: JSON.stringify(imageUrls),
    },
    timeout: 15000,
  }).then((res) => {
    const ok = res.statusCode === 200 || res.statusCode === 201;
    if (ok) {
      uni.showToast({ title: '提交成功', icon: 'success', duration: 1500 });
      setTimeout(() => { uni.navigateBack(); }, 1500);
    } else {
      uni.showToast({ title: (res.data && res.data.error) || '提交失败', icon: 'none' });
    }
  }).catch(() => {
    uni.showToast({ title: '提交失败', icon: 'none' });
  }).finally(() => {
    submitting.value = false;
  });
};

onMounted(async () => {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = (current && current.options) || {};
  projectId.value = parseInt(options.projectId || '0');
  if (options.projectName) {
    projectName.value = decodeURIComponent(options.projectName);
  } else if (projectId.value) {
    try {
      const res = await uni.request({ url: '/api/projects', header: { Authorization: uni.getStorageSync('token') } });
      const data = res.data || [];
      const p = Array.isArray(data) ? data.find((x) => x.id === projectId.value) : null;
      if (p) projectName.value = p.name;
    } catch (e) {}
  }
});

const goBack = () => uni.navigateBack();
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding: 16px;
  padding-bottom: 110px;
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

.project-banner {
  font-size: 13px;
  color: #1E3A5F;
  background: #DBEAFE;
  padding: 8px 14px;
  font-weight: 500;
  border-radius: 8px;
  margin: 12px 0;
}

.form-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
}

.form-item { margin-bottom: 16px; }
.form-item:last-child { margin-bottom: 0; }

.form-label {
  font-size: 13px;
  color: #374151;
  font-weight: 500;
  margin-bottom: 8px;
  display: block;
}

.required { color: #EF4444; }

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid #E5E7EB;
  border-radius: 8px;
  font-size: 14px;
  min-height: 44px;
  box-sizing: border-box;
}

.form-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid #E5E7EB;
  border-radius: 8px;
  font-size: 14px;
  min-height: 100px;
  box-sizing: border-box;
}

.picker-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1.5px solid #E5E7EB;
  border-radius: 8px;
  min-height: 44px;
  box-sizing: border-box;
}
.picker-value { font-size: 14px; color: #1A1F36; }
.picker-placeholder { font-size: 14px; color: #D1D5DB; }
.picker-arrow { font-size: 18px; color: #D1D5DB; }

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 8px;
}

.photo-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: #F3F4F6;
}

.photo-img { width: 100%; height: 100%; display: block; }

.photo-del {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  background: rgba(0,0,0,0.55);
  color: #fff;
  border-radius: 50%;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-uploading {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 22px;
}

.photo-status-badge {
  position: absolute;
  left: 4px;
  bottom: 4px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  color: #fff;
}
.badge-failed { background: #EF4444; }
.badge-warn { background: #F59E0B; }

.photo-add {
  aspect-ratio: 1;
  border: 1.5px dashed #D1D5DB;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9CA3AF;
}
.photo-add-icon { font-size: 24px; }
.photo-add-text { font-size: 12px; margin-top: 4px; }

.upload-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.upload-box {
  background: #fff;
  border-radius: 12px;
  padding: 20px 24px;
  width: 220px;
  text-align: center;
}
.upload-title { font-size: 14px; color: #1A1F36; font-weight: 600; }
.upload-bar-bg {
  height: 6px;
  background: #E5E7EB;
  border-radius: 3px;
  margin: 14px 0 8px;
  overflow: hidden;
}
.upload-bar-fill { height: 100%; background: #3B82F6; transition: width 0.2s; }
.upload-text { font-size: 12px; color: #6B7280; }

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
</style>
