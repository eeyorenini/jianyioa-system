<template>
  <view class="page">
    <!-- 顶部导航（提交按钮已移到底部，这里只留返回 + 标题） -->
    <view class="nav-bar" :style="navStyle">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">录入催收</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 项目横幅：项目名 + 应收/已收/待收 三个数字 -->
    <view class="hero" v-if="projectName || actualReceivable > 0 || collectedTotal > 0">
      <view class="hero-head">
        <text class="hero-icon">📁</text>
        <text class="hero-name">{{ projectName || '未指定项目' }}</text>
      </view>
      <view class="hero-stats">
        <view class="hero-stat">
          <text class="hs-label">项目应收</text>
          <text class="hs-value">¥{{ fmtMoney(actualReceivable) }}</text>
        </view>
        <view class="hero-line"></view>
        <view class="hero-stat">
          <text class="hs-label">已确认实收</text>
          <text class="hs-value hs-in">¥{{ fmtMoney(collectedTotal) }}</text>
        </view>
        <view class="hero-line"></view>
        <view class="hero-stat">
          <text class="hs-label">待收</text>
          <text class="hs-value hs-warn">¥{{ fmtMoney(remainAmount) }}</text>
        </view>
      </view>
    </view>

    <!-- 金额：整页视觉焦点 -->
    <view class="amount-card">
      <view class="amount-head">
        <text class="amount-label">催收金额</text>
        <text class="amount-required">必填</text>
      </view>
      <view class="amount-row">
        <text class="amount-symbol">¥</text>
        <input
          class="amount-input"
          v-model="form.amount"
          type="digit"
          placeholder="0.00"
          placeholder-style="color:#D3D8E0;font-size:52rpx;font-weight:700"
        />
      </view>
      <text class="amount-hint" v-if="actualReceivable > 0">本次录入后累计实收约 ¥{{ fmtMoney(collectedTotal + (parseFloat(form.amount) || 0)) }}</text>
      <text class="amount-hint" v-else>填写本次实际收到的金额</text>
    </view>

    <!-- 表单 -->
    <view class="form-card">
      <!-- 催收日期 -->
      <view class="form-item" @click="showDatePicker">
        <view class="fi-main">
          <text class="fi-label">催收日期</text>
          <text class="fi-sub">这笔款项到账的日期</text>
        </view>
        <view class="fi-right">
          <text class="fi-value" :class="{ placeholder: !form.collect_date }">{{ form.collect_date || '请选择' }}</text>
          <text class="fi-arrow">›</text>
        </view>
      </view>

      <!-- 备注 -->
      <view class="form-item form-item-col">
        <view class="fi-main">
          <text class="fi-label">备注</text>
          <text class="fi-sub">写清款项性质，方便财务核对</text>
        </view>
        <view class="remark-wrap">
          <textarea
            class="form-textarea"
            v-model="form.remark"
            placeholder="一句话描述这笔款的来源…"
            placeholder-style="color:#B9C0CC"
            :maxlength="200"
            auto-height
          />
          <view class="quick-chips">
            <text
              v-for="c in quickChips"
              :key="c"
              class="chip"
              :class="{ 'chip-on': isChipOn(c) }"
              @click="appendRemark(c)"
            >{{ c }}</text>
          </view>
        </view>
      </view>

      <!-- 凭证图片 -->
      <view class="form-item form-item-col">
        <view class="fi-main">
          <text class="fi-label">凭证图片</text>
          <text class="fi-sub">收款截图 / 转账记录，最多 3 张</text>
        </view>
        <view class="image-wrap">
          <view class="image-list">
            <view v-for="(img, idx) in images" :key="img.id || idx" class="image-item">
              <image class="image-thumb" :src="absAsset(img.url || img)" mode="aspectFill" />
              <view v-if="img.status === 'uploading'" class="image-mask">
                <text class="image-mask-text">上传中</text>
              </view>
              <view class="image-remove" @click.stop="removeImage(idx)">
                <text class="image-remove-x">✕</text>
              </view>
            </view>
            <view v-if="images.length < 3 && !uploading" class="image-add" @click="chooseImages">
              <text class="image-add-icon">＋</text>
              <text class="image-add-text">添加凭证</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部固定提交栏 -->
    <view class="submit-bar">
      <button
        class="btn-submit"
        :class="{ 'is-disabled': submitting || loadingCollected }"
        :disabled="submitting || loadingCollected"
        @click="submit"
      >
        {{ submitting ? '提交中…' : (loadingCollected ? '校验中…' : '提交催收') }}
      </button>
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
import { ref, computed, onMounted } from 'vue'
import { absAsset } from "@/utils/api";
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

// 剩余待收 = 应收 - 已确认实收（负数按 0 显示）
const remainAmount = computed(() => Math.max((Number(actualReceivable.value) || 0) - (Number(collectedTotal.value) || 0), 0))

function fmtMoney(n) {
  const v = Number(n) || 0
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 备注里已包含该标签时高亮
function isChipOn(text) {
  return (form.value.remark || '').indexOf(text) >= 0
}

function appendRemark(text) {
  const cur = form.value.remark || ''
  // 已有就不重复追加
  if (cur.indexOf(text) >= 0) return
  form.value.remark = cur ? cur + ' ' + text : text
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
/* ============ 页面骨架 ============ */
.page {
  min-height: 100vh;
  background: #F2F4F7;
  /* ⚠️ 必须显式 padding: 0：App.vue 全局 .page 有 padding:16px，
     不覆盖会让自定义导航栏左右内缩、贴不到屏幕边（卡片自己用 margin 控制留白） */
  padding: 0;
  /* 给底部固定提交栏留位（含 iPhone 安全区） */
  padding-bottom: calc(180rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(180rpx + env(safe-area-inset-bottom));
}

/* ============ 导航栏 ============ */
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
  line-height: 1;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 1rpx;
}

.nav-placeholder {
  width: 40px;
}

/* ============ 项目横幅 ============ */
.hero {
  margin: 24rpx 24rpx 0;
  padding: 32rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #1E3A5F 0%, #2B4C7E 100%);
  box-shadow: 0 8rpx 24rpx rgba(30, 58, 95, 0.18);
}

.hero-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.hero-icon {
  font-size: 30rpx;
}

.hero-name {
  flex: 1;
  font-size: 30rpx;
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-stats {
  display: flex;
  align-items: center;
  margin-top: 28rpx;
}

.hero-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.hs-label {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.62);
}

.hs-value {
  font-size: 30rpx;
  font-weight: 700;
  color: #fff;
}

.hs-in {
  color: #6EE7B7;
}

.hs-warn {
  color: #FCD34D;
}

.hero-line {
  width: 1rpx;
  height: 52rpx;
  background: rgba(255, 255, 255, 0.16);
  margin: 0 12rpx;
}

/* ============ 金额卡片 ============ */
.amount-card {
  margin: 24rpx;
  padding: 32rpx;
  background: #fff;
  border-radius: 24rpx;
  box-shadow: 0 2rpx 12rpx rgba(30, 58, 95, 0.05);
}

.amount-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.amount-label {
  font-size: 26rpx;
  color: #6B7280;
  font-weight: 500;
}

.amount-required {
  font-size: 20rpx;
  color: #D97706;
  background: #FEF3C7;
  padding: 2rpx 12rpx;
  border-radius: 20rpx;
}

.amount-row {
  display: flex;
  align-items: baseline;
  margin-top: 12rpx;
  padding-bottom: 16rpx;
  border-bottom: 2rpx solid #F1F3F7;
}

.amount-symbol {
  font-size: 36rpx;
  font-weight: 700;
  color: #1E3A5F;
  margin-right: 10rpx;
}

.amount-input {
  flex: 1;
  height: 88rpx;
  font-size: 52rpx;
  font-weight: 700;
  color: #1E3A5F;
  line-height: 88rpx;
}

.amount-hint {
  display: block;
  margin-top: 16rpx;
  font-size: 22rpx;
  color: #9AA3B2;
}

/* ============ 表单卡片 ============ */
.form-card {
  margin: 0 24rpx;
  background: #fff;
  border-radius: 24rpx;
  padding: 0 32rpx;
  box-shadow: 0 2rpx 12rpx rgba(30, 58, 95, 0.05);
}

.form-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30rpx 0;
  border-bottom: 1rpx solid #F1F3F7;
}

.form-item:last-child {
  border-bottom: none;
}

.form-item-col {
  flex-direction: column;
  align-items: stretch;
  gap: 18rpx;
}

.fi-main {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.fi-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #1F2937;
}

.fi-sub {
  font-size: 22rpx;
  color: #9AA3B2;
}

.fi-right {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}

.fi-value {
  font-size: 28rpx;
  font-weight: 600;
  color: #1E3A5F;
}

.fi-value.placeholder {
  color: #B9C0CC;
  font-weight: 400;
}

.fi-arrow {
  font-size: 32rpx;
  color: #C7CDD6;
  line-height: 1;
}

/* ============ 备注 ============ */
.remark-wrap {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.form-textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 120rpx;
  padding: 20rpx 24rpx;
  background: #F7F9FC;
  border-radius: 16rpx;
  font-size: 27rpx;
  color: #1F2937;
  line-height: 1.6;
}

.quick-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.chip {
  font-size: 21rpx;
  color: #5B6678;
  background: #F2F4F7;
  padding: 8rpx 16rpx;
  border-radius: 22rpx;
  transition: all 0.15s;
}

.chip-on {
  color: #1E3A5F;
  background: #DBEAFE;
  font-weight: 600;
}

/* ============ 图片上传 ============ */
.image-wrap {
  width: 100%;
}

.image-list {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.image-item {
  position: relative;
  width: 200rpx;
  height: 200rpx;
}

.image-thumb {
  width: 100%;
  height: 100%;
  border-radius: 16rpx;
  background: #F2F4F7;
}

.image-mask {
  position: absolute;
  inset: 0;
  border-radius: 16rpx;
  background: rgba(17, 24, 39, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-mask-text {
  font-size: 22rpx;
  color: #fff;
}

.image-remove {
  position: absolute;
  top: -12rpx;
  right: -12rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: rgba(17, 24, 39, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid #fff;
}

.image-remove-x {
  font-size: 20rpx;
  color: #fff;
  line-height: 1;
}

.image-add {
  width: 200rpx;
  height: 200rpx;
  border: 2rpx dashed #D5DBE5;
  border-radius: 16rpx;
  background: #FAFBFD;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.image-add-icon {
  font-size: 44rpx;
  color: #A8B0BF;
  line-height: 1;
}

.image-add-text {
  font-size: 21rpx;
  color: #A8B0BF;
}

/* ============ 底部提交栏 ============ */
.submit-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  background: #fff;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -4rpx 20rpx rgba(30, 58, 95, 0.08);
}

.btn-submit {
  width: 100%;
  height: 92rpx;
  line-height: 92rpx;
  border: none;
  border-radius: 46rpx;
  background: linear-gradient(135deg, #1E3A5F 0%, #2B4C7E 100%);
  color: #fff;
  font-size: 31rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  box-shadow: 0 8rpx 20rpx rgba(30, 58, 95, 0.24);
}

.btn-submit::after {
  border: none;
}

.btn-submit.is-disabled {
  opacity: 0.55;
  box-shadow: none;
}

/* ============ 上传遮罩 ============ */
.upload-overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.upload-overlay-box {
  background: #fff;
  border-radius: 20rpx;
  padding: 44rpx 64rpx;
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
  border-top-color: #1E3A5F;
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
