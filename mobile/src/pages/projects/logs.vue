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
          class="log-item"
          @click="goLogDetail(log)"
        >
          <!-- 左栏：日期卡片（占两排高度） -->
          <view class="log-date-bar">
            <text class="log-date-day">{{ formatDay(log.created_at) }}</text>
            <text class="log-date-month">{{ formatMonth(log.created_at) }}</text>
          </view>

          <!-- 右栏：所有内容 -->
          <view class="log-content-area">
            <!-- 第一二行：提交人 + 工种人数 + 时间 -->
            <view class="log-header-row">
              <view class="log-user-col">
                <text class="log-operator">👷 {{ log.operator || '未知' }}</text>
              </view>
              <text class="log-time">{{ formatFullTime(log.created_at) }}</text>
            </view>
            <view class="log-tags-row" v-if="log.work_type || log.worker_count">
              <text class="log-tag-icon" v-if="log.work_type">🔧 {{ log.work_type }}</text>
              <text class="log-tag-icon" v-if="log.worker_count">👷 {{ log.worker_count }}人</text>
            </view>

            <!-- 施工内容 -->
            <view class="log-section log-content-section" v-if="log.content">
              <view class="log-section-header">
                <text class="log-section-icon">📝</text>
                <text class="log-section-label">施工内容</text>
              </view>
              <text class="log-section-text">{{ log.content }}</text>
            </view>

            <!-- 明日计划 -->
            <view class="log-section log-plan-section" v-if="log.tomorrow_plan">
              <view class="log-section-header">
                <text class="log-section-icon">📅</text>
                <text class="log-section-label">明日计划</text>
              </view>
              <text class="log-section-text">{{ log.tomorrow_plan }}</text>
            </view>

            <!-- 备注 -->
            <view class="log-section log-note-section" v-if="log.note">
              <view class="log-section-header">
                <text class="log-section-icon">📋</text>
                <text class="log-section-label">备注</text>
              </view>
              <text class="log-section-text">{{ log.note }}</text>
            </view>

            <!-- 图片 -->
            <view class="log-photos" v-if="getPhotos(log).length">
              <view
                class="log-photo"
                v-for="(photo, idx) in getPhotos(log)"
                :key="idx"
                @click.stop="previewImage(getPhotos(log), idx)"
              >
                <image class="log-photo-img" :src="photo" mode="aspectFill" />
              </view>
            </view>
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

    <!-- 图片放大预览弹窗 -->
    <view v-if="previewVisible" class="preview-modal" @click="closePreview">
      <view class="preview-close" @click.stop="closePreview">✕</view>
      <swiper class="preview-swiper" :current="previewIndex" @change="onSwiperChange">
        <swiper-item v-for="(photo, idx) in previewPhotos" :key="idx">
          <image class="preview-image" :src="photo" mode="widthFix" />
        </swiper-item>
      </swiper>
      <view class="preview-indicator">{{ previewIndex + 1 }} / {{ previewPhotos.length }}</view>
    </view>
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

// 图片预览相关
const previewVisible = ref(false)
const previewPhotos = ref([])
const previewIndex = ref(0)

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
        logs.value = res.data || []
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

// 格式化日期
function formatDay(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return String(d.getDate()).padStart(2, '0')
}

function formatMonth(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
  return months[d.getMonth()]
}

function formatFullTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

// 获取日志图片（处理双重编码的JSON字符串）
function getPhotos(log) {
  if (!log.images) return []
  try {
    let photosStr = log.images
    // 第一次解析
    let parsed = JSON.parse(photosStr)
    // 如果解析后是字符串，继续解析
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed)
    }
    if (Array.isArray(parsed)) {
      return parsed.filter(p => p && p.trim())
    }
    return []
  } catch (e) {
    console.error('解析图片失败:', e.message)
    return []
  }
}

function goLogDetail(log) {
  uni.navigateTo({ url: `/pages/projects/log-detail?id=${log.id}` });
}

function goAddLog() {
  uni.navigateTo({ url: `/pages/projects/log-add?id=${projectId.value}` });
}

// 点击缩略图预览（使用原生预览）
function previewImage(photos, index) {
  uni.previewImage({ urls: photos, current: photos[index] })
}

// 关闭预览
function closePreview() {
  previewVisible.value = false
}

// 滑动切换图片
function onSwiperChange(e) {
  previewIndex.value = e.detail.current
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

.log-item {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  margin-bottom: 12px;
  display: flex;
  align-items: stretch;
}

.log-date-bar {
  width: 56px;
  background: #1E3A5F;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 0;
  margin-right: 12px;
  flex-shrink: 0;
}

.log-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.log-user-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-date-day {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.log-date-month {
  font-size: 10px;
  color: rgba(255,255,255,0.8);
  margin-top: 2px;
}

.log-operator {
  font-size: 14px;
  font-weight: 600;
  color: #1E3A5F;
}

.log-time {
  font-size: 12px;
  color: #9CA3AF;
}

.log-tags-row {
  display: flex;
  gap: 12px;
}

.log-tag-icon {
  font-size: 13px;
  color: #1E3A5F;
  background: #E8F4FF;
  padding: 6px 14px;
  border-radius: 18px;
}

.log-content-area {
  flex: 1;
}

.log-section {
  margin-bottom: 16rpx;
}

.log-section-header {
  display: flex;
  align-items: center;
  margin-bottom: 6rpx;
}

.log-section-icon {
  font-size: 24rpx;
  margin-right: 6rpx;
}

.log-section-label {
  font-size: 24rpx;
  color: #666;
}

.log-section-text {
  display: block;
  font-size: 28rpx;
  color: #333;
  line-height: 1.5;
  word-break: break-all;
  padding-left: 36rpx;
}

.log-plan-section .log-section-text {
  color: #FF6B35;
}

.log-note-section .log-section-text {
  color: #888;
  font-style: italic;
}

.log-photos {
  display: grid;
  grid-template-columns: repeat(5, 20%);
  gap: 6px;
  width: 100%;
}

.log-photo {
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
}

.log-photo-img {
  width: 100%;
  height: 100%;
  display: block;
}

/* 空状态 */
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
