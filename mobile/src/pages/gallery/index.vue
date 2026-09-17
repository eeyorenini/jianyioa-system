<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">图库</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 项目选择 -->
    <view class="project-select">
      <picker :value="projectIndex" :range="projects" range-key="name" @change="onProjectChange">
        <view class="picker-bar">
          <text class="picker-text">{{ selectedProject?.name || '全部项目' }}</text>
          <text class="iconfont icon-arrow-down"></text>
        </view>
      </picker>
    </view>

    <!-- 照片网格 -->
    <scroll-view class="gallery-grid" scroll-y>
      <view v-if="loading" class="empty-state"><text class="loading-icon iconfont icon-loading"></text></view>
      <view v-else-if="groups.length === 0" class="empty-state">
        <text class="empty-icon iconfont icon-image"></text>
        <text class="empty-text">暂无照片</text>
      </view>
      <view v-else>
        <view v-for="group in groups" :key="group.date" class="date-group">
          <view class="date-header">{{ group.date }}</view>
          <view class="photo-row">
            <view
              v-for="(photo, idx) in group.photos"
              :key="idx"
              class="photo-cell"
              @click="preview(group.allPhotos, group.allPhotos.indexOf(photo))"
            >
              <image class="photo-img" :src="photo.url" mode="aspectFill" />
              <view class="photo-overlay">
                <text class="photo-desc">{{ photo.desc || '' }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const projects = ref([])
const projectIndex = ref(-1)
const selectedProject = ref(null)
const groups = ref([])
const loading = ref(false)

onMounted(() => {
  uni.request({
    url: '/api/projects/list',
    data: { page_size: 100 },
    success: (res) => {
      if (res.data.code === 0) projects.value = res.data.data?.list || []
    }
  })
  fetchGallery()
})

function onProjectChange(e) {
  projectIndex.value = e.detail.value
  selectedProject.value = projects.value[projectIndex.value]
  fetchGallery()
}

function fetchGallery() {
  loading.value = true
  const project_id = selectedProject.value?.id || ''
  uni.request({
    url: '/api/gallery',
    data: { project_id },
    success: (res) => {
      if (res.data.code === 0) groups.value = res.data.data || []
      else groups.value = []
    },
    complete: () => { loading.value = false }
  })
}

function preview(allPhotos, index) {
  uni.previewImage({ urls: allPhotos.map(p => p.url), current: index })
}


const goBack = () => {
  uni.navigateBack();
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.project-select { padding: 20rpx; background: #fff; }
.picker-bar { display: flex; justify-content: space-between; align-items: center; background: #f5f5f5; border-radius: 40rpx; padding: 20rpx 30rpx; }
.picker-text { font-size: 28rpx; color: #333; }
.gallery-grid { height: calc(100vh - 140rpx); padding: 20rpx; }
.date-group { margin-bottom: 30rpx; }
.date-header { font-size: 26rpx; color: #999; margin-bottom: 16rpx; }
.photo-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8rpx; }
.photo-cell { position: relative; aspect-ratio: 1; }
.photo-img { width: 100%; height: 100%; border-radius: 8rpx; }
.photo-overlay { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.5)); padding: 20rpx 8rpx 8rpx; border-radius: 0 0 8rpx 8rpx; }
.photo-desc { font-size: 20rpx; color: #fff; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 120rpx 0; }
.loading-icon { font-size: 60rpx; color: #1E3A5F; animation: spin 1s linear infinite; }
.empty-icon { font-size: 80rpx; color: #ddd; margin-bottom: 20rpx; }
.empty-text { font-size: 28rpx; color: #999; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
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
