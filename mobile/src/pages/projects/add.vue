<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">新建项目</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 表单 -->
    <view class="form-card">
      <!-- 项目名称 -->
      <view class="form-item">
        <view class="form-label">项目名称 <text class="required">*</text></view>
        <input class="form-input" v-model="form.name" placeholder="请输入项目名称" />
      </view>

      <!-- 客户选择 -->
      <view class="form-item">
        <view class="form-label">客户 <text class="required">*</text></view>
        <picker :range="customers" range-key="name" @change="onCustomerChange">
          <view class="picker-wrap">
            <text :class="form.customer_id ? 'picker-value' : 'picker-placeholder'">
              {{ selectedCustomerName || '请选择客户' }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 自动带出信息 -->
      <view class="auto-info" v-if="selectedCustomerPhone">
        <view class="auto-row">
          <text class="auto-label">客户电话</text>
          <text class="auto-value">{{ selectedCustomerPhone }}</text>
        </view>
        <view class="auto-row" v-if="selectedCustomerAddress">
          <text class="auto-label">楼盘地址</text>
          <text class="auto-value">{{ selectedCustomerAddress }}</text>
        </view>
      </view>

      <!-- 设计师 -->
      <view class="form-item">
        <view class="form-label">设计师</view>
        <picker :range="designers" range-key="name" @change="onDesignerChange">
          <view class="picker-wrap">
            <text :class="form.designer_id ? 'picker-value' : 'picker-placeholder'">
              {{ getEmployeeName(form.designer_id, designers) || '请选择设计师' }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 工程监理 -->
      <view class="form-item">
        <view class="form-label">工程监理</view>
        <picker :range="supervisors" range-key="name" @change="onSupervisorChange">
          <view class="picker-wrap">
            <text :class="form.supervisor_id ? 'picker-value' : 'picker-placeholder'">
              {{ getEmployeeName(form.supervisor_id, supervisors) || '请选择监理' }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 工长 -->
      <view class="form-item">
        <view class="form-label">工长</view>
        <picker :range="managers" range-key="name" @change="onManagerChange">
          <view class="picker-wrap">
            <text :class="form.manager_id ? 'picker-value' : 'picker-placeholder'">
              {{ getEmployeeName(form.manager_id, managers) || '请选择工长' }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 预算金额 -->
      <view class="form-item">
        <view class="form-label">预算金额</view>
        <view class="budget-wrap">
          <text class="budget-symbol">¥</text>
          <input class="form-input budget-input" type="digit" v-model="form.budget" placeholder="0.00" />
        </view>
      </view>

      <!-- 状态 -->
      <view class="form-item">
        <view class="form-label">状态</view>
        <picker :range="statusOptions" @change="onStatusChange">
          <view class="picker-wrap">
            <text class="picker-value">{{ form.status || '开工准备' }}</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 日期 -->
      <view class="form-row">
        <view class="form-item half">
          <view class="form-label">开始日期</view>
          <picker mode="date" :value="form.start_date" @change="onStartDateChange">
            <view class="picker-wrap">
              <text :class="form.start_date ? 'picker-value' : 'picker-placeholder'">
                {{ form.start_date || '请选择' }}
              </text>
            </view>
          </picker>
        </view>
        <view class="form-item half">
          <view class="form-label">结束日期</view>
          <picker mode="date" :value="form.end_date" @change="onEndDateChange">
            <view class="picker-wrap">
              <text :class="form.end_date ? 'picker-value' : 'picker-placeholder'">
                {{ form.end_date || '请选择' }}
              </text>
            </view>
          </picker>
        </view>
      </view>

      <!-- 节点模板 -->
      <view class="form-item">
        <view class="form-label">节点模板</view>
        <picker :range="templateList" range-key="name" @change="onTemplateChange">
          <view class="picker-wrap">
            <text :class="form.template_id ? 'picker-value' : 'picker-placeholder'">
              {{ selectedTemplateName || '请选择节点模板（可选）' }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 备注 -->
      <view class="form-item">
        <view class="form-label">备注</view>
        <textarea class="form-textarea" v-model="form.description" placeholder="请输入备注信息" />
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

<script setup>
import { ref, reactive, computed, onMounted } from "vue";

const loading = ref(false);
const customers = ref([]);
const employees = ref([]);
const templateList = ref([]);

// 状态
const statusOptions = ['开工准备', '进行中', '已暂停', '已完成', '已验收'];
const form = reactive({
  name: '',
  customer_id: null,
  designer_id: null,
  supervisor_id: null,
  manager_id: null,
  budget: '',
  status: '开工准备',
  start_date: '',
  end_date: '',
  template_id: null,
  description: '',
});

// 筛选各角色员工
const designers = computed(() => employees.value.filter(e => (e.position || '').includes('设计')));
const supervisors = computed(() => employees.value.filter(e => (e.position || '').includes('监理')));
const managers = computed(() =>
  employees.value.filter(e =>
    (e.position || '').includes('工长') || (e.role_name || '').includes('工长') || (e.role_name || '').includes('项目经理')
  )
);

const selectedCustomer = computed(() => customers.value.find(c => c.id === form.customer_id));
const selectedCustomerName = computed(() => (selectedCustomer.value && selectedCustomer.value.name) || '');
const selectedCustomerPhone = computed(() => (selectedCustomer.value && selectedCustomer.value.phone) || '');
const selectedCustomerAddress = computed(() => (selectedCustomer.value && selectedCustomer.value.address) || '');
const selectedTemplateName = computed(() => {
  if (!form.template_id) return '';
  const tpl = templateList.value.find(t => t.id === form.template_id);
  return (tpl && tpl.name) || '';
});

const getEmployeeName = (id, list) => {
  if (!id) return '';
  const emp = list.find(e => e.id === id);
  return (emp && emp.name) || '';
};

const goBack = () => {
  uni.navigateBack();
};

const onCustomerChange = (e) => {
  const idx = e.detail.value;
  form.customer_id = customers.value[idx]?.id || null;
};

const onDesignerChange = (e) => {
  const idx = e.detail.value;
  form.designer_id = designers.value[idx]?.id || null;
};

const onSupervisorChange = (e) => {
  const idx = e.detail.value;
  form.supervisor_id = supervisors.value[idx]?.id || null;
};

const onManagerChange = (e) => {
  const idx = e.detail.value;
  form.manager_id = managers.value[idx]?.id || null;
};

const onStatusChange = (e) => {
  const idx = e.detail.value;
  form.status = statusOptions[idx] || '开工准备';
};

const onStartDateChange = (e) => {
  form.start_date = e.detail.value;
};

const onEndDateChange = (e) => {
  form.end_date = e.detail.value;
};

const onTemplateChange = (e) => {
  const idx = e.detail.value;
  form.template_id = templateList.value[idx]?.id || null;
};

const handleSubmit = async () => {
  if (!form.name.trim()) {
    uni.showToast({ title: '请填写项目名称', icon: 'none' });
    return;
  }
  if (!form.customer_id) {
    uni.showToast({ title: '请选择客户', icon: 'none' });
    return;
  }

  loading.value = true;
  try {
    const token = uni.getStorageSync('token');
    const userInfo = uni.getStorageSync('userInfo');
    const res = await uni.request({
      url: '/api/projects',
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'x-user-id': userInfo?.id || 1,
        'Authorization': token,
      },
      data: {
        name: form.name,
        customer_id: form.customer_id,
        designer_id: form.designer_id,
        supervisor_id: form.supervisor_id,
        manager_id: form.manager_id,
        budget: form.budget ? parseFloat(form.budget) : null,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        description: form.description || null,
        template_id: form.template_id || null,
      },
    });
    const data = res.data;
    if (data.id || data.message?.includes('成功')) {
      uni.showToast({ title: '创建成功', icon: 'success' });
      setTimeout(() => {
        uni.navigateBack();
      }, 1500);
    } else {
      uni.showToast({ title: data.error || '创建失败', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: '创建失败：' + (e.message || '网络错误'), icon: 'none' });
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  // 加载客户列表
  try {
    const resC = await uni.request({ url: '/api/customers' });
    const dataC = resC.data;
    if (Array.isArray(dataC)) {
      customers.value = dataC;
    }
  } catch (e) {}

  // 加载员工列表
  try {
    const resE = await uni.request({ url: '/api/employees' });
    const dataE = resE.data;
    if (Array.isArray(dataE)) {
      employees.value = dataE;
    }
  } catch (e) {}

  // 加载节点模板列表
  try {
    const resT = await uni.request({ url: '/api/progress-node-templates' });
    const dataT = resT.data;
    if (Array.isArray(dataT)) {
      templateList.value = dataT;
    }
  } catch (e) {}
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 100px;
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
  font-size: 17px;
  font-weight: 600;
}

.nav-placeholder {
  width: 40px;
}

/* 表单卡片 */
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

.form-item:last-child {
  border-bottom: none;
}

.form-row {
  display: flex;
}

.form-item.half {
  flex: 1;
  border-bottom: none;
}

.form-item.half:first-child {
  border-right: 1px solid #F5F7FA;
}

.form-label {
  font-size: 13px;
  color: #6B7280;
  font-weight: 500;
  margin-bottom: 8px;
}

.required {
  color: #EF4444;
}

.form-input {
  width: 100%;
  font-size: 15px;
  color: #1A1F36;
  background: transparent;
  height: 32px;
  line-height: 32px;
}

.form-input::placeholder {
  color: #D1D5DB;
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

.budget-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}

.budget-symbol {
  font-size: 16px;
  color: #1A1F36;
  font-weight: 600;
}

.budget-input {
  flex: 1;
}

/* Picker选择框 */
.picker-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
}

.picker-value {
  font-size: 15px;
  color: #1A1F36;
}

.picker-placeholder {
  font-size: 15px;
  color: #D1D5DB;
}

.picker-arrow {
  font-size: 18px;
  color: #D1D5DB;
}

/* 自动带出信息 */
.auto-info {
  background: #F9FAFB;
  margin: 0 18px 4px;
  padding: 10px 14px;
  border-radius: 8px;
}

.auto-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
}

.auto-label {
  font-size: 12px;
  color: #9CA3AF;
}

.auto-value {
  font-size: 12px;
  color: #6B7280;
}

/* 底部提交 */
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

.btn-submit.loading {
  opacity: 0.7;
}
</style>
