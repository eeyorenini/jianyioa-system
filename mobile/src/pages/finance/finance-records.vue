<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">收支记录</text>
      <text class="nav-btn"></text>
    </view>

    <!-- 项目信息横幅 -->
    <view class="project-banner" v-if="projectName">
      📁 {{ projectName }}
    </view>

    <!-- 筛选标签 -->
    <view class="filter-tabs">
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="tab-item"
        :class="{ active: filterType === tab.value }"
        @click="onTabChange(tab.value)"
      >{{ tab.label }}</view>
    </view>

    <!-- 记录列表 -->
    <view class="list-container">
      <view v-if="filteredRecords.length === 0" class="empty-state">
        <text class="empty-icon">📭</text>
        <text class="empty-text">暂无记录</text>
      </view>

      <view
        v-for="record in filteredRecords"
        :key="record.id"
        class="record-card"
      >
        <view class="card-header">
          <view class="type-badge" :class="record.type === 'income' ? 'income' : 'expense'">
            {{ record.type === 'income' ? '收入' : '支出' }}
          </view>
          <view class="status-badge" :class="record.status">
            {{ statusLabels[record.status] || record.status }}
          </view>
        </view>

        <view class="card-body">
          <view class="info-row">
            <text class="info-label">类别</text>
            <text class="info-value">{{ categoryLabels[record.category] || record.category }}</text>
          </view>
          <view class="info-row">
            <text class="info-label">金额</text>
            <text class="info-value amount" :class="record.type === 'income' ? 'income' : 'expense'">
              {{ record.type === 'income' ? '+' : '-' }}¥{{ formatAmount(record.amount) }}
            </text>
          </view>
          <view class="info-row">
            <text class="info-label">时间</text>
            <text class="info-value">{{ record.created_at }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const projectId = ref('')
const projectName = ref('')
const records = ref([])
const filterType = ref('all')
const loading = ref(false)

const tabs = [
  { label: '全部', value: 'all' },
  { label: '收入', value: 'income' },
  { label: '支出', value: 'expense' },
]

const categoryLabels = {
  contract: '合同',
  dispatch: '派工',
  collection: '催收',
  manual: '手动',
  contract_change: '增减项',
}

const statusLabels = {
  pending: '待确认',
  confirmed: '已确认',
  cancelled: '已取消',
}

const filteredRecords = computed(() => {
  if (filterType.value === 'all') return records.value
  return records.value.filter(r => r.type === filterType.value)
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

  loadRecords()
})

function loadRecords() {
  if (!projectId.value) return
  loading.value = true

  uni.request({
    url: '/api/payment-records?project_id=' + projectId.value,
    success: (res) => {
      loading.value = false
      if (res.data.code === 0 || res.statusCode === 200) {
        const data = res.data.data?.list || res.data.list || res.data || []
        records.value = Array.isArray(data) ? data : []
      } else {
        records.value = []
        uni.showToast({ title: res.data.msg || '加载失败', icon: 'none' })
      }
    },
    fail: () => {
      loading.value = false
      records.value = []
      uni.showToast({ title: '网络错误', icon: 'none' })
    }
  })
}

function onTabChange(value) {
  filterType.value = value
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
.form-card { margin: 20rpx; background: #fff; border-radius: 16rpx; padding: 30rpx; }
.form-section-title { font-size: 28rpx; font-weight: 600; color: #1E3A5F; margin-bottom: 24rpx; }
.form-item {
  display: flex; align-items: flex-start;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}
.form-item:last-child { border-bottom: none; }
.form-item-top { align-items: flex-start; }
.form-label { width: 160rpx; font-size: 26rpx; color: #666; flex-shrink: 0; padding-top: 6rpx; }
.form-input { flex: 1; font-size: 28rpx; color: #333; }
.form-textarea { flex: 1; font-size: 28rpx; color: #333; border: 1rpx solid #eee; border-radius: 8rpx; padding: 16rpx; resize: none; }
.picker-value {
  flex: 1; font-size: 28rpx; color: #333;
  display: flex; justify-content: space-between; align-items: center;
}
.picker-value.placeholder { color: #999; }
.arrow { font-size: 18px; color: #ccc; }

.work-chips-wrap { padding: 0 0 16rpx 160rpx; }
.work-chips {
  display: flex; flex-wrap: wrap; gap: 8px;
}
.work-chip {
  padding: 5px 14px; background: #F3F4F6;
  border-radius: 18px; font-size: 13px; color: #6B7280;
}
.work-chip.active { background: #1E3A5F; color: #fff; }

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
.nav-btn.disabled { opacity: 0.5; }

/* 筛选标签 */
.filter-tabs {
  display: flex;
  background: #fff;
  padding: 0 16rpx;
  border-bottom: 1rpx solid #eee;
}
.tab-item {
  flex: 1;
  text-align: center;
  padding: 24rpx 0;
  font-size: 28rpx;
  color: #666;
  position: relative;
}
.tab-item.active {
  color: #1E3A5F;
  font-weight: 600;
}
.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60rpx;
  height: 4rpx;
  background: #1E3A5F;
  border-radius: 2rpx;
}

/* 记录列表 */
.list-container {
  padding: 20rpx;
}
.record-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}
.type-badge {
  padding: 4rpx 16rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
  font-weight: 600;
}
.type-badge.income {
  background: #D1FAE5;
  color: #065F46;
}
.type-badge.expense {
  background: #FEE2E2;
  color: #991B1B;
}
.status-badge {
  padding: 4rpx 16rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
}
.status-badge.pending {
  background: #FEF3C7;
  color: #92400E;
}
.status-badge.confirmed {
  background: #D1FAE5;
  color: #065F46;
}
.status-badge.cancelled {
  background: #F3F4F6;
  color: #6B7280;
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
.info-value.amount.income { color: #065F46; font-weight: 600; }
.info-value.amount.expense { color: #991B1B; font-weight: 600; }

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
}
.empty-icon { font-size: 80rpx; margin-bottom: 24rpx; }
.empty-text { font-size: 28rpx; color: #999; }
</style>
