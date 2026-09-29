<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">财务确认</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <scroll-view v-else class="content" scroll-y>
      <!-- 状态卡片 -->
      <view class="status-card" :style="{ background: statusBg(detail.status) }">
        <text class="status-icon">{{ statusIcon(detail.status) }}</text>
        <text class="status-text">{{ statusLabel(detail.status) }}</text>
      </view>

      <!-- 基本信息（只读） -->
      <view class="section-card">
        <view class="section-title">申请信息</view>
        <view class="info-grid">
          <view class="info-item">
            <text class="info-label">申请人</text>
            <text class="info-value">{{ detail.applicant_name }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">项目</text>
            <text class="info-value">{{ detail.project_name }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">供应商</text>
            <text class="info-value">{{ detail.supplier_name || '-' }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">物料</text>
            <text class="info-value">{{ detail.material_name }}</text>
          </view>
          <view class="info-item full">
            <text class="info-label">实付金额</text>
            <text class="info-value amount">¥{{ detail.actual_amount }}</text>
          </view>
        </view>
      </view>

      <!-- 申请人凭证（只读） -->
      <view class="section-card">
        <view class="section-title">报销凭证（申请人上传）</view>
        <view v-if="reimburseImages.length > 0" class="image-list">
          <image
            v-for="(img, idx) in reimburseImages"
            :key="idx"
            class="preview-img"
            :src="getImgUrl(img)"
            mode="aspectFill"
            @click="previewImage(img, reimburseImages)"
          />
        </view>
        <view v-else class="empty-images">暂无凭证</view>
      </view>

      <!-- 报销回执（财务上传） -->
      <view class="section-card">
        <view class="section-title">报销回执</view>
        <view v-if="financeImages.length > 0" class="image-list">
          <view v-for="(img, idx) in financeImages" :key="idx" class="img-wrap">
            <image class="preview-img" :src="getImgUrl(img)" mode="aspectFill" @click="previewImage(img, financeImages)" />
            <view class="img-remove" @click="removeFinanceImage(idx)">×</view>
          </view>
        </view>
        <view v-if="pendingFinanceImages.length > 0" class="image-list">
          <view v-for="(img, idx) in pendingFinanceImages" :key="idx" class="img-wrap">
            <image class="preview-img" :src="img" mode="aspectFill" />
            <view class="img-remove" @click="removePendingImage(idx)">×</view>
          </view>
        </view>
        <view v-if="totalImages < 3" class="img-add" @click="chooseFinanceImage">
          <text class="add-icon">+</text>
          <text class="add-text">添加回执</text>
        </view>
        <view class="img-hint">最多3张</view>
      </view>

      <!-- 操作按钮 -->
      <view class="action-bar">
        <view class="btn primary full" @click="handleConfirm" :class="{ disabled: submitting }">
          {{ submitting ? '提交中...' : '确认完结' }}
        </view>
      </view>
    </scroll-view>

    <!-- 提交遮罩 -->
    <view class="upload-overlay" v-if="uploadProgress.visible">
      <view class="upload-overlay-content">
        <view class="upload-overlay-spinner">⟳</view>
        <text class="upload-overlay-text">{{ uploadProgress.text }}</text>
        <view class="upload-overlay-bar-wrap">
          <view class="upload-overlay-bar" :style="{ width: uploadProgress.percent + '%' }"></view>
        </view>
        <text class="upload-overlay-percent">{{ uploadProgress.percent }}%</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'

const loading = ref(true)
const detail = ref(null)
const submitting = ref(false)
const pendingFinanceImages = ref([])
const uploadProgress = reactive({ visible: false, total: 0, done: 0, percent: 0, text: '' })

let currentPage = null

const statusLabel = (s) => {
  const map = { finance_confirmed: '受理中', reimbursed: '已完结' }
  return map[s] || s
}
const statusBg = (s) => {
  const map = {
    finance_confirmed: 'linear-gradient(135deg, #e3f2fd, #bbdefb)',
    reimbursed: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
  }
  return map[s] || '#f5f5f5'
}
const statusIcon = (s) => {
  const map = { finance_confirmed: '🏦', reimbursed: '🏁' }
  return map[s] || '📋'
}

const reimburseImages = computed(() => {
  try {
    const raw = detail.value?.images
    if (!raw) return []
    const arr = Array.isArray(raw) ? raw : JSON.parse(raw)
    return arr.filter(Boolean)
  } catch { return [] }
})

const financeImages = computed(() => {
  try {
    const raw = detail.value?.finance_images
    if (!raw) return []
    const arr = Array.isArray(raw) ? raw : JSON.parse(raw)
    return arr.filter(Boolean)
  } catch { return [] }
})

const totalImages = computed(() => financeImages.value.length + pendingFinanceImages.value.length)

function getImgUrl(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return path
}

function goBack() { uni.navigateBack() }

function previewImage(current, urls) {
  const allUrls = (urls || []).map(u => getImgUrl(u))
  uni.previewImage({ urls: allUrls, current: getImgUrl(current) || allUrls[0] })
}

function chooseFinanceImage() {
  const remain = 3 - pendingFinanceImages.value.length
  if (remain <= 0) return
  uni.chooseImage({
    count: remain,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      pendingFinanceImages.value = [...pendingFinanceImages.value, ...res.tempFilePaths]
    }
  })
}

function removePendingImage(idx) {
  pendingFinanceImages.value.splice(idx, 1)
}

function removeFinanceImage(idx) {
  // 已上传的财务回执暂不支持删除（直接覆盖）
  uni.showToast({ title: '已上传回执不可删除', icon: 'none' })
}

function loadDetail() {
  loading.value = true
  const userInfo = uni.getStorageSync('userInfo') || {}
  uni.request({
    url: `/api/purchase-requests/${currentPage.options.id}`,
    header: { 'x-user-id': userInfo.id },
    success: (res) => {
      if (res.data && (res.data.code === 0 || res.data.id)) {
        const raw = res.data.data || res.data
        if (raw.items && raw.items.length > 0) {
          const item = raw.items[0]
          raw.material_name = item.material_name
          raw.quantity = item.quantity
          raw.unit_price = item.unit_price
          raw.unit = item.unit
        }
        detail.value = raw
      } else {
        uni.showToast({ title: '加载失败', icon: 'none' })
      }
    },
    fail: () => { uni.showToast({ title: '加载失败', icon: 'none' }) },
    complete: () => { loading.value = false }
  })
}

function handleConfirm() {
  if (submitting.value) return
  const imgs = pendingFinanceImages.value
  if (imgs.length === 0) {
    uni.showToast({ title: '请上传报销回执', icon: 'none' })
    return
  }

  // 显示遮罩，逐张上传
  uploadProgress.visible = true
  uploadProgress.total = imgs.length
  uploadProgress.done = 0
  uploadProgress.percent = 0
  uploadProgress.text = `上传回执 0/${imgs.length}`

  const userInfo = uni.getStorageSync('userInfo') || {}
  const uploadTasks = imgs.map((filePath) => {
    return new Promise((resolve) => {
      uni.uploadFile({
        url: `/api/upload-image`,
        filePath,
        name: 'file',
        header: { 'x-user-id': userInfo.id },
        success: (res) => {
          try {
            const data = JSON.parse(res.data)
            resolve(data.url || '')
          } catch { resolve('') }
        },
        fail: () => resolve('')
      })
    })
  })

  Promise.all(uploadTasks).then((urls) => {
    const validUrls = urls.filter(Boolean)
    const existing = financeImages.value
    const allUrls = [...existing, ...validUrls]
    const imagesJson = JSON.stringify(allUrls)

    uploadProgress.text = '提交中...'
    uploadProgress.percent = 100

    uni.request({
      url: `/api/purchase-requests/${detail.value.id}/finance-confirm`,
      method: 'POST',
      header: { 'x-user-id': userInfo.id },
      data: { images: imagesJson },
      success: (res) => {
        uploadProgress.visible = false
        if (res.data.code === 0 || res.data.code === undefined) {
          uni.showToast({ title: '报销已完成', icon: 'success' })
          setTimeout(() => {
            uni.redirectTo({ url: `/pages/purchase/list` })
          }, 1500)
        } else {
          uni.showToast({ title: res.data.msg || '提交失败', icon: 'none' })
        }
      },
      fail: () => {
        uploadProgress.visible = false
        uni.showToast({ title: '网络错误', icon: 'none' })
      }
    })
  })
}

onMounted(() => {
  currentPage = getCurrentPages()[getCurrentPages().length - 1]
  loadDetail()
})
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.nav-bar { display: flex; align-items: center; justify-content: space-between; height: 44px; background: #fff; padding: 0 16px; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 10; }
.nav-back { font-size: 24px; color: #333; }
.nav-title { font-size: 16px; font-weight: 600; color: #333; }
.nav-placeholder { width: 24px; }
.loading-state { display: flex; justify-content: center; align-items: center; height: 50vh; color: #999; }

.content { padding: 12px 12px 80px; }

.status-card { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; }
.status-icon { font-size: 18px; }
.status-text { font-size: 14px; font-weight: 600; color: #333; }

.section-card { background: #fff; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
.section-title { font-size: 14px; font-weight: 600; color: #333; margin-bottom: 12px; }

.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.info-item { display: flex; flex-direction: column; gap: 2px; }
.info-item.full { grid-column: 1 / -1; }
.info-label { font-size: 12px; color: #999; }
.info-value { font-size: 14px; color: #333; }
.info-value.amount { color: #ff6b00; font-size: 16px; font-weight: 600; }

.image-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.preview-img { width: 80px; height: 80px; border-radius: 6px; object-fit: cover; }
.img-wrap { position: relative; }
.img-remove { position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; background: rgba(0,0,0,0.6); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; }
.empty-images { color: #ccc; font-size: 13px; text-align: center; padding: 20px 0; }

.img-add { width: 80px; height: 80px; border: 1px dashed #ddd; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
.add-icon { font-size: 24px; color: #bbb; }
.add-text { font-size: 11px; color: #bbb; }
.img-hint { font-size: 11px; color: #bbb; text-align: right; margin-top: 4px; }

.action-bar { padding: 16px 0; }
.btn { height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600; }
.btn.primary { background: #409eff; color: #fff; }
.btn.primary.disabled { opacity: 0.6; }

.upload-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 200; }
.upload-overlay-content { display: flex; flex-direction: column; align-items: center; gap: 12px; min-width: 200px; }
.upload-overlay-spinner { font-size: 36px; color: #fff; animation: spin 1s linear infinite; }
.upload-overlay-text { font-size: 14px; color: #fff; }
.upload-overlay-bar-wrap { width: 200px; height: 6px; background: rgba(255,255,255,0.3); border-radius: 3px; overflow: hidden; }
.upload-overlay-bar { height: 100%; background: #409eff; transition: width 0.3s; }
.upload-overlay-percent { font-size: 12px; color: rgba(255,255,255,0.8); }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
