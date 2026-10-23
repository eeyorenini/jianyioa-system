<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">消息通知</text>
      <!-- 按钮永远显示：没未读时置灰，避免"按钮不见了"的错觉 -->
      <text
        class="nav-action"
        :class="{ 'nav-action-disabled': !hasUnread }"
        @click="markAllRead"
      >全部已读</text>
    </view>

    <!-- 下拉刷新 -->
    <scroll-view class="message-list" scroll-y 
      @refresherrefresh="onRefresh" 
      @scrolltolower="loadMore"
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      refresher-default-style="none">
      <view v-if="loading && messages.length === 0" class="empty-state">
        <text class="loading-icon">⟳</text>
      </view>
      <view v-else-if="messages.length === 0" class="empty-state">
        <text class="empty-icon">🔔</text>
        <text class="empty-text">暂无消息</text>
      </view>
      <view v-else>
        <view
          v-for="msg in messages"
          :key="msg.id"
          class="message-card"
          :class="{ unread: !msg.is_read }"
          @click="handleClick(msg)"
          @touchstart="touchStart(msg, $event)"
          @touchmove="touchMove(msg, $event)"
          @touchend="touchEnd(msg)"
          :style="msg._translateX ? `transform: translateX(${msg._translateX}rpx)` : ''"
        >
          <!-- 未读蓝色竖条 -->
          <view v-if="!msg.is_read" class="unread-bar"></view>
          
          <!-- 左侧类型图标 -->
          <view class="msg-icon-wrap" :style="{ background: typeConfig(msg.type).bgColor }">
            <text class="msg-icon">{{ typeConfig(msg.type).icon }}</text>
          </view>
          
          <view class="msg-content">
            <view class="msg-header">
              <view class="msg-title-row">
                <text class="msg-title">{{ msg.title }}</text>
                <view class="type-tag" :style="{ background: typeConfig(msg.type).color + '22', color: typeConfig(msg.type).color }">
                  {{ typeConfig(msg.type).text }}
                </view>
              </view>
              <text class="msg-time">{{ formatTime(msg.created_at) }}</text>
            </view>
            <text class="msg-desc">{{ msg.content }}</text>
          </view>
          
          <!-- 删除按钮（显示在左滑后） -->
          <view class="delete-btn" @click.stop="deleteMessage(msg)">
            <text>删除</text>
          </view>
        </view>
        
        <view v-if="loadingMore" class="loading-more"><text class="loading-text">加载中...</text></view>
        <view v-else-if="noMore && messages.length > 0" class="loading-more"><text class="loading-text">没有更多了</text></view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { toDate } from '@/utils/date'
import { syncMessageBadge } from '@/utils/tabbar'
import { authHeader } from '@/utils/permission'

const messages = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const refreshing = ref(false)
const page = ref(1)
const pageSize = 20
const noMore = ref(false)

// 触摸滑动相关
const touchMap = ref({})

onMounted(() => { fetchMessages() })
onShow(() => { refreshUnreadBadge() })

// 消息类型配置
const typeConfig = (type) => {
  const config = {
    contract_created: { icon: '📄', color: '#409EFF', text: '新合同', bgColor: '#409EFF11' },
    contract_updated: { icon: '📝', color: '#409EFF', text: '合同变更', bgColor: '#409EFF11' },
    contract_uploaded: { icon: '📤', color: '#409EFF', text: '合同上传', bgColor: '#409EFF11' },
    contract_approved: { icon: '✅', color: '#67C23A', text: '合同审核通过', bgColor: '#67C23A11' },
    contract_change_created: { icon: '📝', color: '#E6A23C', text: '增减项', bgColor: '#E6A23C11' },
    contract_change_approved: { icon: '✅', color: '#67C23A', text: '增减项审核通过', bgColor: '#67C23A11' },
    project_created: { icon: '🏗️', color: '#67C23A', text: '新项目', bgColor: '#67C23A11' },
    project_status_changed: { icon: '🔄', color: '#67C23A', text: '项目状态', bgColor: '#67C23A11' },
    node_status_changed: { icon: '📍', color: '#E6A23C', text: '节点状态', bgColor: '#E6A23C11' },
    node_in_progress: { icon: '⏳', color: '#E6A23C', text: '节点进行中', bgColor: '#E6A23C11' },
    node_completed: { icon: '🎯', color: '#67C23A', text: '节点完成', bgColor: '#67C23A11' },
    project_progress: { icon: '📊', color: '#909399', text: '项目进展', bgColor: '#90939911' },
    inspection_submit: { icon: '🔍', color: '#F56C6C', text: '巡检报告', bgColor: '#F56C6C11' },
    acceptance_submit: { icon: '✅', color: '#409EFF', text: '验收提交', bgColor: '#409EFF11' },
    // v2.4.1 主材验收
    material_acceptance_submit: { icon: '📦', color: '#E6A23C', text: '材料验收', bgColor: '#E6A23C11' },
    dispatch_created: { icon: '📋', color: '#E6A23C', text: '派工通知', bgColor: '#E6A23C11' },
    dispatch_status_changed: { icon: '🔔', color: '#E6A23C', text: '派工状态', bgColor: '#E6A23C11' },
    approval_submit: { icon: '⏳', color: '#F56C6C', text: '待审批', bgColor: '#F56C6C11' },
    approval_result: { icon: '🎯', color: '#67C23A', text: '审批结果', bgColor: '#67C23A11' },
    notice_published: { icon: '📢', color: '#909399', text: '公告', bgColor: '#90939911' },
    customer_follow: { icon: '👤', color: '#409EFF', text: '客户跟进', bgColor: '#409EFF11' },
    collection_created: { icon: '📞', color: '#E6A23C', text: '新建催收', bgColor: '#E6A23C11' },
    collection_confirmed: { icon: '💵', color: '#67C23A', text: '催收回款确认', bgColor: '#67C23A11' },
    invoice_created: { icon: '💰', color: '#67C23A', text: '发票', bgColor: '#67C23A11' },
    // 采购系列（purchase 模块历史上 type 字段命名混乱，"采购"中文 type 也存在过）
    purchase: { icon: '🛒', color: '#E6A23C', text: '采购', bgColor: '#E6A23C11' },
    '采购': { icon: '🛒', color: '#E6A23C', text: '采购', bgColor: '#E6A23C11' },
    system_notice: { icon: '⚙️', color: '#909399', text: '系统通知', bgColor: '#90939911' },
    inapp: { icon: '🔔', color: '#909399', text: '通知', bgColor: '#90939911' },
  }
  return config[type] || { icon: '📌', color: '#909399', text: '通知', bgColor: '#90939911' }
}

// 跳转路由映射
// 2026-10-22 调整：本页不再自己做 type → 页面 的跳转（原来那份 pathMap 里的
// /pages/contract/detail 等路径在小程序分包后已不存在，点了必 404）。
// 现在统一「点消息 → 消息详情 → 详情页里的『查看XX』按钮 → 业务模块」，
// 映射表收敛到 utils/pageUrl.ts，两端共用一份。

function fetchMessages() {
  loading.value = true
  page.value = 1
  noMore.value = false
  uni.request({
    url: '/api/messages',
    data: { page: 1, pageSize: pageSize },
    header: { 'x-user-id': String(uni.getStorageSync('userInfo')?.id || '') },
    success: (res) => {
      if (res.data && Array.isArray(res.data)) {
        messages.value = (res.data || []).map(m => ({ ...m, _translateX: 0 }))
      } else if (res.data?.list) {
        messages.value = (res.data.list || []).map(m => ({ ...m, _translateX: 0 }))
      } else {
        messages.value = []
      }
    },
    complete: () => { loading.value = false }
  })
}

function onRefresh() {
  refreshing.value = true
  fetchMessages()
  setTimeout(() => { refreshing.value = false }, 500)
}

function loadMore() {
  if (loadingMore.value || noMore.value) return;
  loadingMore.value = true;
  page.value++
  uni.request({
    url: '/api/messages',
    data: { page: page.value, pageSize: pageSize },
    header: { 'x-user-id': String(uni.getStorageSync('userInfo')?.id || '') },
    success: (res) => {
      const list = res.data?.list || (Array.isArray(res.data) ? res.data : []);
      if (list.length > 0) {
        messages.value = [...messages.value, ...list.map(m => ({ ...m, _translateX: 0 }))]
        if (list.length < pageSize) noMore.value = true
      } else {
        noMore.value = true
      }
    },
    complete: () => { loadingMore.value = false }
  })
}

function formatTime(str) {
  if (!str) return ''
  const d = toDate(str)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  return `${d.getMonth()+1}月${d.getDate()}日`
}

// 处理消息点击
function handleClick(msg) {
  // 重置滑动位置
  msg._translateX = 0

  // 标记已读
  if (!msg.is_read) {
    msg.is_read = true
    // 2026-10-21 修复：原来这条请求没带 x-user-id，服务端拿不到身份直接 401，
    // 界面看着已读、实际没落库 → 下次进来又变成未读
    uni.request({
      url: `/api/messages/${msg.id}/read`,
      method: 'PUT',
      header: { 'x-user-id': String(uni.getStorageSync('userInfo')?.id || '') }
    })
    setTimeout(() => refreshUnreadBadge(), 100)
  }
  
  // 跳转：一律进「消息详情」，详情页里再提供「查看XX」按钮跳对应业务模块。
  // ⚠️ 必须带 src：列表是 messages + notifications 两表 UNION，两表 id 会撞号，
  // 详情接口靠 src 判断该查哪张表（不带就会取到另一张表里同 id 的消息）。
  // 2026-10-23 兜底：线上后端若还是旧版 /api/messages/:id（只查 messages 表），
  // notifications 来的消息点进详情必 404 → 白屏「消息不存在」。列表里其实
  // 已经有 title/content/type/source_id 全套字段，先塞进缓存让详情页直接渲染，
  // 接口只当"刷新/补全"用，失败也不影响阅读。
  try {
    uni.setStorageSync('message_detail_cache', { ...msg, _cached_at: Date.now() })
  } catch (e) {}
  uni.navigateTo({ url: `/pages/message/detail?id=${msg.id}&src=${msg.src || 'messages'}` })
}

// 左滑删除
function touchStart(msg, e) {
  touchMap.value[msg.id] = { startX: e.touches[0].clientX }
}

function touchMove(msg, e) {
  if (!touchMap.value[msg.id]) return
  const deltaX = e.touches[0].clientX - touchMap.value[msg.id].startX
  // 只允许左滑（负值）
  msg._translateX = deltaX < 0 ? Math.max(deltaX, -150) : 0
}

function touchEnd(msg) {
  // 如果滑动超过一半，自动滑到左侧显示删除按钮
  if (msg._translateX < -75) {
    msg._translateX = -150
  } else {
    msg._translateX = 0
  }
}

function deleteMessage(msg) {
  uni.showModal({
    title: '提示',
    content: '确定删除该消息？',
    success: (res) => {
      if (!res.confirm) return
      // 2026-10-22 修复：原来调 DELETE /api/notifications/:id ——
      // ① 那个接口只允许管理员，普通员工 403 ② 只删 notifications 表，messages 来的删不掉
      // ③ success 回调不校验 statusCode，403 也当成功 → 界面删了、刷新又回来。
      // 现在统一走 /api/messages/:id?src=xxx（本人可删自己的），并校验状态码。
      uni.request({
        url: `/api/messages/${msg.id}?src=${msg.src || 'messages'}`,
        method: 'DELETE',
        header: { 'x-user-id': String(uni.getStorageSync('userInfo')?.id || '') },
        success: (r) => {
          if (r.statusCode >= 200 && r.statusCode < 300) {
            messages.value = messages.value.filter(m => m.id !== msg.id)
            uni.showToast({ title: '已删除', icon: 'success' })
            refreshUnreadBadge()
          } else {
            uni.showToast({ title: (r.data && r.data.error) || '删除失败', icon: 'none' })
          }
        },
        fail: () => uni.showToast({ title: '网络异常，请重试', icon: 'none' })
      })
    }
  })
}

const goBack = () => {
  uni.switchTab({ url: '/pages/mine/index' });
};

// 是否存在未读消息（决定"全部已读"按钮显隐）
const hasUnread = computed(() => messages.value.some(m => !m.is_read))

// 一键全部已读（2026-10-12；2026-10-13 按钮永远显示，无未读时给"已全部已读"轻提示避免误以为按钮丢失）
function markAllRead() {
  if (!hasUnread.value) {
    uni.showToast({ title: '已全部已读', icon: 'none' })
    return
  }
  uni.showModal({
    title: '全部已读',
    content: '确定把所有消息标为已读？',
    success: (res) => {
      if (!res.confirm) return
      uni.request({
        url: '/api/messages/read-all',
        method: 'PUT',
        header: { 'x-user-id': String(uni.getStorageSync('userInfo')?.id || '') },
        success: () => {
          messages.value = messages.value.map(m => ({ ...m, is_read: 1 }))
          refreshUnreadBadge()
          uni.showToast({ title: '已全部标为已读', icon: 'success' })
        },
        fail: () => uni.showToast({ title: '操作失败', icon: 'none' })
      })
    }
  })
}

const refreshUnreadBadge = () => {
  // 2026-10-22 修复：本页在分包里（pkg-misc/message/list），**不是 tabBar 页面**，
  // 直接调 uni.setTabBarBadge / uni.removeTabBarBadge 会抛：
  //   MiniProgramError {"errMsg":"removeTabBarBadge:fail not TabBar page"}
  // （2026-10-21 那条注释写的「任何页面都能调」是错的，微信只允许在 tabBar 页调。）
  // 现在统一走 utils/tabbar 的 syncMessageBadge：非 tabBar 页自动跳过，
  // 等用户回到首页 / 我的页时由它们的 onShow 用真实未读数补同步。
  // 未读数取服务端口径（列表只加载了第一页，本地 count 不准）。
  uni.request({
    url: '/api/messages/unread-count',
    header: authHeader(),
    success: (res) => {
      const count = Number((res.data && res.data.count) || 0)
      syncMessageBadge(count)
    },
    fail: () => {
      // 请求失败按本地已知未读兜底：宁可不显示，也不显示错数字
      syncMessageBadge(messages.value.filter(m => !m.is_read).length)
    }
  })
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.message-list { height: calc(100vh - 88rpx); }
.message-card { 
  display: flex; 
  align-items: flex-start; 
  background: #fff; 
  padding: 28rpx; 
  margin-bottom: 2rpx; 
  position: relative;
  transition: transform 0.2s ease;
  overflow: hidden;
}
.message-card.unread { background: #EEF3FF; }

/* 未读蓝色竖条 */
.unread-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6rpx;
  background: #409EFF;
}

.msg-icon-wrap { 
  width: 80rpx; 
  height: 80rpx; 
  border-radius: 50%; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  flex-shrink: 0; 
  margin-right: 20rpx;
  margin-left: 10rpx;
}
.msg-icon { font-size: 40rpx; }
.msg-content { flex: 1; }
.msg-header { display: flex; justify-content: space-between; margin-bottom: 8rpx; }
.msg-title-row { display: flex; align-items: center; gap: 12rpx; flex: 1; }
.msg-title { font-size: 28rpx; font-weight: 600; color: #333; }
.type-tag {
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  border-radius: 20rpx;
  flex-shrink: 0;
}
.msg-time { font-size: 22rpx; color: #999; flex-shrink: 0; margin-left: 12rpx; }
.msg-desc { font-size: 26rpx; color: #666; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5; }

/* 删除按钮 */
.delete-btn {
  position: absolute;
  right: -150rpx;
  top: 0;
  bottom: 0;
  width: 150rpx;
  background: #F56C6C;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 26rpx;
}

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 120rpx 0; }
.loading-icon { font-size: 60rpx; color: #1E3A5F; animation: spin 1s linear infinite; }
.empty-icon { font-size: 80rpx; color: #ddd; margin-bottom: 20rpx; }
.empty-text { font-size: 28rpx; color: #999; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.loading-more { text-align: center; padding: 30rpx; }
.loading-text { font-size: 24rpx; color: #999; }

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

.nav-action {
  font-size: 14px;
  color: #fff;
  min-width: 40px;
  text-align: right;
}

/* 2026-10-13：按钮无未读时置灰（保持可见以避免"按钮不见了"错觉） */
.nav-action-disabled {
  color: rgba(255, 255, 255, 0.4);
}
</style>
