<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">消息详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 消息内容 -->
    <view v-else-if="message.id" class="detail-content">
      <!-- 顶部类型标签 -->
      <view class="type-header">
        <view class="type-icon" :style="{ background: typeConfig.color + '22' }">
          <text class="icon">{{ typeConfig.icon }}</text>
        </view>
        <view class="type-info">
          <view class="type-tag" :style="{ background: typeConfig.color + '22', color: typeConfig.color }">
            {{ typeConfig.text }}
          </view>
          <text class="type-time">{{ formatTime(message.created_at) }}</text>
        </view>
      </view>

      <!-- 标题 -->
      <view class="message-title">{{ message.title }}</view>

      <!-- 正文 -->
      <view class="message-body">{{ message.content }}</view>

      <!-- 底部查看详情按钮 -->
      <view v-if="hasSourceId" class="action-area">
        <view class="action-btn" @click="goToDetail">
          <text>查看详情</text>
          <text class="arrow">›</text>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <text class="empty-icon">📭</text>
      <text class="empty-text">消息不存在或已被删除</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const message = ref({})
const loading = ref(false)

// 消息类型配置
const typeConfig = computed(() => {
  const type = message.value.type
  const config = {
    contract_created: { icon: '📄', color: '#409EFF', text: '新合同' },
    contract_updated: { icon: '📝', color: '#409EFF', text: '合同变更' },
    project_created: { icon: '🏗️', color: '#67C23A', text: '新项目' },
    project_status_changed: { icon: '🔄', color: '#67C23A', text: '项目状态' },
    node_status_changed: { icon: '📍', color: '#E6A23C', text: '节点状态' },
    project_progress: { icon: '📊', color: '#909399', text: '项目进展' },
    inspection_submit: { icon: '🔍', color: '#F56C6C', text: '巡检报告' },
    acceptance_submit: { icon: '✅', color: '#409EFF', text: '验收提交' },
    dispatch_created: { icon: '📋', color: '#E6A23C', text: '派工通知' },
    dispatch_status_changed: { icon: '🔔', color: '#E6A23C', text: '派工状态' },
    approval_submit: { icon: '⏳', color: '#F56C6C', text: '待审批' },
    approval_result: { icon: '🎯', color: '#67C23A', text: '审批结果' },
    notice_published: { icon: '📢', color: '#909399', text: '公告' },
    customer_follow: { icon: '👤', color: '#409EFF', text: '客户跟进' },
    invoice_created: { icon: '💰', color: '#67C23A', text: '发票' },
    system_notice: { icon: '⚙️', color: '#909399', text: '系统通知' },
    inapp: { icon: '🔔', color: '#909399', text: '通知' },
  }
  return config[type] || { icon: '📌', color: '#909399', text: type || '通知' }
})

const hasSourceId = computed(() => !!message.value.source_id)

// 跳转路由映射
const getTargetPath = (msg) => {
  const { type, source_id } = msg
  if (!source_id) return null
  
  const pathMap = {
    contract_created: `/pages/contract/detail?id=${source_id}`,
    contract_updated: `/pages/contract/detail?id=${source_id}`,
    project_created: `/pages/projects/detail?id=${source_id}`,
    project_status_changed: `/pages/projects/detail?id=${source_id}`,
    project_progress: `/pages/projects/detail?id=${source_id}`,
    node_status_changed: `/pages/projects/node?id=${source_id}`,
    inspection_submit: `/pages/inspection/detail?id=${source_id}`,
    acceptance_submit: `/pages/acceptance/list?id=${source_id}`,
    dispatch_created: `/pages/dispatch/detail?id=${source_id}`,
    dispatch_status_changed: `/pages/dispatch/detail?id=${source_id}`,
    approval_submit: null,
    approval_result: null,
    notice_published: `/pages/notices/notices?id=${source_id}`,
    system_notice: null,
    customer_follow: `/pages/customers/customers?id=${source_id}`,
    invoice_created: `/pages/finance/list?id=${source_id}`,
  }
  
  return pathMap[type] || null
}

function goToDetail() {
  const path = getTargetPath(message.value)
  if (path) {
    uni.navigateTo({ url: path })
  } else {
    uni.showToast({ title: '该内容已删除或无法访问', icon: 'none' })
  }
}

function formatTime(str) {
  if (!str) return ''
  const d = new Date(str)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const goBack = () => {
  uni.navigateBack()
}

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  const options = currentPage.options || currentPage.$page?.options || {}
  const id = options.id
  
  if (id) {
    loading.value = true
    uni.request({
      url: `/api/notifications/${id}`,
      success: (res) => {
        if (res.data) {
          message.value = res.data
        }
      },
      complete: () => { loading.value = false }
    })
  }
})
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; }

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
}
.loading-text { font-size: 28rpx; color: #999; }

.detail-content {
  background: #fff;
  margin: 20rpx;
  border-radius: 16rpx;
  padding: 32rpx;
}

.type-header {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}

.type-icon {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
  .icon { font-size: 40rpx; }
}

.type-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.type-tag {
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
}

.type-time {
  font-size: 24rpx;
  color: #999;
}

.message-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 20rpx;
  line-height: 1.5;
}

.message-body {
  font-size: 28rpx;
  color: #666;
  line-height: 1.8;
  white-space: pre-wrap;
}

.action-area {
  margin-top: 40rpx;
  padding-top: 30rpx;
  border-top: 1rpx solid #eee;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1E3A5F;
  color: #fff;
  padding: 24rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  
  .arrow {
    font-size: 32rpx;
    margin-left: 8rpx;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
}
.empty-icon { font-size: 80rpx; color: #ddd; margin-bottom: 20rpx; }
.empty-text { font-size: 28rpx; color: #999; }

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
