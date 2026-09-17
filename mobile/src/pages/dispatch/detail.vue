<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">派工详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <view v-if="loading" class="loading-wrap">
      <text class="loading-icon iconfont icon-loading"></text>
    </view>
    <view v-else-if="!detail" class="empty-state">
      <text class="empty-text">派工记录不存在</text>
    </view>
    <view v-else class="detail-wrap">
      <!-- 状态 -->
      <view class="status-bar">
        <text class="status-tag" :class="'status-' + detail.status">{{ statusText }}</text>
        <text class="create-time">{{ formatDate(detail.created_at) }}</text>
      </view>

      <!-- 基本信息 -->
      <view class="card">
        <view class="card-title">派工信息</view>
        <view class="info-row">
          <text class="info-label">项目</text>
          <text class="info-value">{{ detail.project_name || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">节点</text>
          <text class="info-value">{{ detail.node_name || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">工人</text>
          <text class="info-value">{{ detail.worker_name || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">联系电话</text>
          <text class="info-value" style="color:#1E3A5F" @click="callPhone">{{ detail.worker_phone || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">派工人数</text>
          <text class="info-value">{{ detail.worker_count }}人</text>
        </view>
        <view class="info-row">
          <text class="info-label">预计工期</text>
          <text class="info-value">{{ detail.start_date }} ~ {{ detail.end_date }}</text>
        </view>
      </view>

      <!-- 工作内容 -->
      <view class="card">
        <view class="card-title">工作内容</view>
        <text class="content-text">{{ detail.content || '无' }}</text>
      </view>

      <!-- 备注 -->
      <view v-if="detail.remark" class="card">
        <view class="card-title">备注</view>
        <text class="content-text">{{ detail.remark }}</text>
      </view>

      <!-- 操作按钮 -->
      <view class="action-bar">
        <button v-if="detail.status === 'pending'" class="btn-outline" @click="updateStatus('accepted')">接单</button>
        <button v-if="detail.status === 'accepted'" class="btn-primary" @click="updateStatus('processing')">开始施工</button>
        <button v-if="detail.status === 'processing'" class="btn-primary" @click="updateStatus('finished')">完成派工</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const loading = ref(true)
const detail = ref(null)

onMounted(() => {
  const pages = getCurrentPages()
  const id = pages[pages.length - 1]?.options?.id
  if (id) fetchDetail(id)
  else loading.value = false
})

function fetchDetail(id) {
  uni.request({
    url: `/api/dispatch/detail?id=${id}`,
    success: (res) => {
      if (res.data.code === 0) detail.value = res.data.data
      else detail.value = null
    },
    fail: () => {},
    complete: () => { loading.value = false }
  })
}

const statusText = computed(() => {
  const map = { pending: '待接单', accepted: '已接单', processing: '施工中', finished: '已完成', cancelled: '已取消' }
  return map[detail.value?.status] || '未知'
})

function formatDate(str) {
  if (!str) return ''
  const d = new Date(str)
  return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`
}

function callPhone() {
  if (detail.value?.worker_phone) {
    uni.makePhoneCall({ phoneNumber: detail.value.worker_phone })
  }
}

function updateStatus(status) {
  uni.request({
    url: '/api/dispatch/update-status',
    method: 'POST',
    data: { id: detail.value.id, status },
    success: (res) => {
      if (res.data.code === 0) {
        uni.showToast({ title: '更新成功', icon: 'success' })
        fetchDetail(detail.value.id)
      } else {
        uni.showToast({ title: res.data.msg || '更新失败', icon: 'none' })
      }
    }
  })
}


const goBack = () => {
  uni.navigateBack();
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding: 20rpx; padding-bottom: 120rpx; }
.loading-wrap { display: flex; justify-content: center; padding: 120rpx 0; }
.loading-icon { font-size: 60rpx; color: #1E3A5F; animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.empty-state { display: flex; justify-content: center; padding: 120rpx 0; }
.empty-text { font-size: 28rpx; color: #999; }
.status-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.status-tag { font-size: 24rpx; padding: 6rpx 20rpx; border-radius: 20rpx; }
.status-pending { background: #FFF3E0; color: #FF9800; }
.status-accepted { background: #E3F2FD; color: #2196F3; }
.status-processing { background: #FFF8E1; color: #FFC107; }
.status-finished { background: #E8F5E9; color: #4CAF50; }
.status-cancelled { background: #f5f5f5; color: #999; }
.create-time { font-size: 24rpx; color: #999; }
.card { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 20rpx; }
.card-title { font-size: 28rpx; font-weight: 600; color: #1E3A5F; margin-bottom: 20rpx; }
.info-row { display: flex; justify-content: space-between; padding: 14rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.info-row:last-child { border-bottom: none; }
.info-label { font-size: 26rpx; color: #999; }
.info-value { font-size: 26rpx; color: #333; }
.content-text { font-size: 28rpx; color: #333; line-height: 1.6; display: block; }
.action-bar { position: fixed; bottom: 0; left: 0; right: 0; padding: 20rpx 40rpx; background: #fff; box-shadow: 0 -2rpx 10rpx rgba(0,0,0,0.05); display: flex; gap: 20rpx; }
.btn-primary { flex: 1; background: #1E3A5F; color: #fff; border-radius: 40rpx; font-size: 28rpx; height: 80rpx; line-height: 80rpx; }
.btn-outline { flex: 1; background: #fff; color: #1E3A5F; border: 2rpx solid #1E3A5F; border-radius: 40rpx; font-size: 28rpx; height: 80rpx; line-height: 76rpx; }
/* 导航栏 */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1E3A5F;
  color: #fff;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-back {
  font-size: 28px;
  font-weight: 300;
  width: 40px;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
}

.nav-placeholder {
  width: 40px;
}

</style>
