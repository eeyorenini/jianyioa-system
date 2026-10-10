<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">待办中心</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 汇总 -->
    <view class="summary">
      <view class="summary-main">
        <text class="summary-num">{{ total }}</text>
        <text class="summary-label">项待处理</text>
      </view>
      <view class="summary-sub">按你的权限聚合：采购审核 · 报销 · 审批 · 派工</view>
    </view>

    <!-- 分类筛选 -->
    <scroll-view class="chip-bar" scroll-x>
      <view
        class="chip"
        :class="{ active: activeKey === 'all' }"
        @click="activeKey = 'all'"
      >
        全部
        <text v-if="total" class="chip-badge">{{ total }}</text>
      </view>
      <view
        v-for="g in groups"
        :key="g.key"
        class="chip"
        :class="{ active: activeKey === g.key }"
        @click="activeKey = g.key"
      >
        {{ g.label }}
        <text v-if="g.count" class="chip-badge">{{ g.count }}</text>
      </view>
    </scroll-view>

    <!-- 列表 -->
    <scroll-view
      class="list-container"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
    >
      <view v-if="loading" class="empty-state">
        <text class="loading-icon">⟳</text>
      </view>
      <view v-else-if="visibleGroups.length === 0" class="empty-state">
        <text class="empty-icon">🎉</text>
        <text class="empty-text">暂无待办，去处理点别的吧</text>
      </view>
      <view v-else>
        <view v-for="g in visibleGroups" :key="g.key" class="group">
          <view class="group-header">
            <text class="group-icon">{{ g.icon }}</text>
            <text class="group-title">{{ g.label }}</text>
            <text class="group-count">{{ g.items.length }} / {{ g.count }}</text>
          </view>
          <view
            v-for="item in g.items"
            :key="g.key + '-' + item.id"
            class="card"
            @click="openItem(item)"
          >
            <view class="card-top">
              <text class="card-title">{{ item.title }}</text>
              <text v-if="item.amount !== null && item.amount !== undefined" class="card-amount">¥{{ fmtMoney(item.amount) }}</text>
            </view>
            <view class="card-bottom">
              <text class="card-sub">{{ item.subtitle || '—' }}</text>
              <text class="card-time">{{ item.time }}</text>
            </view>
            <view class="card-action">
              <text class="action-text">去处理</text>
              <text class="action-arrow">›</text>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'

const loading = ref(false)
const refreshing = ref(false)
const groups = ref([])
const total = ref(0)
const activeKey = ref('all')

const visibleGroups = computed(() => {
  // 仅显示有内容的分类；选中某个分类时只显示该分类
  let list = groups.value.filter(g => g.count > 0 && g.items && g.items.length)
  if (activeKey.value !== 'all') {
    list = groups.value.filter(g => g.key === activeKey.value)
  }
  return list
})

const fmtMoney = (n) => {
  const num = Number(n) || 0
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const goBack = () => uni.navigateBack()

const loadData = () => {
  loading.value = true
  const userInfo = uni.getStorageSync('userInfo') || {}
  uni.request({
    url: '/api/todo/center',
    header: { 'x-user-id': String(userInfo.id || '') },
    success: (res) => {
      if (res.data && res.data.code === 0) {
        groups.value = res.data.groups || []
        total.value = res.data.total || 0
      } else {
        groups.value = []
        total.value = 0
      }
    },
    fail: () => { groups.value = []; total.value = 0 },
    complete: () => { loading.value = false; refreshing.value = false }
  })
}

const onRefresh = () => {
  refreshing.value = true
  loadData()
}

const openItem = (item) => {
  if (!item || !item.url) return
  uni.navigateTo({ url: item.url, fail: () => {
    uni.showToast({ title: '页面打开失败', icon: 'none' })
  } })
}

onShow(() => loadData())
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; }

.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.summary {
  background: linear-gradient(135deg, #1E3A5F, #2B4C7E);
  color: #fff; padding: 18px 20px 22px;
}
.summary-main { display: flex; align-items: baseline; }
.summary-num { font-size: 34px; font-weight: 700; line-height: 1; }
.summary-label { font-size: 14px; margin-left: 8px; opacity: .9; }
.summary-sub { margin-top: 8px; font-size: 12px; opacity: .75; }

.chip-bar {
  white-space: nowrap; background: #fff; padding: 10px 12px;
  border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 10;
}
.chip {
  display: inline-flex; align-items: center;
  padding: 6px 14px; margin-right: 8px; border-radius: 16px;
  background: #f2f4f7; color: #555; font-size: 13px;
}
.chip.active { background: #1E3A5F; color: #fff; }
.chip-badge {
  margin-left: 6px; background: #ff4d4f; color: #fff;
  border-radius: 9px; font-size: 10px; padding: 0 6px; line-height: 16px;
}
.chip.active .chip-badge { background: rgba(255,255,255,.28); }

.list-container { height: calc(100vh - 210px); padding: 12px; box-sizing: border-box; }

.group { margin-bottom: 6px; }
.group-header {
  display: flex; align-items: center; padding: 8px 4px;
}
.group-icon { font-size: 16px; margin-right: 6px; }
.group-title { font-size: 14px; font-weight: 600; color: #1E3A5F; flex: 1; }
.group-count { font-size: 12px; color: #999; }

.card {
  background: #fff; border-radius: 12px; padding: 14px 16px;
  margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.card-top { display: flex; justify-content: space-between; align-items: flex-start; }
.card-title { font-size: 15px; font-weight: 600; color: #333; flex: 1; margin-right: 10px; }
.card-amount { font-size: 15px; font-weight: 700; color: #ff6b00; }
.card-bottom { display: flex; justify-content: space-between; margin-top: 8px; }
.card-sub { font-size: 12px; color: #888; flex: 1; margin-right: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-time { font-size: 12px; color: #bbb; }
.card-action {
  display: flex; justify-content: flex-end; align-items: center;
  margin-top: 10px; padding-top: 10px; border-top: 1px solid #f2f2f2;
}
.action-text { font-size: 13px; color: #1E3A5F; font-weight: 600; }
.action-arrow { font-size: 16px; color: #1E3A5F; margin-left: 4px; }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 90px 0;
}
.loading-icon, .empty-icon { font-size: 48px; }
.empty-text { color: #999; font-size: 14px; margin-top: 10px; }
</style>
