<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">新建收支</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="form-card">
      <view class="form-item">
        <text class="form-label">类型</text>
        <radio-group @change="onTypeChange">
          <label class="type-option"><radio value="income" color="#4CAF50" /> 收入</label>
          <label class="type-option"><radio value="expense" color="#F44336" /> 支出</label>
        </radio-group>
      </view>
      <view class="form-item">
        <text class="form-label">项目</text>
        <picker :value="projectIndex" :range="projects" range-key="name" @change="onProjectChange">
          <view class="picker-value">{{ selectedProject?.name || '请选择项目' }} <text class="iconfont icon-arrow-down"></text></view>
        </picker>
      </view>
      <view class="form-item">
        <text class="form-label">金额</text>
        <input class="form-input" v-model="form.amount" type="digit" placeholder="请输入金额" />
      </view>
      <view class="form-item">
        <text class="form-label">对方</text>
        <input class="form-input" v-model="form.payee" placeholder="客户/供应商/员工" />
      </view>
      <view class="form-item">
        <text class="form-label">类别</text>
        <picker :value="categoryIndex" :range="categories" @change="onCategoryChange">
          <view class="picker-value">{{ categories[categoryIndex] || '请选择类别' }} <text class="iconfont icon-arrow-down"></text></view>
        </picker>
      </view>
      <view class="form-item">
        <text class="form-label">日期</text>
        <picker mode="date" :value="form.date" @change="onDateChange">
          <view class="picker-value">{{ form.date || '请选择日期' }} <text class="iconfont icon-arrow-down"></text></view>
        </picker>
      </view>
      <view class="form-item" style="flex-direction:column; align-items:flex-start">
        <text class="form-label" style="width:100%; margin-bottom:12rpx">备注</text>
        <textarea class="form-textarea" v-model="form.remark" placeholder="备注信息" rows="3" style="width:100%" />
      </view>
    </view>

    <view class="submit-bar">
      <button class="btn-primary" :disabled="submitting" @click="submit">提交</button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const projects = ref([])
const projectIndex = ref(-1)
const selectedProject = ref(null)
const categoryIndex = ref(-1)
const submitting = ref(false)
const form = ref({ type: 'income', project_id: '', amount: '', payee: '', category: '', date: '', remark: '' })

const incomeCategories = ['工程款', '定金', '尾款', '退款', '其他']
const expenseCategories = ['材料费', '人工费', '运费', '水电费', '管理费', '税费', '退款', '其他']
const categories = ref(incomeCategories)

onMounted(() => {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const options = (current || {}).options || {}
  if (options.projectId) {
    form.value.project_id = options.projectId
    if (options.projectName) {
      selectedProject.value = { id: options.projectId, name: decodeURIComponent(options.projectName) }
      projectIndex.value = -1
    }
  }
  uni.request({
    url: '/api/projects/list',
    data: { page_size: 100 },
    success: (res) => {
      if (res.data.code === 0) {
        projects.value = res.data.data?.list || []
        if (options.projectId && options.projectName) {
          const name = decodeURIComponent(options.projectName)
          const idx = projects.value.findIndex((p) => String(p.id) === String(options.projectId))
          if (idx >= 0) projectIndex.value = idx
          selectedProject.value = { id: options.projectId, name }
        }
      }
    }
  })
})

function onTypeChange(e) {
  form.value.type = e.detail.value
  categories.value = e.detail.value === 'income' ? incomeCategories : expenseCategories
  categoryIndex.value = -1
  form.value.category = ''
}

function onProjectChange(e) {
  projectIndex.value = e.detail.value
  selectedProject.value = projects.value[projectIndex.value]
  form.value.project_id = selectedProject.value?.id || ''
}

function onCategoryChange(e) {
  categoryIndex.value = e.detail.value
  form.value.category = categories.value[categoryIndex.value]
}

function onDateChange(e) { form.value.date = e.detail.value }

function goBack() { uni.navigateBack() }

function submit() {
  if (!form.value.amount) { uni.showToast({ title: '请填写金额', icon: 'none' }); return }
  if (!form.value.date) { uni.showToast({ title: '请选择日期', icon: 'none' }); return }
  submitting.value = true
  uni.request({
    url: '/api/finance/add',
    method: 'POST',
    data: form.value,
    success: (res) => {
      if (res.data.code === 0) {
        uni.showToast({ title: '提交成功', icon: 'success' })
        setTimeout(() => { uni.navigateBack() }, 1500)
      } else {
        uni.showToast({ title: res.data.msg || '提交失败', icon: 'none' })
      }
    },
    complete: () => { submitting.value = false }
  })
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding-bottom: 120rpx; }



.form-card { margin: 20rpx; background: #fff; border-radius: 16rpx; padding: 30rpx; }
.form-item { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid #f5f5f5; }
.form-item:last-child { border-bottom: none; }
.form-label { width: 160rpx; font-size: 26rpx; color: #666; flex-shrink: 0; }
.form-input { flex: 1; font-size: 28rpx; color: #333; }
.form-textarea { font-size: 28rpx; color: #333; border: 1rpx solid #eee; border-radius: 8rpx; padding: 16rpx; resize: none; }
.picker-value { flex: 1; font-size: 28rpx; color: #333; display: flex; justify-content: space-between; align-items: center; }
.type-option { margin-right: 40rpx; font-size: 28rpx; }
.submit-bar { position: fixed; bottom: 0; left: 0; right: 0; padding: 20rpx 40rpx; background: #fff; box-shadow: 0 -2rpx 10rpx rgba(0,0,0,0.05); }
.btn-primary { background: #1E3A5F; color: #fff; border-radius: 40rpx; font-size: 28rpx; height: 88rpx; line-height: 88rpx; }
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
