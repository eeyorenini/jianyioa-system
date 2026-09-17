<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">财务列表</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 统计卡片 -->
    <view class="stats-row">
      <view class="stat-card income">
        <text class="stat-label">收入</text>
        <text class="stat-amount">¥{{ stats.income || 0 }}</text>
      </view>
      <view class="stat-card expense">
        <text class="stat-label">支出</text>
        <text class="stat-amount">¥{{ stats.expense || 0 }}</text>
      </view>
      <view class="stat-card balance">
        <text class="stat-label">结余</text>
        <text class="stat-amount">¥{{ stats.balance || 0 }}</text>
      </view>
    </view>

    <!-- 筛选 -->
    <view class="filter-bar">
      <view
        v-for="tab in typeTabs"
        :key="tab.value"
        class="filter-chip"
        :class="{ active: type === tab.value }"
        @click="onTypeChange(tab.value)"
      >{{ tab.label }}</view>
    </view>

    <!-- 记录列表 -->
    <scroll-view class="record-list" scroll-y @scrolltolower="loadMore">
      <view v-if="loading && records.length === 0" class="empty-state">
        <text class="loading-icon iconfont icon-loading"></text>
      </view>
      <view v-else-if="records.length === 0" class="empty-state">
        <text class="empty-text">暂无记录</text>
      </view>
      <view v-else>
        <view
          v-for="r in records"
          :key="r.id"
          class="record-card"
        >
          <view class="record-left">
            <text class="record-type" :class="r.type">{{ r.type === 'income' ? '收入' : '支出' }}</text>
            <text class="record-project">{{ r.project_name || '-' }}</text>
            <text class="record-date">{{ formatDate(r.created_at) }}</text>
          </view>
          <view class="record-right">
            <text class="record-amount" :class="r.type">
              {{ r.type === 'income' ? '+' : '-' }}¥{{ r.amount }}
            </text>
            <text class="record-payee">{{ r.payee || '-' }}</text>
          </view>
        </view>
        <view v-if="loadingMore" class="loading-more"><text class="loading-text">加载中...</text></view>
        <view v-else-if="noMore" class="loading-more"><text class="loading-text">没有更多了</text></view>
      </view>
    </scroll-view>

    <!-- 新建按钮 -->
    <view class="float-btn" @click="goAdd">
      <text class="iconfont icon-add"></text>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const type = ref('all')
const records = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const page = ref(1)
const pageSize = 20
const noMore = ref(false)
const stats = ref({ income: 0, expense: 0, balance: 0 })

const typeTabs = [
  { label: '全部', value: 'all' },
  { label: '收入', value: 'income' },
  { label: '支出', value: 'expense' }
]

onMounted(() => {
  fetchStats()
  fetchRecords()
})

function fetchStats() {
  uni.request({
    url: '/api/finance/stats',
    success: (res) => {
      if (res.data.code === 0) stats.value = res.data.data || {}
    }
  })
}

function fetchRecords() {
  loading.value = true
  page.value = 1
  noMore.value = false
  uni.request({
    url: '/api/finance/list',
    data: { type: type.value === 'all' ? '' : type.value, page: 1, page_size: pageSize },
    success: (res) => {
      if (res.data.code === 0) records.value = res.data.data?.list || []
      else records.value = []
    },
    complete: () => { loading.value = false }
  })
}

function loadMore() {
  if (loadingMore.value || noMore.value) return
  loadingMore.value = true
  page.value++
  uni.request({
    url: '/api/finance/list',
    data: { type: type.value === 'all' ? '' : type.value, page: page.value, page_size: pageSize },
    success: (res) => {
      if (res.data.code === 0) {
        const list = res.data.data?.list || []
        records.value = [...records.value, ...list]
        if (list.length < pageSize) noMore.value = true
      } else { noMore.value = true }
    },
    complete: () => { loadingMore.value = false }
  })
}

function onTypeChange(val) {
  type.value = val
  fetchRecords()
}

function formatDate(str) {
  if (!str) return ''
  const d = new Date(str)
  return `${d.getMonth()+1}月${d.getDate()}日`
}

function goAdd() {
  uni.navigateTo({ url: '/pages/finance/add' })
}


const goBack = () => {
  uni.navigateBack();
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.stats-row { display: flex; gap: 20rpx; padding: 20rpx; background: #1E3A5F; }
.stat-card { flex: 1; background: rgba(255,255,255,0.15); border-radius: 16rpx; padding: 24rpx 16rpx; text-align: center; }
.stat-label { font-size: 24rpx; color: rgba(255,255,255,0.7); display: block; margin-bottom: 8rpx; }
.stat-amount { font-size: 32rpx; color: #fff; font-weight: 600; display: block; }
.filter-bar { display: flex; padding: 16rpx 20rpx; background: #fff; gap: 16rpx; }
.filter-chip { padding: 10rpx 28rpx; border-radius: 30rpx; font-size: 26rpx; color: #666; background: #f0f0f0; }
.filter-chip.active { background: #1E3A5F; color: #fff; }
.record-list { height: calc(100vh - 340rpx); padding: 20rpx; }
.record-card { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 16rpx; display: flex; justify-content: space-between; }
.record-left { display: flex; flex-direction: column; gap: 8rpx; }
.record-type { font-size: 26rpx; font-weight: 600; }
.record-type.income { color: #4CAF50; }
.record-type.expense { color: #F44336; }
.record-project { font-size: 26rpx; color: #333; }
.record-date { font-size: 24rpx; color: #999; }
.record-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8rpx; }
.record-amount { font-size: 32rpx; font-weight: 600; }
.record-amount.income { color: #4CAF50; }
.record-amount.expense { color: #F44336; }
.record-payee { font-size: 24rpx; color: #999; }
.empty-state { display: flex; justify-content: center; padding: 120rpx 0; }
.loading-icon { font-size: 60rpx; color: #1E3A5F; animation: spin 1s linear infinite; }
.empty-text { font-size: 28rpx; color: #999; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.loading-more { text-align: center; padding: 30rpx; }
.loading-text { font-size: 24rpx; color: #999; }
.float-btn { position: fixed; right: 40rpx; bottom: 60rpx; width: 100rpx; height: 100rpx; background: #FF6B35; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 8rpx 30rpx rgba(255,107,53,0.4); }
.float-btn .iconfont { font-size: 48rpx; color: #fff; }
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
