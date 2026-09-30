<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">实收统计</text>
      <text class="nav-btn"></text>
    </view>

    <!-- 项目信息横幅 -->
    <view class="project-banner" v-if="projectName">
      📁 {{ projectName }}
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <template v-else>
      <!-- 待确认催收 -->
      <view class="section">
        <view class="section-title">待确认催收</view>
        <view v-if="pendingList.length === 0" class="empty-state small">
          <text class="empty-text">暂无待确认记录</text>
        </view>
        <view
          v-for="item in pendingList"
          :key="item.id"
          class="record-card"
        >
          <view class="card-body">
            <view class="info-row">
              <text class="info-label">金额</text>
              <text class="info-value amount">¥{{ formatAmount(item.amount) }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">日期</text>
              <text class="info-value">{{ item.collection_date || item.created_at }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">提交人</text>
              <text class="info-value">{{ item.submitted_by_name || '—' }}</text>
            </view>
          </view>
          <view class="card-action">
            <view class="confirm-btn" @click="confirmCollection(item.id)">确认收款</view>
          </view>
        </view>
      </view>

      <!-- 已确认收款 -->
      <view class="section">
        <view class="section-title">已确认收款</view>
        <view v-if="confirmedList.length === 0" class="empty-state small">
          <text class="empty-text">暂无已确认记录</text>
        </view>
        <view
          v-for="item in confirmedList"
          :key="item.id"
          class="record-card confirmed"
        >
          <view class="card-body">
            <view class="info-row">
              <text class="info-label">金额</text>
              <text class="info-value amount">¥{{ formatAmount(item.amount) }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">日期</text>
              <text class="info-value">{{ item.collection_date || item.created_at }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">提交人</text>
              <text class="info-value">{{ item.submitted_by_name || '—' }}</text>
            </view>
          </view>
          <view class="confirmed-tag">
            <text>✓ 已确认</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const projectId = ref('')
const projectName = ref('')
const loading = ref(false)
const allRecords = ref([])

const pendingList = computed(() => allRecords.value.filter(r => r.status === 'pending'))
const confirmedList = computed(() => allRecords.value.filter(r => r.status === 'confirmed'))

onMounted(() => {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const options = current.options || {}

  if (options.projectId) {
    projectId.value = options.projectId
  }
  if (options.projectName) {
    projectName.value = decodeURIComponent(options.projectName)
  }

  loadRecords()
})

function loadRecords() {
  if (!projectId.value) return
  loading.value = true

  uni.request({
    url: '/api/collection-records?project_id=' + projectId.value,
    success: (res) => {
      loading.value = false
      if (res.data.code === 0 || res.statusCode === 200) {
        const data = res.data.data?.list || res.data.list || res.data || []
        allRecords.value = Array.isArray(data) ? data : []
      } else {
        allRecords.value = []
        uni.showToast({ title: res.data.msg || '加载失败', icon: 'none' })
      }
    },
    fail: () => {
      loading.value = false
      allRecords.value = []
      uni.showToast({ title: '网络错误', icon: 'none' })
    }
  })
}

function confirmCollection(id) {
  uni.showModal({
    title: '确认收款',
    content: '确定已收到该笔款项？',
    success: (res) => {
      if (res.confirm) {
        doConfirm(id)
      }
    }
  })
}

function doConfirm(id) {
  uni.request({
    url: '/api/collection-records/' + id + '/confirm',
    method: 'PUT',
    success: (res) => {
      if (res.data.code === 0 || res.statusCode === 200) {
        uni.showToast({ title: '确认成功', icon: 'success' })
        loadRecords()
      } else {
        uni.showToast({ title: res.data.msg || '确认失败', icon: 'none' })
      }
    },
    fail: () => {
      uni.showToast({ title: '网络错误', icon: 'none' })
    }
  })
}

function formatAmount(val) {
  if (!val && val !== 0) return '0.00'
  return parseFloat(val).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function goBack() {
  uni.navigateBack()
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding-bottom: 120rpx; }

.project-banner {
  font-size: 13px; color: #1E3A5F;
  background: #DBEAFE; padding: 8px 14px; font-weight: 500;
}

.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-btn { font-size: 15px; color: #fff; width: 40px; text-align: right; }

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 120rpx 0;
  color: #999;
  font-size: 28rpx;
}

.section {
  padding: 20rpx;
}

.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1E3A5F;
  margin-bottom: 20rpx;
}

.record-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.record-card.confirmed {
  opacity: 0.8;
}

.card-body {}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 0;
}
.info-label { font-size: 26rpx; color: #999; }
.info-value { font-size: 28rpx; color: #333; }
.info-value.amount {
  color: #065F46;
  font-weight: 600;
}

.card-action {
  margin-top: 20rpx;
  display: flex;
  justify-content: flex-end;
}

.confirm-btn {
  background: #1E3A5F;
  color: #fff;
  padding: 16rpx 32rpx;
  border-radius: 40rpx;
  font-size: 26rpx;
}

.confirmed-tag {
  margin-top: 16rpx;
  text-align: right;
  color: #065F46;
  font-size: 24rpx;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80rpx 0;
}
.empty-state.small {
  padding: 40rpx 0;
}
.empty-text { font-size: 26rpx; color: #999; }
</style>
