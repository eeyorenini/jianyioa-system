<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">新建派工单</text>
      <view class="nav-placeholder"></view>
    </view>
    <view class="project-banner" v-if="projectName">
      📁 {{ projectName }}
    </view>
    <view class="form-card">
      <view class="form-item">
        <view class="form-label">施工内容 *</view>
        <input class="form-input" v-model="form.content" placeholder="描述施工内容" />
      </view>

      <view class="form-item">
        <view class="form-label">施工地点</view>
        <input class="form-input" v-model="form.location" placeholder="如：主卧" />
      </view>

      <view class="form-item">
        <view class="form-label">指派工人/班组</view>
        <input class="form-input" v-model="form.worker" placeholder="输入工人姓名或班组" />
      </view>

      <view class="form-item">
        <view class="form-label">约定工费</view>
        <input class="form-input" v-model="form.fee" type="number" placeholder="¥0" />
      </view>

      <view class="form-item">
        <view class="form-label">施工开始时间</view>
        <input class="form-input" v-model="form.start_date" type="date" />
      </view>

      <view class="form-item">
        <view class="form-label">施工要求</view>
        <textarea class="form-textarea" v-model="form.requirement" placeholder="补充施工要求..."></textarea>
      </view>
    </view>

    <view class="submit-bar">
      <view class="btn btn-primary btn-block" @click="submit">提交派工</view>
    </view>
  </view>
</template>

<script setup >
import { ref, reactive, onMounted } from "vue";

const projectId = ref(0);
const projectName = ref('');

const form = reactive({
  content: '',
  location: '',
  worker: '',
  fee: '',
  start_date: '',
  requirement: '',
});

const submit = async () => {
  if (!form.content.trim()) {
    uni.showToast({ title: '请填写施工内容', icon: 'none' }); return;
  }
  try {
    const token = uni.getStorageSync("token");
    await uni.request({
      url: "/api/dispatches",
      method: "POST",
      header: { Authorization: token, 'Content-Type': 'application/json' },
      data: { project_id: projectId.value, project_name: projectName.value, ...form },
    });
    uni.showToast({ title: '派工单已创建', icon: 'success' });
    uni.$emit('dispatch-refresh');
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
  }
  if (projectId.value && !projectName.value) {
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
  padding-bottom: 100px;
}

.project-banner {
  font-size: 13px;
  color: #1E3A5F;
  background: #DBEAFE;
  padding: 8px 14px;
  font-weight: 500;
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
