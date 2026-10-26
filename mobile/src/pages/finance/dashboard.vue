<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">公司财务大盘</text>
      <text class="nav-btn" @click="reload">⟳</text>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading && !summary" class="loading-state">
      <text class="loading-icon iconfont icon-loading"></text>
      <text class="loading-text">加载中...</text>
    </view>

    <template v-else-if="summary">
      <!-- 数据盘卡片（v2.3.6 hotfix 10-15：按真实收支口径，排除增减项占位） -->
      <!-- 第 1 行：合同营收 / 应收 -->
      <view class="cards-row">
        <view class="stat-card primary">
          <view class="stat-label">合同营收</view>
          <view class="stat-value">¥{{ formatAmount(summary.contract_amount) }}</view>
          <view class="stat-sub">已审核合同</view>
        </view>
        <view class="stat-card accent">
          <view class="stat-label">应收</view>
          <view class="stat-value">¥{{ formatAmount(summary.receivable) }}</view>
          <view class="stat-sub">合同+增-减</view>
        </view>
      </view>
      <!-- 第 2 行：实收 / 未收（真实收入侧） -->
      <view class="cards-row">
        <view class="stat-card success">
          <view class="stat-label">已收（实收）</view>
          <view class="stat-value">¥{{ formatAmount(summary.collected) }}</view>
          <view class="stat-sub">催收已确认</view>
        </view>
        <view class="stat-card danger">
          <view class="stat-label">未收</view>
          <view class="stat-value">¥{{ formatAmount(summary.unpaid) }}</view>
          <view class="stat-sub">应收-实收</view>
        </view>
      </view>
      <!-- 第 3 行：已支出 / 利润（真实支出侧 + 利润） -->
      <view class="cards-row">
        <view class="stat-card warning">
          <view class="stat-label">已支出（真实）</view>
          <view class="stat-value">¥{{ formatAmount(summary.expensed) }}</view>
          <view class="stat-sub">派工/采购已支付</view>
        </view>
        <view class="stat-card" :class="summary.profit >= 0 ? 'success' : 'danger'">
          <view class="stat-label">利润</view>
          <view class="stat-value">¥{{ formatAmount(summary.profit) }}</view>
          <view class="stat-sub">实收-已支</view>
        </view>
      </view>
      <!-- 第 4 行：增减项净额 + 待确认支出（独立信息） -->
      <view class="cards-row">
        <view class="stat-card info">
          <view class="stat-label">增减项净额</view>
          <view class="stat-value">
            {{ summary.change_net > 0 ? '+' : summary.change_net < 0 ? '-' : '' }}¥{{ formatAmount(Math.abs(summary.change_net || 0)) }}
          </view>
          <view class="stat-sub">增 {{ formatAmount(summary.increase_total) }} / 减 {{ formatAmount(summary.decrease_total) }}</view>
        </view>
        <view class="stat-card warning" v-if="summary.pending_expense">
          <view class="stat-label">待确认支出</view>
          <view class="stat-value">¥{{ formatAmount(summary.pending_expense) }}</view>
          <view class="stat-sub">财务待受理</view>
        </view>
        <view class="stat-card warning" v-else>
          <view class="stat-label">待确认催收</view>
          <view class="stat-value">¥{{ formatAmount(summary.unconfirmed) }}</view>
          <view class="stat-sub">财务待确认</view>
        </view>
      </view>

      <!-- 本月小结（真实收支） -->
      <view class="month-bar">
        <view class="month-bar-label">📅 {{ summary.this_month || '本月' }} 真实收支</view>
        <view class="month-bar-row">
          <text class="month-income">收入 ¥{{ formatAmount(summary.this_month_income) }}</text>
          <text class="month-divider">|</text>
          <text class="month-expense">支出 ¥{{ formatAmount(summary.this_month_expense) }}</text>
        </view>
      </view>

      <!-- 月度趋势图（手写 CSS 柱状图） -->
      <view class="section">
        <view class="section-title">📈 月度收支趋势</view>
        <scroll-view scroll-x class="trend-scroll">
          <view class="trend-bars">
            <view v-for="item in summary.monthly_trend" :key="item.month" class="bar-item">
              <view class="bar-group">
                <view class="bar income-bar" :style="{ height: getBarHeight(item.income, 'income') + '%' }">
                  <text class="bar-value">{{ formatAmount(item.income, true) }}</text>
                </view>
                <view class="bar expense-bar" :style="{ height: getBarHeight(item.expense, 'expense') + '%' }">
                  <text class="bar-value">{{ formatAmount(item.expense, true) }}</text>
                </view>
              </view>
              <text class="bar-label">{{ formatMonth(item.month) }}</text>
            </view>
          </view>
        </scroll-view>
        <view class="trend-legend">
          <text class="legend-item"><text class="legend-dot income"></text>收入</text>
          <text class="legend-item"><text class="legend-dot expense"></text>支出</text>
        </view>
      </view>

      <!-- 各项目财务汇总 -->
      <view class="section">
        <view class="section-title">📋 各项目财务</view>
        <view v-if="summary.by_project.length === 0" class="empty-state small">
          <text class="empty-text">暂无项目数据</text>
        </view>
        <view
          v-for="p in summary.by_project"
          :key="p.project_id"
          class="project-card"
          @click="goProjectDetail(p)"
        >
          <view class="project-card-top">
            <view class="project-name">{{ p.project_name }}</view>
            <view class="project-customer">{{ p.customer_name || '—' }}</view>
          </view>
          <view class="project-card-stats">
            <view class="ps-item">
              <text class="ps-label">应收</text>
              <text class="ps-value">¥{{ formatAmount(p.receivable) }}</text>
            </view>
            <view class="ps-item success">
              <text class="ps-label">实收</text>
              <text class="ps-value">¥{{ formatAmount(p.collected) }}</text>
            </view>
            <view class="ps-item" :class="p.unpaid > 0 ? 'danger' : 'success'">
              <text class="ps-label">未收</text>
              <text class="ps-value">¥{{ formatAmount(p.unpaid) }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 更新时间 -->
      <view class="footer-time">截至 {{ summary.server_time || '' }}</view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const loading = ref(false)
const summary = ref(null)

onMounted(() => {
  loadDashboard()
})

function loadDashboard(opts = {}) {
  const toastOnSuccess = opts.toast === true
  loading.value = true
  uni.request({
    url: '/api/finance/dashboard',
    success: (res) => {
      if (res.data.code === 0) {
        summary.value = res.data.data
        if (toastOnSuccess) uni.showToast({ title: '已刷新', icon: 'success', duration: 900 })
      } else {
        uni.showToast({ title: res.data.msg || '加载失败', icon: 'none' })
      }
    },
    fail: () => {
      uni.showToast({ title: '网络错误', icon: 'none' })
    },
    complete: () => { loading.value = false }
  })
}

// 2026-10-26：原来点刷新是「静默重载」——页面已有数据时 loading 块不显示
// （v-if="loading && !summary"），请求回来数据又没变化，看上去就像点了没反应。
// 现在：防重入 + 成功后 toast「已刷新」，点了有明确反馈。
function reload() {
  if (loading.value) return
  loadDashboard({ toast: true })
}

function getBarHeight(value, kind) {
  const trend = summary.value?.monthly_trend || []
  if (!trend.length) return 0
  const max = Math.max(...trend.map(t => Number(t.income || 0)), ...trend.map(t => Number(t.expense || 0)))
  if (max <= 0) return 0
  return (Number(value || 0) / max * 100 * 0.8)
}

function formatAmount(val, short = false) {
  const num = Number(val || 0)
  if (short && num >= 10000) return (num / 10000).toFixed(1) + '万'
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatMonth(m) {
  if (!m) return ''
  const parts = m.split('-')
  return parts.length === 2 ? `${parseInt(parts[1])}月` : m
}

function goProjectDetail(p) {
  uni.navigateTo({ url: `/pages/projects/detail?id=${p.project_id}` })
}

function goBack() {
  uni.navigateBack()
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding-bottom: 80rpx; }

.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
/* 2026-10-26：加大热区，原来只有 22px 字高，手指容易点空 */
.nav-btn { font-size: 22px; width: 44px; text-align: right; padding: 8px 0; line-height: 1; box-sizing: border-box; }

.loading-state {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 200rpx 0;
}
.loading-icon { font-size: 60rpx; color: #1E3A5F; animation: spin 1s linear infinite; }
.loading-text { margin-top: 20rpx; color: #999; font-size: 28rpx; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* 5 张数据盘卡片 */
.cards-row {
  display: flex; gap: 20rpx; padding: 16rpx 20rpx 0;
}
.stat-card {
  flex: 1; background: #fff; border-radius: 16rpx;
  padding: 24rpx 20rpx; box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.04);
  border-left: 6rpx solid #e5e7eb;
}
.stat-card.primary { border-left-color: #409EFF; }
.stat-card.accent { border-left-color: #8B5CF6; }
.stat-card.success { border-left-color: #10B981; }
.stat-card.warning { border-left-color: #F59E0B; }
.stat-card.danger { border-left-color: #EF4444; }
.stat-card.info { border-left-color: #6B7280; }
.stat-label { font-size: 24rpx; color: #666; margin-bottom: 12rpx; }
.stat-value { font-size: 32rpx; font-weight: 700; color: #303133; line-height: 1.2; }
.stat-sub { font-size: 20rpx; color: #999; margin-top: 8rpx; }

/* 本月小结 */
.month-bar {
  margin: 24rpx 20rpx 0; padding: 20rpx 24rpx;
  background: linear-gradient(135deg, #1E3A5F, #2D5A8F);
  color: #fff; border-radius: 16rpx;
}
.month-bar-label { font-size: 26rpx; opacity: 0.85; margin-bottom: 8rpx; }
.month-bar-row { font-size: 30rpx; font-weight: 600; }
.month-income { color: #67C23A; }
.month-expense { color: #F56C6C; }
.month-divider { opacity: 0.5; margin: 0 12rpx; }

/* 月度趋势 */
.section { background: #fff; margin: 24rpx 20rpx 0; border-radius: 16rpx; padding: 24rpx; }
.section-title { font-size: 28rpx; font-weight: 600; color: #1E3A5F; margin-bottom: 20rpx; }
.trend-scroll { white-space: nowrap; }
.trend-bars { display: inline-flex; gap: 16rpx; align-items: flex-end; min-width: 100%; }
.bar-item { display: flex; flex-direction: column; align-items: center; min-width: 100rpx; }
.bar-group { display: flex; gap: 4rpx; height: 160rpx; align-items: flex-end; }
.bar { width: 28rpx; min-height: 4rpx; display: flex; align-items: flex-end; justify-content: center; border-radius: 4rpx 4rpx 0 0; }
.bar-value { font-size: 16rpx; color: #666; writing-mode: vertical-rl; margin-bottom: 4rpx; }
.income-bar { background: linear-gradient(180deg, #67C23A, #409EFF); }
.expense-bar { background: linear-gradient(180deg, #F56C6C, #FFA07A); }
.bar-label { margin-top: 12rpx; font-size: 22rpx; color: #666; }
.trend-legend { display: flex; justify-content: center; gap: 24rpx; margin-top: 20rpx; }
.legend-item { font-size: 24rpx; color: #666; display: flex; align-items: center; gap: 8rpx; }
.legend-dot { width: 16rpx; height: 16rpx; border-radius: 4rpx; display: inline-block; }
.legend-dot.income { background: #67C23A; }
.legend-dot.expense { background: #F56C6C; }

/* 各项目卡片 */
.project-card {
  background: #fafafa; border-radius: 12rpx; padding: 20rpx; margin-bottom: 16rpx;
  border: 1rpx solid #eee;
}
.project-card-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16rpx; }
.project-name { font-size: 28rpx; font-weight: 600; color: #303133; }
.project-customer { font-size: 22rpx; color: #999; }
.project-card-stats { display: flex; gap: 16rpx; }
.ps-item { flex: 1; text-align: center; padding: 12rpx 8rpx; background: #fff; border-radius: 8rpx; }
.ps-item.success .ps-value { color: #10B981; }
.ps-item.danger .ps-value { color: #EF4444; }
.ps-label { font-size: 22rpx; color: #666; display: block; margin-bottom: 6rpx; }
.ps-value { font-size: 26rpx; font-weight: 600; color: #303133; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 60rpx 0; }
.empty-state.small { padding: 40rpx 0; }
.empty-text { font-size: 26rpx; color: #999; }

.footer-time {
  text-align: center; font-size: 22rpx; color: #999; margin: 24rpx 0;
}
</style>
