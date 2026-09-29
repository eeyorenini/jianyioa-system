<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">派工详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <view v-if="loading" class="loading-wrap">
      <text class="loading-icon">⟳</text>
    </view>
    <view v-else-if="!detail" class="empty-state">
      <text class="empty-text">派工记录不存在</text>
    </view>
    <view v-else class="detail-wrap">
      <!-- 状态栏 -->
      <view class="status-bar">
        <view class="status-tag" :style="{ background: statusBg(detail.status), color: statusColor(detail.status) }">
          {{ statusLabel(detail.status) }}
        </view>
        <text class="create-time">{{ detail.created_at }}</text>
      </view>

      <!-- 基本信息 -->
      <view class="card">
        <view class="card-title">派工信息</view>
        <view class="info-row">
          <text class="info-label">项目</text>
          <text class="info-value">{{ detail.project_name || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">施工地点</text>
          <text class="info-value">{{ detail.location || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">工人/班组</text>
          <text class="info-value">{{ detail.worker || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">约定工费</text>
          <text class="info-value amount">¥{{ detail.fee || 0 }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">开始时间</text>
          <text class="info-value">{{ detail.start_date || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">申请人</text>
          <text class="info-value">{{ detail.applicant_name || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">创建时间</text>
          <text class="info-value">{{ detail.created_at || '-' }}</text>
        </view>
        <view v-if="detail.rejection_reason" class="info-row">
          <text class="info-label">驳回原因</text>
          <text class="info-value" style="color:#f44336">{{ detail.rejection_reason }}</text>
        </view>
      </view>

      <!-- 工作内容 -->
      <view class="card">
        <view class="card-title">施工内容</view>
        <text class="content-text">{{ detail.content || '无' }}</text>
      </view>

      <!-- 施工要求 -->
      <view v-if="detail.requirement" class="card">
        <view class="card-title">施工要求</view>
        <text class="content-text">{{ detail.requirement }}</text>
      </view>

      <!-- 操作按钮 -->
      <view v-if="showActions" class="action-bar">
        <!-- 待审核：审批人看到通过/驳回 -->
        <template v-if="detail.status === 'pending' && canApprove">
          <view class="action-btn reject" @click="handleReject">驳回</view>
          <view class="action-btn approve" @click="handleApprove">通过</view>
        </template>
        <!-- 进行中：确认完工 -->
        <template v-else-if="detail.status === 'approved'">
          <view class="action-btn approve-full" @click="handleComplete">确认完工</view>
        </template>
      </view>
    </view>

    <!-- 审批弹窗 -->
    <view v-if="showDialog" class="dialog-mask" @click="showDialog = false">
      <view class="dialog-content" @click.stop>
        <view class="dialog-header">{{ dialogTitle }}</view>
        <view class="dialog-body">
          <textarea
            class="comment-input"
            v-model="dialogComment"
            :placeholder="dialogAction === 'approve' || dialogAction === 'complete' ? '选填备注' : '请输入驳回原因'"
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

const loading = ref(true)
const detail = ref(null)
const showDialog = ref(false)
const dialogAction = ref('approve')
const dialogComment = ref('')

const statusLabel = (s) => ({ pending: '待审核', approved: '进行中', rejected: '已驳回', completed: '已完成' }[s] || s)
const statusBg = (s) => ({ pending: '#fff3e0', approved: '#DBEAFE', rejected: '#ffebee', completed: '#D1FAE5' }[s] || '#f5f5f5')
const statusColor = (s) => ({ pending: '#ff9800', approved: '#1E40AF', rejected: '#f44336', completed: '#065F46' }[s] || '#999')

const dialogTitle = computed(() => {
  if (dialogAction.value === 'approve') return '通过派工单'
  if (dialogAction.value === 'reject') return '驳回派工单'
  if (dialogAction.value === 'complete') return '确认完工'
  return '操作确认'
})

// 是否显示操作区（申请人或审批人）
const canApprove = ref(false)
const showActions = computed(() => {
  if (!detail.value) return false
  const s = detail.value.status
  return s === 'pending' || s === 'approved'
})

onMounted(() => {
  const pages = getCurrentPages()
  const id = pages[pages.length - 1]?.options?.id
  if (id) fetchDetail(id)
  else loading.value = false
})

function fetchDetail(id) {
  uni.request({
    url: '/api/dispatches',
    success: (res) => {
      const arr = Array.isArray(res.data) ? res.data : (res.data?.list || [])
      detail.value = arr.find(item => String(item.id) === String(id)) || null
      // 检查当前用户是否为审批人（简单判断：有 pending 项就显示操作）
      // 真实权限由后端接口控制，前端只读 canApprove 标志
      canApprove.value = !!(detail.value && detail.value.status === 'pending')
    },
    fail: () => { detail.value = null },
    complete: () => { loading.value = false }
  })
}

function handleApprove() {
  dialogAction.value = 'approve'
  dialogComment.value = ''
  showDialog.value = true
}

function handleReject() {
  dialogAction.value = 'reject'
  dialogComment.value = ''
  showDialog.value = true
}

function handleComplete() {
  dialogAction.value = 'complete'
  dialogComment.value = ''
  showDialog.value = true
}

function submitAction() {
  const id = detail.value.id

  if (dialogAction.value === 'reject' && !dialogComment.value.trim()) {
    uni.showToast({ title: '请输入驳回原因', icon: 'none' })
    return
  }

  const token = uni.getStorageSync('userInfo')?.id || ''

  if (dialogAction.value === 'complete') {
    uni.request({
      url: `/api/dispatches/${id}/complete`,
      method: 'PUT',
      header: { 'x-user-id': token },
      data: { remark: dialogComment.value },
      success: (res) => {
        if (res.data.code === 0 || res.data.code === undefined || res.statusCode === 200) {
          uni.showToast({ title: '已确认完工', icon: 'success' })
          showDialog.value = false
          setTimeout(() => fetchDetail(id), 500)
        } else {
          uni.showToast({ title: res.data.error || '操作失败', icon: 'none' })
        }
      },
      fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) }
    })
    return
  }

  // 审核通过/驳回
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
        setTimeout(() => fetchDetail(id), 500)
      } else {
        uni.showToast({ title: res.data.msg || res.data.error || '操作失败', icon: 'none' })
      }
    },
    fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) }
  })
}

function goBack() { uni.navigateBack() }
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.loading-wrap { display: flex; justify-content: center; padding: 120rpx 0; }
.loading-icon { font-size: 48px; color: #1E3A5F; animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.empty-state { display: flex; justify-content: center; padding: 120rpx 0; }
.empty-text { font-size: 28rpx; color: #999; }

.status-bar {
  display: flex; justify-content: space-between; align-items: center;
  margin: 12px 12px 8px;
}
.status-tag { font-size: 12px; padding: 4px 12px; border-radius: 12px; font-weight: 500; }
.create-time { font-size: 12px; color: #999; }

.detail-wrap { padding: 0 12px 120px; }
.card {
  background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 10px;
}
.card-title { font-size: 14px; font-weight: 600; color: #1E3A5F; margin-bottom: 12px; }
.info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f5f5f5; }
.info-row:last-child { border-bottom: none; }
.info-label { font-size: 13px; color: #999; }
.info-value { font-size: 13px; color: #333; text-align: right; flex: 1; margin-left: 12px; }
.info-value.amount { color: #1E3A5F; font-weight: 600; }
.content-text { font-size: 14px; color: #333; line-height: 1.6; display: block; }

/* 操作按钮 */
.action-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  background: #fff; box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
  display: flex; gap: 12px; z-index: 100;
}
.action-btn {
  flex: 1; text-align: center; padding: 12px 0;
  border-radius: 8px; font-size: 15px; font-weight: 600;
}
.action-btn.approve { background: #1E3A5F; color: #fff; }
.action-btn.reject { background: #fff; color: #f44336; border: 1px solid #f44336; }
.action-btn.approve-full { background: #10B981; color: #fff; }

/* 审批弹窗 */
.dialog-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  z-index: 200; display: flex; align-items: center; justify-content: center;
}
.dialog-content { background: #fff; border-radius: 16px; width: 300px; overflow: hidden; }
.dialog-header {
  text-align: center; font-size: 16px; font-weight: 600;
  padding: 20px 16px 12px; color: #1A1F36;
}
.dialog-body { padding: 0 16px 16px; }
.comment-input {
  width: 100%; border: 1px solid #eee; border-radius: 8px;
  padding: 12px; font-size: 14px; resize: none; box-sizing: border-box; min-height: 80px;
}
.dialog-footer { display: flex; border-top: 1px solid #f5f5f5; }
.dialog-btn {
  flex: 1; text-align: center; padding: 14px 0; font-size: 15px;
  &:first-child { border-right: 1px solid #f5f5f5; }
}
.dialog-btn.cancel { color: #666; }
.dialog-btn.confirm { color: #1E3A5F; font-weight: 600; }

/* 导航栏 */
.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }
</style>
