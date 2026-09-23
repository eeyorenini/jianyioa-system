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
        <view class="form-label">到场人数</view>
        <input class="form-input" v-model="form.worker_count" type="number" placeholder="如：3人" />
      </view>

      <view class="form-item">
        <view class="form-label">施工工种</view>
        <input class="form-input" v-model="form.work_type" placeholder="如：水电工、泥瓦工" />
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
        </view>
        <view class="photo-add" @click="choosePhoto">
          <text class="photo-add-icon">📷</text>
          <text class="photo-add-text">添加照片</text>
        </view>
      </view>
    </view>

    <!-- 提交 -->
    <view class="submit-bar">
      <view class="btn btn-primary btn-block" :class="{ loading: submitting }" @click="submit">
        <text v-if="!submitting">提交日志</text>
        <text v-else>提交中...</text>
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, reactive, onMounted } from "vue";
import VoiceInput from "@/components/voice-input.vue";

const projectId = ref(0);
const projectName = ref('');
const photos = ref([]);
const submitting = ref(false);

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

const choosePhoto = () => {
  uni.chooseImage({
    count: 9 - photos.value.length,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      photos.value.push(...res.tempFilePaths.map(f => f));
    },
  });
};

const previewImg = (idx) => {
  uni.previewImage({ urls: photos.value, current: idx });
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

    const photoUrls = [];
    // 先上传照片
    for (const path of photos.value) {
      console.log('上传图片:', path);
      try {
        const uploadRes = await uni.uploadFile({
          url: '/api/upload',
          filePath: path,
          name: 'file',
        });
        console.log('上传结果:', uploadRes);
        const data = JSON.parse(uploadRes.data);
        if (data.url) photoUrls.push(data.url);
      } catch (uploadErr) {
        console.error('上传失败:', uploadErr);
      }
    }

    console.log('准备提交到 /api/project-logs');
    const res = await uni.request({
      url: "/api/project-logs",
      method: "POST",
      data: {
        project_id: projectId.value,
        content: form.content,
        operator: userInfo?.name || userInfo?.username || '未知',
        images: JSON.stringify(photoUrls),
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
      const res = await uni.request({
        url: "/api/projects",
        header: { Authorization: token },
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

.photo-add {
  aspect-ratio: 1;
  border: 1.5px dashed #D1D5DB;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
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
