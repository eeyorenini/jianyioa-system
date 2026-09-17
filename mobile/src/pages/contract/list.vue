<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">合同列表</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 搜索栏 -->
    <view class="search-bar">
      <view class="search-input-wrap">
        <text class="iconfont icon-search"></text>
        <input class="search-input" v-model="keyword" placeholder="搜索合同" @confirm="fetchContracts" />
      </view>
    </view>

    <!-- 状态筛选 -->
    <scroll-view class="filter-bar" scroll-x>
      <view
        v-for="tab in statusTabs"
        :key="tab.value"
        class="filter-chip"
        :class="{ active: status === tab.value }"
        @click="onStatusChange(tab.value)"
      >{{ tab.label }}</view>
    </scroll-view>

    <!-- 合同列表 -->
    <scroll-view class="contract-list" scroll-y @scrolltolower="loadMore">
      <view v-if="loading && contracts.length === 0" class="empty-state">
        <text class="loading-icon iconfont icon-loading"></text>
        <text class="empty-text">加载中...</text>
      </view>
      <view v-else-if="contracts.length === 0" class="empty-state">
        <text class="empty-icon iconfont icon-document"></text>
        <text class="empty-text">暂无合同</text>
      </view>
      <view v-else>
        <view
          v-for="c in contracts"
          :key="c.id"
          class="contract-card"
          @click="goDetail(c)"
        >
          <view class="contract-header">
            <text class="contract-name">{{ c.name }}</text>
            <text class="status-tag" :class="'status-' + c.status">{{ statusText(c.status) }}</text>
          </view>
          <view class="contract-info">
            <text class="info-text">客户：{{ c.customer_name || '-' }}</text>
            <text class="info-text">金额：¥{{ c.amount || 0 }}</text>
          </view>
          <view class="contract-footer">
            <text class="date-text">{{ formatDate(c.created_at) }}</text>
            <text class="arrow iconfont icon-arrow-right"></text>
          </view>
        </view>
        <view v-if="loadingMore" class="loading-more"><text class="loading-text">加载中...</text></view>
        <view v-else-if="noMore" class="loading-more"><text class="loading-text">没有更多了</text></view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const keyword = ref('')
const status = ref('all')
const contracts = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const page = ref(1)
const pageSize = 20
const noMore = ref(false)

const statusTabs = [
  { label: '全部', value: 'all' },
  { label: '待签署', value: 'pending' },
  { label: '执行中', value: 'active' },
  { label: '已完成', value: 'completed' },
  { label: '已终止', value: 'terminated' }
]

onMounted(() => { fetchContracts() })

function fetchContracts() {
  loading.value = true
  page.value = 1
  noMore.value = false
  uni.request({
    url: '/api/contracts',
    data: { keyword: keyword.value, status: status.value === 'all' ? '' : status.value, page: 1, page_size: pageSize },
    success: (res) => {
      if (res.data.code === 0) contracts.value = res.data.data?.list || []
      else contracts.value = []
    },
    complete: () => { loading.value = false }
  })
}

function loadMore() {
  if (loadingMore.value || noMore.value) return
  loadingMore.value = true
  page.value++
  uni.request({
    url: '/api/contracts',
    data: { keyword: keyword.value, status: status.value === 'all' ? '' : status.value, page: page.value, page_size: pageSize },
    success: (res) => {
      if (res.data.code === 0) {
        const list = res.data.data?.list || []
        contracts.value = [...contracts.value, ...list]
        if (list.length < pageSize) noMore.value = true
      } else { noMore.value = true }
    },
    complete: () => { loadingMore.value = false }
  })
}

function onStatusChange(val) {
  status.value = val
  fetchContracts()
}

function statusText(s) {
  const map = { pending: '待签署', active: '执行中', completed: '已完成', terminated: '已终止' }
  return map[s] || s
}

function formatDate(str) {
  if (!str) return ''
  const d = new Date(str)
  return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`
}

function goDetail(c) {
  uni.navigateTo({ url: `/pages/contract/detail?id=${c.id}` })
}


const goBack = () => {
  uni.navigateBack();
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.search-bar { padding: 20rpx; background: #fff; }
.search-input-wrap { display: flex; align-items: center; background: #f5f5f5; border-radius: 40rpx; padding: 0 30rpx; height: 72rpx; }
.search-input { flex: 1; font-size: 28rpx; margin-left: 16rpx; }
.filter-bar { display: flex; padding: 16rpx 20rpx; background: #fff; white-space: nowrap; }
.filter-chip { display: inline-block; padding: 10rpx 28rpx; border-radius: 30rpx; font-size: 26rpx; color: #666; margin-right: 16rpx; background: #f0f0f0; }
.filter-chip.active { background: #1E3A5F; color: #fff; }
.contract-list { height: calc(100vh - 260rpx); padding: 20rpx; }
.contract-card { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 20rpx; }
.contract-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.contract-name { font-size: 30rpx; font-weight: 600; color: #1E3A5F; }
.status-tag { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 20rpx; }
.status-pending { background: #FFF3E0; color: #FF9800; }
.status-active { background: #E3F2FD; color: #2196F3; }
.status-completed { background: #E8F5E9; color: #4CAF50; }
.status-terminated { background: #f5f5f5; color: #999; }
.contract-info { display: flex; flex-direction: column; gap: 8rpx; margin-bottom: 16rpx; }
.info-text { font-size: 26rpx; color: #666; }
.contract-footer { display: flex; justify-content: space-between; align-items: center; }
.date-text { font-size: 24rpx; color: #999; }
.arrow { font-size: 24rpx; color: #ccc; }
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 120rpx 0; }
.loading-icon { font-size: 60rpx; color: #1E3A5F; animation: spin 1s linear infinite; }
.empty-icon { font-size: 80rpx; color: #ddd; margin-bottom: 20rpx; }
.empty-text { font-size: 28rpx; color: #999; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.loading-more { text-align: center; padding: 30rpx; }
.loading-text { font-size: 24rpx; color: #999; }
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
