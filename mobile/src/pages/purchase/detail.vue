<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">采购详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 加载中 -->
    <view v-if="loading" class="loading-state">
      <text class="loading-icon">⟳</text>
    </view>

    <template v-else-if="detail">
      <!-- 状态卡片 -->
      <view class="status-card" :style="{ background: statusBg(detail.status) }">
        <view class="status-row">
          <text class="status-icon">{{ statusIcon(detail.status) }}</text>
          <view class="status-text">
            <text class="status-label">{{ statusLabel(detail.status) }}</text>
            <text class="status-time">{{ detail.created_at }}</text>
          </view>
        </view>
      </view>

      <!-- 基本信息 -->
      <view class="section-card">
        <view class="section-title">采购信息</view>
        <view class="info-grid">
          <view class="info-item">
            <text class="info-label">项目</text>
            <text class="info-value">{{ detail.project_name }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">主材</text>
            <text class="info-value">{{ detail.material_name }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">规格</text>
            <text class="info-value">{{ detail.spec || '-' }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">供应商</text>
            <text class="info-value">{{ detail.supplier_name }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">数量</text>
            <text class="info-value">{{ detail.quantity }}{{ detail.unit }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">金额</text>
            <text class="info-value amount">¥{{ detail.amount || 0 }}</text>
          </view>
          <view class="info-item" v-if="detail.remark">
            <text class="info-label">用途</text>
            <text class="info-value">{{ detail.remark }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">申请人</text>
            <text class="info-value">{{ detail.applicant_name }}</text>
          </view>
        </view>
      </view>

      <!-- 审核信息 -->
      <view class="section-card" v-if="detail.approver_name || detail.approved_at">
        <view class="section-title">审核结果</view>
        <view class="info-grid">
          <view class="info-item" v-if="detail.approver_name">
            <text class="info-label">审核人</text>
            <text class="info-value">{{ detail.approver_name }}</text>
          </view>
          <view class="info-item" v-if="detail.approved_at">
            <text class="info-label">审核时间</text>
            <text class="info-value">{{ detail.approved_at }}</text>
          </view>
          <view class="info-item full" v-if="detail.approver_comment">
            <text class="info-label">审核备注</text>
            <text class="info-value">{{ detail.approver_comment }}</text>
          </view>
        </view>
      </view>

      <!-- 报销凭证 -->
      <view class="section-card" v-if="detail.status === 'reimburse' || detail.status === 'reimbursed'">
        <view class="section-title">报销凭证</view>
        <view v-if="detail.reimburse_images && detail.reimburse_images.length > 0" class="image-list">
          <image
            v-for="(img, idx) in detail.reimburse_images"
            :key="idx"
            class="preview-img"
            :src="img"
            mode="aspectFill"
            @click="previewImage(idx)"
          />
        </view>
        <view v-else class="empty-images">暂无凭证</view>

        <!-- 上传凭证（待报销状态且是本人） -->
        <view v-if="detail.status === 'reimburse' && isApplicant" class="upload-section">
          <view class="upload-btn" @click="chooseImage">
            <text class="upload-icon">+</text>
            <text class="upload-text">添加凭证</text>
          </view>
          <view v-for="(img, idx) in pendingImages" :key="idx" class="pending-img-wrap">
            <image class="preview-img" :src="img" mode="aspectFill" />
            <view class="remove-btn" @click="removeImage(idx)">×</view>
          </view>
        </view>
      </view>

      <!-- 财务确认 -->
      <view class="section-card" v-if="detail.status === 'finance_confirmed'">
        <view class="section-title">财务确认</view>
        <view class="info-grid">
          <view class="info-item">
            <text class="info-label">确认人</text>
            <text class="info-value">{{ detail.finance_confirmer_name || '-' }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">确认时间</text>
            <text class="info-value">{{ detail.finance_confirmed_at || '-' }}</text>
          </view>
        </view>
      </view>

      <!-- 操作按钮 -->
      <view class="action-bar">
        <!-- 待审核 - 审核人可操作 -->
        <template v-if="detail.status === 'pending' && isApprover">
          <view class="btn reject" @click="showRejectDialog">驳回</view>
          <view class="btn approve" @click="showApproveDialog">通过</view>
        </template>

        <!-- 待报销 - 本人上传凭证 -->
        <template v-if="detail.status === 'reimburse' && isApplicant">
          <view class="btn primary full" @click="submitReimburse" :class="{ disabled: submitting }">
            {{ submitting ? '提交中...' : '提交报销' }}
          </view>
        </template>

        <!-- 财务确认 - 财务人员可操作 -->
        <template v-if="detail.status === 'finance_confirmed' && isFinance">
          <view class="btn reject" @click="showRejectDialog">驳回</view>
          <view class="btn approve" @click="confirmFinance">确认付款</view>
        </template>
      </view>
    </template>

    <!-- 审批/财务驳回弹窗 -->
    <view v-if="showDialog" class="dialog-mask" @click="showDialog = false">
      <view class="dialog-content" @click.stop>
        <view class="dialog-header">{{ dialogType === 'approve' ? '通过申请' : '驳回申请' }}</view>
        <view class="dialog-body">
          <textarea class="comment-input" v-model="dialogComment"
            :placeholder="dialogType === 'approve' ? '选填备注' : '请输入驳回原因'" />
        </view>
        <view class="dialog-footer">
          <view class="dialog-btn cancel" @click="showDialog = false">取消</view>
          <view class="dialog-btn confirm" @click="submitDialog">确定</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const loading = ref(true)
const detail = ref(null)
const submitting = ref(false)
const pendingImages = ref([])
const showDialog = ref(false)
const dialogType = ref('approve') // 'approve' | 'reject'
const dialogComment = ref('')

let currentPage = null

const statusLabel = (s) => {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    reimburse: '待报销',
    reimbursed: '已报销',
    finance_confirmed: '财务确认',
  }
  return map[s] || s
}

const statusBg = (s) => {
  const map = {
    pending: 'linear-gradient(135deg, #fff3e0, #ffe0b2)',
    approved: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
    rejected: 'linear-gradient(135deg, #ffebee, #ffcdd2)',
    reimburse: 'linear-gradient(135deg, #fff3e0, #ffe0b2)',
    reimbursed: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
    finance_confirmed: 'linear-gradient(135deg, #e3f2fd, #bbdefb)',
  }
  return map[s] || '#f5f5f5'
}

const statusIcon = (s) => {
  const map = {
    pending: '⏳',
    approved: '✅',
    rejected: '❌',
    reimburse: '💰',
    reimbursed: '✅',
    finance_confirmed: '🏦',
  }
  return map[s] || '📋'
}

const userInfo = computed(() => uni.getStorageSync('userInfo') || {})
const isApplicant = computed(() => detail.value?.applicant_id === userInfo.value.id)
const isApprover = computed(() => detail.value?.can_approve === true)
const isFinance = computed(() => detail.value?.can_finance_confirm === true)

function goBack() { uni.navigateBack() }

function previewImage(idx) {
  uni.previewImage({
    urls: detail.value.reimburse_images,
    current: idx
  })
}

function chooseImage() {
  uni.chooseImage({
    count: 9 - pendingImages.value.length,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      pendingImages.value = [...pendingImages.value, ...res.tempFilePaths]
    }
  })
}

function removeImage(idx) {
  pendingImages.value.splice(idx, 1)
}

async function uploadImages(urls) {
  // 提交报销
  submitting.value = true
  uni.request({
    url: `/api/purchase-requests/${detail.value.id}/reimburse`,
    method: 'POST',
    data: { images: JSON.stringify(urls) },
    success: (res) => {
      if (res.data.code === 0 || res.data.code === undefined) {
        uni.showToast({ title: '提交成功', icon: 'success' })
        setTimeout(() => { loadDetail() }, 1500)
      } else {
        uni.showToast({ title: res.data.msg || '提交失败', icon: 'none' })
      }
    },
    fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) },
    complete: () => { submitting.value = false }
  })
}

function loadDetail() {
  loading.value = true
  uni.request({
    url: `/api/purchase-requests/${currentPage.options.id}`,
    success: (res) => {
      if (res.data.code === 0) {
        detail.value = res.data.data || res.data
        // 解析报销图片
        if (detail.value.reimburse_images) {
          try {
            detail.value.reimburse_images = JSON.parse(detail.value.reimburse_images)
          } catch { detail.value.reimburse_images = [] }
        }
      } else {
        uni.showToast({ title: '加载失败', icon: 'none' })
      }
    },
    fail: () => { uni.showToast({ title: '加载失败', icon: 'none' }) },
    complete: () => { loading.value = false }
  })
}

function showApproveDialog() {
  dialogType.value = 'approve'
  dialogComment.value = ''
  showDialog.value = true
}

function showRejectDialog() {
  dialogType.value = 'reject'
  dialogComment.value = ''
  showDialog.value = true
}

function submitDialog() {
  if (dialogType.value === 'reject' && !dialogComment.value.trim()) {
    uni.showToast({ title: '请输入驳回原因', icon: 'none' })
    return
  }
  const id = detail.value.id
  const url = dialogType.value === 'approve'
    ? `/api/purchase-requests/${id}/approve`
    : `/api/purchase-requests/${id}/reject`
  uni.request({
    url, method: 'POST',
    data: { comment: dialogComment.value },
    success: (res) => {
      if (res.data.code === 0 || res.data.code === undefined) {
        uni.showToast({ title: dialogType.value === 'approve' ? '已通过' : '已驳回', icon: 'success' })
        showDialog.value = false
        setTimeout(() => { loadDetail() }, 1000)
      } else {
        uni.showToast({ title: res.data.msg || '操作失败', icon: 'none' })
      }
    },
    fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) }
  })
}

function submitReimburse() {
  if (pendingImages.value.length === 0) {
    uni.showToast({ title: '请先上传凭证', icon: 'none' })
    return
  }
  // 上传图片到服务器
  const uploadTasks = pendingImages.value.map(path =>
    new Promise((resolve, reject) => {
      uni.uploadFile({
        url: '/api/upload',
        filePath: path,
        name: 'file',
        success: (res) => {
          try {
            const data = JSON.parse(res.data)
            resolve(data.url || data.path || '')
          } catch { resolve('') }
        },
        fail: () => resolve('')
      })
    })
  )
  submitting.value = true
  Promise.all(uploadTasks).then(uploadImages)
}

function confirmFinance() {
  uni.request({
    url: `/api/purchase-requests/${detail.value.id}/finance-confirm`,
    method: 'POST',
    success: (res) => {
      if (res.data.code === 0 || res.data.code === undefined) {
        uni.showToast({ title: '确认成功', icon: 'success' })
        setTimeout(() => { loadDetail() }, 1000)
      } else {
        uni.showToast({ title: res.data.msg || '操作失败', icon: 'none' })
      }
    },
    fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) }
  })
}

onMounted(() => {
  const pages = getCurrentPages()
  currentPage = pages[pages.length - 1]
  loadDetail()
})
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding-bottom: 120rpx; }
.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.loading-state {
  display: flex; justify-content: center; padding: 100px 0;
}
.loading-icon { font-size: 60px; color: #1E3A5F; animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.status-card {
  margin: 16rpx; border-radius: 16rpx; padding: 24rpx;
}
.status-row { display: flex; align-items: center; gap: 16rpx; }
.status-icon { font-size: 36px; }
.status-text { display: flex; flex-direction: column; }
.status-label { font-size: 16px; font-weight: 600; color: #333; }
.status-time { font-size: 12px; color: #999; margin-top: 4px; }

.section-card {
  margin: 16rpx; background: #fff; border-radius: 16rpx; padding: 24rpx;
}
.section-title { font-size: 14px; font-weight: 600; color: #1E3A5F; margin-bottom: 16rpx; }
.info-grid { display: flex; flex-wrap: wrap; }
.info-item {
  width: 50%; display: flex; flex-direction: column;
  padding: 8rpx 0;
}
.info-item.full { width: 100%; }
.info-label { font-size: 24rpx; color: #999; margin-bottom: 4rpx; }
.info-value { font-size: 28rpx; color: #333; }
.amount { color: #ff6b00; font-weight: 600; }

.image-list { display: flex; flex-wrap: wrap; gap: 12rpx; }
.preview-img {
  width: 180rpx; height: 180rpx; border-radius: 8rpx;
}
.empty-images { font-size: 26rpx; color: #999; padding: 20rpx 0; }

.upload-section { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx; }
.upload-btn {
  width: 180rpx; height: 180rpx; border: 2rpx dashed #ddd;
  border-radius: 8rpx; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8rpx;
}
.upload-icon { font-size: 40px; color: #ccc; }
.upload-text { font-size: 24rpx; color: #999; }
.pending-img-wrap { position: relative; }
.remove-btn {
  position: absolute; top: -8px; right: -8px;
  width: 32rpx; height: 32rpx; background: #f44336; color: #fff;
  border-radius: 50%; font-size: 20px; display: flex; align-items: center;
  justify-content: center; line-height: 1;
}

.action-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; gap: 20rpx; padding: 20rpx 32rpx;
  background: #fff; box-shadow: 0 -2rpx 10rpx rgba(0,0,0,0.08);
  padding-bottom: max(20rpx, env(safe-area-inset-bottom));
}
.btn {
  flex: 1; text-align: center; padding: 24rpx 0;
  border-radius: 40rpx; font-size: 28rpx;
}
.btn.reject { background: #fff; color: #f44336; border: 2rpx solid #f44336; }
.btn.approve { background: #1E3A5F; color: #fff; }
.btn.primary { background: #1E3A5F; color: #fff; }
.btn.full { flex: unset; width: 100%; }
.btn.disabled { opacity: 0.6; }

.dialog-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5); display: flex; align-items: flex-end; z-index: 999;
}
.dialog-content {
  background: #fff; width: 100%; border-radius: 12px 12px 0 0;
  padding-bottom: env(safe-area-inset-bottom);
}
.dialog-header {
  text-align: center; padding: 15px; font-size: 16px; font-weight: bold;
  border-bottom: 1px solid #eee;
}
.dialog-body { padding: 20px 15px; }
.comment-input {
  width: 100%; border: 1px solid #eee; border-radius: 8px;
  padding: 10px; font-size: 14px; min-height: 80px; box-sizing: border-box;
}
.dialog-footer { display: flex; border-top: 1px solid #eee; }
.dialog-btn { flex: 1; text-align: center; padding: 15px; font-size: 15px; }
.dialog-btn.cancel { color: #666; border-right: 1px solid #eee; }
.dialog-btn.confirm { color: #1E3A5F; font-weight: bold; }
</style>
