<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
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

    <!-- 照片网格 -->
    <scroll-view class="gallery-grid" scroll-y>
      <view v-if="loading" class="empty-state"><text class="loading-icon">⟳</text></view>
      <view v-else-if="photos.length === 0" class="empty-state">
        <text class="empty-icon">📷</text>
        <text class="empty-text">暂无照片</text>
      </view>
      <view v-else class="photo-row">
        <view
          v-for="(photo, idx) in photos"
          :key="idx"
          class="photo-cell"
          @click="preview(idx)"
        >
          <image class="photo-img" :src="photo.url" mode="aspectFill" />
          <view class="photo-overlay">
            <text class="photo-desc">{{ photo.desc || '' }}</text>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const projectId = ref('')
const projectName = ref('')
const curCat = ref('全部')
const allCats = ['开工', '水电', '防水', '泥瓦', '木工', '油漆', '安装', '验收']
const photos = ref([])
const loading = ref(false)

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
      photos.value = res.data?.list || []
    },
    complete: () => { loading.value = false }
  })
}

function preview(idx) {
  const urls = photos.value.map(p => p.url)
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

.gallery-grid { height: calc(100vh - 160rpx - env(safe-area-inset-bottom)); padding: 16rpx; }
.photo-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8rpx; }
.photo-cell { position: relative; aspect-ratio: 1; }
.photo-img { width: 100%; height: 100%; border-radius: 8rpx; }
.photo-overlay {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.5));
  padding: 20rpx 8rpx 8rpx; border-radius: 0 0 8rpx 8rpx;
}
.photo-desc { font-size: 20rpx; color: #fff; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 120rpx 0; }
.loading-icon { font-size: 60rpx; color: #1E3A5F; animation: spin 1s linear infinite; }
.empty-icon { font-size: 80rpx; color: #ddd; margin-bottom: 20rpx; }
.empty-text { font-size: 28rpx; color: #999; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
