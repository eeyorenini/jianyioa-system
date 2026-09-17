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
        <input class="form-input" v-model="form.title" placeholder="简要描述问题" />
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
            :class="`level-${lv.value}`"
            :classList="{ selected: form.level === lv.value }"
            @click="form.level = lv.value"
          >
            <text>{{ lv.label }}</text>
          </view>
        </view>
      </view>

      <view class="form-item">
        <view class="form-label">问题描述</view>
        <textarea class="form-textarea" v-model="form.description" placeholder="详细描述问题..."></textarea>
      </view>

      <view class="form-item">
        <view class="form-label">整改截止时间</view>
        <input class="form-input" v-model="form.deadline" type="date" />
      </view>
    </view>

    <!-- 问题照片 -->
    <view class="form-card">
      <view class="form-label">问题照片（标注缺陷）</view>
      <view class="photo-grid">
        <view class="photo-item" v-for="(img, idx) in photos" :key="idx">
          <image class="photo-img" :src="img" mode="aspectFill"></image>
          <view class="photo-del" @click="photos.splice(idx, 1)">✕</view>
        </view>
        <view class="photo-add" @click="addPhoto">
          <text class="photo-add-icon">📷</text>
          <text class="photo-add-text">拍照</text>
        </view>
      </view>
    </view>

    <view class="submit-bar">
      <view class="btn btn-primary btn-block" @click="submit">提交巡检</view>
    </view>
  </view>
</template>

<script setup >
import { ref, reactive, onMounted } from "vue";

const projectId = ref(0);
const projectName = ref('');
const photos = ref([]);

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

const addPhoto = () => {
  uni.chooseImage({ count: 9, sourceType: ['camera', 'album'], success: (r) => {
    photos.value.push(...r.tempFilePaths.map(f => f));
  }});
};

const submit = async () => {
  if (!form.title.trim()) {
    uni.showToast({ title: '请填写问题标题', icon: 'none' }); return;
  }
  try {
    const token = uni.getStorageSync("token");
    await uni.request({
      url: "/api/inspections",
      method: "POST",
      header: { Authorization: token },
      data: {
        project_id: projectId.value,
        title: form.title,
        category: form.category,
        location: form.location,
        level: form.level,
        description: form.description,
        deadline: form.deadline,
      },
    });
    uni.showToast({ title: '已提交', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 1500);
  } catch (e) {
    uni.showToast({ title: '提交失败', icon: 'none' });
  }
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
