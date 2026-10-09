<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">增减项</text>
      <text class="nav-btn" @click="submit" :class="{ disabled: submitting }">提交</text>
    </view>

    <!-- 项目信息横幅 -->
    <view class="project-banner" v-if="projectName">
      📁 {{ projectName }}
    </view>

    <!-- 表单 -->
    <view class="form-card">
      <view class="form-section-title">增减项信息</view>

      <!-- 类型选择 -->
      <view class="form-item">
        <text class="form-label">类型 *</text>
        <view class="type-selector">
          <view
            class="type-btn type-add"
            :class="{ active: form.change_type === 'increase' }"
            @click="onTypeSelect('increase')"
          >
            <text class="type-icon">+</text>
            <text class="type-text">增加</text>
          </view>
          <view
            class="type-btn type-minus"
            :class="{ active: form.change_type === 'decrease' }"
            @click="onTypeSelect('decrease')"
          >
            <text class="type-icon">-</text>
            <text class="type-text">减少</text>
          </view>
        </view>
      </view>

      <!-- 标题 -->
      <view class="form-item">
        <text class="form-label">标题 *</text>
        <input class="form-input" v-model="form.title" placeholder="请输入增减项标题" />
      </view>

      <!-- 标题快捷选项 -->
      <view class="work-chips-wrap">
        <view class="work-chips">
          <view
            v-for="tag in tags"
            :key="tag"
            class="work-chip"
            :class="{ active: form.title === tag }"
            @click="onTagClick(tag)"
          >{{ tag }}</view>
        </view>
      </view>

      <!-- 金额 -->
      <view class="form-item">
        <text class="form-label">金额</text>
        <input class="form-input" v-model="form.amount" type="number" placeholder="¥0" />
      </view>

      <!-- 描述 -->
      <view class="form-item form-item-top">
        <text class="form-label">描述</text>
        <textarea class="form-textarea" v-model="form.description" placeholder="补充说明（可选）..." rows="3" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const projectId = ref('')
const projectName = ref('')
const submitting = ref(false)

const form = ref({
  project_id: '',
  change_type: '',
  title: '',
  amount: '',
  description: '',
})

const tags = [
  '水电改造',
  '防水工程',
  '墙面处理',
  '木工吊顶',
  '油漆粉刷',
  '门窗更换',
  '其他',
]

onMounted(async () => {
  // 从 URL 参数读取项目信息（从项目详情页跳转来）
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const options = current.options || {}

  if (options.projectId) {
    projectId.value = parseInt(options.projectId)
    form.value.project_id = projectId.value
  }
  if (options.projectName) {
    projectName.value = decodeURIComponent(options.projectName)
  }

  // 检查该项目是否有已审核通过的合同，没有则不允许提交增减项
  if (projectId.value) {
    try {
      const token = uni.getStorageSync('token')
      const res = await uni.request({
        url: `/api/contracts/by-project/${projectId.value}`,
        header: { Authorization: token },
      })
      const contracts = res.data?.data || []
      const hasApproved = contracts.some(c => c.review_status === 'approved')
      if (!hasApproved) {
        uni.showToast({ title: '该项目暂无已审核合同，暂不能提交增减项', icon: 'none', duration: 2500 })
        setTimeout(() => uni.navigateBack(), 2500)
        return
      }
    } catch (e) {
      console.error('检查合同失败', e)
    }
  }
})

const onTypeSelect = (type) => {
  form.value.change_type = type
}

const onTagClick = (tag) => {
  form.value.title = tag
}

function goBack() {
  uni.navigateBack()
}

function submit() {
  if (!form.value.change_type) {
    uni.showToast({ title: '请选择增减项类型', icon: 'none' })
    return
  }
  if (!form.value.title.trim()) {
    uni.showToast({ title: '请输入标题', icon: 'none' })
    return
  }

  submitting.value = true

  const userId = uni.getStorageSync('userInfo')?.id || ''

  uni.request({
    url: '/api/contract-changes',
    method: 'POST',
    header: { 'x-user-id': userId },
    data: {
      project_id: form.value.project_id,
      change_type: form.value.change_type,
      title: form.value.title,
      amount: form.value.amount || 0,
      description: form.value.description,
    },
    success: function(res) {
      submitting.value = false
      if (res.data.code === 0 || res.data.code === undefined) {
        uni.showToast({ title: '提交成功', icon: 'success' })
        setTimeout(function() {
          uni.navigateBack()
        }, 1500)
      } else {
        uni.showToast({ title: res.data.msg || res.data.error || '提交失败', icon: 'none' })
      }
    },
    fail: function(err) {
      submitting.value = false
      uni.showToast({ title: '网络错误', icon: 'none' })
    },
  })
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 120rpx;
}

.form-card {
  margin: 20rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 30rpx;
}

.form-section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1e3a5f;
  margin-bottom: 24rpx;
}

.form-item {
  display: flex;
  align-items: flex-start;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.form-item:last-child {
  border-bottom: none;
}

.form-item-top {
  align-items: flex-start;
}

.form-label {
  width: 160rpx;
  font-size: 26rpx;
  color: #666;
  flex-shrink: 0;
  padding-top: 6rpx;
}

.form-input {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.form-textarea {
  flex: 1;
  font-size: 28rpx;
  color: #333;
  border: 1rpx solid #eee;
  border-radius: 8rpx;
  padding: 16rpx;
  resize: none;
}

.picker-value {
  flex: 1;
  font-size: 28rpx;
  color: #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.picker-value.placeholder {
  color: #999;
}

.arrow {
  font-size: 18px;
  color: #ccc;
}

/* 类型选择器 */
.type-selector {
  flex: 1;
  display: flex;
  gap: 16rpx;
}

.type-btn {
  flex: 1;
  height: 80rpx;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  background: #f3f4f6;
  border: 2rpx solid transparent;
}

.type-btn.type-add.active {
  background: #dcfce7;
  border-color: #16a34a;
  color: #16a34a;
}

.type-btn.type-minus.active {
  background: #fee2e2;
  border-color: #dc2626;
  color: #dc2626;
}

.type-icon {
  font-size: 32rpx;
  font-weight: 600;
}

.type-text {
  font-size: 28rpx;
  font-weight: 500;
}

/* 快捷标签 */
.work-chips-wrap {
  padding: 0 0 16rpx 160rpx;
}

.work-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.work-chip {
  padding: 5px 14px;
  background: #f3f4f6;
  border-radius: 18px;
  font-size: 13px;
  color: #6b7280;
}

.work-chip.active {
  background: #1e3a5f;
  color: #fff;
}

/* 项目横幅 */
.project-banner {
  font-size: 13px;
  color: #1e3a5f;
  background: #dbeafe;
  padding: 8px 14px;
  font-weight: 500;
}

/* 导航栏 */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1e3a5f;
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

.nav-btn {
  font-size: 15px;
  color: #fff;
  width: 40px;
  text-align: right;
}

.nav-btn.disabled {
  opacity: 0.5;
}
</style>
