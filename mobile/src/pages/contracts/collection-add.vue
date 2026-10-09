<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">录入催收</text>
      <text class="nav-btn" @click="submit" :class="{ disabled: submitting || loadingCollected }">提交</text>
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
        <view class="remark-wrap">
          <textarea class="form-textarea" v-model="form.remark" placeholder="一句话描述..." rows="2" />
          <view class="quick-chips">
            <text class="chip" v-for="c in quickChips" :key="c" @click="appendRemark(c)">{{ c }}</text>
          </view>
        </view>
      </view>

      <!-- 图片上传 -->
      <view class="form-item form-item-top">
        <text class="form-label">凭证图片</text>
        <view class="image-upload-wrap">
          <view class="image-list">
            <view v-for="(img, idx) in images" :key="img.id || idx" class="image-item">
              <image class="image-thumb" :src="img.url || img" mode="aspectFill" />
              <text class="image-remove" @click="removeImage(idx)">✕</text>
            </view>
            <view v-if="images.length < 3 && !uploading" class="image-add" @click="chooseImages">
              <text class="image-add-icon">+</text>
              <text class="image-add-text">添加图片</text>
            </view>
          </view>
          <text class="image-hint">最多上传3张图片</text>
        </view>
      </view>

    </view>

    <!-- 上传中遮罩 -->
    <view v-if="uploading" class="upload-overlay">
      <view class="upload-overlay-box">
        <view class="upload-spinner"></view>
        <text class="upload-overlay-text">{{ uploadText }}</text>
        <text class="upload-overlay-sub">{{ uploadDone }}/{{ uploadTotal }} 张</text>
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
const uploading = ref(false)
const uploadText = ref('上传中，请稍候')
const uploadDone = ref(0)
const uploadTotal = ref(0)
const collectedTotal = ref(0) // 该项目已确认实收总额
const actualReceivable = ref(0) // 项目应收金额（从上个页面传入）
const loadingCollected = ref(false) // 是否正在加载已确认催收总额

const form = ref({
  amount: '',
  collect_date: formatDate(new Date()),
  remark: '',
})

const quickChips = ['首付款', '中期款', '尾款', '增项款', '进度款']

function appendRemark(text) {
  form.value.remark = form.value.remark ? form.value.remark + ' ' + text : text
}

const datePicker = ref({ visible: false, title: '选择催收日期', items: [] })

onMounted(() => {
  // 从 URL 参数读取项目信息（从项目详情页跳转来）
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const options = current.options || {}

  if (options.projectId) {
    projectId.value = parseInt(options.projectId)
    loadCollectedTotal()
  }
  if (options.projectName) {
    projectName.value = decodeURIComponent(options.projectName)
  }
  if (options.actualReceivable) {
    actualReceivable.value = parseFloat(options.actualReceivable) || 0
  }

  // 初始化日期选择器：未来30天
  initDatePicker()
})

async function loadCollectedTotal() {
  loadingCollected.value = true
  const userId = uni.getStorageSync('userInfo')?.id || ''
  const res = await uni.request({
    url: `/api/collection-records?project_id=${projectId.value}`,
    header: { 'x-user-id': userId },
  })
  const list = Array.isArray(res.data) ? res.data : (res.data?.list || [])
  // 只统计已确认的
  collectedTotal.value = list
    .filter(r => r.status === 'confirmed')
    .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)
  loadingCollected.value = false
}

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
      const paths = res.tempFilePaths
      uploading.value = true
      uploadText.value = '图片上传中，请稍候'
      uploadDone.value = 0
      uploadTotal.value = paths.length

      const userInfo = uni.getStorageSync('userInfo') || {}
      // 2026-10-09 优化：先 push 本地临时路径占位，用户立刻看到缩略图；上传完后替换为 url
      const placeholders = paths.map(p => ({ id: 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), url: p, status: 'uploading' }))
      images.value.push(...placeholders)
      for (let i = 0; i < paths.length; i++) {
        const ph = placeholders[i]
        try {
          const url = await new Promise((resolve) => {
            uni.uploadFile({
              url: '/api/upload-image',
              filePath: paths[i],
              name: 'file',
              header: { 'x-user-id': userInfo.id },
              success: (uploadRes) => {
                try {
                  const data = JSON.parse(uploadRes.data)
                  resolve(data.url || data.data?.url || data.data || '')
                } catch { resolve('') }
              },
              fail: () => resolve(''),
            })
          })
          const idx = images.value.findIndex(it => it.id === ph.id)
          if (url) {
            if (idx >= 0) images.value[idx] = { id: ph.id, url, status: 'done' }
          } else {
            if (idx >= 0) images.value.splice(idx, 1)  // 失败移除占位
          }
        } catch {}
        uploadDone.value++
      }
      uploading.value = false
    },
  })
}

function removeImage(idx) {
  images.value.splice(idx, 1)
}

function goBack() {
  uni.navigateBack()
}

async function submit() {
  if (!form.value.amount) {
    uni.showToast({ title: '请输入催收金额', icon: 'none' })
    return
  }
  if (!form.value.collect_date) {
    uni.showToast({ title: '请选择催收日期', icon: 'none' })
    return
  }

  // 每次提交前重新拉最新的已确认催收总额
  await loadCollectedTotal()

  const inputAmount = parseFloat(form.value.amount) || 0
  const totalAfter = collectedTotal.value + inputAmount

  // 超出应收，弹窗警告
  if (actualReceivable.value > 0 && totalAfter > actualReceivable.value) {
    uni.showModal({
      title: '⚠️ 金额超出应收',
      content: `项目应收金额：¥${actualReceivable.value.toLocaleString()}\n已确认实收：¥${collectedTotal.value.toLocaleString()}\n本次录入：¥${inputAmount.toLocaleString()}\n\n催收总额将达 ¥${totalAfter.toLocaleString()}，超出 ¥${(totalAfter - actualReceivable.value).toLocaleString()}，是否确认提交？`,
      confirmText: '确认提交',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) doSubmit(inputAmount)
      },
    })
    return
  }

  doSubmit(inputAmount)
}

function doSubmit(amount) {
  submitting.value = true
  const userId = uni.getStorageSync('userInfo')?.id || ''

  uni.request({
    url: '/api/collection-records',
    method: 'POST',
    header: { 'x-user-id': userId },
    data: {
      project_id: projectId.value,
      amount: amount,
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

.remark-wrap {
  flex: 1;
}

.quick-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 12rpx;
}

.chip {
  font-size: 22rpx;
  color: #1e3a5f;
  background: #dbeafe;
  padding: 6rpx 18rpx;
  border-radius: 20rpx;
}

.form-textarea {
  flex: 1;
  font-size: 28rpx;
  color: #333;
  border: 1rpx solid #eee;
  border-radius: 8rpx;
  padding: 12rpx;
  resize: none;
  min-height: 80rpx;
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

/* 上传中遮罩 */
.upload-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.upload-overlay-box {
  background: #fff;
  border-radius: 16rpx;
  padding: 40rpx 60rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  min-width: 320rpx;
}
.upload-spinner {
  width: 60rpx;
  height: 60rpx;
  border: 4rpx solid #E5E7EB;
  border-top-color: #3B82F6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.upload-overlay-text {
  font-size: 28rpx;
  color: #1F2937;
  font-weight: 600;
}
.upload-overlay-sub {
  font-size: 24rpx;
  color: #6B7280;
}
</style>
