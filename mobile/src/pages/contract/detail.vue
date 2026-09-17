<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">合同详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <view v-if="loading" class="loading-wrap"><text class="loading-icon iconfont icon-loading"></text></view>
    <view v-else-if="!detail" class="empty-state"><text class="empty-text">合同不存在</text></view>
    <view v-else class="detail-wrap">
      <view class="status-bar">
        <text class="status-tag" :class="'status-' + detail.status">{{ statusText }}</text>
        <text class="create-time">{{ formatDate(detail.created_at) }}</text>
      </view>

      <!-- 基本信息 -->
      <view class="card">
        <view class="card-title">基本信息</view>
        <view class="info-row"><text class="info-label">合同名称</text><text class="info-value">{{ detail.name }}</text></view>
        <view class="info-row"><text class="info-label">客户</text><text class="info-value">{{ detail.customer_name || '-' }}</text></view>
        <view class="info-row"><text class="info-label">签约日期</text><text class="info-value">{{ detail.sign_date || '-' }}</text></view>
        <view class="info-row"><text class="info-label">合同金额</text><text class="info-value amount">¥{{ detail.amount || 0 }}</text></view>
        <view class="info-row"><text class="info-label">关联项目</text><text class="info-value" style="color:#1E3A5F" @click="goProject">{{ detail.project_name || '无' }}</text></view>
      </view>

      <!-- 合同正文预览 -->
      <view class="card">
        <view class="card-title">合同正文</view>
        <view class="content-preview" v-html="detail.content || '<text style=\'color:#999\'>无正文内容</text>'"></view>
      </view>

      <!-- 附件 -->
      <view v-if="detail.attachments && detail.attachments.length > 0" class="card">
        <view class="card-title">附件</view>
        <view v-for="(att, idx) in detail.attachments" :key="idx" class="attachment-item" @click="downloadAtt(att)">
          <text class="att-icon iconfont icon-file"></text>
          <text class="att-name">{{ att.name }}</text>
          <text class="att-download iconfont icon-download"></text>
        </view>
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
    url: `/api/contracts/${id}`,
    success: (res) => {
      if (res.data.code === 0) detail.value = res.data.data
      else detail.value = null
    },
    complete: () => { loading.value = false }
  })
}

const statusText = computed(() => {
  const map = { pending: '待签署', active: '执行中', completed: '已完成', terminated: '已终止' }
  return map[detail.value?.status] || '未知'
})

function formatDate(str) {
  if (!str) return ''
  const d = new Date(str)
  return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`
}

function goProject() {
  if (detail.value?.project_id) {
    uni.navigateTo({ url: `/pages/projects/detail?id=${detail.value.project_id}` })
  }
}

function downloadAtt(att) {
  uni.showToast({ title: '下载中...', icon: 'none' })
  // 实际应调用 /api/contracts/attachment?path=xxx
}


const goBack = () => {
  uni.navigateBack();
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding: 20rpx; }
.loading-wrap { display: flex; justify-content: center; padding: 120rpx 0; }
.loading-icon { font-size: 60rpx; color: #1E3A5F; animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.empty-state { display: flex; justify-content: center; padding: 120rpx 0; }
.empty-text { font-size: 28rpx; color: #999; }
.status-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.status-tag { font-size: 24rpx; padding: 6rpx 20rpx; border-radius: 20rpx; }
.status-pending { background: #FFF3E0; color: #FF9800; }
.status-active { background: #E3F2FD; color: #2196F3; }
.status-completed { background: #E8F5E9; color: #4CAF50; }
.status-terminated { background: #f5f5f5; color: #999; }
.create-time { font-size: 24rpx; color: #999; }
.card { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 20rpx; }
.card-title { font-size: 28rpx; font-weight: 600; color: #1E3A5F; margin-bottom: 20rpx; }
.info-row { display: flex; justify-content: space-between; padding: 14rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.info-row:last-child { border-bottom: none; }
.info-label { font-size: 26rpx; color: #999; }
.info-value { font-size: 26rpx; color: #333; }
.amount { color: #FF6B35 !important; font-weight: 600; }
.content-preview { font-size: 28rpx; color: #333; line-height: 1.8; max-height: 600rpx; overflow: hidden; }
.attachment-item { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.attachment-item:last-child { border-bottom: none; }
.att-icon { font-size: 40rpx; color: #1E3A5F; margin-right: 16rpx; }
.att-name { flex: 1; font-size: 28rpx; color: #333; }
.att-download { font-size: 28rpx; color: #1E3A5F; }
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
