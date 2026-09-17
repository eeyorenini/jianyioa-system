<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">施工日志</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 搜索栏 -->
    <view class="search-bar">
      <view class="search-input-wrap">
        <text class="iconfont icon-search"></text>
        <input class="search-input" v-model="keyword" placeholder="搜索日志内容" @confirm="fetchLogs" />
      </view>
      <button class="btn-primary" @click="fetchLogs">搜索</button>
    </view>

    <!-- 施工日志列表 -->
    <scroll-view class="log-list" scroll-y @scrolltolower="loadMore">
      <view v-if="loading && logs.length === 0" class="empty-state">
        <text class="iconfont icon-loading loading-icon"></text>
        <text class="empty-text">加载中...</text>
      </view>
      <view v-else-if="logs.length === 0" class="empty-state">
        <text class="iconfont icon-document empty-icon"></text>
        <text class="empty-text">暂无施工日志</text>
        <button class="btn-outline" @click="goAddLog">写日志</button>
      </view>
      <view v-else>
        <view
          v-for="log in logs"
          :key="log.id"
          class="log-card"
          @click="goLogDetail(log)"
        >
          <view class="log-header">
            <text class="log-date">{{ formatDate(log.created_at) }}</text>
            <text class="log-author">{{ log.worker_name || '未知' }}</text>
          </view>
          <view class="log-content">{{ log.content }}</view>
          <view class="log-footer">
            <view class="log-meta">
              <text class="meta-tag">工人: {{ log.worker_count }}人</text>
              <text v-if="log.tomorrow_plan" class="meta-tag plan-tag">有明日计划</text>
            </view>
            <text class="log-arrow iconfont icon-arrow-right"></text>
          </view>
          <!-- 照片预览 -->
          <view v-if="log.photos && log.photos.length > 0" class="log-photos">
            <image
              v-for="(photo, idx) in log.photos.slice(0, 3)"
              :key="idx"
              class="photo-thumb"
              :src="photo"
              mode="aspectFill"
              @click.stop="previewImage(log.photos, idx)"
            />
            <text v-if="log.photos.length > 3" class="photo-more">+{{ log.photos.length - 3 }}</text>
          </view>
        </view>

        <view v-if="loadingMore" class="loading-more">
          <text class="loading-text">加载中...</text>
        </view>
        <view v-else-if="noMore" class="loading-more">
          <text class="loading-text">没有更多了</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const projectId = ref(0);
const keyword = ref('')
const logs = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const page = ref(1)
const pageSize = 20
const noMore = ref(false)

onMounted(async () => {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = (current.options || {});
  projectId.value = parseInt(options.id || '0');
  fetchLogs();
});

function fetchLogs() {
  if (loading.value) return
  loading.value = true
  page.value = 1
  noMore.value = false
  uni.request({
    url: `/api/project-logs/${projectId.value}`,
    data: { keyword: keyword.value, page: 1, page_size: pageSize },
    success: (res) => {
      if (res.data.code === 0) {
        logs.value = res.data.data.list || []
      } else {
        logs.value = []
      }
    },
    fail: () => {
      logs.value = []
    },
    complete: () => {
      loading.value = false
    }
  })
}

function loadMore() {
  if (loadingMore.value || noMore.value) return
  loadingMore.value = true
  page.value++
  uni.request({
    url: `/api/project-logs/${projectId.value}`,
    data: { keyword: keyword.value, page: page.value, page_size: pageSize },
    success: (res) => {
      if (res.data.code === 0) {
        const list = res.data.data.list || []
        logs.value = [...logs.value, ...list]
        if (list.length < pageSize) noMore.value = true
      } else {
        noMore.value = true
      }
    },
    fail: () => {
      noMore.value = true
    },
    complete: () => {
      loadingMore.value = false
    }
  })
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function goLogDetail(log) {
  uni.navigateTo({ url: `/pages/projects/log-detail?id=${log.id}` });
}

function goAddLog() {
  uni.navigateTo({ url: `/pages/projects/log-add?id=${projectId.value}` });
}

function previewImage(photos, index) {
  uni.previewImage({ urls: photos, current: index })
}


const goBack = () => {
  uni.navigateBack();
};
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 20rpx;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 20rpx;
}

.search-input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 40rpx;
  padding: 0 30rpx;
  height: 72rpx;
}

.search-input {
  flex: 1;
  font-size: 28rpx;
  margin-left: 16rpx;
}

.log-list {
  height: calc(100vh - 200rpx);
}

.log-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
}

.log-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.log-date {
  font-size: 26rpx;
  color: #999;
}

.log-author {
  font-size: 26rpx;
  color: #1E3A5F;
  font-weight: 600;
}

.log-content {
  font-size: 28rpx;
  color: #333;
  line-height: 1.6;
  margin-bottom: 16rpx;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.log-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.log-meta {
  display: flex;
  gap: 16rpx;
}

.meta-tag {
  font-size: 22rpx;
  color: #666;
  background: #f0f0f0;
  padding: 4rpx 16rpx;
  border-radius: 20rpx;
}

.plan-tag {
  color: #FF6B35;
  background: #FFF0EB;
}

.log-arrow {
  font-size: 24rpx;
  color: #ccc;
}

.log-photos {
  display: flex;
  gap: 12rpx;
  margin-top: 16rpx;
}

.photo-thumb {
  width: 160rpx;
  height: 160rpx;
  border-radius: 8rpx;
}

.photo-more {
  width: 160rpx;
  height: 160rpx;
  line-height: 160rpx;
  text-align: center;
  background: #f0f0f0;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #666;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
}

.empty-icon {
  font-size: 80rpx;
  color: #ddd;
  margin-bottom: 20rpx;
}

.loading-icon {
  font-size: 60rpx;
  color: #1E3A5F;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.empty-text {
  font-size: 28rpx;
  color: #999;
  margin-bottom: 30rpx;
}

.loading-more {
  text-align: center;
  padding: 30rpx;
}

.loading-text {
  font-size: 24rpx;
  color: #999;
}
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
