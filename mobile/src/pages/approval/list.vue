<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">审批</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- Tab切换 -->
    <view class="tab-bar">
      <view class="tab-item" :class="{ active: activeTab === 'my' }" @click="switchTab('my')">
        我的申请
        <view v-if="myCount > 0" class="badge">{{ myCount }}</view>
      </view>
      <view class="tab-item" :class="{ active: activeTab === 'todo' }" @click="switchTab('todo')">
        待我审批
        <view v-if="todoCount > 0" class="badge">{{ todoCount }}</view>
      </view>
    </view>

    <!-- 筛选栏 -->
    <view class="filter-bar">
      <picker mode="selector" :range="typeOptions" range-key="label" @change="onTypeChange">
        <view class="filter-item">
          {{ currentTypeLabel }} <text class="arrow">▼</text>
        </view>
      </picker>
    </view>

    <!-- 列表 -->
    <scroll-view class="list-container" scroll-y
      @refresherrefresh="onRefresh"
      @scrolltolower="loadMore"
      :refresher-enabled="true"
      :refresher-triggered="refreshing">
      <view v-if="loading && list.length === 0" class="empty-state">
        <text class="loading-icon">⟳</text>
      </view>
      <view v-else-if="list.length === 0" class="empty-state">
        <text class="empty-icon">📋</text>
        <text class="empty-text">暂无审批</text>
      </view>
      <view v-else>
        <view
          v-for="item in list"
          :key="item.id"
          class="approval-card"
          @click="goDetail(item)">
          <view class="card-header">
            <text class="card-title">{{ item.title }}</text>
            <view class="status-tag" :style="{ background: statusConfig(item.status).bgColor, color: statusConfig(item.status).color }">
              {{ item.status }}
            </view>
          </view>
          <view class="card-info">
            <view class="info-row">
              <text class="info-label">类型</text>
              <text class="info-value">{{ item.type }}</text>
            </view>
            <view class="info-row" v-if="item.amount">
              <text class="info-label">金额</text>
              <text class="info-value amount">¥{{ formatNumber(item.amount) }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">{{ activeTab === 'my' ? '审批人' : '申请人' }}</text>
              <text class="info-value">{{ activeTab === 'my' ? item.approver_name : item.applicant_name }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">时间</text>
              <text class="info-value">{{ item.created_at }}</text>
            </view>
          </view>
          <!-- 待我审批显示操作按钮 -->
          <view v-if="activeTab === 'todo' && item.status === '待审批'" class="card-actions" @click.stop>
            <view class="action-btn reject" @click="handleReject(item)">驳回</view>
            <view class="action-btn approve" @click="handleApprove(item)">同意</view>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 发起审批按钮 -->
    <view v-if="activeTab === 'my'" class="fab" @click="goApply">
      <text class="fab-icon">+</text>
    </view>

    <!-- 审批弹窗 -->
    <view v-if="showApproveDialog" class="dialog-mask" @click="showApproveDialog = false">
      <view class="dialog-content" @click.stop>
        <view class="dialog-header">审批操作</view>
        <view class="dialog-body">
          <view class="action-group">
            <view class="action-item" :class="{ active: approveAction === '同意' }" @click="approveAction = '同意'">
              <text class="action-icon">✓</text>
              <text>同意</text>
            </view>
            <view class="action-item" :class="{ active: approveAction === '驳回' }" @click="approveAction = '驳回'">
              <text class="action-icon">✗</text>
              <text>驳回</text>
            </view>
          </view>
          <textarea class="comment-input" v-model="approveComment" :placeholder="approveAction === '同意' ? '选填审批意见' : '请输入驳回原因'" />
        </view>
        <view class="dialog-footer">
          <view class="dialog-btn cancel" @click="showApproveDialog = false">取消</view>
          <view class="dialog-btn confirm" @click="submitApprove">确定</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
const apiBase = ''  // 空字符串，使用相对路径，通过vite代理或实际域名访问

export default {
  data() {
    return {
      activeTab: 'my',
      list: [],
      loading: false,
      refreshing: false,
      showApproveDialog: false,
      currentItem: null,
      approveAction: '同意',
      approveComment: '',
      todoCount: 0,
      myCount: 0,
      filterType: '',
      page: 1,
      hasMore: true
    }
  },
  computed: {
    typeOptions() {
      return [{ label: '全部类型', value: '' }, { label: '报销', value: '报销' }, { label: '支出', value: '支出' }, { label: '请假', value: '请假' }, { label: '采购', value: '采购' }, { label: '付款', value: '付款' }, { label: '其他', value: '其他' }]
    },
    currentTypeLabel() {
      const found = this.typeOptions.find(t => t.value === this.filterType)
      return found ? found.label : '全部类型'
    }
  },
  onLoad() {
    this.loadData()
    this.loadCounts()
  },
  methods: {
    goBack() { uni.navigateBack() },
    switchTab(tab) {
      this.activeTab = tab
      this.page = 1
      this.list = []
      this.loadData()
    },
    onTypeChange(e) {
      this.filterType = this.typeOptions[e.detail.value].value
      this.page = 1
      this.list = []
      this.loadData()
    },
    loadData() {
      if (this.loading) return
      this.loading = true
      const api = this.activeTab === 'my' ? '/api/approvals/my' : '/api/approvals/todo'
      uni.request({
        url: `${apiBase}${api}`,
        data: { page: this.page, pageSize: 20, type: this.filterType },
        success: (res) => {
          if (res.data) {
            if (this.page === 1) this.list = res.data
            else this.list = [...this.list, ...res.data]
            this.hasMore = res.data.length === 20
          }
        },
        fail: () => { uni.showToast({ title: '加载失败', icon: 'none' }) },
        complete: () => { this.loading = false; this.refreshing = false }
      })
    },
    loadCounts() {
      uni.request({ url: `${apiBase}/api/approvals/my`, data: { page: 1, pageSize: 1, status: '待审批' }, success: (res) => { if (res.data) this.myCount = res.data.length } })
      uni.request({ url: `${apiBase}/api/approvals/todo`, data: { page: 1, pageSize: 1 }, success: (res) => { if (res.data) this.todoCount = res.data.length } })
    },
    onRefresh() { this.refreshing = true; this.page = 1; this.loadData() },
    loadMore() { if (this.hasMore && !this.loading) { this.page++; this.loadData() } },
    formatNumber(num) { return num ? Number(num).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00' },
    statusConfig(status) {
      const map = { '待审批': { bgColor: '#fff3e0', color: '#ff9800' }, '已通过': { bgColor: '#e8f5e9', color: '#4caf50' }, '已驳回': { bgColor: '#ffebee', color: '#f44336' } }
      return map[status] || { bgColor: '#f5f5f5', color: '#999' }
    },
    goDetail(item) { uni.navigateTo({ url: `/pages/approval/detail?id=${item.id}&tab=${this.activeTab}` }) },
    goApply() { uni.navigateTo({ url: '/pages/approval/apply' }) },
    handleApprove(item) { this.currentItem = item; this.approveAction = '同意'; this.approveComment = ''; this.showApproveDialog = true },
    handleReject(item) { this.currentItem = item; this.approveAction = '驳回'; this.approveComment = ''; this.showApproveDialog = true },
    submitApprove() {
      if (this.approveAction === '驳回' && !this.approveComment.trim()) {
        uni.showToast({ title: '请输入驳回原因', icon: 'none' }); return
      }
      const api = this.approveAction === '同意'
        ? `${apiBase}/api/approvals/${this.currentItem.id}/approve`
        : `${apiBase}/api/approvals/${this.currentItem.id}/reject`
      uni.request({
        url: api, method: 'POST', data: { comment: this.approveComment },
        success: () => {
          uni.showToast({ title: this.approveAction === '同意' ? '已同意' : '已驳回', icon: 'success' })
          this.showApproveDialog = false
          this.page = 1
          this.loadData()
          this.loadCounts()
        },
        fail: (e) => { uni.showToast({ title: '操作失败', icon: 'none' }) }
      })
    }
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 15px; background: #fff; }
.nav-back { font-size: 24px; color: #333; }
.nav-title { font-size: 16px; font-weight: bold; color: #333; }
.nav-placeholder { width: 24px; }
.tab-bar { display: flex; background: #fff; border-bottom: 1px solid #eee; }
.tab-item { flex: 1; text-align: center; padding: 12px 0; font-size: 14px; color: #666; position: relative; }
.tab-item.active { color: #1890ff; font-weight: bold; }
.tab-item.active::after { content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 40px; height: 2px; background: #1890ff; }
.badge { position: absolute; top: 4px; right: calc(50% - 20px); background: #ff4d4f; color: #fff; border-radius: 10px; font-size: 10px; padding: 0 5px; min-width: 16px; text-align: center; }
.filter-bar { display: flex; padding: 10px 15px; background: #fff; border-bottom: 1px solid #eee; }
.filter-item { font-size: 13px; color: #666; background: #f5f5f5; padding: 5px 12px; border-radius: 4px; }
.arrow { font-size: 10px; margin-left: 4px; }
.list-container { height: calc(100vh - 180px); }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; }
.loading-icon, .empty-icon { font-size: 48px; }
.empty-text { color: #999; font-size: 14px; margin-top: 10px; }
.approval-card { background: #fff; margin: 10px 15px; border-radius: 8px; padding: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.card-title { font-size: 15px; font-weight: bold; color: #333; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-tag { font-size: 12px; padding: 2px 8px; border-radius: 4px; margin-left: 10px; }
.card-info { display: flex; flex-direction: column; gap: 6px; }
.info-row { display: flex; font-size: 13px; }
.info-label { color: #999; width: 60px; }
.info-value { color: #333; flex: 1; }
.amount { color: #ff6b00; font-weight: bold; }
.card-actions { display: flex; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f0f0; justify-content: flex-end; }
.action-btn { padding: 6px 16px; border-radius: 4px; font-size: 13px; }
.action-btn.reject { background: #fff; color: #ff4d4f; border: 1px solid #ff4d4f; }
.action-btn.approve { background: #1890ff; color: #fff; }
.fab { position: fixed; right: 20px; bottom: 30px; width: 50px; height: 50px; background: #1890ff; border-radius: 25px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(24,144,255,0.4); }
.fab-icon { font-size: 28px; color: #fff; line-height: 1; }
.dialog-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: flex-end; z-index: 999; }
.dialog-content { background: #fff; width: 100%; border-radius: 12px 12px 0 0; padding-bottom: env(safe-area-inset-bottom); }
.dialog-header { text-align: center; padding: 15px; font-size: 16px; font-weight: bold; border-bottom: 1px solid #eee; }
.dialog-body { padding: 20px 15px; }
.action-group { display: flex; gap: 15px; margin-bottom: 15px; }
.action-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 15px; border: 1px solid #eee; border-radius: 8px; }
.action-item.active { border-color: #1890ff; background: #e6f7ff; }
.action-icon { font-size: 24px; }
.comment-input { width: 100%; border: 1px solid #eee; border-radius: 8px; padding: 10px; font-size: 14px; min-height: 80px; box-sizing: border-box; }
.dialog-footer { display: flex; border-top: 1px solid #eee; }
.dialog-btn { flex: 1; text-align: center; padding: 15px; font-size: 15px; }
.dialog-btn.cancel { color: #666; border-right: 1px solid #eee; }
.dialog-btn.confirm { color: #1890ff; font-weight: bold; }
</style>
