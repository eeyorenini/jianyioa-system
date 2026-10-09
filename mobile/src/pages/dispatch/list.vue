<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">派工管理</text>
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
        <view v-if="tab.key === 'pending' && pendingCount > 0" class="tab-badge">{{ pendingCount }}</view>
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
        <text class="empty-icon">👷</text>
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
            <text class="card-title">{{ item.content }}</text>
            <view class="status-tag" :style="{ background: statusBg(item.status), color: statusColor(item.status) }">
              {{ statusLabel(item.status) }}
            </view>
          </view>
          <view class="card-info">
            <view class="info-row">
              <text class="info-label">项目</text>
              <text class="info-value">{{ item.project_name || '-' }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">施工地点</text>
              <text class="info-value">{{ item.location || '-' }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">工人/班组</text>
              <text class="info-value">{{ item.worker || '-' }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">约定工费</text>
              <text class="info-value amount">¥{{ item.fee || 0 }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">开始时间</text>
              <text class="info-value">{{ item.start_date || '-' }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">申请人</text>
              <text class="info-value">{{ item.applicant_name || '-' }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">时间</text>
              <text class="info-value">{{ item.created_at }}</text>
            </view>
          </view>
          <!-- 2026-10-10：我的派工：所有状态都显示删除按钮（按大王要求） -->
          <view v-if="activeTab === 'my'" class="card-actions" @click.stop>
            <view class="action-btn danger" @click="handleDelete(item)">删除</view>
          </view>
          <!-- 待审核：显示反审核 + 驳回 + 通过 按钮 -->
          <view v-else-if="activeTab === 'pending' && item.status === 'pending'" class="card-actions" @click.stop>
            <view class="action-btn danger" @click="handleRevert(item)">反审核</view>
            <view class="action-btn reject" @click="handleReject(item)">驳回</view>
            <view class="action-btn approve" @click="handleApprove(item)">通过</view>
          </view>
          <!-- 进行中：显示确认完工按钮（不显示删除） -->
          <view v-else-if="activeTab === 'progress' && item.status === 'approved'" class="card-actions" @click.stop>
            <view class="action-btn approve" @click="handleComplete(item)">确认完工</view>
          </view>
          <!-- 已完成：不能删除/操作（按大王要求） -->
        </view>
      </view>
      <view v-if="loadingMore" class="loading-more"><text class="loading-text">加载中...</text></view>
      <view v-else-if="noMore && list.length > 0" class="loading-more"><text class="loading-text">没有更多了</text></view>
    </scroll-view>

    <!-- 新建按钮（我的派工tab显示） -->
    <view v-if="activeTab === 'my'" class="fab" @click="goAdd">
      <text class="fab-icon">+</text>
    </view>

    <!-- 审批/操作弹窗 -->
    <view v-if="showDialog" class="dialog-mask" @click="showDialog = false">
      <view class="dialog-content" @click.stop>
        <view class="dialog-header">{{ dialogTitle }}</view>
        <view class="dialog-body">
          <textarea
            class="comment-input"
            v-model="dialogComment"
            :placeholder="dialogAction === 'complete' ? '选填备注' : '请输入驳回原因'"
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const activeTab = ref('my')
const list = ref([])
const loading = ref(false)
const refreshing = ref(false)
const loadingMore = ref(false)
const page = ref(1)
const pageSize = 20
const noMore = ref(false)
const pendingCount = ref(0)
const showDialog = ref(false)
const dialogAction = ref('approve')
const dialogComment = ref('')
const currentItem = ref(null)

const tabs = computed(() => [
  { key: 'my', label: '我的派工' },
  { key: 'pending', label: '待审核' },
  { key: 'progress', label: '进行中' },
  { key: 'completed', label: '已完成' },
])

const emptyText = computed(() => {
  const map = {
    my: '暂无派工单',
    pending: '暂无待审核派工',
    progress: '暂无进行中派工',
    completed: '暂无已完成派工',
  }
  return map[activeTab.value] || '暂无数据'
})

function statusLabel(s) {
  const map = {
    pending: '待审核',
    approved: '进行中',
    rejected: '已驳回',
    completed: '已完成',
  }
  return map[s] || s
}

function statusBg(s) {
  const map = {
    pending: '#fff3e0',
    approved: '#DBEAFE',
    rejected: '#ffebee',
    completed: '#D1FAE5',
  }
  return map[s] || '#f5f5f5'
}

function statusColor(s) {
  const map = {
    pending: '#ff9800',
    approved: '#1E40AF',
    rejected: '#f44336',
    completed: '#065F46',
  }
  return map[s] || '#999'
}

const dialogTitle = computed(() => {
  if (dialogAction.value === 'approve') return '通过派工单'
  if (dialogAction.value === 'reject') return '驳回派工单'
  if (dialogAction.value === 'complete') return '确认完工'
  return '操作确认'
})

function goBack() {
  const pages = getCurrentPages()
  if (pages.length <= 1) {
    uni.switchTab({ url: '/pages/home/index' })
  } else {
    uni.navigateBack()
  }
}

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
  const userId = userInfo.id || ''
  let url = ''
  let data = { page: page.value, page_size: pageSize }

  if (activeTab.value === 'my') {
    url = '/api/dispatches/my'
  } else if (activeTab.value === 'pending') {
    url = '/api/dispatches/pending'
  } else if (activeTab.value === 'progress') {
    url = '/api/dispatches'
    data.status = 'approved'
  } else if (activeTab.value === 'completed') {
    url = '/api/dispatches'
    data.status = 'completed'
  }

  uni.request({
    url,
    data,
    header: { 'x-user-id': userId },
    success: (res) => {
      if (res.data.code === 0 || res.data.code === undefined) {
        const arr = res.data.list || res.data.data?.list || (Array.isArray(res.data) ? res.data : [])
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
  const userId = uni.getStorageSync('userInfo')?.id || ''
  uni.request({
    url: '/api/dispatches/pending',
    data: { page: 1, page_size: 1 },
    header: { 'x-user-id': userId },
    success: (res) => {
      const total = res.data.total || res.data.list?.length || 0
      pendingCount.value = total
    }
  })
}

function goDetail(item) {
  uni.navigateTo({ url: `/pages/dispatch/detail?id=${item.id}` })
}

function goAdd() {
  uni.navigateTo({ url: '/pages/dispatch/add' })
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

function handleComplete(item) {
  currentItem.value = item
  dialogAction.value = 'complete'
  dialogComment.value = ''
  showDialog.value = true
}

// 2026-10-10：反审核（从已通过/已驳回改回待审核）
function handleRevert(item) {
  uni.showModal({
    title: '反审核',
    content: '确定要将此派工单反审核回"待审核"状态吗？',
    confirmText: '反审核',
    confirmColor: '#f44336',
    success: (res) => {
      if (res.confirm) {
        const token = uni.getStorageSync('userInfo')?.id || ''
        uni.request({
          url: `/api/dispatches/${item.id}/revert`,
          method: 'POST',
          header: { 'x-user-id': token },
          success: (res) => {
            if (res.data.code === 0 || res.data.code === undefined || res.statusCode === 200) {
              uni.showToast({ title: '已反审核', icon: 'success' })
              page.value = 1
              loadData()
              loadCounts()
            } else {
              uni.showToast({ title: res.data.error || '操作失败', icon: 'none' })
            }
          },
          fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) }
        })
      }
    }
  })
}

function handleDelete(item) {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这条派工单吗？删除后不可恢复。',
    confirmColor: '#f44336',
    success: (res) => {
      if (res.confirm) {
        const token = uni.getStorageSync('userInfo')?.id || ''
        uni.request({
          url: `/api/dispatches/${item.id}`,
          method: 'DELETE',
          header: { 'x-user-id': token },
          success: (res) => {
            if (res.data.code === 0 || res.data.code === undefined || res.statusCode === 200) {
              uni.showToast({ title: '已删除', icon: 'success' })
              page.value = 1
              loadData()
              loadCounts()
            } else {
              uni.showToast({ title: res.data.error || '删除失败', icon: 'none' })
            }
          },
          fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) }
        })
      }
    }
  })
}

function submitAction() {
  const id = currentItem.value.id

  if (dialogAction.value === 'reject' && !dialogComment.value.trim()) {
    uni.showToast({ title: '请输入驳回原因', icon: 'none' })
    return
  }

  if (dialogAction.value === 'complete') {
    // 确认完工
    const token = uni.getStorageSync('userInfo')?.id || ''
    uni.request({
      url: `/api/dispatches/${id}/complete`,
      method: 'PUT',
      header: { 'x-user-id': token },
      data: { remark: dialogComment.value },
      success: (res) => {
        if (res.data.code === 0 || res.data.code === undefined || res.statusCode === 200) {
          uni.showToast({ title: '已确认完工', icon: 'success' })
          showDialog.value = false
          // 2026-10-10：完工后跳到"已完成" tab，让用户看到结果
          activeTab.value = 'completed'
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

  // 审核通过/驳回
  const token = uni.getStorageSync('userInfo')?.id || ''
  const url = `/api/dispatches/${id}/approve`
  const data = dialogAction.value === 'approve'
    ? { action: 'approve' }
    : { action: 'reject', reason: dialogComment.value }

  uni.request({
    url,
    method: 'PUT',
    header: { 'x-user-id': token },
    data,
    success: (res) => {
      if (res.data.code === 0 || res.data.code === undefined) {
        uni.showToast({ title: dialogAction.value === 'approve' ? '已通过' : '已驳回', icon: 'success' })
        showDialog.value = false
        // 2026-10-10：审核后跳到对应 tab：
        //  - approve → "进行中"（approved 派工单）
        //  - reject  → "我的"（用户能看到自己被驳回的派工单）
        activeTab.value = dialogAction.value === 'approve' ? 'progress' : 'my'
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
  loadData()
  loadCounts()
  uni.$on('dispatch-refresh', () => {
    page.value = 1
    loadData()
    loadCounts()
  })
})

onUnmounted(() => {
  uni.$off('dispatch-refresh')
})

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
  font-size: 15px; font-weight: 600; color: #1A1F36;
  flex: 1; margin-right: 10px;
}
.status-tag {
  font-size: 11px; padding: 2px 8px; border-radius: 10px;
  white-space: nowrap;
}
.card-info { }
.info-row {
  display: flex; font-size: 13px; margin-bottom: 4px;
}
.info-label { color: #999; width: 80px; flex-shrink: 0; }
.info-value { color: #333; flex: 1; }
.info-value.amount { color: #1E3A5F; font-weight: 600; }

.card-actions {
  display: flex; gap: 10px; margin-top: 12px; padding-top: 12px;
  border-top: 1px solid #f5f5f5; justify-content: flex-end;
}
.action-btn {
  padding: 6px 18px; border-radius: 6px; font-size: 13px;
  font-weight: 500;
}
.action-btn.approve { background: #1E3A5F; color: #fff; }
.action-btn.reject { background: #fff; color: #f44336; border: 1px solid #f44336; }
.action-btn.danger { background: #fff; color: #f44336; border: 1px solid #f44336; }

.loading-more { text-align: center; padding: 16px; }
.loading-text { color: #999; font-size: 13px; }

.fab {
  position: fixed; right: 20px; bottom: 90px;
  width: 52px; height: 52px;
  background: linear-gradient(135deg, #1E3A5F, #3B82F6);
  color: #fff; border-radius: 50%;
  font-size: 28px; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 16px rgba(30,58,95,0.4); z-index: 100;
}
.fab-icon { font-size: 28px; font-weight: 300; }

/* 审批弹窗 */
.dialog-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  z-index: 200; display: flex; align-items: center; justify-content: center;
}
.dialog-content {
  background: #fff; border-radius: 16px; width: 300px;
  overflow: hidden;
}
.dialog-header {
  text-align: center; font-size: 16px; font-weight: 600;
  padding: 20px 16px 12px; color: #1A1F36;
}
.dialog-body { padding: 0 16px 16px; }
.comment-input {
  width: 100%; border: 1px solid #eee; border-radius: 8px;
  padding: 12px; font-size: 14px; resize: none; box-sizing: border-box;
  min-height: 80px;
}
.dialog-footer {
  display: flex; border-top: 1px solid #f5f5f5;
}
.dialog-btn {
  flex: 1; text-align: center; padding: 14px 0; font-size: 15px;
  &:first-child { border-right: 1px solid #f5f5f5; }
}
.dialog-btn.cancel { color: #666; }
.dialog-btn.confirm { color: #1E3A5F; font-weight: 600; }
</style>
