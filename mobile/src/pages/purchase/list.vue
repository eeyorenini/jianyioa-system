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
              <text class="info-value amount">¥{{ item.amount || 0 }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">申请人</text>
              <text class="info-value">{{ item.applicant_name }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">时间</text>
              <text class="info-value">{{ item.created_at }}</text>
            </view>
          </view>
          <!-- 待我审核 显示操作按钮 -->
          <view v-if="activeTab === 'pending' && item.status === 'pending'" class="card-actions" @click.stop>
            <view class="action-btn reject" @click="handleReject(item)">驳回</view>
            <view class="action-btn approve" @click="handleApprove(item)">通过</view>
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
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

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
const dialogAction = ref('approve') // 'approve' | 'reject'
const dialogComment = ref('')
const currentItem = ref(null)

const tabs = computed(() => [
  { key: 'my', label: '我的申请', badge: null },
  { key: 'pending', label: '待审核', badge: pendingCount.value || null },
  { key: 'reimburse', label: '待报销', badge: reimburseCount.value || null },
  { key: 'finance', label: '财务确认', badge: null },
])

const emptyText = computed(() => {
  const map = {
    my: '暂无采购申请',
    pending: '暂无待审核申请',
    reimburse: '暂无待报销申请',
    finance: '暂无待财务确认',
  }
  return map[activeTab.value] || '暂无数据'
})

function statusLabel(s) {
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

function statusBg(s) {
  const map = {
    pending: '#fff3e0',
    approved: '#e8f5e9',
    rejected: '#ffebee',
    reimburse: '#fff3e0',
    reimbursed: '#e8f5e9',
    finance_confirmed: '#e3f2fd',
  }
  return map[s] || '#f5f5f5'
}

function statusColor(s) {
  const map = {
    pending: '#ff9800',
    approved: '#4caf50',
    rejected: '#f44336',
    reimburse: '#ff9800',
    reimbursed: '#4caf50',
    finance_confirmed: '#2196f3',
  }
  return map[s] || '#999'
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
    url = '/api/purchase-requests/reimburse'
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

  // 待审核数量
  uni.request({
    url: '/api/purchase-requests/pending',
    data: { page: 1, page_size: 1 },
    success: (res) => {
      const arr = res.data.list || res.data.data?.list || []
      pendingCount.value = arr.length
    }
  })

  // 待报销数量
  uni.request({
    url: '/api/purchase-requests/reimburse',
    data: { page: 1, page_size: 1 },
    success: (res) => {
      const arr = res.data.list || res.data.data?.list || []
      reimburseCount.value = arr.length
    }
  })
}

function goDetail(item) {
  uni.navigateTo({ url: `/pages/purchase/detail?id=${item.id}` })
}

function goAdd() {
  uni.navigateTo({ url: '/pages/purchase/add' })
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

function submitAction() {
  if (dialogAction.value === 'reject' && !dialogComment.value.trim()) {
    uni.showToast({ title: '请输入驳回原因', icon: 'none' })
    return
  }
  const id = currentItem.value.id
  const url = dialogAction.value === 'approve'
    ? `/api/purchase-requests/${id}/approve`
    : `/api/purchase-requests/${id}/reject`
  uni.request({
    url,
    method: 'POST',
    data: { comment: dialogComment.value },
    success: (res) => {
      if (res.data.code === 0 || res.data.code === undefined) {
        uni.showToast({ title: dialogAction.value === 'approve' ? '已通过' : '已驳回', icon: 'success' })
        showDialog.value = false
        page.value = 1
        loadData()
        loadCounts()
      } else {
        uni.showToast({ title: res.data.msg || '操作失败', icon: 'none' })
      }
    },
    fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) }
  })
}

onMounted(() => {
  loadData()
  loadCounts()
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
.card-info { display: flex; flex-direction: column; gap: 6px; }
.info-row { display: flex; font-size: 13px; }
.info-label { color: #999; width: 60px; flex-shrink: 0; }
.info-value { color: #333; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.amount { color: #ff6b00; font-weight: 600; }

.card-actions {
  display: flex; gap: 10px; margin-top: 12px;
  padding-top: 12px; border-top: 1px solid #f0f0f0; justify-content: flex-end;
}
.action-btn { padding: 6px 16px; border-radius: 4px; font-size: 13px; }
.action-btn.reject { background: #fff; color: #f44336; border: 1px solid #f44336; }
.action-btn.approve { background: #1E3A5F; color: #fff; }

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
