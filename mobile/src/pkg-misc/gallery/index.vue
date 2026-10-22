<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar" :style="navStyle">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">图库</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 分类选择 -->
    <view class="gallery-tabs">
      <text
        class="gallery-tab"
        :class="{ active: curCat === '全部' }"
        @click="switchCat('全部')"
      >全部</text>
      <text
        class="gallery-tab"
        :class="{ active: curCat === cat }"
        v-for="cat in allCats"
        :key="cat"
        @click="switchCat(cat)"
      >{{ cat }}</text>
    </view>

    <!-- 照片网格（4 列 + 加载更多分页） -->
    <scroll-view class="gallery-grid" scroll-y>
      <view v-if="loading && allPhotos.length === 0" class="empty-state">
        <text class="loading-icon">⟳</text>
        <text class="empty-text">加载中…</text>
      </view>
      <view v-else-if="photos.length === 0" class="empty-state">
        <text class="empty-icon">📷</text>
        <text class="empty-text">暂无照片</text>
      </view>
      <view v-else class="photo-row-4col">
        <view
          v-for="(photo, idx) in photos"
          :key="photo.url + idx"
          class="photo-cell"
          @click="preview(idx)"
        >
          <image class="photo-img" :src="photo.url" mode="aspectFill" />
          <view class="photo-overlay">
            <text class="photo-desc">{{ photo.desc || '' }}</text>
            <text class="photo-date" v-if="photo.date">{{ photo.date }}</text>
          </view>
        </view>
      </view>

      <!-- 加载更多 / 已加载完 -->
      <view v-if="allPhotos.length > 0 && photos.length < allPhotos.length" class="load-more" @click="loadMore">
        <text>{{ loading ? '加载中…' : `加载更多（已显示 ${photos.length}/${allPhotos.length}）` }}</text>
      </view>
      <view v-else-if="allPhotos.length > pageSize" class="load-more-end">
        <text>— 已加载全部 {{ allPhotos.length }} 张 —</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { absAsset } from "@/utils/api";

const projectId = ref('')
const projectName = ref('')
const curCat = ref('全部')
const allCats = ['开工', '水电', '防水', '泥瓦', '木工', '油漆', '安装', '验收']

// 全量照片（从后端一次拿完）+ 客户端分页渲染（避免图片太多渲染慢）
const allPhotos = ref([])
const visibleCount = ref(24)
const pageSize = 24
const loading = ref(false)

// 当前展示的照片（前 visibleCount 张）
const photos = computed(() => allPhotos.value.slice(0, visibleCount.value))

onMounted(() => {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const options = current.options || {}
  if (options.projectId) projectId.value = options.projectId
  if (options.projectName) projectName.value = decodeURIComponent(options.projectName)
  if (options.cat && options.cat !== 'undefined') {
    curCat.value = options.cat
  }
  fetchGallery()
})

function switchCat(cat) {
  curCat.value = cat
  visibleCount.value = pageSize // 切分类时重置到第一页
  fetchGallery()
}

function fetchGallery() {
  loading.value = true
  uni.request({
    url: '/api/project-gallery',
    data: {
      project_id: projectId.value,
      category: curCat.value === '全部' ? '' : curCat.value,
    },
    success: (res) => {
      allPhotos.value = (res.data?.list || []).map((x) => ({ ...x, url: absAsset(x.url) }))
    },
    complete: () => { loading.value = false }
  })
}

// 加载更多（每次多显示 pageSize 张；到底后按钮消失，显示"已加载全部"）
function loadMore() {
  if (loading.value) return
  loading.value = true
  setTimeout(() => {
    visibleCount.value = Math.min(visibleCount.value + pageSize, allPhotos.value.length)
    loading.value = false
  }, 150) // 给客户端一点点喘气时间，避免一次渲染太多卡顿
}

function preview(idx) {
  // 预览时传入全量 allPhotos，能让用户左右滑完所有照片
  const urls = allPhotos.value.map(p => p.url)
  uni.previewImage({ urls, current: idx })
}

const goBack = () => {
  uni.navigateBack();
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.gallery-tabs {
  display: flex; flex-wrap: nowrap; overflow-x: auto;
  background: #fff; padding: 12px 10px; gap: 8px;
  scrollbar-width: none;
}
.gallery-tabs::-webkit-scrollbar { display: none; }
.gallery-tab {
  font-size: 13px; color: #666; background: #f0f0f0;
  padding: 5px 14px; border-radius: 16px; white-space: nowrap;
  flex-shrink: 0;
}
.gallery-tab.active { background: #1E3A5F; color: #fff; }

.gallery-grid { height: calc(100vh - 160rpx - env(safe-area-inset-bottom)); padding: 12rpx; }
.photo-row-4col { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6rpx; }
.photo-cell {
  position: relative;
  aspect-ratio: 1;
  background: #F3F4F6;
  border-radius: 6rpx;
  overflow: hidden;
  cursor: pointer;
}
.photo-cell:active { transform: scale(0.97); }
.photo-img { width: 100%; height: 100%; display: block; }
.photo-overlay {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.6));
  padding: 14rpx 6rpx 6rpx;
}
.photo-desc {
  font-size: 20rpx; color: #fff;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
}
.photo-date {
  display: block; font-size: 18rpx; color: rgba(255,255,255,0.75); margin-top: 2rpx;
}
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 120rpx 0; }
.loading-icon { font-size: 60rpx; color: #1E3A5F; animation: spin 1s linear infinite; }
.empty-icon { font-size: 80rpx; color: #ddd; margin-bottom: 20rpx; }
.empty-text { font-size: 28rpx; color: #999; }

/* 加载更多 / 已加载完 */
.load-more, .load-more-end {
  text-align: center; padding: 32rpx 0;
  font-size: 26rpx;
}
.load-more { color: #1E3A5F; }
.load-more:active { opacity: 0.7; }
.load-more-end { color: #9CA3AF; }

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
