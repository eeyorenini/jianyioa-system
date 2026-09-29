<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">财务受理</text>
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
          <view class="info-item">
            <text class="info-label">数量</text>
            <text class="info-value">{{ detail.quantity }} {{ detail.unit }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">单价</text>
            <text class="info-value">¥{{ detail.unit_price }}</text>
          </view>
          <view class="info-item full">
            <text class="info-label">预算金额</text>
            <text class="info-value amount">¥{{ detail.total_amount }}</text>
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

      <!-- 实付金额（财务填写） -->
      <view class="section-card">
        <view class="section-title">实付金额</view>
        <view class="amount-input-wrap">
          <text class="yuan-symbol">¥</text>
          <input
            class="amount-input"
            type="digit"
            v-model="financeAmount"
            :placeholder="'预算 ' + detail.total_amount"
          />
        </view>
        <view class="amount-hint">预算金额自动带入，可自行修改</view>
      </view>

      <!-- 财务备注 -->
      <view class="section-card">
        <view class="section-title">财务备注（选填）</view>
        <textarea
          class="finance-notes"
          v-model="financialNotes"
          placeholder="选填备注"
          :adjust-position="true"
        />
      </view>

      <!-- 操作按钮 -->
      <view class="action-bar">
        <view class="btn reject" @click="showRejectDialog">驳回</view>
        <view class="btn primary" @click="handleAccept" :class="{ disabled: submitting }">
          {{ submitting ? '提交中...' : '确认受理' }}
        </view>
      </view>
    </scroll-view>

    <!-- 驳回弹窗 -->
    <view class="dialog-mask" v-if="showDialog" @click="showDialog = false">
      <view class="dialog" @click.stop>
        <view class="dialog-header">
          <text class="dialog-title">财务驳回</text>
        </view>
        <view class="dialog-body">
          <textarea
            class="comment-input"
            v-model="rejectComment"
            placeholder="请输入驳回原因"
            :adjust-position="true"
          />
        </view>
        <view class="dialog-footer">
          <view class="dialog-btn cancel" @click="showDialog = false">取消</view>
          <view class="dialog-btn confirm" @click="submitReject">确定驳回</view>
        </view>
      </view>
    </view>

    <!-- 提交遮罩 -->
    <view class="upload-overlay" v-if="submitting">
      <view class="upload-overlay-content">
        <view class="upload-overlay-spinner">⟳</view>
        <text class="upload-overlay-text">提交中...</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const loading = ref(true)
const detail = ref(null)
const submitting = ref(false)
const financeAmount = ref('')
const financialNotes = ref('')
const showDialog = ref(false)
const rejectComment = ref('')

let currentPage = null

const statusLabel = (s) => {
  const map = {
    reimbursing: '报销中',
    finance_confirmed: '受理中',
    reimbursed: '已完结',
  }
  return map[s] || s
}

const statusBg = (s) => {
  const map = {
    reimbursing: 'linear-gradient(135deg, #fff3e0, #ffe0b2)',
    finance_confirmed: 'linear-gradient(135deg, #e3f2fd, #bbdefb)',
    reimbursed: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
  }
  return map[s] || '#f5f5f5'
}

const statusIcon = (s) => {
  const map = {
    reimbursing: '💰',
    finance_confirmed: '🏦',
    reimbursed: '🏁',
  }
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

function showRejectDialog() {
  rejectComment.value = ''
  showDialog.value = true
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
          raw.amount = item.total_price
        }
        detail.value = raw
        // 预填金额：预算金额
        financeAmount.value = raw.total_amount ? String(raw.total_amount) : ''
      } else {
        uni.showToast({ title: '加载失败', icon: 'none' })
      }
    },
    fail: () => { uni.showToast({ title: '加载失败', icon: 'none' }) },
    complete: () => { loading.value = false }
  })
}

function handleAccept() {
  if (submitting.value) return
  submitting.value = true
  const userInfo = uni.getStorageSync('userInfo') || {}
  uni.request({
    url: `/api/purchase-requests/${detail.value.id}/finance-accept`,
    method: 'POST',
    header: { 'x-user-id': userInfo.id },
    data: {
      finance_amount: parseFloat(financeAmount.value) || 0,
      financial_notes: financialNotes.value
    },
    success: (res) => {
      if (res.data.code === 0 || res.data.code === undefined) {
        uni.showToast({ title: '受理成功', icon: 'success' })
        setTimeout(() => {
          uni.navigateTo({ url: `/pages/purchase/finance-confirm?id=${detail.value.id}` })
        }, 1500)
      } else {
        uni.showToast({ title: res.data.msg || '受理失败', icon: 'none' })
      }
    },
    fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) },
    complete: () => { submitting.value = false }
  })
}

function submitReject() {
  if (!rejectComment.value.trim()) {
    uni.showToast({ title: '请输入驳回原因', icon: 'none' })
    return
  }
  const userInfo = uni.getStorageSync('userInfo') || {}
  uni.request({
    url: `/api/purchase-requests/${detail.value.id}/finance-reject`,
    method: 'PUT',
    header: { 'x-user-id': userInfo.id },
    data: { reason: rejectComment.value },
    success: (res) => {
      if (res.data.code === 0 || res.data.code === undefined) {
        uni.showToast({ title: '已驳回', icon: 'success' })
        setTimeout(() => { uni.navigateBack() }, 1500)
      } else {
        uni.showToast({ title: res.data.msg || '操作失败', icon: 'none' })
      }
    },
    fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) }
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

.image-list { display: flex; flex-wrap: wrap; gap: 8px; }
.preview-img { width: 80px; height: 80px; border-radius: 6px; object-fit: cover; }
.empty-images { color: #ccc; font-size: 13px; text-align: center; padding: 20px 0; }

.amount-input-wrap { display: flex; align-items: center; background: #f9f9f9; border-radius: 6px; padding: 8px 12px; }
.yuan-symbol { font-size: 16px; color: #333; margin-right: 4px; }
.amount-input { flex: 1; font-size: 16px; color: #333; background: transparent; }
.amount-hint { font-size: 11px; color: #bbb; margin-top: 6px; text-align: right; }

.finance-notes { width: 100%; min-height: 80px; background: #f9f9f9; border-radius: 6px; padding: 10px 12px; font-size: 14px; color: #333; box-sizing: border-box; resize: none; }

.action-bar { display: flex; gap: 12px; padding: 16px 0; }
.btn { flex: 1; height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600; }
.btn.reject { background: #fff; color: #f56c6c; border: 1px solid #f56c6c; }
.btn.primary { background: #409eff; color: #fff; }
.btn.primary.disabled { opacity: 0.6; }

.dialog-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
.dialog { background: #fff; border-radius: 12px; width: 300px; overflow: hidden; }
.dialog-header { padding: 16px; border-bottom: 1px solid #eee; }
.dialog-title { font-size: 15px; font-weight: 600; color: #333; }
.dialog-body { padding: 16px; }
.comment-input { width: 100%; min-height: 100px; background: #f5f5f5; border-radius: 6px; padding: 10px; font-size: 14px; color: #333; box-sizing: border-box; resize: none; }
.dialog-footer { display: flex; border-top: 1px solid #eee; }
.dialog-btn { flex: 1; height: 44px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
.dialog-btn.cancel { color: #999; }
.dialog-btn.confirm { color: #409eff; font-weight: 600; border-left: 1px solid #eee; }

.upload-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 200; }
.upload-overlay-content { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.upload-overlay-spinner { font-size: 36px; color: #fff; animation: spin 1s linear infinite; }
.upload-overlay-text { font-size: 14px; color: #fff; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
