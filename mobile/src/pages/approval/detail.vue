<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">审批详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>
    <view v-else class="detail-container">
      <!-- 基本信息 -->
      <view class="section">
        <view class="section-title">基本信息</view>
        <view class="info-grid">
          <view class="info-item">
            <text class="info-label">标题</text>
            <text class="info-value">{{ detail.title }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">类型</text>
            <text class="info-value">{{ detail.type }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">申请人</text>
            <text class="info-value">{{ detail.applicant_name }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">审批人</text>
            <text class="info-value">{{ detail.approver_name }}</text>
          </view>
          <view class="info-item" v-if="detail.amount">
            <text class="info-label">金额</text>
            <text class="info-value amount">¥{{ formatNumber(detail.amount) }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">状态</text>
            <view class="status-tag" :style="{ background: statusConfig(detail.status).bgColor, color: statusConfig(detail.status).color }">
              {{ detail.status }}
            </view>
          </view>
          <view class="info-item">
            <text class="info-label">申请时间</text>
            <text class="info-value">{{ detail.created_at }}</text>
          </view>
          <view class="info-item" v-if="detail.approve_time">
            <text class="info-label">审批时间</text>
            <text class="info-value">{{ detail.approve_time }}</text>
          </view>
        </view>
        <view class="info-item" v-if="detail.content" style="margin-top: 10px;">
          <text class="info-label">说明</text>
          <text class="info-value">{{ detail.content }}</text>
        </view>
        <view class="info-item" v-if="detail.remark" style="margin-top: 10px;">
          <text class="info-label">备注</text>
          <text class="info-value">{{ detail.remark }}</text>
        </view>
      </view>

      <!-- 审批记录 -->
      <view class="section" v-if="detail.records && detail.records.length > 0">
        <view class="section-title">审批记录</view>
        <view class="record-list">
          <view class="record-item" v-for="(record, idx) in detail.records" :key="idx">
            <view class="record-dot" :class="record.action === '同意' ? 'agree' : 'reject'"></view>
            <view class="record-content">
              <view class="record-header">
                <text class="record-name">{{ record.approver_name }}</text>
                <text class="record-action" :class="record.action === '同意' ? 'agree' : 'reject'">{{ record.action }}</text>
              </view>
              <text class="record-time">{{ record.created_at }}</text>
              <text class="record-comment" v-if="record.comment">意见：{{ record.comment }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 操作按钮 -->
      <view class="action-bar" v-if="showAction">
        <view class="action-btn reject" @click="handleReject">驳回</view>
        <view class="action-btn approve" @click="handleApprove">同意</view>
      </view>
    </view>

    <!-- 审批弹窗 -->
    <view v-if="showDialog" class="dialog-mask" @click="showDialog = false">
      <view class="dialog-content" @click.stop>
        <view class="dialog-header">审批操作</view>
        <view class="dialog-body">
          <view class="action-group">
            <view class="action-item" :class="{ active: action === '同意' }" @click="action = '同意'">
              <text class="action-icon">✓</text>
              <text>同意</text>
            </view>
            <view class="action-item" :class="{ active: action === '驳回' }" @click="action = '驳回'">
              <text class="action-icon">✗</text>
              <text>驳回</text>
            </view>
          </view>
          <textarea class="comment-input" v-model="comment" :placeholder="action === '同意' ? '选填审批意见' : '请输入驳回原因'" />
        </view>
        <view class="dialog-footer">
          <view class="dialog-btn cancel" @click="showDialog = false">取消</view>
          <view class="dialog-btn confirm" @click="submitAction">确定</view>
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
      id: null,
      tab: 'my',
      detail: {},
      loading: false,
      showDialog: false,
      action: '同意',
      comment: '',
      showAction: false
    }
  },
  onLoad(options) {
    this.id = options.id
    this.tab = options.tab || 'my'
    this.loadDetail()
  },
  methods: {
    goBack() { uni.navigateBack() },
    loadDetail() {
      this.loading = true
      uni.request({
        url: `${apiBase}/api/approvals/${this.id}`,
        success: (res) => {
          if (res.data) {
            this.detail = res.data
            // 只有待我审批tab且状态为待审批时，才能操作
            this.showAction = (this.tab === 'todo' && this.detail.status === '待审批')
          }
        },
        fail: () => { uni.showToast({ title: '加载失败', icon: 'none' }) },
        complete: () => { this.loading = false }
      })
    },
    formatNumber(num) { return num ? Number(num).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00' },
    statusConfig(status) {
      const map = {
        '待审批': { bgColor: '#fff3e0', color: '#ff9800' },
        '已通过': { bgColor: '#e8f5e9', color: '#4caf50' },
        '已驳回': { bgColor: '#ffebee', color: '#f44336' }
      }
      return map[status] || { bgColor: '#f5f5f5', color: '#999' }
    },
    handleApprove() { this.action = '同意'; this.comment = ''; this.showDialog = true },
    handleReject() { this.action = '驳回'; this.comment = ''; this.showDialog = true },
    submitAction() {
      if (this.action === '驳回' && !this.comment.trim()) {
        uni.showToast({ title: '请输入驳回原因', icon: 'none' }); return
      }
      const api = this.action === '同意'
        ? `${apiBase}/api/approvals/${this.id}/approve`
        : `${apiBase}/api/approvals/${this.id}/reject`
      uni.request({
        url: api, method: 'POST', data: { comment: this.comment },
        success: () => {
          uni.showToast({ title: this.action === '同意' ? '已同意' : '已驳回', icon: 'success' })
          this.showDialog = false
          setTimeout(() => { uni.navigateBack() }, 1500)
        },
        fail: () => { uni.showToast({ title: '操作失败', icon: 'none' }) }
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
.loading-state { display: flex; align-items: center; justify-content: center; padding: 60px; color: #999; }
.detail-container { padding: 15px; padding-bottom: 80px; }
.section { background: #fff; border-radius: 8px; padding: 15px; margin-bottom: 15px; }
.section-title { font-size: 15px; font-weight: bold; color: #333; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #f0f0f0; }
.info-grid { display: flex; flex-direction: column; gap: 10px; }
.info-item { display: flex; align-items: flex-start; }
.info-label { font-size: 13px; color: #999; width: 70px; flex-shrink: 0; }
.info-value { font-size: 13px; color: #333; flex: 1; }
.amount { color: #ff6b00; font-weight: bold; }
.status-tag { font-size: 12px; padding: 2px 8px; border-radius: 4px; }
.record-list { display: flex; flex-direction: column; gap: 15px; padding-left: 10px; }
.record-item { display: flex; gap: 10px; position: relative; }
.record-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
.record-dot.agree { background: #4caf50; }
.record-dot.reject { background: #f44336; }
.record-content { flex: 1; }
.record-header { display: flex; gap: 10px; align-items: center; margin-bottom: 4px; }
.record-name { font-size: 14px; font-weight: bold; color: #333; }
.record-action { font-size: 13px; }
.record-action.agree { color: #4caf50; }
.record-action.reject { color: #f44336; }
.record-time { font-size: 12px; color: #999; display: block; margin-bottom: 4px; }
.record-comment { font-size: 13px; color: #666; display: block; }
.action-bar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 15px; padding: 15px; background: #fff; border-top: 1px solid #eee; }
.action-btn { flex: 1; text-align: center; padding: 12px; border-radius: 8px; font-size: 15px; }
.action-btn.reject { background: #fff; color: #ff4d4f; border: 1px solid #ff4d4f; }
.action-btn.approve { background: #1890ff; color: #fff; }
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
