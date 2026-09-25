<template>
  <view class="dynamic-feed">
    <!-- 标题栏 -->
    <view class="feed-header">
      <text class="feed-title">装修动态</text>
      <text class="feed-count" v-if="list.length > 0">{{ list.length }}条更新</text>
    </view>

    <!-- 加载中骨架屏 -->
    <view v-if="loading && list.length === 0" class="skeleton-list">
      <view v-for="i in 3" :key="i" class="skeleton-card">
        <view class="skeleton-left">
          <view class="skeleton-avatar"></view>
        </view>
        <view class="skeleton-right">
          <view class="skeleton-line" style="width:80px"></view>
          <view class="skeleton-line" style="height:50px;margin-top:8px"></view>
          <view class="skeleton-line" style="width:60%;margin-top:8px"></view>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else-if="!loading && list.length === 0" class="empty-state">
      <text class="empty-icon">🏠</text>
      <text class="empty-text">暂无施工动态</text>
      <text class="empty-hint">施工进度将第一时间更新</text>
    </view>

    <!-- 错误状态 -->
    <view v-else-if="error" class="error-state">
      <text class="error-icon">⚠️</text>
      <text class="error-text">加载失败</text>
      <view class="retry-btn" @click="handleRetry">点击重试</view>
    </view>

    <!-- 动态列表 - 卡片流 -->
    <view v-else class="feed-list">
      <view
        v-for="(item, index) in list"
        :key="item.id || index"
        class="dynamic-card"
        :class="{ 'has-image': getMediaList(item).length > 0 }"
      >
        <!-- 左侧类型指示条 -->
        <view class="card-type-bar" :style="{ background: item.typeColor || '#3B82F6' }"></view>
        
        <!-- 主要内容区 -->
        <view class="card-main">
          <!-- 头部：类型标签 + 时间 -->
          <view class="card-header">
            <view class="type-badge" :style="{ 
              background: (item.typeColor || '#3B82F6') + '18',
              color: item.typeColor || '#3B82F6'
            }">
              <text class="type-icon">{{ item.typeIcon }}</text>
              <text class="type-label">{{ item.typeText }}</text>
            </view>
            <text class="post-time">{{ formatDate(item.created_at) }}</text>
          </view>

          <!-- 内容区域 -->
          <view class="card-content">
            <text class="content-text" :class="{ 'empty-content': !getContentText(item) }">
              {{ getContentText(item) || '暂无详细描述' }}
            </text>
          </view>

          <!-- 图片区域 -->
          <view class="media-section" v-if="getMediaList(item).length > 0">
            <view class="media-grid" :class="'grid-' + Math.min(getMediaList(item).length, 3)">
              <view
                v-for="(media, mediaIdx) in getMediaList(item).slice(0, 3)"
                :key="mediaIdx"
                class="media-item"
                @click.stop="previewMedia(getMediaList(item), mediaIdx)"
              >
                <image
                  class="media-img"
                  :src="media.thumbnailUrl || media.url"
                  mode="aspectFill"
                />
                <view class="video-play" v-if="media.type === 'video'">
                  <text class="play-icon">▶</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 底部信息 -->
          <view class="card-footer">
            <view class="operator-info">
              <text class="operator-name">{{ item.operator || item.creator_name || '系统' }}</text>
            </view>
            <view class="card-actions">
              <text class="action-tag">{{ getSourceText(item) }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 加载更多 -->
      <view v-if="loadingMore" class="load-more">
        <text>加载中...</text>
      </view>
      <view v-else-if="noMore && list.length > 0" class="load-more no-more">
        <text>— 已加载全部 —</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from "vue";

const props = defineProps({
  list: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  loadingMore: { type: Boolean, default: false },
  noMore: { type: Boolean, default: false },
  error: { type: Boolean, default: false }
});

const emit = defineEmits(['retry', 'load-more', 'media-click']);

// 获取内容文本
const getContentText = (item) => {
  if (item.content) return item.content;
  if (item.description) return item.description;
  if (item.result) return item.result;
  if (item.note) return item.note;
  if (item.issues) return item.issues;
  return '';
};

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

// 获取来源
const getSourceText = (item) => {
  if (item.source) return item.source;
  if (item.type === 'log') return '施工日志';
  if (item.type === 'inspection') return '巡检记录';
  if (item.type === 'acceptance') return '验收记录';
  if (item.type === 'node') return '节点进度';
  if (item.category) return item.category;
  return '动态';
};

// 获取媒体列表
const getMediaList = (item) => {
  const parseJson = (str) => {
    if (!str) return [];
    try {
      const parsed = JSON.parse(str);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };
  
  if (item.mediaList) return item.mediaList;
  if (item.images) {
    const imgs = parseJson(item.images);
    return imgs.length ? imgs.map(url => ({ url, type: 'image' })) : [];
  }
  if (item.photos) {
    const photos = parseJson(item.photos);
    return photos.length ? photos.map(url => ({ url, type: 'image' })) : [];
  }
  return [];
};

// 预览图片
const previewMedia = (mediaList, index) => {
  const urls = mediaList.map(m => m.url || m.thumbnailUrl);
  uni.previewImage({ urls, current: index });
  emit('media-click', { mediaList, index });
};

// 重试
const handleRetry = () => emit('retry');
const loadMoreData = () => emit('load-more');
</script>

<style scoped>
.dynamic-feed {
  padding: 0 16px 16px;
}

/* 标题栏 */
.feed-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0 14px;
}

.feed-title {
  font-size: 17px;
  font-weight: 600;
  color: #1A1F36;
}

.feed-count {
  font-size: 12px;
  color: #9CA3AF;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 50px 20px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}

.empty-icon {
  font-size: 56px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 16px;
  color: #374151;
  font-weight: 500;
  margin-bottom: 6px;
}

.empty-hint {
  font-size: 13px;
  color: #9CA3AF;
}

/* 错误状态 */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  background: #fff;
  border-radius: 16px;
}

.error-icon { font-size: 40px; margin-bottom: 12px; }
.error-text { font-size: 14px; color: #EF4444; margin-bottom: 14px; }

.retry-btn {
  font-size: 14px;
  color: #fff;
  background: linear-gradient(135deg, #1E3A5F, #2D5A8E);
  padding: 10px 28px;
  border-radius: 20px;
}

/* 骨架屏 */
.skeleton-list {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}

.skeleton-card {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.skeleton-card:last-child { margin-bottom: 0; }

.skeleton-left { flex-shrink: 0; }

.skeleton-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.skeleton-right { flex: 1; }

.skeleton-line {
  height: 14px;
  border-radius: 7px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* 动态卡片 */
.feed-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dynamic-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
  overflow: hidden;
  display: flex;
  transition: transform 0.2s, box-shadow 0.2s;
}

.dynamic-card:active {
  transform: scale(0.98);
  box-shadow: 0 1px 6px rgba(0,0,0,0.06);
}

/* 左侧类型色条 */
.card-type-bar {
  width: 4px;
  flex-shrink: 0;
}

/* 主要内容 */
.card-main {
  flex: 1;
  padding: 14px 16px;
}

/* 头部 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.type-icon { font-size: 13px; }
.type-label { font-size: 12px; }

.post-time {
  font-size: 12px;
  color: #9CA3AF;
}

/* 内容 */
.card-content {
  margin-bottom: 10px;
}

.content-text {
  font-size: 15px;
  color: #374151;
  line-height: 1.6;
  word-break: break-all;
}

.content-text.empty-content {
  color: #9CA3AF;
  font-style: italic;
}

/* 图片区 */
.media-section {
  margin-bottom: 12px;
}

.media-grid {
  display: grid;
  gap: 6px;
}

.media-grid.grid-1 { grid-template-columns: 1fr; max-width: 200px; }
.media-grid.grid-2 { grid-template-columns: repeat(2, 1fr); }
.media-grid.grid-3 { grid-template-columns: repeat(3, 1fr); }

.media-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: #F3F4F6;
}

.media-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.play-icon {
  color: #fff;
  font-size: 12px;
  margin-left: 2px;
}

/* 底部 */
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #F5F7FA;
}

.operator-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.operator-name {
  font-size: 13px;
  color: #6B7280;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.action-tag {
  font-size: 11px;
  color: #9CA3AF;
  background: #F5F7FA;
  padding: 3px 8px;
  border-radius: 8px;
}

/* 加载更多 */
.load-more {
  text-align: center;
  padding: 16px 0 8px;
  font-size: 13px;
  color: #9CA3AF;
}

.load-more.no-more {
  color: #D1D5DB;
}
</style>
