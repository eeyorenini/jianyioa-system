<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">新建巡检问题</text>
      <view class="nav-placeholder"></view>
    </view>
    <view class="project-banner" v-if="projectName">
      📁 {{ projectName }}
    </view>
    <view class="form-card">
      <view class="form-item">
        <view class="form-label">问题标题 *</view>
        <input class="form-input" v-model="form.title" placeholder="自动生成，可手动修改" />
      </view>

      <view class="form-item">
        <view class="form-label">问题分类</view>
        <view class="tag-select">
          <view
            v-for="cat in categories"
            :key="cat"
            class="tag-option"
            :class="{ selected: form.category === cat }"
            @click="form.category = cat"
          >{{ cat }}</view>
        </view>
      </view>

      <view class="form-item">
        <view class="form-label">问题位置</view>
        <view class="tag-select">
          <view
            v-for="loc in locations"
            :key="loc"
            class="tag-option"
            :class="{ selected: form.location === loc }"
            @click="form.location = loc"
          >{{ loc }}</view>
        </view>
      </view>

      <view class="form-item">
        <view class="form-label">问题等级</view>
        <view class="level-select">
          <view
            v-for="lv in levels"
            :key="lv.value"
            class="level-option"
            :class="[`level-${lv.value}`, { selected: form.level === lv.value }]"
            @click="form.level = lv.value"
          >
            <text>{{ lv.label }}</text>
          </view>
        </view>
      </view>

      <view class="form-item">
        <view class="form-label">问题描述</view>
        <view class="textarea-wrapper">
          <textarea class="form-textarea" v-model="form.description" placeholder="详细描述问题..."></textarea>
          <view class="textarea-toolbar">
          </view>
        </view>
      </view>

      <view class="form-item">
        <view class="form-label">整改截止时间</view>
        <picker mode="date" :value="form.deadline" @change="onDeadlineChange" class="picker-btn">
          <view class="date-display">{{ form.deadline || '请选择日期' }}</view>
        </picker>
      </view>
    </view>

    <!-- 问题照片/视频 -->
    <view class="form-card">
      <view class="form-label">问题照片/视频</view>
      <view class="photo-grid">
        <view class="photo-item" v-for="(img, idx) in photos" :key="'photo_' + idx">
          <image class="photo-img" :src="img" mode="aspectFill" @click="previewImg(idx)"></image>
          <view class="photo-del" @click="delPhoto(idx)">✕</view>
          <view class="photo-uploading" v-if="uploadingPhotoIdx === idx">
            <view class="photo-uploading-icon">⟳</view>
          </view>
        </view>
        <!-- 添加按钮 -->
        <button class="photo-add" type="button" @click.stop="choosePhoto($event)" :disabled="choosingPhoto">
          <text class="photo-add-icon">📷</text>
          <text class="photo-add-text">添加照片</text>
        </button>
      </view>
      <view class="upload-overlay" v-if="uploadProgress.visible">
        <view class="upload-overlay-content">
          <view class="upload-overlay-spinner">⟳</view>
          <text class="upload-overlay-text">{{ uploadProgress.text }}</text>
          <view class="upload-overlay-bar-wrap">
            <view class="upload-overlay-bar" :style="{ width: uploadProgress.percent + '%' }"></view>
          </view>
          <text class="upload-overlay-percent">{{ uploadProgress.percent }}%</text>
        </view>
      </view>
    </view>

    <view class="submit-bar">
      <view class="btn btn-primary btn-block" :class="{ 'btn-loading': submitting }" @click="submit" :disabled="submitting">
        <text v-if="submitting">提交中...</text>
        <text v-else>提交巡检</text>
      </view>
    </view>

    <!-- 提交遮罩 -->
    <view class="loading-overlay" v-if="submitting">
      <view class="spinner"></view>
      <text class="loading-text">提交中...</text>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from "vue";

const projectId = ref(0);
const projectName = ref('');
const photos = ref([]);
const submitting = ref(false);
const choosingPhoto = ref(false);
const uploadingPhotoIdx = ref(-1);
const uploadProgress = reactive({
  visible: false,
  total: 0,
  done: 0,
  percent: 0,
  text: '',
});

const categories = ['水电问题', '防水问题', '泥瓦问题', '木工问题', '油漆问题', '安全隐患', '卫生问题'];
const locations = ['客厅', '卧室', '厨房', '卫生间', '阳台', '全屋'];
const levels = [
  { value: 'normal', label: '一般' },
  { value: 'serious', label: '严重' },
  { value: 'stop', label: '停工整改' },
];

const form = reactive({
  title: '',
  category: '',
  location: '',
  level: 'normal',
  description: '',
  deadline: '',
});

// 选择问题分类时自动填入标题
const generateTitle = () => {
  if (form.category && !form.title) {
    form.title = form.category;
  }
};

// 监听分类变化，重新生成标题
watch(() => form.category, generateTitle);

// 日期选择
const onDeadlineChange = (e) => {
  form.deadline = e.detail.value;
};

// 判断是否是视频
// 选择照片（统一入口，与日志提交页一致）
const choosePhoto = (e) => {
  e?.preventDefault?.();
  if (choosingPhoto.value) return;
  const remain = 9 - photos.value.length;
  if (remain <= 0) {
    uni.showToast({ title: '最多9张', icon: 'none' });
    return;
  }
  choosingPhoto.value = true;
  uni.chooseImage({
    count: Number(remain),
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const paths = res.tempFilePaths;
      if (!paths.length) { choosingPhoto.value = false; return; }

      // 显示遮罩
      uploadProgress.visible = true;
      uploadProgress.total = paths.length;
      uploadProgress.done = 0;
      uploadProgress.percent = 0;
      uploadProgress.text = '正在上传 0/' + paths.length;

      // 并行上传所有图片
      const uploadTasks = paths.map((path, i) => asyncUploadPhoto(path, i, paths.length));
      await Promise.all(uploadTasks);

      // 隐藏遮罩
      uploadProgress.visible = false;
      choosingPhoto.value = false;
    },
    fail: () => {
      choosingPhoto.value = false;
    },
  });
};

// 上传单张照片（带进度更新）
const asyncUploadPhoto = (filePath, index, total) => {
  return new Promise((resolve) => {
    uploadingPhotoIdx.value = photos.value.length + index;
    uni.uploadFile({
      url: '/api/upload-image',
      filePath,
      name: 'file',
      success: (res) => {
        try {
          const data = JSON.parse(res.data);
          if (data.url) {
            photos.value.push(data.url);
          }
        } catch (e) {}
        uploadProgress.done++;
        uploadProgress.percent = Math.round((uploadProgress.done / uploadProgress.total) * 100);
        uploadProgress.text = '正在上传 ' + uploadProgress.done + '/' + uploadProgress.total;
        resolve(true);
      },
      fail: (err) => {
        console.error('上传失败:', err);
        uni.showToast({ title: '有图片上传失败，已跳过', icon: 'none', duration: 1500 });
        uploadProgress.done++;
        uploadProgress.percent = Math.round((uploadProgress.done / uploadProgress.total) * 100);
        uploadProgress.text = '正在上传 ' + uploadProgress.done + '/' + uploadProgress.total;
        resolve(false);
      },
      complete: () => {
        uploadingPhotoIdx.value = -1;
      },
    });
  });
};

// 删除照片
const delPhoto = (idx) => {
  photos.value.splice(idx, 1);
};

// 预览照片
const previewImg = (idx) => {
  const urls = photos.value.map(p => {
    if (p.startsWith('/uploads/') || p.startsWith('http')) return p;
    return p;
  });
  uni.previewImage({ urls, current: idx });
};

// 提交
const submit = () => {
  if (submitting.value) return;
  submitting.value = true;
  if (!form.title.trim()) {
    uni.showToast({ title: '请填写问题标题', icon: 'none' });
    submitting.value = false;
    return;
  }
  const token = uni.getStorageSync("token");
  const userInfo = uni.getStorageSync('userInfo');

  const imageUrls = photos.value.map(p => {
    if (p.startsWith('/uploads/') || p.startsWith('http')) return p;
    return p;
  });

  uni.request({
    url: "/api/rectification-issues",
    method: "POST",
    header: {
      Authorization: token,
      'x-user-id': String(userInfo?.id || 1),
    },
    data: {
      user_id: userInfo?.id || 1,
      project_id: projectId.value,
      project_name: projectName.value,
      title: form.title,
      category: form.category,
      location: form.location,
      level: form.level,
      description: form.description,
      issue_desc: form.description,
      due_date: form.deadline,
      images: JSON.stringify(imageUrls),
    },
    timeout: 15000,
  }).then((res) => {
    if (res.statusCode === 200 || res.statusCode === 201) {
      uni.showToast({ title: '提交成功', icon: 'success', duration: 1500 });
      setTimeout(() => {
        uni.navigateBack({ fail: () => {
          location.assign('/pages/inspection/list');
        }});
      }, 1500);
    } else {
      uni.showToast({ title: '提交失败', icon: 'none' });
    }
  }).catch((err) => {
    uni.showToast({ title: '提交失败', icon: 'none' });
    console.error('提交失败', err);
  }).finally(() => {
    submitting.value = false;
  });
};

onMounted(async () => {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = (current).options || {};
  projectId.value = parseInt(options.projectId || '0');
  if (options.projectName) {
    projectName.value = decodeURIComponent(options.projectName);
  } else if (projectId.value) {
    try {
      const token = uni.getStorageSync('token');
      const res = await uni.request({ url: '/api/projects', header: { Authorization: token } });
      const data = (res.data) || [];
      const p = Array.isArray(data) ? data.find((x) => x.id === projectId.value) : null;
      if (p) projectName.value = p.name;
    } catch (e) {}
  }
});

const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding: 16px;
  padding-bottom: 100px;
}

.project-banner {
  font-size: 13px;
  color: #1E3A5F;
  background: #DBEAFE;
  padding: 8px 14px;
  font-weight: 500;
  border-radius: 8px;
  margin-bottom: 12px;
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
  resize: none;
  box-sizing: border-box;
}

.textarea-wrapper {
  position: relative;
}

.textarea-toolbar {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 2;
}

.tag-select {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-option {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  background: #F3F4F6;
  color: #6B7280;
  cursor: pointer;
}

.tag-option.selected {
  background: #1E3A5F;
  color: #fff;
}

.level-select { display: flex; gap: 10px; }

.level-option {
  flex: 1;
  text-align: center;
  padding: 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 2px solid transparent;
}

.level-normal { background: #FEF3C7; color: #92400E; }
.level-serious { background: #FEE2E2; color: #991B1B; }
.level-stop { background: #EDE9FE; color: #7C3AED; }
.level-normal.selected { border-color: #92400E; }
.level-serious.selected { border-color: #991B1B; }
.level-stop.selected { border-color: #7C3AED; }

/* 日期选择 */
.date-display {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid #E5E7EB;
  border-radius: 8px;
  min-height: 44px;
  box-sizing: border-box;
  font-size: 14px;
  background: #fff;
  display: flex;
  align-items: center;
  color: #6B7280;
}
.picker-btn { width: 100%; }

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 8px;
}

.photo-item { position: relative; aspect-ratio: 1; }

.photo-img {
  width: 100%;
  height: 100%;
  border-radius: 8px;
}

.photo-del {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  background: rgba(0,0,0,0.5);
  color: #fff;
  border-radius: 50%;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.photo-add {
  aspect-ratio: 1;
  border: 1.5px dashed #D1D5DB;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: transparent;
  padding: 0;
  margin: 0;
}

.photo-add-icon { font-size: 22px; margin-bottom: 2px; }
.photo-add-text { font-size: 11px; color: #9CA3AF; }

/* 照片上传中状态 */
.photo-uploading {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.7);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.photo-uploading-icon {
  font-size: 22px;
  color: #1E3A5F;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 上传进度遮罩 */
.upload-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.upload-overlay-content {
  background: #fff;
  border-radius: 16px;
  padding: 32px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 220px;
}
.upload-overlay-spinner {
  font-size: 36px;
  color: #1E3A5F;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}
.upload-overlay-text {
  font-size: 14px;
  color: #374151;
  margin-bottom: 12px;
}
.upload-overlay-bar-wrap {
  width: 100%;
  height: 6px;
  background: #E5E7EB;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}
.upload-overlay-bar {
  height: 100%;
  background: #1E3A5F;
  border-radius: 3px;
  transition: width 0.3s;
}
.upload-overlay-percent {
  font-size: 12px;
  color: #9CA3AF;
}

.submit-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: #fff;
  box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
  z-index: 100;
  display: flex;
  justify-content: center;
}
.submit-bar .btn {
  display: flex;
}
.btn.loading {
  opacity: 0.7;
}

/* 加载遮罩 */
.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { color: #fff; margin-top: 16px; font-size: 16px; }

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
</style>
