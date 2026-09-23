<template>
  <view class="dynamic-feed">
    <!-- 标题栏 -->
    <view class="feed-header">
      <text class="feed-title">装修动态</text>
      <text class="feed-count" v-if="list.length > 0">{{ list.length }}条</text>
    </view>

    <!-- 加载中骨架屏 -->
    <view v-if="loading && list.length === 0" class="skeleton-list">
      <view v-for="i in 3" :key="i" class="skeleton-card">
        <view class="skeleton-header">
          <view class="skeleton-avatar"></view>
          <view class="skeleton-meta">
            <view class="skeleton-line short"></view>
            <view class="skeleton-line tiny"></view>
          </view>
        </view>
        <view class="skeleton-content"></view>
        <view class="skeleton-images">
          <view class="skeleton-img"></view>
          <view class="skeleton-img"></view>
          <view class="skeleton-img"></view>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else-if="!loading && list.length === 0" class="empty-state">
      <text class="empty-icon">📝</text>
      <text class="empty-text">暂无施工动态</text>
      <text class="empty-hint">工长正在工地施工，敬请期待</text>
    </view>

    <!-- 错误状态 -->
    <view v-else-if="error" class="error-state">
      <text class="error-icon">⚠️</text>
      <text class="error-text">加载失败</text>
      <view class="retry-btn" @click="handleRetry">点击重试</view>
    </view>

    <!-- 动态列表 -->
    <view v-else class="feed-list">
      <view
        v-for="(item, index) in list"
        :key="item.id || index"
        class="dynamic-card"
      >
        <!-- 卡片头部 -->
        <view class="card-header">
          <view class="user-info">
            <view class="avatar">{{ getAvatarText(item) }}</view>
            <view class="user-meta">
              <view class="user-row">
                <text class="user-name">{{ item.operator || item.creator_name || '未知' }}</text>
                <view class="role-tag" v-if="item.role_name || item.role">
                  {{ item.role_name || item.role }}
                </view>
              </view>
              <text class="post-time">{{ formatTime(item.created_at) }}</text>
            </view>
          </view>
        </view>

        <!-- 卡片内容 -->
        <view class="card-body">
          <!-- 文字内容 -->
          <view class="content-text" :class="{ collapsed: item.collapsed && isLongContent(item) }">
            {{ item.content || item.description || '暂无内容' }}
          </view>
          <view class="expand-btn" v-if="isLongContent(item)" @click="toggleExpand(item)">
            {{ item.collapsed ? '展开' : '收起' }}
          </view>

          <!-- 媒体素材区 -->
          <view class="media-section" v-if="getMediaList(item).length > 0">
            <!-- 图片网格 -->
            <view class="media-grid" :class="'grid-' + Math.min(getMediaList(item).length, 3)">
              <view
                v-for="(media, mediaIdx) in getMediaList(item)"
                :key="mediaIdx"
                class="media-item"
                @click="previewMedia(getMediaList(item), mediaIdx)"
              >
                <image
                  class="media-img"
                  :src="media.thumbnailUrl || media.url"
                  mode="aspectFill"
                  @error="onMediaError($event, item, mediaIdx)"
                />
                <!-- 视频标记 -->
                <view class="video-play" v-if="media.type === 'video'">
                  <text class="play-icon">▶</text>
                </view>
                <!-- 加载失败占位 -->
                <view class="media-error" v-if="item.mediaError?.[mediaIdx]">
                  <text>素材加载失败</text>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 加载更多 -->
      <view v-if="loadingMore" class="load-more">
        <text>加载中...</text>
      </view>
      <view v-else-if="noMore && list.length > 0" class="load-more no-more">
        <text>没有更多了</text>
      </view>
      <view v-else-if="!noMore && list.length > 0" class="load-more" @click="loadMoreData">
        <text>加载更多</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from "vue";

const props = defineProps({
  // 动态列表数据
  list: {
    type: Array,
    default: () => []
  },
  // 加载状态
  loading: {
    type: Boolean,
    default: false
  },
  // 加载更多状态
  loadingMore: {
    type: Boolean,
    default: false
  },
  // 是否没有更多数据
  noMore: {
    type: Boolean,
    default: false
  },
  // 错误状态
  error: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['retry', 'load-more', 'media-click']);

// 获取头像文字
const getAvatarText = (item) => {
  const name = item.operator || item.creator_name || '未知';
  return name.substring(0, 1);
};

// 格式化时间
const formatTime = (dateStr) => {
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

// 判断是否为长内容
const isLongContent = (item) => {
  const content = item.content || item.description || '';
  return content.length > 100;
};

// 展开/收起
const toggleExpand = (item) => {
  item.collapsed = !item.collapsed;
};

// 获取媒体列表
const getMediaList = (item) => {
  if (item.mediaList && Array.isArray(item.mediaList)) {
    return item.mediaList;
  }
  if (item.images) {
    try {
      const images = typeof item.images === 'string' ? JSON.parse(item.images) : item.images;
      if (Array.isArray(images)) {
        return images.map(url => ({ url, type: 'image' }));
      }
    } catch (e) {
      // 如果是逗号分隔的字符串
      if (typeof item.images === 'string') {
        return item.images.split(',').filter(Boolean).map(url => ({ url, type: 'image' }));
      }
    }
  }
  if (item.photos) {
    try {
      const photos = typeof item.photos === 'string' ? JSON.parse(item.photos) : item.photos;
      if (Array.isArray(photos)) {
        return photos.map(url => ({ url, type: 'image' }));
      }
    } catch (e) {}
  }
  return [];
};

// 预览媒体
const previewMedia = (mediaList, index) => {
  const urls = mediaList.map(m => m.url || m.thumbnailUrl);
  uni.previewImage({
    urls,
    current: index
  });
  emit('media-click', { mediaList, index });
};

// 媒体加载失败
const onMediaError = (e, item, index) => {
  if (!item.mediaError) {
    item.mediaError = {};
  }
  item.mediaError[index] = true;
};

// 重试
const handleRetry = () => {
  emit('retry');
};

// 加载更多
const loadMoreData = () => {
  emit('load-more');
};
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
  padding: 16px 0 12px;
}

.feed-title {
  font-size: 16px;
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
  padding: 40px 20px;
  background: #fff;
  border-radius: 14px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 15px;
  color: #374151;
  font-weight: 500;
  margin-bottom: 4px;
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
  border-radius: 14px;
}

.error-icon {
  font-size: 36px;
  margin-bottom: 8px;
}

.error-text {
  font-size: 14px;
  color: #EF4444;
  margin-bottom: 12px;
}

.retry-btn {
  font-size: 14px;
  color: #1E3A5F;
  padding: 8px 24px;
  border: 1px solid #1E3A5F;
  border-radius: 20px;
}

/* 骨架屏 */
.skeleton-list {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
}

.skeleton-card {
  margin-bottom: 16px;
}

.skeleton-card:last-child {
  margin-bottom: 0;
}

.skeleton-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.skeleton-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.skeleton-meta {
  flex: 1;
}

.skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  margin-bottom: 6px;
}

.skeleton-line.short { width: 60%; }
.skeleton-line.tiny { width: 40%; height: 10px; }

.skeleton-content {
  height: 40px;
  border-radius: 8px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  margin-bottom: 12px;
}

.skeleton-images {
  display: flex;
  gap: 8px;
}

.skeleton-img {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* 动态卡片列表 */
.feed-list {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
}

.dynamic-card {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #F5F7FA;
}

.dynamic-card:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

/* 卡片头部 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1E3A5F, #3B82F6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-name {
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
}

.role-tag {
  font-size: 10px;
  padding: 2px 6px;
  background: #DBEAFE;
  color: #1E40AF;
  border-radius: 10px;
}

.post-time {
  font-size: 12px;
  color: #9CA3AF;
}

/* 卡片内容 */
.card-body {
  padding-left: 50px;
}

.content-text {
  font-size: 14px;
  color: #374151;
  line-height: 1.6;
  word-break: break-all;
}

.content-text.collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.expand-btn {
  font-size: 13px;
  color: #1E3A5F;
  margin-top: 4px;
}

/* 媒体区 */
.media-section {
  margin-top: 10px;
}

.media-grid {
  display: grid;
  gap: 6px;
}

.media-grid.grid-1 { grid-template-columns: 1fr; }
.media-grid.grid-2 { grid-template-columns: repeat(2, 1fr); }
.media-grid.grid-3 { grid-template-columns: repeat(3, 1fr); }

.media-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: #F5F7FA;
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
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.play-icon {
  color: #fff;
  font-size: 14px;
  margin-left: 2px;
}

.media-error {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #E5E7EB;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #6B7280;
}

/* 加载更多 */
.load-more {
  text-align: center;
  padding: 16px 0 4px;
  font-size: 13px;
  color: #1E3A5F;
}

.load-more.no-more {
  color: #9CA3AF;
}
</style>
