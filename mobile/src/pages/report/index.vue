<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">数据报表</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 项目统计 -->
    <view class="section">
      <view class="section-title">项目概况</view>
      <view class="stats-grid">
        <view class="stat-item">
          <text class="stat-num">{{ stats.project_total }}</text>
          <text class="stat-label">项目总数</text>
        </view>
        <view class="stat-item">
          <text class="stat-num text-green">{{ stats.project_active }}</text>
          <text class="stat-label">进行中</text>
        </view>
        <view class="stat-item">
          <text class="stat-num text-orange">{{ stats.project_overdue }}</text>
          <text class="stat-label">逾期未完成</text>
        </view>
        <view class="stat-item">
          <text class="stat-num text-blue">{{ stats.project_completed }}</text>
          <text class="stat-label">已完成</text>
        </view>
      </view>
    </view>

    <!-- 巡检统计 -->
    <view class="section">
      <view class="section-title">巡检统计</view>
      <view class="stats-grid">
        <view class="stat-item">
          <text class="stat-num">{{ stats.inspection_total }}</text>
          <text class="stat-label">巡检总数</text>
        </view>
        <view class="stat-item">
          <text class="stat-num text-red">{{ stats.inspection_pending }}</text>
          <text class="stat-label">待整改</text>
        </view>
        <view class="stat-item">
          <text class="stat-num text-green">{{ stats.inspection_fixed }}</text>
          <text class="stat-label">已整改</text>
        </view>
        <view class="stat-item">
          <text class="stat-num text-orange">{{ stats.inspection_overdue }}</text>
          <text class="stat-label">已逾期</text>
        </view>
      </view>
    </view>

    <!-- 收支汇总 -->
    <view class="section">
      <view class="section-title">收支汇总</view>
      <view class="finance-summary">
        <view class="finance-item income">
          <text class="finance-label">总收入</text>
          <text class="finance-amount">¥{{ stats.income || 0 }}</text>
        </view>
        <view class="finance-item expense">
          <text class="finance-label">总支出</text>
          <text class="finance-amount">¥{{ stats.expense || 0 }}</text>
        </view>
        <view class="finance-divider"></view>
        <view class="finance-item balance">
          <text class="finance-label">净利润</text>
          <text class="finance-amount">¥{{ (stats.income - stats.expense) || 0 }}</text>
        </view>
      </view>
    </view>

    <!-- 项目进度排名 -->
    <view class="section">
      <view class="section-title">项目进度</view>
      <view v-if="projects.length === 0" class="empty-small">暂无数据</view>
      <view v-else>
        <view v-for="p in projects" :key="p.id" class="project-rank-item">
          <view class="rank-left">
            <text class="rank-name">{{ p.name }}</text>
            <text class="rank-customer">{{ p.customer_name || '-' }}</text>
          </view>
          <view class="rank-right">
            <view class="progress-bar-wrap">
              <view class="progress-bar">
                <view class="progress-fill" :style="{ width: p.progress + '%' }"></view>
              </view>
              <text class="progress-text">{{ p.progress }}%</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const stats = ref({ project_total: 0, project_active: 0, project_overdue: 0, project_completed: 0, inspection_total: 0, inspection_pending: 0, inspection_fixed: 0, inspection_overdue: 0, income: 0, expense: 0 })
const projects = ref([])

onMounted(() => {
  uni.request({
    url: '/api/report/stats',
    success: (res) => {
      if (res.data.code === 0) {
        stats.value = res.data.data?.stats || {}
        projects.value = res.data.data?.projects || []
      }
    }
  })
})


const goBack = () => {
  uni.navigateBack();
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding: 20rpx; }
.section { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 20rpx; }
.section-title { font-size: 30rpx; font-weight: 600; color: #1E3A5F; margin-bottom: 24rpx; }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16rpx; }
.stat-item { text-align: center; }
.stat-num { font-size: 48rpx; font-weight: 700; display: block; margin-bottom: 8rpx; }
.text-green { color: #4CAF50; }
.text-orange { color: #FF6B35; }
.text-blue { color: #1E3A5F; }
.text-red { color: #F44336; }
.stat-label { font-size: 22rpx; color: #999; }
.finance-summary { display: flex; align-items: center; justify-content: space-between; }
.finance-item { text-align: center; flex: 1; }
.finance-label { font-size: 24rpx; color: #999; display: block; margin-bottom: 8rpx; }
.finance-amount { font-size: 36rpx; font-weight: 600; display: block; }
.income .finance-amount { color: #4CAF50; }
.expense .finance-amount { color: #F44336; }
.balance .finance-amount { color: #1E3A5F; }
.finance-divider { width: 1rpx; height: 60rpx; background: #eee; }
.project-rank-item { display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid #f5f5f5; }
.project-rank-item:last-child { border-bottom: none; }
.rank-left { flex: 1; }
.rank-name { font-size: 28rpx; color: #333; font-weight: 600; display: block; margin-bottom: 4rpx; }
.rank-customer { font-size: 24rpx; color: #999; }
.rank-right { width: 280rpx; }
.progress-bar-wrap { display: flex; align-items: center; gap: 12rpx; }
.progress-bar { flex: 1; height: 12rpx; background: #f0f0f0; border-radius: 6rpx; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #1E3A5F, #FF6B35); border-radius: 6rpx; }
.progress-text { font-size: 24rpx; color: #666; width: 70rpx; text-align: right; }
.empty-small { font-size: 26rpx; color: #999; text-align: center; padding: 40rpx 0; }
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
