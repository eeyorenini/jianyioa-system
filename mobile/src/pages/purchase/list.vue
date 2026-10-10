<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">采购申请</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- Tab切换 -->
    <view class="tab-bar">
      <view
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-item"
        :class="{ active: activeTab === tab.key }"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
        <view v-if="tab.badge" class="tab-badge">{{ tab.badge }}</view>
      </view>
    </view>

    <!-- 列表 -->
    <scroll-view
      class="list-container"
      scroll-y
      @scrolltolower="loadMore"
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
    >
      <view v-if="loading && list.length === 0" class="empty-state">
        <text class="loading-icon">⟳</text>
      </view>
      <view v-else-if="list.length === 0" class="empty-state">
        <text class="empty-icon">📋</text>
        <text class="empty-text">{{ emptyText }}</text>
      </view>
      <view v-else>
        <view
          v-for="item in list"
          :key="item.id"
          class="card"
          @click="goDetail(item)"
        >
          <view class="card-header">
            <text class="card-title">{{ item.material_name }}</text>
            <view class="status-tag" :style="{ background: statusBg(item.status), color: statusColor(item.status) }">
              {{ statusLabel(item.status) }}
            </view>
          </view>
          <view v-if="flowHint(item) && activeTab === 'my'" class="flow-hint">{{ flowHint(item) }}</view>
          <view class="card-info">
            <view class="info-row">
              <text class="info-label">项目</text>
              <text class="info-value">{{ item.project_name }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">供应商</text>
              <text class="info-value">{{ item.supplier_name }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">数量</text>
              <text class="info-value">{{ item.quantity }}{{ item.unit }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">金额</text>
              <text class="info-value amount">¥{{ item.total_amount || 0 }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">申请人</text>
              <text class="info-value">{{ item.applicant_name }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">时间</text>
              <text class="info-value">{{ item.created_at }}</text>
            </view>
            <!-- 图片缩略图（申请时） -->
            <view v-if="getImages(item.images).length" class="info-row image-row">
              <text class="info-label">图片</text>
              <view class="thumb-list">
                <image
                  v-for="(img, idx) in getImages(item.images)"
                  :key="idx"
                  class="thumb-img"
                  :src="getImgUrl(img)"
                  mode="aspectFill"
                  @click.stop="previewImage(img, getImages(item.images))"
                />
              </view>
            </view>
            <!-- 报销凭证缩略图（已上传报销后显示） -->
            <view v-if="reimburseImagesOf(item).length" class="info-row image-row">
              <text class="info-label">凭证</text>
              <view class="thumb-list">
                <image
                  v-for="(img, idx) in reimburseImagesOf(item)"
                  :key="'r' + idx"
                  class="thumb-img"
                  :src="getImgUrl(img)"
                  mode="aspectFill"
                  @click.stop="previewImage(img, reimburseImagesOf(item))"
                />
              </view>
            </view>
          </view>
          <!-- 我的申请：待审核/已驳回显示删除；已通过显示"上传报销"和"反审核" -->
          <view v-if="activeTab === 'my' && (item.status === 'pending' || item.status === 'rejected')" class="card-actions" @click.stop>
            <view class="action-btn danger" @click="handleDelete(item)">删除</view>
          </view>
          <view v-else-if="activeTab === 'my' && item.status === 'approved' && !hasReimbursement(item)" class="card-actions" @click.stop>
            <view class="action-btn approve" @click="goReimburseDetail(item)">上传报销</view>
            <view class="action-btn warn" @click="handleUnapprove(item)">反审核</view>
            <view class="action-btn danger" @click="handleDelete(item)">删除</view>
          </view>
          <view v-else-if="activeTab === 'my' && item.status === 'approved' && hasReimbursement(item)" class="card-actions" @click.stop>
            <view class="action-btn" @click="goReimburseDetail(item)">查看报销</view>
          </view>
          <!-- 待我审核 显示操作按钮 -->
          <view v-else-if="activeTab === 'pending' && item.status === 'pending'" class="card-actions" @click.stop>
            <view class="action-btn reject" @click="handleReject(item)">驳回</view>
            <view class="action-btn approve" @click="handleApprove(item)">通过</view>
          </view>
          <!-- 待报销（申请人视角 status=approved 且无 reimbursement）显示"上传报销" -->
          <view v-else-if="activeTab === 'reimburse' && item.status === 'approved' && !hasReimbursement(item)" class="card-actions" @click.stop>
            <view class="action-btn approve" @click="goReimburseDetail(item)">上传报销</view>
          </view>
          <!-- 待报销（财务视角 status=reimbursing）显示确认/驳回按钮 -->
          <view v-else-if="activeTab === 'reimburse' && item.status === 'reimbursing'" class="card-actions" @click.stop>
            <view class="action-btn reject" @click="handleFinanceReject(item)">驳回</view>
            <view class="action-btn approve" @click="handleFinanceConfirm(item)">确认</view>
          </view>
          <!-- 财务确认tab：finance_confirmed 状态跳上传回执页 -->
          <view v-else-if="activeTab === 'finance' && item.status === 'finance_confirmed'" class="card-actions" @click.stop>
            <view class="action-btn approve" @click="goFinanceConfirm(item)">上传回执</view>
          </view>
        </view>
      </view>
      <view v-if="loadingMore" class="loading-more"><text class="loading-text">加载中...</text></view>
      <view v-else-if="noMore && list.length > 0" class="loading-more"><text class="loading-text">没有更多了</text></view>
    </scroll-view>

    <!-- 新建按钮 -->
    <view v-if="activeTab === 'my'" class="fab" @click="goAdd">
      <text class="fab-icon">+</text>
    </view>

    <!-- 审批弹窗 -->
    <view v-if="showDialog" class="dialog-mask" @click="showDialog = false">
      <view class="dialog-content" @click.stop>
        <view class="dialog-header">{{ dialogAction === 'approve' ? '通过申请' : '驳回申请' }}</view>
        <view class="dialog-body">
          <textarea
            class="comment-input"
            v-model="dialogComment"
            :placeholder="dialogAction === 'approve' ? '选填备注' : '请输入驳回原因'"
          />
        </view>
        <view class="dialog-footer">
          <view class="dialog-btn cancel" @click="showDialog = false">取消</view>
          <view class="dialog-btn confirm" @click="submitAction">确定</view>
        </view>
      </view>
    </view>

    <!-- 上传报销单弹窗 -->
    <view v-if="reimburseDialogVisible" class="dialog-mask" @click="closeReimburseDialog">
      <view class="dialog-content" @click.stop>
        <view class="dialog-header">上传报销单</view>
        <view class="dialog-body">
          <view class="form-row">
            <text class="form-label">实付金额 *</text>
            <input class="form-input" v-model="reimburseForm.actual_amount" type="digit" placeholder="¥0.00" />
          </view>
          <view class="form-row">
            <text class="form-label">财务备注</text>
            <textarea class="comment-input" v-model="reimburseForm.financial_notes" placeholder="选填：发票号/付款方式/其他说明" />
          </view>
          <view class="form-row">
            <text class="form-label">报销凭证 *</text>
            <view class="img-uploader">
              <view v-for="(img, idx) in reimburseForm.images" :key="idx" class="img-thumb-wrap">
                <image class="img-thumb" :src="img" mode="aspectFill" @click="previewReimburseImage(img)" />
                <view class="img-remove" @click="removeReimburseImage(idx)">×</view>
              </view>
              <view v-if="reimburseForm.images.length < 9" class="img-add" @click="chooseReimburseImages">
                <text class="img-add-icon">+</text>
                <text class="img-add-text">添加凭证</text>
              </view>
            </view>
          </view>
        </view>
        <view class="dialog-footer">
          <view class="dialog-btn cancel" @click="closeReimburseDialog">取消</view>
          <view class="dialog-btn confirm" @click="submitReimburse">确定上传</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { guardTab } from '@/utils/permission'

const userStore = useUserStore()
const activeTab = ref('my')
const list = ref([])
const loading = ref(false)
const refreshing = ref(false)
const loadingMore = ref(false)
const page = ref(1)
const pageSize = 20
const noMore = ref(false)
const pendingCount = ref(0)
const reimburseCount = ref(0)
const showDialog = ref(false)
const reimburseDialogVisible = ref(false)  // 2026-10-10
const reimburseForm = ref({ actual_amount: '', financial_notes: '', images: [] })  // 2026-10-10
const dialogAction = ref('approve') // 'approve' | 'reject'
const dialogComment = ref('')
const currentItem = ref(null)

// 权限判定统一走 store（由服务端 /api/me 同步；借权切换后随之变化）
const userPerms = () => userStore.permissionList()
const isAdminUser = () => userStore.isAdminUser()
const can = (perm) => userStore.can(perm)
const isFinanceView = () => {
  const info = uni.getStorageSync('userInfo') || {}
  return !!(info.purchase_finance || info.is_finance) || userStore.can('purchase:finance')
}

// tab 按权限渲染：一个页面，各角色只看到自己该处理的
const tabs = computed(() => {
  const list = [{ key: 'my', label: '我的申请', badge: null }]
  if (can('purchase:approve')) {
    list.push({ key: 'pending', label: '待审核', badge: pendingCount.value || null })
  }
  if (can('purchase:write') || can('purchase:finance')) {
    list.push({ key: 'reimburse', label: '待报销', badge: reimburseCount.value || null })
  }
  if (can('purchase:finance')) {
    list.push({ key: 'finance', label: '财务确认', badge: null })
  }
  return list
})

const emptyText = computed(() => {
  const map = {
    my: '暂无采购申请',
    pending: '暂无待审核申请',
    reimburse: '暂无待报销申请',
    finance: '暂无待财务确认',
    finance_confirmed: '暂无受理中单据',
  }
  return map[activeTab.value] || '暂无数据'
})

function statusLabel(s) {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    reimbursing: '报销中',
    finance_confirmed: '受理中',
    reimbursed: '已完结',
  }
  return map[s] || s
}

function statusBg(s) {
  const map = {
    pending: '#fff3e0',
    approved: '#e8f5e9',
    rejected: '#ffebee',
    reimbursing: '#fff3e0',
    finance_confirmed: '#e3f2fd',
    reimbursed: '#e8f5e9',
  }
  return map[s] || '#f5f5f5'
}

function statusColor(s) {
  const map = {
    pending: '#ff9800',
    approved: '#4caf50',
    rejected: '#f44336',
    reimbursing: '#ff9800',
    finance_confirmed: '#2196f3',
    reimbursed: '#4caf50',
  }
  return map[s] || '#999'
}

// 当前所处环节提示：让申请人清楚「现在轮到谁处理」
function flowHint(item) {
  const s = item && item.status
  if (s === 'reimbursing') return '⏳ 已上传凭证，等待财务受理'
  if (s === 'finance_confirmed') return '🏦 财务已受理，等待上传报销回执'
  if (s === 'approved') return '📤 待您上传报销凭证'
  return ''
}

const getImages = (imgField) => {
  if (!imgField) return []
  if (Array.isArray(imgField)) return imgField
  try { return JSON.parse(imgField) } catch { return [] }
}

// 2026-10-10：报销凭证图片（来自 purchase_reimbursements.images）
const reimburseImagesOf = (item) => {
  if (!item || !item.reimbursement) return []
  return getImages(item.reimbursement.images)
}

const getImgUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return path
}

const previewImage = (current, list) => {
  uni.previewImage({ current, urls: list })
}

function goBack() { uni.navigateBack() }

function switchTab(key) {
  activeTab.value = key
  page.value = 1
  list.value = []
  noMore.value = false
  loadData()
}

function onRefresh() {
  refreshing.value = true
  page.value = 1
  noMore.value = false
  loadData()
}

function loadMore() {
  if (loadingMore.value || noMore.value) return
  page.value++
  loadData(true)
}

function loadData(isMore = false) {
  if (loading.value) return
  loading.value = true

  const userInfo = uni.getStorageSync('userInfo') || {}
  let url = ''
  let data = { page: page.value, page_size: pageSize }

  if (activeTab.value === 'my') {
    url = '/api/purchase-requests/my'
    data.applicant_id = userInfo.id
  } else if (activeTab.value === 'pending') {
    url = '/api/purchase-requests/pending'
  } else if (activeTab.value === 'reimburse') {
    // 2026-10-10：申请人视角查 to-reimburse；财务视角查 reimburse
    if (isFinanceView()) {
      url = '/api/purchase-requests/reimburse'
    } else {
      url = '/api/purchase-requests/to-reimburse'
    }
  } else if (activeTab.value === 'finance') {
    url = '/api/purchase-requests/finance'
  }

  uni.request({
    url,
    data,
    success: (res) => {
      if (res.data.code === 0 || res.data.code === undefined) {
        const arr = res.data.list || res.data.data?.list || []
        if (isMore) {
          list.value = [...list.value, ...arr]
        } else {
          list.value = arr
        }
        noMore.value = arr.length < pageSize
      } else {
        if (!isMore) list.value = []
      }
    },
    fail: () => { if (!isMore) list.value = [] },
    complete: () => {
      loading.value = false
      refreshing.value = false
      loadingMore.value = false
    }
  })
}

function loadCounts() {
  const userInfo = uni.getStorageSync('userInfo') || {}

  // 待审核数量（仅审批人）
  if (can('purchase:approve')) {
    uni.request({
      url: '/api/purchase-requests/pending',
      data: { page: 1, page_size: 1 },
      header: { 'x-user-id': String(userInfo.id || '') },
      success: (res) => { pendingCount.value = Number(res.data.total) || 0 },
      fail: () => { pendingCount.value = 0 }
    })
  } else {
    pendingCount.value = 0
  }

  // 待报销数量（申请人用 to-reimburse；财务用 reimburse）
  if (can('purchase:write') || can('purchase:finance')) {
    const countUrl = isFinanceView() ? '/api/purchase-requests/reimburse' : '/api/purchase-requests/to-reimburse'
    uni.request({
      url: countUrl,
      data: { page: 1, page_size: 1 },
      header: { 'x-user-id': String(userInfo.id || '') },
      success: (res) => { reimburseCount.value = Number(res.data.total) || 0 },
      fail: () => { reimburseCount.value = 0 }
    })
  } else {
    reimburseCount.value = 0
  }
}

function goDetail(item) {
  uni.navigateTo({ url: `/pages/purchase/detail?id=${item.id}` })
}

function goAdd() {
  uni.navigateTo({ url: '/pages/material/purchase' })
}

function handleApprove(item) {
  currentItem.value = item
  dialogAction.value = 'approve'
  dialogComment.value = ''
  showDialog.value = true
}

function handleReject(item) {
  currentItem.value = item
  dialogAction.value = 'reject'
  dialogComment.value = ''
  showDialog.value = true
}

function handleDelete(item) {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这条采购申请吗？删除后不可恢复。',
    confirmColor: '#f44336',
    success: (modalRes) => {
      if (!modalRes.confirm) return
      const userInfo = uni.getStorageSync('userInfo') || {}
      uni.request({
        url: `/api/purchase-requests/${item.id}`,
        method: 'DELETE',
        header: { 'x-user-id': String(userInfo.id || '') },
        success: (res) => {
          // 严格判断：必须 statusCode=200 且 res.data.message 表明成功
          if (res.statusCode === 200 && res.data && res.data.message) {
            uni.showToast({ title: '已删除', icon: 'success' })
            page.value = 1
            loadData()
            loadCounts()
          } else {
            uni.showToast({ title: (res.data && (res.data.error || res.data.message)) || '删除失败', icon: 'none' })
          }
        },
        fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) }
      })
    }
  })
}

// 财务确认 — 跳转到财务受理页
function handleFinanceConfirm(item) {
  uni.navigateTo({ url: `/pages/purchase/finance-accept?id=${item.id}` })
}

// 2026-10-10：上传报销单（申请人）— 走弹窗快速报销
function showReimburseDialog(item) {
  currentItem.value = item
  reimburseForm.value = { actual_amount: item.total_amount || '', financial_notes: '', images: [] }
  reimburseDialogVisible.value = true
}

// 2026-10-10：从 list 进入报销 detail 页面（用于"查看报销"按钮）
function goReimburseDetail(item) {
  // 弹窗快速上传；如果想进 detail 完整页面，把下面注释打开
  showReimburseDialog(item)
  // uni.navigateTo({ url: `/pages/purchase/detail?id=${item.id}` })
}

// 2026-10-10：判断列表项是否已有报销记录
function hasReimbursement(item) {
  return !!(item && (item.reimbursement || item._hasReimbursement))
}

// 2026-10-10：选报销凭证图片（最多 9 张）
function chooseReimburseImages() {
  uni.chooseImage({
    count: 9 - reimburseForm.value.images.length,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      reimburseForm.value.images = [...reimburseForm.value.images, ...res.tempFilePaths]
    }
  })
}

function removeReimburseImage(idx) {
  reimburseForm.value.images.splice(idx, 1)
}

function previewReimburseImage(current) {
  uni.previewImage({ urls: reimburseForm.value.images, current })
}

function closeReimburseDialog() {
  if (uploadingReimburse.value) {
    uni.showToast({ title: '上传中，请稍候', icon: 'none' })
    return
  }
  reimburseDialogVisible.value = false
}

// 2026-10-10：反审核
function handleUnapprove(item) {
  uni.showModal({
    title: '确认反审核',
    content: '将已通过的申请退回待审核队列，确认操作？',
    confirmColor: '#ff9800',
    success: (modalRes) => {
      if (!modalRes.confirm) return
      const userInfo = uni.getStorageSync('userInfo') || {}
      uni.request({
        url: `/api/purchase-requests/${item.id}/unapprove`,
        method: 'PUT',
        header: { 'x-user-id': String(userInfo.id || '') },
        success: (res) => {
          if (res.statusCode === 200 && (res.data.code === 0 || res.data.message || res.data.error === undefined)) {
            uni.showToast({ title: '已反审核', icon: 'success' })
            page.value = 1
            loadData()
            loadCounts()
          } else {
            uni.showToast({ title: (res.data && (res.data.error || res.data.message)) || '反审核失败', icon: 'none' })
          }
        },
        fail: () => uni.showToast({ title: '网络错误', icon: 'none' })
      })
    }
  })
}

const uploadingReimburse = ref(false)

function submitReimburse() {
  if (uploadingReimburse.value) return
  if (!reimburseForm.value.actual_amount) {
    uni.showToast({ title: '请填写实付金额', icon: 'none' })
    return
  }
  if (reimburseForm.value.images.length === 0) {
    uni.showToast({ title: '请至少上传一张凭证', icon: 'none' })
    return
  }
  if (!currentItem.value || !currentItem.value.id) {
    uni.showToast({ title: '参数错误', icon: 'none' })
    return
  }

  const id = currentItem.value.id
  const userInfo = uni.getStorageSync('userInfo') || {}
  const token = String(userInfo.id || '')
  const paths = reimburseForm.value.images
  uploadingReimburse.value = true

  // 多文件上传：先 uploadFile 全部拿到 URL，再 POST JSON 给后端（避免 4xx 时回滚）
  const tasks = paths.map((p) => new Promise((resolve) => {
    uni.uploadFile({
      url: '/api/upload-image',
      filePath: p,
      name: 'file',
      header: { 'x-user-id': token },
      success: (res) => {
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
          resolve(data.url || data.path || '')
        } catch { resolve('') }
      },
      fail: () => resolve('')
    })
  }))

  uni.showLoading({ title: '上传凭证中...' })
  Promise.all(tasks).then((urls) => {
    const validUrls = urls.filter(Boolean)
    if (validUrls.length === 0) {
      uni.hideLoading()
      uploadingReimburse.value = false
      uni.showToast({ title: '凭证上传失败', icon: 'none' })
      return
    }
    // 提交报销
    uni.request({
      url: `/api/purchase-requests/${id}/reimburse`,
      method: 'POST',
      header: { 'x-user-id': token },
      data: {
        actual_amount: reimburseForm.value.actual_amount,
        financial_notes: reimburseForm.value.financial_notes,
        images: JSON.stringify(validUrls)
      },
      success: (res) => {
        if (res.statusCode === 200 && (res.data.code === 0 || res.data.message)) {
          uni.showToast({ title: '报销单已提交', icon: 'success' })
          reimburseDialogVisible.value = false
          page.value = 1
          loadData()
          loadCounts()
        } else {
          uni.showToast({ title: (res.data && (res.data.error || res.data.message)) || '提交失败', icon: 'none' })
        }
      },
      fail: () => uni.showToast({ title: '网络错误', icon: 'none' }),
      complete: () => {
        uni.hideLoading()
        uploadingReimburse.value = false
      }
    })
  })
}

// 财务上传回执 — 跳转到财务确认页
function goFinanceConfirm(item) {
  uni.navigateTo({ url: `/pages/purchase/finance-confirm?id=${item.id}` })
}

// 财务驳回（打回给员工重新上传）
function handleFinanceReject(item) {
  currentItem.value = item
  dialogAction.value = 'finance_reject'
  dialogComment.value = ''
  showDialog.value = true
}

function submitAction() {
  const id = currentItem.value.id

  // 财务驳回报销
  if (dialogAction.value === 'finance_reject') {
    if (!dialogComment.value.trim()) {
      uni.showToast({ title: '请输入驳回原因', icon: 'none' })
      return
    }
    uni.request({
      url: `/api/purchase-requests/${id}/finance-reject`,
      method: 'PUT',
      data: { reason: dialogComment.value },
      success: (res) => {
        if (res.data.code === 0 || res.data.code === undefined || res.statusCode === 200) {
          uni.showToast({ title: '已驳回', icon: 'success' })
          showDialog.value = false
          page.value = 1
          loadData()
          loadCounts()
        } else {
          uni.showToast({ title: res.data.error || '操作失败', icon: 'none' })
        }
      },
      fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) }
    })
    return
  }

  // 审批通过/驳回
  if (dialogAction.value === 'reject' && !dialogComment.value.trim()) {
    uni.showToast({ title: '请输入驳回原因', icon: 'none' })
    return
  }
  const url = `/api/purchase-requests/${id}/approve`
  const data = dialogAction.value === 'approve'
    ? { action: 'approve' }
    : { action: 'reject', reason: dialogComment.value }
  uni.request({
    url,
    method: 'PUT',
    data,
    success: (res) => {
      if (res.data.code === 0 || res.data.code === undefined) {
        uni.showToast({ title: dialogAction.value === 'approve' ? '已通过' : '已驳回', icon: 'success' })
        showDialog.value = false
        page.value = 1
        loadData()
        loadCounts()
      } else {
        uni.showToast({ title: res.data.msg || res.data.error || '操作失败', icon: 'none' })
      }
    },
    fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) }
  })
}

onMounted(() => {
  if (!guardTab('purchase:read')) return
  loadData()
  loadCounts()
})

// 切换 tab 时重新加载数据
watch(activeTab, () => {
  loadData()
})
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.tab-bar {
  display: flex; background: #fff;
  border-bottom: 1px solid #eee;
}
.tab-item {
  flex: 1; text-align: center; padding: 12px 0;
  font-size: 13px; color: #666; position: relative;
}
.tab-item.active { color: #1E3A5F; font-weight: bold; }
.tab-item.active::after {
  content: ''; position: absolute; bottom: 0; left: 50%;
  transform: translateX(-50%); width: 40px; height: 2px; background: #1E3A5F;
}
.tab-badge {
  position: absolute; top: 4px; right: calc(50% - 18px);
  background: #ff4d4f; color: #fff; border-radius: 10px;
  font-size: 10px; padding: 0 5px; min-width: 16px; text-align: center;
}

.list-container { height: calc(100vh - 100px); padding: 12px; }
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 80px 0;
}
.loading-icon, .empty-icon { font-size: 48px; }
.empty-text { color: #999; font-size: 14px; margin-top: 10px; }

.card {
  background: #fff; border-radius: 12px; padding: 16px;
  margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}
.card-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px;
}
.card-title {
  font-size: 15px; font-weight: bold; color: #333;
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.status-tag {
  font-size: 12px; padding: 2px 8px; border-radius: 4px; margin-left: 8px;
}
.flow-hint {
  font-size: 12px; color: #ff9800; margin: 6px 0 8px;
}
.card-info { display: flex; flex-direction: column; gap: 6px; }
.info-row { display: flex; font-size: 13px; }
.info-label { color: #999; width: 60px; flex-shrink: 0; }
.info-value { color: #333; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.amount { color: #ff6b00; font-weight: 600; }

.image-row { align-items: flex-start; }
.thumb-list { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
.thumb-img {
  width: 50px; height: 50px; border-radius: 4px;
  border: 1rpx solid #eee; flex-shrink: 0;
}

.card-actions {
  display: flex; gap: 10px; margin-top: 12px;
  padding-top: 12px; border-top: 1px solid #f0f0f0; justify-content: flex-end;
}
.action-btn { padding: 6px 16px; border-radius: 4px; font-size: 13px; }
.action-btn.reject { background: #fff; color: #f44336; border: 1px solid #f44336; }
.action-btn.approve { background: #1E3A5F; color: #fff; }
.action-btn.danger { background: #fff; color: #f44336; border: 1px solid #f44336; }
.action-btn.warn { background: #fff; color: #ff9800; border: 1px solid #ff9800; }

.form-row { display: flex; flex-direction: column; margin-bottom: 16px; }
.form-label { font-size: 13px; color: #333; margin-bottom: 6px; }
.form-input {
  border: 1px solid #eee; border-radius: 8px; padding: 10px;
  font-size: 14px; box-sizing: border-box;
}
.img-uploader {
  display: flex; flex-wrap: wrap; gap: 10px;
}
.img-thumb-wrap { position: relative; width: 80px; height: 80px; }
.img-thumb { width: 80px; height: 80px; border-radius: 6px; border: 1rpx solid #eee; }
.img-remove {
  position: absolute; top: -8px; right: -8px;
  width: 20px; height: 20px; line-height: 18px; text-align: center;
  background: #f44336; color: #fff; border-radius: 50%; font-size: 14px;
}
.img-add {
  width: 80px; height: 80px; border-radius: 6px;
  border: 1rpx dashed #ccc; display: flex; flex-direction: column;
  align-items: center; justify-content: center; color: #999;
}
.img-add-icon { font-size: 26px; line-height: 1; }
.img-add-text { font-size: 11px; margin-top: 4px; }

.loading-more { text-align: center; padding: 20px; }
.loading-text { font-size: 24rpx; color: #999; }

.fab {
  position: fixed; right: 20px; bottom: 30px;
  width: 50px; height: 50px; background: #1E3A5F; border-radius: 25px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(30,58,95,0.4);
}
.fab-icon { font-size: 28px; color: #fff; line-height: 1; }

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
