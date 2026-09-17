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
        <textarea
          class="form-textarea"
          v-model="form.content"
          placeholder="描述今日施工内容..."
          :maxlength="500"
        ></textarea>
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

const projectId = ref(0);
const projectName = ref('');
const photos = ref([]);
const submitting = ref(false);

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
    const token = uni.getStorageSync("token");
    // 先上传照片
    const photoUrls = [];
    for (const path of photos.value) {
      const uploadRes = await uni.uploadFile({
        url: '/api/upload',
        filePath: path,
        name: 'file',
        header: { Authorization: token },
      });
      const data = JSON.parse(uploadRes.data);
      if (data.url) photoUrls.push(data.url);
    }

    await uni.request({
      url: "/api/project-logs",
      method: "POST",
      header: { Authorization: token },
      data: {
        project_id: projectId.value,
        action_type: 'note_added',
        description: form.content,
        content: form.content,
        worker_count: form.worker_count,
        work_type: form.work_type,
        tomorrow_plan: form.tomorrow_plan,
        note: form.note,
        photos: photoUrls.join(','),
      },
    });

    uni.showToast({ title: '日志已提交', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 1500);
  } catch (e) {
    uni.showToast({ title: '提交失败', icon: 'none' });
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
