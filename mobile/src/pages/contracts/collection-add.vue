<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">录入催收</text>
      <text class="nav-btn" @click="submit" :class="{ disabled: submitting }">提交</text>
    </view>

    <!-- 项目信息横幅 -->
    <view class="project-banner" v-if="projectName">
      📁 {{ projectName }}
    </view>

    <!-- 表单 -->
    <view class="form-card">
      <view class="form-section-title">催收信息</view>

      <!-- 催收金额 -->
      <view class="form-item">
        <text class="form-label">催收金额 *</text>
        <input class="form-input" v-model="form.amount" type="digit" placeholder="¥0.00" />
      </view>

      <!-- 催收日期 -->
      <view class="form-item">
        <text class="form-label">催收日期 *</text>
        <view class="picker-value" :class="{ placeholder: !form.collect_date }" @click="showDatePicker">
          {{ form.collect_date || '请选择日期' }}
          <text class="arrow">›</text>
        </view>
      </view>

      <!-- 备注 -->
      <view class="form-item form-item-top">
        <text class="form-label">备注</text>
        <textarea class="form-textarea" v-model="form.remark" placeholder="补充催收说明..." rows="3" />
      </view>

      <!-- 图片上传 -->
      <view class="form-item form-item-top">
        <text class="form-label">凭证图片</text>
        <view class="image-upload-wrap">
          <view class="image-list">
            <view v-for="(img, idx) in images" :key="idx" class="image-item">
              <image class="image-thumb" :src="img" mode="aspectFill" />
              <text class="image-remove" @click="removeImage(idx)">✕</text>
            </view>
            <view v-if="images.length < 3" class="image-add" @click="chooseImages">
              <text class="image-add-icon">+</text>
              <text class="image-add-text">添加图片</text>
            </view>
          </view>
          <text class="image-hint">最多上传3张图片</text>
        </view>
      </view>
    </view>

    <!-- 日期选择弹窗 -->
    <BottomPicker
      v-model:visible="datePicker.visible"
      :title="datePicker.title"
      :items="datePicker.items"
      @select="onDateSelect"
      @cancel="datePicker.visible = false"
    />
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import BottomPicker from '@/components/bottom-picker.vue'

const projectId = ref('')
const projectName = ref('')
const submitting = ref(false)
const images = ref([])

const form = ref({
  amount: '',
  collect_date: '',
  remark: '',
})

const datePicker = ref({ visible: false, title: '选择催收日期', items: [] })

onMounted(() => {
  // 从 URL 参数读取项目信息（从项目详情页跳转来）
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const options = current.options || {}

  if (options.projectId) {
    projectId.value = parseInt(options.projectId)
  }
  if (options.projectName) {
    projectName.value = decodeURIComponent(options.projectName)
  }

  // 初始化日期选择器：未来30天
  initDatePicker()
})

function initDatePicker() {
  const items = []
  const today = new Date()
  for (let i = 0; i < 30; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const dateStr = formatDate(d)
    items.push({
      name: dateStr,
      icon: '📅',
      _date: dateStr,
    })
  }
  datePicker.value.items = items
}

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function showDatePicker() {
  datePicker.value = {
    visible: true,
    title: '选择催收日期',
    items: datePicker.value.items,
  }
}

function onDateSelect({ item }) {
  form.value.collect_date = item._date
  datePicker.value.visible = false
}

function chooseImages() {
  const remain = 3 - images.value.length
  if (remain <= 0) {
    uni.showToast({ title: '最多上传3张图片', icon: 'none' })
    return
  }
  uni.chooseImage({
    count: remain,
    success: async (res) => {
      for (const tempPath of res.tempFilePaths) {
        await uploadImage(tempPath)
      }
    },
  })
}

function uploadImage(tempPath) {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: '/api/upload-image',
      filePath: tempPath,
      name: 'file',
      success: (uploadRes) => {
        try {
          const data = JSON.parse(uploadRes.data)
          // 兼容多种返回格式
          const url = data.url || data.data?.url || data.data || ''
          if (url) {
            images.value.push(url)
          }
        } catch (e) {
          console.error('解析上传返回数据失败', e)
        }
        resolve(uploadRes)
      },
      fail: (err) => {
        console.error('图片上传失败', err)
        uni.showToast({ title: '图片上传失败', icon: 'none' })
        reject(err)
      },
    })
  })
}

function removeImage(idx) {
  images.value.splice(idx, 1)
}

function goBack() {
  uni.navigateBack()
}

function submit() {
  if (!form.value.amount) {
    uni.showToast({ title: '请输入催收金额', icon: 'none' })
    return
  }
  if (!form.value.collect_date) {
    uni.showToast({ title: '请选择催收日期', icon: 'none' })
    return
  }

  submitting.value = true

  const userId = uni.getStorageSync('userInfo')?.id || ''

  uni.request({
    url: '/api/collection-records',
    method: 'POST',
    header: { 'x-user-id': userId },
    data: {
      project_id: projectId.value,
      amount: parseFloat(form.value.amount),
      collect_date: form.value.collect_date,
      remark: form.value.remark,
      images: JSON.stringify(images.value),
    },
    success: function (res) {
      submitting.value = false
      if (res.data.code === 0 || res.data.code === undefined) {
        uni.showToast({ title: '提交成功', icon: 'success' })
        setTimeout(function () {
          uni.navigateBack()
        }, 1500)
      } else {
        uni.showToast({ title: res.data.msg || res.data.error || '提交失败', icon: 'none' })
      }
    },
    fail: function (err) {
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

/* 图片上传 */
.image-upload-wrap {
  flex: 1;
}

.image-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.image-item {
  position: relative;
  width: 180rpx;
  height: 180rpx;
}

.image-thumb {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
}

.image-remove {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  width: 36rpx;
  height: 36rpx;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 50%;
  font-size: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-add {
  width: 180rpx;
  height: 180rpx;
  border: 2rpx dashed #ddd;
  border-radius: 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.image-add-icon {
  font-size: 48rpx;
  color: #999;
}

.image-add-text {
  font-size: 22rpx;
  color: #999;
}

.image-hint {
  display: block;
  font-size: 22rpx;
  color: #999;
  margin-top: 12rpx;
}
</style>
