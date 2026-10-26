<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">采购申请</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- Tab切换：只有 1 个 tab 时整条隐藏，避免一条 tab 占满整行 -->
    <view v-if="tabs.length > 1" class="tab-bar">
      <view
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-item"
        :class="{ active: activeTab === tab.key }"
        @click="switchTab(tab.key)"
      >
        <text class="tab-text">{{ tab.label }}</text>
        <text v-if="tab.badge" class="tab-badge">{{ tab.badge > 99 ? '99+' : tab.badge }}</text>
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
      <!-- 汇总条 -->
      <view v-if="list.length" class="summary-bar">
        <text class="summary-count">共 {{ total }} 单</text>
        <text v-if="noMore" class="summary-amount">合计 ¥{{ fmtMoney(sumAmount) }}</text>
      </view>

      <!-- 首次加载 -->
      <view v-if="loading && list.length === 0" class="state-state">
        <view class="spin"></view>
        <text class="state-text">加载中...</text>
      </view>

      <!-- 空态 -->
      <view v-else-if="list.length === 0" class="state-state">
        <text class="empty-icon">🧾</text>
        <text class="empty-text">{{ emptyText }}</text>
        <text v-if="activeTab === 'my'" class="empty-hint">点右下角 + 提交采购申请</text>
      </view>

      <view v-else class="card-list">
        <view
          v-for="item in list"
          :key="item.id"
          class="card"
          @click="goDetail(item)"
        >
          <!-- 标题 + 状态 -->
          <view class="card-head">
            <text class="card-title">{{ item.material_name || '采购申请' }}</text>
            <text class="status-pill" :class="'st-' + (item.status || 'default')">
              {{ statusLabel(item.status) }}
            </text>
          </view>

          <!-- 金额 / 数量 -->
          <view class="card-amount-row">
            <text class="card-amount">¥{{ fmtMoney(item.total_amount) }}</text>
            <text v-if="item.quantity" class="card-qty">{{ fmtQty(item.quantity) }}{{ item.unit || '' }}</text>
          </view>

          <!-- 当前环节提示 -->
          <view v-if="flowHint(item) && activeTab === 'my'" class="flow-hint">
            <text class="flow-text">{{ flowHint(item) }}</text>
          </view>

          <!-- 单据信息 -->
          <view class="card-meta">
            <view v-if="item.project_name" class="meta-row">
              <text class="meta-k">项目</text>
              <text class="meta-v">{{ item.project_name }}</text>
            </view>
            <view v-if="item.supplier_name" class="meta-row">
              <text class="meta-k">供应商</text>
              <text class="meta-v">{{ item.supplier_name }}</text>
            </view>
            <view class="meta-row">
              <text class="meta-k">申请人</text>
              <text class="meta-v">
                {{ item.applicant_name || '—' }}
                <text class="meta-dot">·</text>
                <text class="meta-time">{{ fmtTime(item.created_at) }}</text>
              </text>
            </view>
          </view>

          <!-- 附件 / 凭证 -->
          <view v-if="imagesOf(item).length || reimburseImagesOf(item).length" class="card-media">
            <view v-if="imagesOf(item).length" class="media-group">
              <text class="media-label">申请附件</text>
              <view class="thumb-list">
                <image
                  v-for="(img, idx) in imagesOf(item)"
                  :key="'a' + idx"
                  class="thumb-img"
                  :src="img"
                  mode="aspectFill"
                  @click.stop="previewImage(img, imagesOf(item))"
                />
              </view>
            </view>
            <view v-if="reimburseImagesOf(item).length" class="media-group">
              <text class="media-label">报销凭证</text>
              <view class="thumb-list">
                <image
                  v-for="(img, idx) in reimburseImagesOf(item)"
                  :key="'r' + idx"
                  class="thumb-img"
                  :src="img"
                  mode="aspectFill"
                  @click.stop="previewImage(img, reimburseImagesOf(item))"
                />
              </view>
            </view>
          </view>

          <!-- 我的申请：待审核/已驳回 → 删除 -->
          <view v-if="activeTab === 'my' && (item.status === 'pending' || item.status === 'rejected')" class="card-actions" @click.stop>
            <view class="action-btn danger" @click="handleDelete(item)">删除</view>
          </view>
          <!-- 我的申请：已通过无报销 → 上传报销 / 反审核 / 删除 -->
          <view v-else-if="activeTab === 'my' && item.status === 'approved' && !hasReimbursement(item)" class="card-actions" @click.stop>
            <view class="action-btn danger" @click="handleDelete(item)">删除</view>
            <view class="action-btn warn" @click="handleUnapprove(item)">反审核</view>
            <view class="action-btn approve" @click="goReimburseDetail(item)">上传报销</view>
          </view>
          <view v-else-if="activeTab === 'my' && item.status === 'approved' && hasReimbursement(item)" class="card-actions" @click.stop>
            <view class="action-btn ghost" @click="goReimburseDetail(item)">查看报销</view>
          </view>
          <!-- 待我审核 -->
          <view v-else-if="activeTab === 'pending' && item.status === 'pending'" class="card-actions" @click.stop>
            <view class="action-btn reject" @click="handleReject(item)">驳回</view>
            <view class="action-btn approve" @click="handleApprove(item)">通过</view>
          </view>
          <!-- 待报销：申请人上传 -->
          <view v-else-if="activeTab === 'reimburse' && item.status === 'approved' && !hasReimbursement(item)" class="card-actions" @click.stop>
            <view class="action-btn approve" @click="goReimburseDetail(item)">上传报销</view>
          </view>
          <!-- 待报销：财务受理 -->
          <view v-else-if="activeTab === 'reimburse' && item.status === 'reimbursing'" class="card-actions" @click.stop>
            <view class="action-btn reject" @click="handleFinanceReject(item)">驳回</view>
            <view class="action-btn approve" @click="handleFinanceConfirm(item)">确认</view>
          </view>
          <!-- 财务确认：上传回执 -->
          <view v-else-if="activeTab === 'finance' && item.status === 'finance_confirmed'" class="card-actions" @click.stop>
            <view class="action-btn approve" @click="goFinanceConfirm(item)">上传回执</view>
          </view>
        </view>
      </view>

      <view v-if="loadingMore" class="loading-more"><text class="loading-text">加载中...</text></view>
      <view v-else-if="noMore && list.length > 3" class="loading-more"><text class="loading-text">没有更多了</text></view>

      <!-- 给底部 tabBar 与 FAB 留出空间 -->
      <view class="bottom-pad"></view>
    </scroll-view>

    <!-- 新建按钮 -->
    <view v-if="activeTab === 'my'" class="fab" @click="goAdd">
      <text class="fab-icon">+</text>
    </view>

    <!-- 审批弹窗 -->
    <view v-if="showDialog" class="dialog-mask" @click="showDialog = false">
      <view class="dialog-content" @click.stop>
        <view class="dialog-header">{{ dialogTitle }}</view>
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
                <image class="img-thumb" :src="absAsset(img)" mode="aspectFill" @click="previewReimburseImage(img)" />
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
import { absAsset } from '@/utils/api'
import { useUserStore } from '@/stores/user'
import { guardTab } from '@/utils/permission'

const userStore = useUserStore()
const activeTab = ref('my')
const list = ref([])
const total = ref(0)
const loading = ref(false)
const refreshing = ref(false)
const loadingMore = ref(false)
const page = ref(1)
const pageSize = 20
const noMore = ref(false)
const pendingCount = ref(0)
const reimburseCount = ref(0)
const showDialog = ref(false)
const reimburseDialogVisible = ref(false)
const reimburseForm = ref({ actual_amount: '', financial_notes: '', images: [] })
const dialogAction = ref('approve') // 'approve' | 'reject' | 'finance_reject'
const dialogComment = ref('')
const currentItem = ref(null)

// 权限判定统一走 store（由服务端 /api/me 同步；借权切换后随之变化）
const can = (perm) => userStore.can(perm)
const isFinanceView = () => {
  const info = uni.getStorageSync('userInfo') || {}
  return !!(info.purchase_finance || info.is_finance) || userStore.can('purchase:finance')
}

// tab 按权限渲染：一个页面，各角色只看到自己该处理的
const tabs = computed(() => {
  const arr = [{ key: 'my', label: '我的申请', badge: null }]
  if (can('purchase:approve')) {
    arr.push({ key: 'pending', label: '待审核', badge: pendingCount.value || null })
  }
  if (can('purchase:write') || can('purchase:finance')) {
    arr.push({ key: 'reimburse', label: '待报销', badge: reimburseCount.value || null })
  }
  if (can('purchase:finance')) {
    arr.push({ key: 'finance', label: '财务确认', badge: null })
  }
  return arr
})

const emptyText = computed(() => {
  const map = {
    my: '暂无采购申请',
    pending: '暂无待审核申请',
    reimburse: '暂无待报销申请',
    finance: '暂无待财务确认',
  }
  return map[activeTab.value] || '暂无数据'
})

const dialogTitle = computed(() => {
  if (dialogAction.value === 'approve') return '通过申请'
  if (dialogAction.value === 'finance_reject') return '驳回报销'
  return '驳回申请'
})

const sumAmount = computed(() =>
  list.value.reduce((s, i) => s + (Number(i.total_amount) || 0), 0)
)

function statusLabel(s) {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    reimbursing: '报销中',
    finance_confirmed: '受理中',
    reimbursed: '已完结',
  }
  return map[s] || s || '未知'
}

// 金额千分位两位小数
function fmtMoney(v) {
  const n = Number(v)
  if (!isFinite(n)) return '0.00'
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// 数量去掉无意义的尾随 0：1.00 → 1，2.50 → 2.5
function fmtQty(v) {
  const n = Number(v)
  if (!isFinite(n)) return v
  return String(parseFloat(n.toFixed(2)))
}

// 时间只取「月-日 时:分」，列表里不需要年份和秒
function fmtTime(s) {
  if (!s) return ''
  const str = String(s)
  // 形如 2026-10-09 22:25:16 / 2026-10-09T22:25:16
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (m) return `${m[2]}-${m[3]} ${m[4]}:${m[5]}`
  return str
}

// 当前所处环节提示：让申请人清楚「现在轮到谁处理」
function flowHint(item) {
  const s = item && item.status
  if (s === 'reimbursing') return '已上传凭证，等待财务受理'
  if (s === 'finance_confirmed') return '财务已受理，等待上传报销回执'
  if (s === 'approved') return '待您上传报销凭证'
  return ''
}

/**
 * 图片字段兼容三种形态：
 *   字符串 JSON 数组 ["/uploads/a.png"]
 *   对象数组 [{id,url,status}]  ← 采购申请 images 就是这种
 *   已是数组本身
 * 统一返回可用的 url 数组（过滤空值与无法识别的项）。
 * 之前直接把对象传给 absAsset()，得到 "[object Object]"，列表全是裂图。
 */
function getImages(imgField) {
  if (!imgField) return []
  let arr = imgField
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr) } catch { return [] }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .map((it) => {
      if (typeof it === 'string') return it
      if (it && typeof it === 'object') return it.url || it.path || ''
      return ''
    })
    .filter(Boolean)
}

function imagesOf(item) {
  return getImages(item && item.images).map(absAsset)
}

// 报销凭证图片（来自 purchase_reimbursements.images）
function reimburseImagesOf(item) {
  if (!item || !item.reimbursement) return []
  return getImages(item.reimbursement.images).map(absAsset)
}

const previewImage = (current, urls) => {
  uni.previewImage({ current, urls })
}

// 2026-10-26 修复：本页是 tabBar 页（pages.json tabBar 里的「采购」），
// 直接 uni.navigateBack() 在栈底会**静默失败**（无上一页可退），点了完全没反应。
// 其他 tabBar 页（项目/巡检/我的）早就有 getCurrentPages 兜底，本页漏了。
function goBack() {
  const pages = getCurrentPages()
  if (pages.length <= 1) {
    uni.switchTab({ url: '/pages/home/index' })
  } else {
    uni.navigateBack()
  }
}

// 切 tab 只在这里改状态，加载交给 watch（避免重复请求）
function switchTab(key) {
  if (key === activeTab.value) return
  activeTab.value = key
}

function onRefresh() {
  refreshing.value = true
  page.value = 1
  noMore.value = false
  loadData()
}

function loadMore() {
  if (loadingMore.value || noMore.value || loading.value) return
  page.value++
  loadData(true)
}

function loadData(isMore = false) {
  if (loading.value) return
  loading.value = true
  if (!isMore) noMore.value = false

  const userInfo = uni.getStorageSync('userInfo') || {}
  let url = ''
  const data = { page: page.value, page_size: pageSize }

  if (activeTab.value === 'my') {
    url = '/api/purchase-requests/my'
    data.applicant_id = userInfo.id
  } else if (activeTab.value === 'pending') {
    url = '/api/purchase-requests/pending'
  } else if (activeTab.value === 'reimburse') {
    url = isFinanceView() ? '/api/purchase-requests/reimburse' : '/api/purchase-requests/to-reimburse'
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
        const t = Number(res.data.total)
        if (isFinite(t)) total.value = t
        else if (!isMore) total.value = arr.length
        noMore.value = arr.length < pageSize
      } else {
        if (!isMore) { list.value = []; total.value = 0 }
      }
    },
    fail: () => { if (!isMore) { list.value = []; total.value = 0 } },
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

// 上传报销单（申请人）— 弹窗快速报销
function showReimburseDialog(item) {
  currentItem.value = item
  reimburseForm.value = { actual_amount: item.total_amount || '', financial_notes: '', images: [] }
  reimburseDialogVisible.value = true
}

function goReimburseDetail(item) {
  showReimburseDialog(item)
}

function hasReimbursement(item) {
  return !!(item && (item.reimbursement || item._hasReimbursement))
}

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

// 反审核
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

// 切 tab 时重置分页再加载
watch(activeTab, () => {
  page.value = 1
  list.value = []
  noMore.value = false
  total.value = 0
  loadData()
})
</script>

<style lang="scss" scoped>
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #F5F7FA;
  box-sizing: border-box;
}

/* ---------- 导航 ---------- */
.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  flex-shrink: 0;
  position: relative;
  z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; line-height: 1; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

/* ---------- Tab ---------- */
.tab-bar {
  display: flex; background: #fff; flex-shrink: 0;
  padding: 0 6px;
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.04);
}
.tab-item {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 13px 4px; position: relative;
}
.tab-text { font-size: 13px; color: #6B7280; }
.tab-item.active .tab-text { color: #1E3A5F; font-weight: 600; }
.tab-item.active::after {
  content: ''; position: absolute; bottom: 0; left: 50%;
  transform: translateX(-50%); width: 24px; height: 3px;
  border-radius: 2px; background: #1E3A5F;
}
.tab-badge {
  position: absolute; top: 6px; right: 12px;
  background: #EF4444; color: #fff; border-radius: 9px;
  font-size: 10px; line-height: 15px; padding: 0 5px;
  min-width: 15px; text-align: center;
}

/* ---------- 列表容器 ---------- */
.list-container {
  flex: 1;
  height: 0;              /* flex 子项允许收缩，否则 scroll-view 撑破页面 */
  padding: 12px 12px 0;
  box-sizing: border-box;
}
.bottom-pad { height: 96px; }

/* ---------- 汇总 ---------- */
.summary-bar {
  display: flex; align-items: baseline; justify-content: space-between;
  padding: 2px 4px 10px;
}
.summary-count { font-size: 12px; color: #8A93A3; }
.summary-amount { font-size: 12px; color: #1E3A5F; font-weight: 600; }

/* ---------- 空/加载态 ---------- */
.state-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 90px 0;
}
.spin {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid #E5E7EB; border-top-color: #1E3A5F;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.state-text { font-size: 13px; color: #9CA3AF; }
.empty-icon { font-size: 40px; margin-bottom: 12px; }
.empty-text { font-size: 14px; color: #6B7280; }
.empty-hint {
  font-size: 12px; color: #B0B7C3; margin-top: 8px;
  background: #EEF2F7; padding: 6px 14px; border-radius: 12px;
}

/* ---------- 卡片 ---------- */
.card-list { padding-bottom: 4px; }
.card {
  background: #fff; border-radius: 14px; padding: 14px;
  margin-bottom: 10px;
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.05);
}

.card-head { display: flex; align-items: center; justify-content: space-between; }
.card-title {
  font-size: 15px; font-weight: 600; color: #1A1F36;
  flex: 1; margin-right: 8px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.status-pill {
  font-size: 11px; line-height: 1; padding: 5px 9px; border-radius: 10px;
  color: #fff; background: #9CA3AF; flex-shrink: 0;
}
.status-pill.st-pending { background: #F59E0B; }
.status-pill.st-approved { background: #0E9F6E; }
.status-pill.st-rejected { background: #DC2626; }
.status-pill.st-reimbursing { background: #2563EB; }
.status-pill.st-finance_confirmed { background: #7C3AED; }
.status-pill.st-reimbursed { background: #64748B; }
.status-pill.st-default { background: #9CA3AF; }

.card-amount-row {
  display: flex; align-items: baseline; margin-top: 8px;
}
.card-amount {
  font-size: 20px; font-weight: 700; color: #1E3A5F; letter-spacing: -0.3px;
}
.card-qty { font-size: 12px; color: #8A93A3; margin-left: 10px; }

.flow-hint {
  margin-top: 10px; padding: 7px 10px;
  background: #FFF7E6; border-radius: 8px;
}
.flow-text { font-size: 12px; color: #B45309; }

.card-meta {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid #F1F3F7;
}
.meta-row { display: flex; margin-bottom: 5px; }
.meta-row:last-child { margin-bottom: 0; }
.meta-k {
  font-size: 12px; color: #9CA3AF; width: 52px; flex-shrink: 0;
}
.meta-v {
  font-size: 12px; color: #4B5563; flex: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.meta-dot { color: #D1D5DB; margin: 0 6px; }
.meta-time { color: #9CA3AF; }

/* ---------- 图片 ---------- */
.card-media {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid #F1F3F7;
}
.media-group { margin-bottom: 8px; }
.media-group:last-child { margin-bottom: 0; }
.media-label { font-size: 11px; color: #9CA3AF; display: block; margin-bottom: 6px; }
.thumb-list { display: flex; flex-wrap: wrap; }
.thumb-img {
  width: 56px; height: 56px; border-radius: 8px;
  margin: 0 8px 8px 0; background: #F3F4F6;
  flex-shrink: 0;
}

/* ---------- 操作 ---------- */
.card-actions {
  display: flex; align-items: center; justify-content: flex-end;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid #F1F3F7;
}
.action-btn {
  font-size: 13px; line-height: 1; padding: 9px 16px;
  border-radius: 8px; margin-left: 8px;
  border: 1px solid transparent;
}
.action-btn.approve { background: #1E3A5F; color: #fff; }
.action-btn.reject { background: #fff; color: #DC2626; border-color: #FCA5A5; }
.action-btn.danger { background: #fff; color: #9CA3AF; border-color: #E5E7EB; }
.action-btn.warn { background: #fff; color: #D97706; border-color: #FCD34D; }
.action-btn.ghost { background: #F3F4F6; color: #4B5563; }

/* ---------- 底部 ---------- */
.loading-more { text-align: center; padding: 14px 0 4px; }
.loading-text { font-size: 12px; color: #B0B7C3; }

.fab {
  position: fixed;
  right: 18px;
  /* 主包 tabBar 约 50px 高，FAB 必须抬高，否则被压住一半 */
  bottom: calc(72px + env(safe-area-inset-bottom));
  width: 52px; height: 52px; border-radius: 26px;
  background: #1E3A5F; color: #fff; font-size: 28px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 16px rgba(30, 58, 95, 0.32);
  z-index: 90;
}
.fab-icon { font-size: 28px; color: #fff; line-height: 1; }

/* ---------- 弹窗 ---------- */
.dialog-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex; align-items: flex-end; z-index: 999;
}
.dialog-content {
  background: #fff; width: 100%; border-radius: 16px 16px 0 0;
  padding-bottom: env(safe-area-inset-bottom);
}
.dialog-header {
  text-align: center; padding: 16px; font-size: 16px; font-weight: 600;
  color: #1A1F36; border-bottom: 1px solid #F1F3F7;
}
.dialog-body { padding: 18px 16px; }
.dialog-footer { display: flex; border-top: 1px solid #F1F3F7; }
.dialog-btn { flex: 1; text-align: center; padding: 15px; font-size: 15px; }
.dialog-btn.cancel { color: #6B7280; border-right: 1px solid #F1F3F7; }
.dialog-btn.confirm { color: #1E3A5F; font-weight: 600; }

.form-row { display: flex; flex-direction: column; margin-bottom: 16px; }
.form-row:last-child { margin-bottom: 0; }
.form-label { font-size: 13px; color: #374151; margin-bottom: 8px; }
.form-input {
  border: 1px solid #E5E7EB; border-radius: 10px; padding: 11px 12px;
  font-size: 14px; box-sizing: border-box; background: #FAFBFC;
}
.comment-input {
  width: 100%; border: 1px solid #E5E7EB; border-radius: 10px;
  padding: 11px 12px; font-size: 14px; min-height: 80px;
  box-sizing: border-box; background: #FAFBFC;
}
.img-uploader { display: flex; flex-wrap: wrap; }
.img-thumb-wrap { position: relative; width: 78px; height: 78px; margin: 0 10px 10px 0; }
.img-thumb { width: 78px; height: 78px; border-radius: 10px; background: #F3F4F6; }
.img-remove {
  position: absolute; top: -7px; right: -7px;
  width: 20px; height: 20px; line-height: 18px; text-align: center;
  background: #EF4444; color: #fff; border-radius: 50%; font-size: 14px;
}
.img-add {
  width: 78px; height: 78px; border-radius: 10px; margin-bottom: 10px;
  border: 1px dashed #D1D5DB; background: #FAFBFC;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: #9CA3AF;
}
.img-add-icon { font-size: 24px; line-height: 1; }
.img-add-text { font-size: 11px; margin-top: 4px; }
</style>
