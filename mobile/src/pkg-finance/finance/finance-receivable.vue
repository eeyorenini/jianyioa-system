<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar" :style="navStyle">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">应收统计</text>
      <text class="nav-btn"></text>
    </view>

    <!-- 项目信息横幅 -->
    <view class="project-banner" v-if="projectName">
      📁 {{ projectName }}
    </view>

    <!-- 未指定项目：给明确提示，不静默显示 0 -->
    <view v-if="!projectId" class="empty-state">
      <text class="empty-icon">📊</text>
      <text class="empty-title">未指定项目</text>
      <text class="empty-desc">本页按项目核算应收，请从项目详情或财务消息进入</text>
      <view class="empty-btn" @click="goBack">返回</view>
    </view>

    <!-- 加载状态 -->
    <view v-else-if="loading" class="loading-state">
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

      <!-- 已收款 -->
      <view class="summary-card collected">
        <view class="card-label">已收款</view>
        <view class="card-value">¥{{ formatAmount(summary.collected) }}</view>
      </view>

      <!-- 剩余应收（重点） -->
      <view class="summary-card balance" :class="{ settled: remaining <= 0 }">
        <view class="card-label">剩余应收</view>
        <view class="card-value">¥{{ formatAmount(remaining) }}</view>
        <view class="card-sub" v-if="remaining <= 0 && actualReceivable > 0">已结清</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const projectId = ref('')
const projectName = ref('')
const loading = ref(false)

const summary = ref({
  contract_amount: 0,
  increase_total: 0,
  decrease_total: 0,
  collected: 0,
})

/** 实际应收 = 合同 + 增项 - 减项 */
const actualReceivable = computed(() => {
  return (summary.value.contract_amount || 0)
    + (summary.value.increase_total || 0)
    - (summary.value.decrease_total || 0)
})

/** 剩余应收 = 实际应收 - 已收款；后端有 balance 就用后端的，口径以后端为准 */
const remaining = computed(() => {
  if (summary.value.balance !== undefined && summary.value.balance !== null) {
    return summary.value.balance
  }
  return actualReceivable.value - (summary.value.collected || 0)
})

// ⚠️ 必须用 onLoad 取参：H5 首屏 mounted 阶段页面栈还没就绪，
//    用 getCurrentPages().options 会拿到空对象 → projectId 为空 → 全显示 0。
onLoad((options) => {
  const opts = options || {}
  projectId.value = opts.projectId || opts.project_id || ''
  if (opts.projectName) {
    try { projectName.value = decodeURIComponent(opts.projectName) } catch (e) { projectName.value = opts.projectName }
  }
  if (projectId.value) loadSummary()
})

function loadSummary() {
  if (!projectId.value) return
  loading.value = true

  uni.request({
    url: '/api/finance/summary?project_id=' + projectId.value,
    success: (res) => {
      loading.value = false
      if (res.statusCode === 200 && res.data && !res.data.error) {
        const data = res.data.data || res.data || {}
        summary.value = {
          contract_amount: Number(data.contract_amount) || 0,
          increase_total: Number(data.increase_total) || 0,
          decrease_total: Number(data.decrease_total) || 0,
          collected: Number(data.collected) || 0,
          balance: data.balance !== undefined && data.balance !== null ? Number(data.balance) || 0 : undefined,
        }
      } else {
        uni.showToast({ title: (res.data && (res.data.error || res.data.msg)) || '加载失败', icon: 'none' })
      }
    },
    fail: () => {
      loading.value = false
      uni.showToast({ title: '网络错误', icon: 'none' })
    }
  })
}

function formatAmount(val) {
  const n = Number(val)
  if (!isFinite(n)) return '0.00'
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 140rpx 40rpx 0;
}
.empty-icon { font-size: 72rpx; margin-bottom: 24rpx; }
.empty-title { font-size: 32rpx; font-weight: 600; color: #333; margin-bottom: 12rpx; }
.empty-desc { font-size: 26rpx; color: #999; text-align: center; line-height: 1.6; }
.empty-btn {
  margin-top: 40rpx; padding: 16rpx 64rpx;
  background: #1E3A5F; color: #fff; border-radius: 40rpx; font-size: 28rpx;
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

.summary-card.total .card-label,
.summary-card.balance .card-label {
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

/* 已收款：绿色系（已到账） */
.summary-card.collected {
  background: #ECFDF5;
}
.summary-card.collected .card-value { color: #065F46; }

/* 剩余应收：橙红强调（还要收的钱） */
.summary-card.balance {
  background: #B45309;
}
.summary-card.balance .card-value { color: #fff; font-size: 44rpx; }
.summary-card.balance.settled { background: #059669; }

.card-sub {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.85);
}
</style>
