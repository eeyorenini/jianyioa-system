<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">新建验收</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 项目信息 -->
    <view class="project-banner" v-if="projectName">
      <text>📁 {{ projectName }}</text>
    </view>

    <!-- 表单 -->
    <view class="form-card">
      <!-- 验收标题 -->
      <view class="form-item">
        <view class="form-label">验收标题 <text class="required">*</text></view>
        <input class="form-input" v-model="form.title" placeholder="如：水电工程隐蔽验收" />
      </view>

      <!-- 验收类型 -->
      <view class="form-item">
        <view class="form-label">验收类型</view>
        <picker :range="typeOptions" @change="onTypeChange">
          <view class="picker-wrap">
            <text :class="form.check_type ? 'picker-value' : 'picker-placeholder'">
              {{ form.check_type || '请选择验收类型' }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 验收日期 -->
      <view class="form-item">
        <view class="form-label">验收日期</view>
        <picker mode="date" :value="form.check_date" @change="onDateChange">
          <view class="picker-wrap">
            <text :class="form.check_date ? 'picker-value' : 'picker-placeholder'">
              {{ form.check_date || '请选择日期' }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 验收人 -->
      <view class="form-item">
        <view class="form-label">验收人</view>
        <picker :range="inspectorOptions" range-key="name" @change="onInspectorChange">
          <view class="picker-wrap">
            <text :class="form.inspector_id ? 'picker-value' : 'picker-placeholder'">
              {{ selectedInspectorName || '请选择验收人' }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 验收结果 -->
      <view class="form-item">
        <view class="form-label">验收结果</view>
        <picker :range="resultOptions" @change="onResultChange">
          <view class="picker-wrap">
            <text :class="form.result ? 'picker-value' : 'picker-placeholder'">
              {{ form.resultText || '请选择结果' }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 备注 -->
      <view class="form-item">
        <view class="form-label">备注说明</view>
        <textarea class="form-textarea" v-model="form.notes" placeholder="验收情况说明、整改要求等" />
      </view>
    </view>

    <!-- 提交按钮 -->
    <view class="bottom-bar">
      <view class="btn-submit" :class="{ loading }" @click="handleSubmit">
        <text v-if="!loading">提 交</text>
        <text v-else>提交中...</text>
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, computed, onMounted } from "vue";

const projectId = ref(0);
const projectName = ref('');
const loading = ref(false);
const employees = ref([]);

const typeOptions = ['材料进场验收', '隐蔽工程验收', '节点验收', '竣工验收', '其他'];
const resultOptions = [
  { label: '通过', value: 'passed' },
  { label: '整改中', value: 'rework' },
  { label: '不通过', value: 'failed' },
];

const form = reactive({
  title: '',
  check_type: '',
  check_date: '',
  inspector_id: null,
  result: '',
  resultText: '',
  notes: '',
});

const inspectorOptions = computed(() => employees.value);
const selectedInspectorName = computed(() => {
  if (!form.inspector_id) return '';
  return employees.value.find(e => e.id === form.inspector_id)?.name || '';
});

const onTypeChange = (e) => {
  form.check_type = typeOptions[e.detail.value];
};

const onDateChange = (e) => {
  form.check_date = e.detail.value;
};

const onInspectorChange = (e) => {
  form.inspector_id = employees.value[e.detail.value]?.id || null;
};

const onResultChange = (e) => {
  const sel = resultOptions[e.detail.value];
  form.result = sel.value;
  form.resultText = sel.label;
};

const handleSubmit = async () => {
  if (!form.title.trim()) {
    uni.showToast({ title: '请填写验收标题', icon: 'none' });
    return;
  }
  if (!projectId.value) {
    uni.showToast({ title: '未指定项目', icon: 'none' });
    return;
  }

  loading.value = true;
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      url: '/api/acceptance',
      method: 'POST',
      header: { 'Content-Type': 'application/json', Authorization: token },
      data: {
        project_id: projectId.value,
        title: form.title,
        check_type: form.check_type,
        check_date: form.check_date,
        inspector_id: form.inspector_id,
        result: form.result,
        notes: form.notes,
      },
    });
    const data = res.data;
    if (data.id || data.message?.includes('成功')) {
      uni.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => uni.navigateBack(), 1500);
    } else {
      uni.showToast({ title: data.error || '提交失败', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: '提交失败：' + (e.message || '网络错误'), icon: 'none' });
  } finally {
    loading.value = false;
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
  // 加载员工列表
  try {
    const res = await uni.request({ url: '/api/employees', header: { Authorization: uni.getStorageSync('token') } });
    const data = res.data;
    if (Array.isArray(data)) employees.value = data;
  } catch (e) {}
});

const goBack = () => uni.navigateBack();
</script>

<script >
import { reactive } from 'vue';
export default { options: { styleIsolation: 'shared' } };
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 100px;
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
.nav-title { font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.project-banner {
  background: #fff;
  padding: 10px 16px;
  font-size: 13px;
  color: #1E3A5F;
  font-weight: 500;
  border-bottom: 1px solid #F3F4F6;
}

.form-card {
  margin: 16px;
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
}

.form-item {
  padding: 14px 18px;
  border-bottom: 1px solid #F5F7FA;
}

.form-item:last-child { border-bottom: none; }

.form-label {
  font-size: 13px;
  color: #6B7280;
  font-weight: 500;
  margin-bottom: 8px;
}

.required { color: #EF4444; }

.form-input {
  width: 100%;
  font-size: 15px;
  color: #1A1F36;
  background: transparent;
  height: 32px;
  line-height: 32px;
}

.form-textarea {
  width: 100%;
  font-size: 15px;
  color: #1A1F36;
  background: #F9FAFB;
  border-radius: 8px;
  padding: 10px 12px;
  box-sizing: border-box;
  min-height: 80px;
  border: 1px solid #E5E7EB;
}

.picker-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
}

.picker-value { font-size: 15px; color: #1A1F36; }
.picker-placeholder { font-size: 15px; color: #D1D5DB; }
.picker-arrow { font-size: 18px; color: #D1D5DB; }

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
