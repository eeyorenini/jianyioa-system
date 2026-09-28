<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">日志详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- 日志内容 -->
    <view v-else-if="log" class="log-detail">
      <!-- 头部信息 -->
      <view class="log-header">
        <view class="log-info">
          <text class="log-date">{{ formatDate(log.created_at) }}</text>
          <text class="log-author">👷 {{ log.operator || '未知' }}</text>
        </view>
        <text class="log-time">{{ formatFullTime(log.created_at) }}</text>
      </view>

      <!-- 施工内容 -->
      <view class="section" v-if="log.content">
        <view class="section-label">📝 施工内容</view>
        <view class="section-content">{{ log.content }}</view>
      </view>

      <!-- 工种和人数 -->
      <view class="section" v-if="log.work_type || log.worker_count">
        <view class="section-label">👥 人员信息</view>
        <view class="log-tags">
          <text class="log-tag" v-if="log.work_type">🔧 {{ log.work_type }}</text>
          <text class="log-tag" v-if="log.worker_count">👷 {{ log.worker_count }}人</text>
        </view>
      </view>

      <!-- 明日计划 -->
      <view class="section" v-if="log.tomorrow_plan">
        <view class="section-label">📅 明日计划</view>
        <view class="section-content plan-content">{{ log.tomorrow_plan }}</view>
      </view>

      <!-- 备注 -->
      <view class="section" v-if="log.note">
        <view class="section-label">📋 备注</view>
        <view class="section-content note-content">{{ log.note }}</view>
      </view>

      <!-- 照片 -->
      <view class="section" v-if="photos.length > 0">
        <view class="section-label">📷 现场照片</view>
        <view class="photos-grid">
          <view 
            class="photo-item" 
            v-for="(photo, idx) in photos" 
            :key="idx"
            @click="previewPhoto(idx)"
          >
            <image class="photo-img" :src="photo" mode="aspectFill" />
            <view class="photo-overlay">
              <text class="photo-icon">🔍</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 提交信息 -->
      <view class="submit-info">
        <text>提交时间：{{ formatFullDateTime(log.created_at) }}</text>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <text class="empty-icon">📝</text>
      <text class="empty-text">日志不存在</text>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const log = ref(null)
const loading = ref(true)
const photos = ref([])

onMounted(() => {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const options = current.options || {}
  const logId = parseInt(options.id || '0')
  fetchLogDetail(logId)
})

function fetchLogDetail(logId) {
  loading.value = true
  uni.request({
    url: `/api/project-log/${logId}`,
    success: (res) => {
      if (res.data) {
        log.value = res.data
        photos.value = getPhotos(res.data)
      }
    },
    fail: () => {
      log.value = null
    },
    complete: () => {
      loading.value = false
    }
  })
}

function getPhotos(log) {
  if (!log.images) return []
  try {
    let photosStr = log.images
    let parsed = JSON.parse(photosStr)
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed)
    }
    if (Array.isArray(parsed)) {
      return parsed.filter(p => p && p.trim())
    }
    return []
  } catch (e) {
    return []
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
}

function formatFullTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function formatFullDateTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function previewPhoto(index) {
  uni.previewImage({
    urls: photos.value,
    current: photos.value[index]
  })
}

const goBack = () => {
  uni.navigateBack()
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 20rpx;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 100rpx;
  color: #999;
}

.log-detail {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24rpx;
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.log-info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.log-date {
  font-size: 28rpx;
  color: #999;
}

.log-author {
  font-size: 32rpx;
  font-weight: 600;
  color: #1E3A5F;
}

.log-time {
  font-size: 26rpx;
  color: #999;
}

.section {
  margin-bottom: 24rpx;
}

.section-label {
  font-size: 26rpx;
  color: #666;
  margin-bottom: 12rpx;
  font-weight: 500;
}

.section-content {
  font-size: 30rpx;
  color: #333;
  line-height: 1.6;
}

.plan-content {
  color: #FF6B35;
  background: #FFF8F5;
  padding: 16rpx 20rpx;
  border-radius: 10rpx;
}

.note-content {
  color: #666;
  font-style: italic;
  background: #f9f9f9;
  padding: 16rpx 20rpx;
  border-radius: 10rpx;
}

.log-tags {
  display: flex;
  gap: 16rpx;
}

.log-tag {
  font-size: 26rpx;
  color: #1E3A5F;
  background: #E8F4FF;
  padding: 10rpx 24rpx;
  border-radius: 24rpx;
}

.photos-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
}

.photo-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 12rpx;
  overflow: hidden;
}

.photo-img {
  width: 100%;
  height: 100%;
}

.photo-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.photo-item:active .photo-overlay {
  opacity: 1;
}

.photo-icon {
  font-size: 40rpx;
}

.submit-info {
  margin-top: 32rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #f0f0f0;
  text-align: center;
  color: #999;
  font-size: 24rpx;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 200rpx 0;
}

.empty-icon {
  font-size: 80rpx;
  color: #ddd;
  margin-bottom: 20rpx;
}

.empty-text {
  font-size: 28rpx;
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
