<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">新建施工日志</text>
      <view class="nav-placeholder"></view>
    </view>
    <!-- 项目信息 -->
    <view class="project-tip">
      📁 {{ projectName }}
    </view>

    <!-- 日志表单 -->
    <view class="form-card">
      <view class="form-item">
        <view class="form-label">施工内容 *</view>
        <view class="textarea-wrapper">
          <textarea
            class="form-textarea"
            v-model="form.content"
            placeholder="描述今日施工内容..."
            :maxlength="500"
          ></textarea>
          <view class="textarea-toolbar">
            <voice-input v-model="form.content" @ai-organize="handleAiOrganize($event, 'content')" />
          </view>
        </view>
        <text class="char-count">{{ form.content.length }}/500</text>
      </view>

      <view class="form-item">
        <view class="form-label">施工工种</view>
        <input class="form-input" v-model="form.work_type" placeholder="如：水电工、泥瓦工" />
        <view class="work-type-tags">
          <text
            class="work-type-tag"
            v-for="t in workTypeOptions"
            :key="t"
            @click="selectWorkType(t)"
          >{{ t }}</text>
        </view>
      </view>

      <!-- 到场人数 -->
      <view class="form-item">
        <view class="form-label">到场人数</view>
        <view class="worker-count-picker" @click="showWorkerPicker = true">
          <text class="picker-value">{{ form.worker_count || '请选择' }}</text>
          <text class="picker-arrow">▼</text>
        </view>
      </view>

      <!-- 人数滚轮弹窗 -->
      <view class="picker-mask" v-if="showWorkerPicker" @click="showWorkerPicker = false">
        <view class="picker-sheet" @click.stop>
          <view class="picker-header">
            <text class="picker-cancel" @click="showWorkerPicker = false">取消</text>
            <text class="picker-title">选择人数</text>
            <text class="picker-confirm" @click="confirmWorker">确定</text>
          </view>
          <picker-view
            class="picker-view"
            :value="workerPickerIndex"
            @change="onWorkerChange"
          >
            <picker-view-column>
              <view class="picker-item" v-for="n in 10" :key="n"><text>{{ n }}</text></view>
            </picker-view-column>
          </picker-view>
        </view>
      </view>

      <view class="form-item">
        <view class="form-label">明日计划</view>
        <textarea
          class="form-textarea"
          v-model="form.tomorrow_plan"
          placeholder="描述明日施工计划..."
          :maxlength="200"
        ></textarea>
      </view>

      <view class="form-item">
        <view class="form-label">现场备注</view>
        <textarea
          class="form-textarea"
          v-model="form.note"
          placeholder="现场问题、材料情况等..."
          :maxlength="200"
        ></textarea>
      </view>
    </view>

    <!-- 照片上传 -->
    <view class="form-card">
      <view class="form-label">现场照片（自动加水印）</view>
      <view class="photo-grid">
        <view class="photo-item" v-for="(img, idx) in photos" :key="idx">
          <image class="photo-img" :src="img" mode="aspectFill" @click="previewImg(idx)"></image>
          <view class="photo-del" @click="delPhoto(idx)">✕</view>
          <view class="photo-uploading" v-if="uploadingPhotoIdx === idx">
            <view class="photo-uploading-icon">⟳</view>
          </view>
        </view>
        <button class="photo-add" type="button" @click.stop="choosePhoto($event)" :disabled="choosingPhoto">
          <text class="photo-add-icon">📷</text>
          <text class="photo-add-text">添加照片</text>
        </button>
      </view>
    </view>

    <!-- 上传遮罩层 -->
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

    <!-- 提交 -->
    <view class="submit-bar">
      <view class="btn btn-primary btn-block" :class="{ loading: submitting }" @click="submit">
        <text v-if="!submitting">提交</text>
        <text v-else>提交中...</text>
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, reactive, onMounted } from "vue";
import { useUserStore } from "@/stores/user";
import VoiceInput from "@/components/voice-input.vue";

const projectId = ref(0);
const projectName = ref('');
const userStore = useUserStore();
const photos = ref([]);
const submitting = ref(false);
const showWorkerPicker = ref(false);
const workerPickerIndex = ref([0]);
const choosingPhoto = ref(false);
const uploadingPhotoIdx = ref(-1); // 哪个图片正在上传中（显示转圈）

// 上传进度遮罩状态
const uploadProgress = reactive({
  visible: false,
  text: '正在上传...',
  total: 0,
  done: 0,
  percent: 0,
});

const workTypeOptions = ['水电工', '泥瓦工', '木工', '油漆工', '钢筋工', '杂工'];

// 选择施工工种（追加到输入框）
const selectWorkType = (t) => {
  if (form.work_type) {
    // 已有时去重再追加
    const existing = form.work_type.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (!existing.includes(t)) {
      form.work_type = [...existing, t].join('、');
    }
  } else {
    form.work_type = t;
  }
};

// 人数滚轮变化
const onWorkerChange = (e) => {
  workerPickerIndex.value = e.detail.value;
};

// 确认人数
const confirmWorker = () => {
  form.worker_count = workerPickerIndex.value[0] + 1;
  showWorkerPicker.value = false;
};

// AI整理语音输入的文字（目前H5端直接使用原始文字，APP端可扩展）
const handleAiOrganize = (text, field) => {
  if (!text) return;
  // 目前H5端Web Speech API识别出来的文字已经是中文，可直接使用
  // 这里预留AI整理的扩展点，未来可调用后端AI接口优化格式
  uni.showToast({ title: '已识别', icon: 'success', duration: 1000 });
};

const form = reactive({
  content: '',
  worker_count: '',
  work_type: '',
  tomorrow_plan: '',
  note: '',
});

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

const previewImg = (idx) => {
  const urls = photos.value.map(p => {
    if (p.startsWith('/uploads/') || p.startsWith('http')) return p;
    return p;
  });
  uni.previewImage({ urls, current: idx });
};

const delPhoto = (idx) => {
  photos.value.splice(idx, 1);
};

const submit = async () => {
  if (!form.content.trim()) {
    uni.showToast({ title: '请填写施工内容', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    const userInfo = uni.getStorageSync('userInfo');
    console.log('提交日志 - userInfo:', userInfo);
    console.log('提交日志 - projectId:', projectId.value);
    console.log('提交日志 - content:', form.content);
    console.log('提交日志 - photos:', photos.value);

    // photos.value 里已经是上传后的服务器URL，无需再上传
    console.log('上传完成，photoUrls:', photos.value);
    console.log('准备提交到 /api/project-logs');
    const res = await uni.request({
      url: "/api/project-logs",
      method: "POST",
      data: {
        project_id: projectId.value,
        content: form.content,
        operator: userInfo?.name || userInfo?.username || '未知',
        images: JSON.stringify(photos.value),
        worker_count: form.worker_count,
        work_type: form.work_type,
        tomorrow_plan: form.tomorrow_plan,
        note: form.note,
      },
    });
    console.log('提交结果:', res);

    uni.showToast({ title: '日志已提交', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 1500);
  } catch (e) {
    console.error('提交失败:', e);
    uni.showToast({ title: '提交失败: ' + (e.message || e), icon: 'none' });
  } finally {
    submitting.value = false;
  }
};

onMounted(async () => {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = (current).options || {};
  projectId.value = parseInt(options.projectId || '0');

  // 获取项目名称
  if (projectId.value) {
    try {
      const token = uni.getStorageSync("token");
      const userInfo = uni.getStorageSync('userInfo');
      const res = await uni.request({
        url: "/api/projects",
        header: { 
          Authorization: token,
          'x-user-role': userStore.state.role_name,
          'x-user-id': String(userStore.state.id),

        },
      });
      const data = res.data;
      if (Array.isArray(data)) {
        const p = data.find((x) => x.id === projectId.value);
        if (p) projectName.value = p.name;
      }
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



.project-tip {
  font-size: 13px;
  color: #1E3A5F;
  background: #DBEAFE;
  padding: 8px 14px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.form-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
}

.form-item {
  margin-bottom: 16px;
}

.form-item:last-child {
  margin-bottom: 0;
}

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
  color: #1A1F36;
  box-sizing: border-box;
  min-height: 44px;
}

.form-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid #E5E7EB;
  border-radius: 8px;
  font-size: 14px;
  color: #1A1F36;
  box-sizing: border-box;
  min-height: 100px;
  resize: none;
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

.form-input:focus, .form-textarea:focus {
  outline: none;
  border-color: #1E3A5F;
}

/* 施工工种标签 */
.work-type-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.work-type-tag {
  font-size: 12px;
  color: #1E3A5F;
  background: #E8F4FF;
  padding: 4px 12px;
  border-radius: 14px;
  cursor: pointer;
}

/* 到场人数选择器 */
.worker-count-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1.5px solid #E5E7EB;
  border-radius: 8px;
  font-size: 14px;
  color: #1A1F36;
  cursor: pointer;
}

.worker-count-picker:focus {
  border-color: #1E3A5F;
  outline: none;
}

.picker-value { color: #1A1F36; }
.picker-arrow { color: #9CA3AF; font-size: 10px; }

/* 人数滚轮弹窗 */
.picker-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 999;
  display: flex;
  align-items: flex-end;
}

.picker-sheet {
  width: 100%;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #F0F0F0;
}

.picker-cancel { font-size: 14px; color: #9CA3AF; }
.picker-title { font-size: 15px; font-weight: 600; color: #1A1F36; }
.picker-confirm { font-size: 14px; color: #1E3A5F; font-weight: 600; }

.picker-view {
  height: 200px;
  text-align: center;
}

.picker-item {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #1A1F36;
}

.char-count {
  font-size: 11px;
  color: #9CA3AF;
  display: block;
  text-align: right;
  margin-top: 4px;
}

/* 照片 */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 8px;
}

.photo-item {
  position: relative;
  aspect-ratio: 1;
}

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

/* 上传遮罩层 */
.upload-overlay {
  position: fixed;
  inset: 0;
  background: rgba(255,255,255,0.92);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 200px;
}

.upload-overlay-spinner {
  font-size: 48px;
  color: #1E3A5F;
  animation: spin 0.8s linear infinite;
}

.upload-overlay-text {
  font-size: 14px;
  color: #374151;
}

.upload-overlay-bar-wrap {
  width: 100%;
  height: 6px;
  background: #E5E7EB;
  border-radius: 3px;
  overflow: hidden;
}

.upload-overlay-bar {
  height: 100%;
  background: #1E3A5F;
  border-radius: 3px;
  transition: width 0.2s ease;
}

.upload-overlay-percent {
  font-size: 20px;
  font-weight: 700;
  color: #1E3A5F;
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

.photo-add-icon { font-size: 24px; margin-bottom: 4px; }
.photo-add-text { font-size: 11px; color: #9CA3AF; }

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

.btn.loading {
  opacity: 0.7;
}
/* 导航栏 */
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

.nav-back {
  font-size: 28px;
  font-weight: 300;
  width: 40px;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
}

.nav-placeholder {
  width: 40px;
}

</style>
