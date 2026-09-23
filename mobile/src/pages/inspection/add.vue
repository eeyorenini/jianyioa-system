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
            <VoiceInput v-model="form.description" @ai-organize="handleAiOrganize" />
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
        <!-- 照片 -->
        <view class="photo-item" v-for="(img, idx) in photos" :key="'photo_' + idx">
          <video v-if="isVideo(img)" class="photo-img" :src="img" mode="aspectFill"></video>
          <image v-else class="photo-img" :src="img" mode="aspectFill"></image>
          <view class="photo-del" @click="removeMedia(idx)">✕</view>
        </view>
        <!-- 添加按钮 -->
        <view class="photo-add" @click="showMediaOptions">
          <text class="photo-add-icon">📷</text>
          <text class="photo-add-text">拍照/录像</text>
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

<script setup >
import { ref, reactive, watch, onMounted } from "vue";
import VoiceInput from "@/components/voice-input.vue";

const projectId = ref(0);
const projectName = ref('');
const photos = ref([]);
const submitting = ref(false);

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

// 自动生成标题：项目名 + 问题分类 + 日期
const generateTitle = () => {
  const today = new Date().toISOString().split('T')[0];
  const catPrefix = form.category ? `[${form.category}] ` : '';
  form.title = `${projectName.value || '未知项目'} ${catPrefix}${today}`;
};

// 监听分类变化，重新生成标题
watch(() => form.category, generateTitle);

// AI整理语音输入的文字
const handleAiOrganize = (text) => {
  if (!text) return;
  uni.showToast({ title: '已识别', icon: 'success', duration: 1000 });
};

// 日期选择
const onDeadlineChange = (e) => {
  form.deadline = e.detail.value;
};

// 判断是否是视频
const isVideo = (url) => url && (url.startsWith('blob:') || url.startsWith('http') && (url.includes('.mp4') || url.includes('.mov') || url.includes('.3gp') || url.includes('wxfile')));

// 判断是否是视频
const showMediaOptions = () => {
  uni.showActionSheet({
    itemList: ['📷 拍照', '🎬 录像', '🖼 从相册选择'],
    success: (res) => {
      if (res.tapIndex === 0) {
        // 拍照
        addPhoto();
      } else if (res.tapIndex === 1) {
        // 录像
        addVideo();
      } else {
        // 相册
        addFromAlbum();
      }
    }
  });
};

// 拍照
const addPhoto = () => {
  uni.chooseImage({ count: 1, sourceType: ['camera'], success: (r) => {
    compressAndAdd(r.tempFilePaths[0], 'image');
  }});
};

// 录像
const addVideo = () => {
  uni.chooseVideo({
    sourceType: ['camera'],
    maxDuration: 60,
    success: (r) => {
      if (r.tempFilePath) {
        compressAndAdd(r.tempFilePath, 'video');
      }
    }
  });
};

// 从相册选择（照片+视频混合）
const addFromAlbum = () => {
  // 先选照片
  uni.chooseImage({
    count: 9,
    sourceType: ['album'],
    success: (r) => {
      r.tempFilePaths.forEach(p => compressAndAdd(p, 'image'));
    }
  });
};

// 删除媒体
const removeMedia = (idx) => {
  photos.value.splice(idx, 1);
};

// 压缩并添加（图片压缩，视频暂不压缩）
const compressAndAdd = (filePath, type) => {
  if (type === 'image') {
    // 图片压缩
    uni.compressImage({
      src: filePath,
      quality: 80,
      success: (res) => {
        photos.value.push(res.tempFilePath);
      },
      fail: () => {
        // 压缩失败，直接添加原图
        photos.value.push(filePath);
      }
    });
  } else {
    // 视频暂不压缩（uni-app H5 不支持直接压缩），直接添加
    photos.value.push(filePath);
  }
};

// 提交
const submit = async () => {
  if (!form.title.trim()) {
    uni.showToast({ title: '请填写问题标题', icon: 'none' }); return;
  }
  if (submitting.value) return;
  submitting.value = true;
  try {
    const token = uni.getStorageSync("token");

    // 处理图片/视频文件上传
    const imageUrls = [];
    for (const filePath of photos.value) {
      const isVid = isVideo(filePath);
      const ext = isVid ? 'mp4' : 'jpg';
      const mime = isVid ? 'video/mp4' : 'image/jpeg';
      try {
        await new Promise((resolve, reject) => {
          uni.uploadFile({
            url: '/api/upload',
            filePath,
            name: 'file',
            header: { Authorization: token },
            formData: { type: isVid ? 'video' : 'image' },
            timeout: 30000,
            success: (res) => {
              try {
                const data = JSON.parse(res.data);
                if (data.url) imageUrls.push(data.url);
                else if (data.path) imageUrls.push(data.path);
                resolve();
              } catch { resolve(); }
            },
            fail: () => reject(new Error('上传失败')),
          });
        });
      } catch (e) {
        // 单个文件上传失败不影响整体
      }
    }

    // 提交数据
    await new Promise((resolve, reject) => {
      uni.request({
        url: "/api/rectification-issues",
        method: "POST",
        header: { Authorization: token },
        data: {
          project_id: projectId.value,
          project_name: projectName.value,
          title: form.title,
          category: form.category,
          location: form.location,
          level: form.level,
          description: form.description,
          issue_desc: form.description,
          due_date: form.deadline,
          images: imageUrls,
        },
        timeout: 15000,
        success: (res) => {
          if (res.statusCode === 200 || res.statusCode === 201) resolve();
          else reject(new Error('提交失败'));
        },
        fail: () => reject(new Error('请求失败')),
      });
    });

    uni.showToast({ title: '提交成功', icon: 'success', duration: 1200 });
    setTimeout(() => { uni.navigateBack(); }, 1200);
  } catch (e) {
    uni.showToast({ title: '提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};

onMounted(async () => {
  generateTitle();
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
  generateTitle();
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
}

.photo-add-icon { font-size: 22px; margin-bottom: 2px; }
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

.btn-primary {
  background: #1E3A5F;
  color: #fff;
  border-radius: 24px;
  font-size: 16px;
  height: 48px;
  line-height: 48px;
  text-align: center;
  border: none;
  width: 100%;
}
.btn-primary[disabled] { background: #9CA3AF; }
.btn-loading { opacity: 0.8; }

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
