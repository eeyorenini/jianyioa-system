<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">消息通知</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 下拉刷新 -->
    <scroll-view class="message-list" scroll-y 
      @refresherrefresh="onRefresh" 
      @scrolltolower="loadMore"
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      refresher-default-style="none">
      <view v-if="loading && messages.length === 0" class="empty-state">
        <text class="loading-icon">⟳</text>
      </view>
      <view v-else-if="messages.length === 0" class="empty-state">
        <text class="empty-icon">🔔</text>
        <text class="empty-text">暂无消息</text>
      </view>
      <view v-else>
        <view
          v-for="msg in messages"
          :key="msg.id"
          class="message-card"
          :class="{ unread: !msg.is_read }"
          @click="handleClick(msg)"
          @touchstart="touchStart(msg, $event)"
          @touchmove="touchMove(msg, $event)"
          @touchend="touchEnd(msg)"
          :style="msg._translateX ? `transform: translateX(${msg._translateX}rpx)` : ''"
        >
          <!-- 未读蓝色竖条 -->
          <view v-if="!msg.is_read" class="unread-bar"></view>
          
          <!-- 左侧类型图标 -->
          <view class="msg-icon-wrap" :style="{ background: typeConfig(msg.type).bgColor }">
            <text class="msg-icon">{{ typeConfig(msg.type).icon }}</text>
          </view>
          
          <view class="msg-content">
            <view class="msg-header">
              <view class="msg-title-row">
                <text class="msg-title">{{ msg.title }}</text>
                <view class="type-tag" :style="{ background: typeConfig(msg.type).color + '22', color: typeConfig(msg.type).color }">
                  {{ typeConfig(msg.type).text }}
                </view>
              </view>
              <text class="msg-time">{{ formatTime(msg.created_at) }}</text>
            </view>
            <text class="msg-desc">{{ msg.content }}</text>
          </view>
          
          <!-- 删除按钮（显示在左滑后） -->
          <view class="delete-btn" @click.stop="deleteMessage(msg)">
            <text>删除</text>
          </view>
        </view>
        
        <view v-if="loadingMore" class="loading-more"><text class="loading-text">加载中...</text></view>
        <view v-else-if="noMore && messages.length > 0" class="loading-more"><text class="loading-text">没有更多了</text></view>
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
const refreshing = ref(false)
const page = ref(1)
const pageSize = 20
const noMore = ref(false)

// 触摸滑动相关
const touchMap = ref({})

onMounted(() => { fetchMessages() })
onShow(() => { refreshUnreadBadge() })

// 消息类型配置
const typeConfig = (type) => {
  const config = {
    contract_created: { icon: '📄', color: '#409EFF', text: '新合同', bgColor: '#409EFF11' },
    contract_updated: { icon: '📝', color: '#409EFF', text: '合同变更', bgColor: '#409EFF11' },
    project_created: { icon: '🏗️', color: '#67C23A', text: '新项目', bgColor: '#67C23A11' },
    project_status_changed: { icon: '🔄', color: '#67C23A', text: '项目状态', bgColor: '#67C23A11' },
    node_status_changed: { icon: '📍', color: '#E6A23C', text: '节点状态', bgColor: '#E6A23C11' },
    project_progress: { icon: '📊', color: '#909399', text: '项目进展', bgColor: '#90939911' },
    inspection_submit: { icon: '🔍', color: '#F56C6C', text: '巡检报告', bgColor: '#F56C6C11' },
    acceptance_submit: { icon: '✅', color: '#409EFF', text: '验收提交', bgColor: '#409EFF11' },
    dispatch_created: { icon: '📋', color: '#E6A23C', text: '派工通知', bgColor: '#E6A23C11' },
    dispatch_status_changed: { icon: '🔔', color: '#E6A23C', text: '派工状态', bgColor: '#E6A23C11' },
    approval_submit: { icon: '⏳', color: '#F56C6C', text: '待审批', bgColor: '#F56C6C11' },
    approval_result: { icon: '🎯', color: '#67C23A', text: '审批结果', bgColor: '#67C23A11' },
    notice_published: { icon: '📢', color: '#909399', text: '公告', bgColor: '#90939911' },
    customer_follow: { icon: '👤', color: '#409EFF', text: '客户跟进', bgColor: '#409EFF11' },
    invoice_created: { icon: '💰', color: '#67C23A', text: '发票', bgColor: '#67C23A11' },
    system_notice: { icon: '⚙️', color: '#909399', text: '系统通知', bgColor: '#90939911' },
    inapp: { icon: '🔔', color: '#909399', text: '通知', bgColor: '#90939911' },
  }
  return config[type] || { icon: '📌', color: '#909399', text: type || '通知', bgColor: '#90939911' }
}

// 跳转路由映射
const getTargetPath = (msg) => {
  const { type, source_id } = msg
  if (!source_id) return null
  
  const pathMap = {
    contract_created: `/pages/contract/detail?id=${source_id}`,
    contract_updated: `/pages/contract/detail?id=${source_id}`,
    contract_deleted: `/pages/contract/list`,
    project_created: `/pages/projects/detail?id=${source_id}`,
    project_status_changed: `/pages/projects/detail?id=${source_id}`,
    project_progress: `/pages/projects/detail?id=${source_id}`,
    node_status_changed: `/pages/projects/node?id=${source_id}`,
    inspection_submit: `/pages/inspection/detail?id=${source_id}`,
    acceptance_submit: `/pages/acceptance/list?id=${source_id}`,
    dispatch_created: `/pages/dispatch/detail?id=${source_id}`,
    dispatch_status_changed: `/pages/dispatch/detail?id=${source_id}`,
    approval_submit: null, // 审批页面不存在
    approval_result: null,
    notice_published: `/pages/notices/notices?id=${source_id}`,
    system_notice: null,
    customer_follow: `/pages/customers/customers?id=${source_id}`,
    invoice_created: `/pages/finance/list?id=${source_id}`,
  }
  
  return pathMap[type] || null
}

function fetchMessages() {
  loading.value = true
  page.value = 1
  noMore.value = false
  uni.request({
    url: '/api/notifications',
    data: { page: 1, pageSize: pageSize },
    success: (res) => {
      if (res.data.list) {
        messages.value = (res.data.list || []).map(m => ({ ...m, _translateX: 0 }))
      } else {
        messages.value = []
      }
    },
    complete: () => { loading.value = false }
  })
}

function onRefresh() {
  refreshing.value = true
  fetchMessages()
  setTimeout(() => { refreshing.value = false }, 500)
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
        messages.value = [...messages.value, ...list.map(m => ({ ...m, _translateX: 0 }))]
        if (list.length < pageSize) noMore.value = true
      } else {
        noMore.value = true
      }
    },
    complete: () => { loadingMore.value = false }
  })
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

// 处理消息点击
function handleClick(msg) {
  // 重置滑动位置
  msg._translateX = 0
  
  // 标记已读
  if (!msg.is_read) {
    msg.is_read = true
    uni.request({ url: `/api/notifications/${msg.id}/read`, method: 'PUT' })
    setTimeout(() => refreshUnreadBadge(), 100)
  }
  
  // 跳转
  const path = getTargetPath(msg)
  if (path) {
    uni.navigateTo({ url: path })
  } else {
    // 没有跳转页面时，打开详情页
    uni.navigateTo({ url: `/pages/message/detail?id=${msg.id}` })
  }
}

// 左滑删除
function touchStart(msg, e) {
  touchMap.value[msg.id] = { startX: e.touches[0].clientX }
}

function touchMove(msg, e) {
  if (!touchMap.value[msg.id]) return
  const deltaX = e.touches[0].clientX - touchMap.value[msg.id].startX
  // 只允许左滑（负值）
  msg._translateX = deltaX < 0 ? Math.max(deltaX, -150) : 0
}

function touchEnd(msg) {
  // 如果滑动超过一半，自动滑到左侧显示删除按钮
  if (msg._translateX < -75) {
    msg._translateX = -150
  } else {
    msg._translateX = 0
  }
}

function deleteMessage(msg) {
  uni.showModal({
    title: '提示',
    content: '确定删除该消息？',
    success: (res) => {
      if (res.confirm) {
        uni.request({
          url: `/api/notifications/${msg.id}`,
          method: 'DELETE',
          success: () => {
            messages.value = messages.value.filter(m => m.id !== msg.id)
            uni.showToast({ title: '已删除', icon: 'success' })
          }
        })
      }
    }
  })
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
.message-list { height: calc(100vh - 88rpx); }
.message-card { 
  display: flex; 
  align-items: flex-start; 
  background: #fff; 
  padding: 28rpx; 
  margin-bottom: 2rpx; 
  position: relative;
  transition: transform 0.2s ease;
  overflow: hidden;
}
.message-card.unread { background: #EEF3FF; }

/* 未读蓝色竖条 */
.unread-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6rpx;
  background: #409EFF;
}

.msg-icon-wrap { 
  width: 80rpx; 
  height: 80rpx; 
  border-radius: 50%; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  flex-shrink: 0; 
  margin-right: 20rpx;
  margin-left: 10rpx;
}
.msg-icon { font-size: 40rpx; }
.msg-content { flex: 1; }
.msg-header { display: flex; justify-content: space-between; margin-bottom: 8rpx; }
.msg-title-row { display: flex; align-items: center; gap: 12rpx; flex: 1; }
.msg-title { font-size: 28rpx; font-weight: 600; color: #333; }
.type-tag {
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  border-radius: 20rpx;
  flex-shrink: 0;
}
.msg-time { font-size: 22rpx; color: #999; flex-shrink: 0; margin-left: 12rpx; }
.msg-desc { font-size: 26rpx; color: #666; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5; }

/* 删除按钮 */
.delete-btn {
  position: absolute;
  right: -150rpx;
  top: 0;
  bottom: 0;
  width: 150rpx;
  background: #F56C6C;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 26rpx;
}

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
