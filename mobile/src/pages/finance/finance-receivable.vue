<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">应收统计</text>
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

    <!-- 统计数据 -->
    <view v-else class="summary-container">
      <!-- 合同金额 -->
      <view class="summary-card">
        <view class="card-label">合同金额</view>
        <view class="card-value">¥{{ formatAmount(summary.contract_amount) }}</view>
      </view>

      <!-- 增加项 -->
      <view class="summary-card increase">
        <view class="card-label">增加项</view>
        <view class="card-value">+¥{{ formatAmount(summary.increase_total) }}</view>
      </view>

      <!-- 减少项 -->
      <view class="summary-card decrease">
        <view class="card-label">减少项</view>
        <view class="card-value">-¥{{ formatAmount(summary.decrease_total) }}</view>
      </view>

      <!-- 实际应收（高亮） -->
      <view class="summary-card total">
        <view class="card-label">实际应收</view>
        <view class="card-value highlight">¥{{ formatAmount(actualReceivable) }}</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const projectId = ref('')
const projectName = ref('')
const loading = ref(false)

const summary = ref({
  contract_amount: 0,
  increase_total: 0,
  decrease_total: 0,
})

const actualReceivable = computed(() => {
  return (summary.value.contract_amount || 0)
    + (summary.value.increase_total || 0)
    - (summary.value.decrease_total || 0)
})

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

  loadSummary()
})

function loadSummary() {
  if (!projectId.value) return
  loading.value = true

  uni.request({
    url: '/api/finance/summary?project_id=' + projectId.value,
    success: (res) => {
      loading.value = false
      if (res.data.code === 0 || res.statusCode === 200) {
        const data = res.data.data || res.data || {}
        summary.value = {
          contract_amount: data.contract_amount || 0,
          increase_total: data.increase_total || 0,
          decrease_total: data.decrease_total || 0,
        }
      } else {
        uni.showToast({ title: res.data.msg || '加载失败', icon: 'none' })
      }
    },
    fail: () => {
      loading.value = false
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

.summary-container {
  padding: 20rpx;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
}

.summary-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx 24rpx;
  text-align: center;
}

.summary-card.total {
  grid-column: 1 / -1;
  background: #1E3A5F;
}

.card-label {
  font-size: 26rpx;
  color: #666;
  margin-bottom: 16rpx;
}

.summary-card.total .card-label {
  color: rgba(255, 255, 255, 0.8);
}

.card-value {
  font-size: 36rpx;
  font-weight: 700;
  color: #333;
}

.summary-card.increase .card-value {
  color: #065F46;
}

.summary-card.decrease .card-value {
  color: #991B1B;
}

.card-value.highlight {
  color: #fff;
  font-size: 44rpx;
}
</style>
