<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">巡检详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <view v-if="loading" class="loading-wrap">
      <text class="loading-icon iconfont icon-loading"></text>
    </view>

    <view v-else-if="!detail" class="empty-state">
      <text class="empty-text">巡检记录不存在</text>
    </view>

    <view v-else class="detail-wrap">
      <!-- 状态标签 -->
      <view class="status-bar">
        <text class="status-tag" :class="statusClass">{{ statusText }}</text>
        <text class="create-time">{{ formatDate(detail.created_at) }}</text>
      </view>

      <!-- 基础信息 -->
      <view class="card">
        <view class="card-title">巡检信息</view>
        <view class="info-row">
          <text class="info-label">项目</text>
          <text class="info-value">{{ detail.project_name || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">检查项</text>
          <text class="info-value">{{ detail.category || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">问题位置</text>
          <text class="info-value">{{ detail.location || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">严重程度</text>
          <text class="severity-tag" :class="'severity-' + detail.level">{{ severityText }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">负责人</text>
          <text class="info-value">{{ detail.responsible_name || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">整改期限</text>
          <text class="info-value" :class="{ 'text-red': isOverdue }">{{ detail.due_date || '-' }}</text>
        </view>
      </view>

      <!-- 问题描述 -->
      <view class="card">
        <view class="card-title">问题描述</view>
        <text class="problem-desc">{{ detail.issue_desc || '无' }}</text>
      </view>

      <!-- 照片 -->
      <view v-if="getPhotos(detail).length > 0" class="card">
        <view class="card-title">现场照片</view>
        <view class="photo-grid">
          <image
            v-for="(photo, idx) in getPhotos(detail)"
            :key="idx"
            class="photo-item"
            :src="photo"
            mode="aspectFill"
            @click="previewImage(idx)"
          />
        </view>
      </view>

      <!-- 整改记录 -->
      <view v-if="detail.fix_record" class="card">
        <view class="card-title">整改记录</view>
        <text class="fix-record">{{ detail.fix_record }}</text>
        <text v-if="detail.fix_time" class="fix-time">整改于 {{ detail.fix_time }}</text>
      </view>

      <!-- 整改操作 -->
      <view v-if="detail.status === 'pending'" class="action-bar">
        <button class="btn-primary" @click="showFixDialog = true">提交整改</button>
      </view>
    </view>

    <!-- 整改弹窗 -->
    <view v-if="showFixDialog" class="dialog-mask" @click="showFixDialog = false">
      <view class="dialog" @click.stop>
        <view class="dialog-title">提交整改</view>
        <textarea
          class="fix-input"
          v-model="fixContent"
          placeholder="请描述整改情况..."
          rows="4"
        />
        <view class="dialog-actions">
          <button class="btn-cancel" @click="showFixDialog = false">取消</button>
          <button class="btn-primary" @click="submitFix">提交</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const loading = ref(true)
const detail = ref(null)
const showFixDialog = ref(false)
const fixContent = ref('')

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  const id = currentPage?.options?.id
  // 优先从列表页传递的数据获取，避免额外请求
  if (currentPage?.$inspectionData) {
    detail.value = currentPage.$inspectionData
    loading.value = false
  } else if (id) {
    fetchDetail(id)
  } else {
    loading.value = false
  }
})

function fetchDetail(id) {
  uni.request({
    url: `/api/rectification-issues?id=${id}`,
    success: (res) => {
      if (res.data && Array.isArray(res.data) && res.data[0]) {
        detail.value = res.data[0];
      } else if (res.data?.data) {
        detail.value = res.data.data;
      } else {
        detail.value = null;
      }
    },
    fail: () => { detail.value = null },
    complete: () => { loading.value = false }
  })
}

const statusClass = computed(() => {
  const s = String(detail.value?.rectify_status || detail.value?.status || '').toLowerCase()
  if (s.includes('待整改') || s === 'pending') return 'status-pending'
  if (s.includes('已完成') || s === 'completed') return 'status-fixed'
  if (s.includes('已验收') || s === 'verified') return 'status-fixed'
  return ''
})

const statusText = computed(() => {
  const s = String(detail.value?.rectify_status || detail.value?.status || '').toLowerCase()
  if (s.includes('待整改') || s === 'pending') return '待整改'
  if (s.includes('已完成') || s === 'completed') return '已完成'
  if (s.includes('已验收') || s === 'verified') return '已验收'
  if (s.includes('整改中') || s === 'fixing') return '整改中'
  return '待整改'
})

const severityText = computed(() => {
  const map = { low: '轻微', medium: '中等', high: '严重', serious: '严重', stop: '停工', normal: '一般' }
  return map[detail.value?.level] || '一般'
})

const isOverdue = computed(() => {
  if (!detail.value?.due_date) return false
  const s = String(detail.value?.rectify_status || detail.value?.status || '').toLowerCase()
  return new Date(detail.value.due_date) < new Date() && !s.includes('完成') && !s.includes('已完成')
})

function formatDate(str) {
  if (!str) return ''
  const d = new Date(str.replace(/-/g, '/'))
  return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

function getPhotos(item) {
  if (!item?.images) return []
  try {
    let s = item.images
    let p = JSON.parse(s)
    if (typeof p === 'string') p = JSON.parse(p)
    if (Array.isArray(p)) return p.filter(x => x && x.trim())
    return []
  } catch { return [] }
}

function previewImage(index) {
  const photos = getPhotos(detail.value)
  uni.previewImage({ urls: photos, current: photos[index] })
}

function submitFix() {
  if (!fixContent.value.trim()) {
    uni.showToast({ title: '请填写整改内容', icon: 'none' })
    return
  }
  // 调用真实存在的 API: PUT /api/inspections/:id
  uni.request({
    url: `/api/inspections/${detail.value.id}`,
    method: 'PUT',
    data: {
      rectify_status: '整改中',
      remark: fixContent.value
    },
    success: (res) => {
      if (res.data.code === 0 || res.statusCode === 200) {
        uni.showToast({ title: '提交成功', icon: 'success' })
        showFixDialog.value = false
        // 更新本地数据
        detail.value.rectify_status = '整改中'
        detail.value.remark = fixContent.value
      } else {
        uni.showToast({ title: res.data?.msg || '提交失败', icon: 'none' })
      }
    }
  })
}


const goBack = () => {
  uni.navigateBack();
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding: 20rpx; padding-bottom: 120rpx; }
.loading-wrap { display: flex; justify-content: center; padding: 120rpx 0; }
.loading-icon { font-size: 60rpx; color: #1E3A5F; animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.empty-state { display: flex; justify-content: center; padding: 120rpx 0; }
.empty-text { font-size: 28rpx; color: #999; }
.status-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.status-tag { font-size: 24rpx; padding: 6rpx 20rpx; border-radius: 20rpx; }
.status-pending { background: #FFF3E0; color: #FF9800; }
.status-fixed { background: #E8F5E9; color: #4CAF50; }
.status-overdue { background: #FFEBEE; color: #F44336; }
.create-time { font-size: 24rpx; color: #999; }
.card { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 20rpx; }
.card-title { font-size: 28rpx; font-weight: 600; color: #1E3A5F; margin-bottom: 20rpx; }
.info-row { display: flex; justify-content: space-between; padding: 14rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.info-row:last-child { border-bottom: none; }
.info-label { font-size: 26rpx; color: #999; }
.info-value { font-size: 26rpx; color: #333; }
.text-red { color: #F44336 !important; }
.severity-tag { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 20rpx; }
.severity-low { background: #E8F5E9; color: #4CAF50; }
.severity-medium { background: #FFF3E0; color: #FF9800; }
.severity-high { background: #FFEBEE; color: #F44336; }
.problem-desc { font-size: 28rpx; color: #333; line-height: 1.6; }
.photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12rpx; }
.photo-item { width: 200rpx; height: 200rpx; border-radius: 8rpx; }
.fix-record { font-size: 28rpx; color: #333; line-height: 1.6; display: block; }
.fix-time { font-size: 24rpx; color: #999; display: block; margin-top: 12rpx; }
.action-bar { position: fixed; bottom: 0; left: 0; right: 0; padding: 20rpx 40rpx; background: #fff; box-shadow: 0 -2rpx 10rpx rgba(0,0,0,0.05); }
.dialog-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 999; }
.dialog { width: 600rpx; background: #fff; border-radius: 20rpx; padding: 40rpx; }
.dialog-title { font-size: 32rpx; font-weight: 600; color: #1E3A5F; margin-bottom: 30rpx; text-align: center; }
.fix-input { width: 100%; border: 1rpx solid #eee; border-radius: 12rpx; padding: 20rpx; font-size: 28rpx; box-sizing: border-box; }
.dialog-actions { display: flex; gap: 20rpx; margin-top: 30rpx; }
.btn-primary { flex: 1; background: #1E3A5F; color: #fff; border-radius: 40rpx; font-size: 28rpx; padding: 0; height: 80rpx; line-height: 80rpx; }
.btn-cancel { flex: 1; background: #f5f5f5; color: #666; border-radius: 40rpx; font-size: 28rpx; }
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
