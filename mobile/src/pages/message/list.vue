<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">消息通知</text>
      <view class="nav-placeholder"></view>
    </view>

    <scroll-view class="message-list" scroll-y @scrolltolower="loadMore">
      <view v-if="loading && messages.length === 0" class="empty-state">
        <text class="loading-icon iconfont icon-loading"></text>
      </view>
      <view v-else-if="messages.length === 0" class="empty-state">
        <text class="empty-icon iconfont icon-bell"></text>
        <text class="empty-text">暂无消息</text>
      </view>
      <view v-else>
        <view
          v-for="msg in messages"
          :key="msg.id"
          class="message-card"
          :class="{ unread: !msg.is_read }"
          @click="goDetail(msg)"
        >
          <view class="msg-icon-wrap">
            <text class="msg-icon iconfont" :class="iconClass(msg.type)"></text>
          </view>
          <view class="msg-content">
            <view class="msg-header">
              <text class="msg-title">{{ msg.title }}</text>
              <text class="msg-time">{{ formatTime(msg.created_at) }}</text>
            </view>
            <text class="msg-desc">{{ msg.content }}</text>
          </view>
          <text v-if="!msg.is_read" class="unread-dot"></text>
        </view>
        <view v-if="loadingMore" class="loading-more"><text class="loading-text">加载中...</text></view>
        <view v-else-if="noMore" class="loading-more"><text class="loading-text">没有更多了</text></view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'

const messages = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const page = ref(1)
const pageSize = 20
const noMore = ref(false)

onMounted(() => { fetchMessages() })
onShow(() => { refreshUnreadBadge() })

function fetchMessages() {
  loading.value = true
  page.value = 1
  noMore.value = false
  uni.request({
    url: '/api/notifications',
    data: { page: 1, pageSize: pageSize },
    success: (res) => {
      if (res.data.list) messages.value = res.data.list || []
      else messages.value = []
    },
    complete: () => { loading.value = false }
  })
}

function loadMore() {
  if (loadingMore.value || noMore.value) return
  loadingMore.value = true
  page.value++
  uni.request({
    url: '/api/notifications',
    data: { page: page.value, pageSize: pageSize },
    success: (res) => {
      if (res.data.list) {
        const list = res.data.list || []
        messages.value = [...messages.value, ...list]
        if (list.length < pageSize) noMore.value = true
      } else { noMore.value = true }
    },
    complete: () => { loadingMore.value = false }
  })
}

function iconClass(type) {
  const map = { system: 'icon-gear', warning: 'icon-warning', project: 'icon-folder', inspection: 'icon-search', dispatch: 'icon-users' }
  return map[type] || 'icon-bell'
}

function formatTime(str) {
  if (!str) return ''
  const d = new Date(str)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  return `${d.getMonth()+1}月${d.getDate()}日`
}

function goDetail(msg) {
  if (!msg.is_read) {
    msg.is_read = true
    uni.request({ url: `/api/notifications/${msg.id}/read`, method: 'PUT' })
    // 刷新红点
    setTimeout(() => refreshUnreadBadge(), 100)
  }
}


const goBack = () => {
  uni.switchTab({ url: '/pages/mine/index' });
};

const refreshUnreadBadge = () => {
  uni.request({
    url: '/api/notifications/unread-count',
    header: { 'x-user-id': String(uni.getStorageSync('userInfo')?.id || '') },
    success: (res) => {
      const count = res.data?.count || 0;
      if (count > 0) {
        uni.setTabBarBadge({ index: 4, text: count > 99 ? '99+' : String(count) });
      } else {
        uni.removeTabBarBadge({ index: 4 });
      }
    }
  });
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.message-list { height: 100vh; }
.message-card { display: flex; align-items: flex-start; background: #fff; padding: 28rpx; margin-bottom: 2rpx; position: relative; }
.message-card.unread { background: #EEF3FF; }
.msg-icon-wrap { width: 80rpx; height: 80rpx; border-radius: 50%; background: #f0f0f0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 20rpx; }
.msg-icon { font-size: 36rpx; color: #1E3A5F; }
.msg-content { flex: 1; }
.msg-header { display: flex; justify-content: space-between; margin-bottom: 8rpx; }
.msg-title { font-size: 28rpx; font-weight: 600; color: #333; }
.msg-time { font-size: 22rpx; color: #999; }
.msg-desc { font-size: 26rpx; color: #666; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5; }
.unread-dot { position: absolute; top: 36rpx; right: 36rpx; width: 16rpx; height: 16rpx; background: #F44336; border-radius: 50%; }
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
