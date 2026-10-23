<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">消息详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 消息内容 -->
    <view v-else-if="message.id" class="detail-content">
      <!-- 顶部类型标签 -->
      <view class="type-header">
        <view class="type-icon" :style="{ background: typeConfig.color + '22' }">
          <text class="icon">{{ typeConfig.icon }}</text>
        </view>
        <view class="type-info">
          <view class="type-tag" :style="{ background: typeConfig.color + '22', color: typeConfig.color }">
            {{ typeConfig.text }}
          </view>
          <text class="type-time">{{ formatTime(message.created_at) }}</text>
        </view>
      </view>

      <!-- 标题 -->
      <view class="message-title">{{ message.title }}</view>

      <!-- 正文 -->
      <view class="message-body">{{ message.content }}</view>

      <!-- 底部：跳转对应业务模块（该消息确实有关联页面才显示） -->
      <view v-if="target" class="action-area">
        <view class="action-btn" @click="goToDetail">
          <text>{{ target.label }}</text>
          <text class="arrow">›</text>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <text class="empty-icon">📭</text>
      <text class="empty-text">消息不存在或已被删除</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { toDate } from '@/utils/date'
import { resolveMessageTarget, openMessageTarget } from '@/utils/pageUrl'

const message = ref({})
const loading = ref(false)

// 消息类型配置
const typeConfig = computed(() => {
  const type = message.value.type
  const config = {
    contract_created: { icon: '📄', color: '#409EFF', text: '新合同' },
    contract_updated: { icon: '📝', color: '#409EFF', text: '合同变更' },
    project_created: { icon: '🏗️', color: '#67C23A', text: '新项目' },
    project_status_changed: { icon: '🔄', color: '#67C23A', text: '项目状态' },
    node_status_changed: { icon: '📍', color: '#E6A23C', text: '节点状态' },
    project_progress: { icon: '📊', color: '#909399', text: '项目进展' },
    inspection_submit: { icon: '🔍', color: '#F56C6C', text: '巡检报告' },
    acceptance_submit: { icon: '✅', color: '#409EFF', text: '验收提交' },
    // v2.4.1 主材验收
    material_acceptance_submit: { icon: '📦', color: '#E6A23C', text: '材料验收' },
    dispatch_created: { icon: '📋', color: '#E6A23C', text: '派工通知' },
    dispatch_status_changed: { icon: '🔔', color: '#E6A23C', text: '派工状态' },
    approval_submit: { icon: '⏳', color: '#F56C6C', text: '待审批' },
    approval_result: { icon: '🎯', color: '#67C23A', text: '审批结果' },
    notice_published: { icon: '📢', color: '#909399', text: '公告' },
    customer_follow: { icon: '👤', color: '#409EFF', text: '客户跟进' },
    invoice_created: { icon: '💰', color: '#67C23A', text: '发票' },
    // 2026-10-22 补齐：这些 type 在库里真实存在（见 messages / notifications 分布），
    // 原来落到兜底分支会把英文 type 直接显示给用户
    contract_uploaded: { icon: '📤', color: '#409EFF', text: '合同上传' },
    contract_approved: { icon: '✅', color: '#67C23A', text: '合同审核通过' },
    contract_change_created: { icon: '📝', color: '#E6A23C', text: '增减项' },
    contract_change_approved: { icon: '✅', color: '#67C23A', text: '增减项审核通过' },
    node_in_progress: { icon: '⏳', color: '#E6A23C', text: '节点进行中' },
    node_completed: { icon: '🎯', color: '#67C23A', text: '节点完成' },
    project_file_pending: { icon: '📎', color: '#E6A23C', text: '文件待审核' },
    project_file_approved: { icon: '📎', color: '#67C23A', text: '文件审核通过' },
    collection_created: { icon: '📞', color: '#E6A23C', text: '新建催收' },
    collection_confirmed: { icon: '💵', color: '#67C23A', text: '催收回款确认' },
    purchase: { icon: '🛒', color: '#E6A23C', text: '采购' },
    '采购': { icon: '🛒', color: '#E6A23C', text: '采购' },
    system_notice: { icon: '⚙️', color: '#909399', text: '系统通知' },
    inapp: { icon: '🔔', color: '#909399', text: '通知' },
  }
  return config[type] || { icon: '📌', color: '#909399', text: type || '通知' }
})

// 跳转目标：由 utils/pageUrl 统一算（实体优先，兼容 inapp/中文 type 等历史脏值）
const target = computed(() => resolveMessageTarget(message.value))

function goToDetail() {
  openMessageTarget(target.value)
}

function formatTime(str) {
  if (!str) return ''
  const d = toDate(str)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const goBack = () => {
  uni.navigateBack()
}

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  const options = currentPage.options || currentPage.$page?.options || {}
  const id = options.id
  // src 决定详情查 messages 还是 notifications（两表 id 会撞号，见列表页注释）
  const src = options.src || ''

  if (id) {
    // 1) 列表页已经把整条消息塞进缓存了（title/content/type/source_id/src 全在，
    //    与详情接口返回字段完全一致），缓存命中就直接渲染、**一次请求都不发**。
    //    2026-10-23：线上后端 /api/messages/:id 仍是旧版（只查 messages 表），
    //    notifications 来的消息点进去必 404，控制台红字一片。数据本来就在手上，
    //    不请求就不会有 404，比"请求失败再兜底"干净。
    let cached = null
    try { cached = uni.getStorageSync('message_detail_cache') } catch (e) {}
    if (cached && String(cached.id) === String(id) && (!src || !cached.src || cached.src === src)) {
      message.value = cached
      loading.value = false
      return
    }

    // 2) 没缓存才请求（直接打开链接、小程序冷启动直达详情等场景）；
    //    详情接口拿不到再退一步从列表接口按 id 捞（兼容线上旧后端）。
    loading.value = true
    uni.request({
      url: `/api/messages/${id}${src ? '?src=' + src : ''}`,
      header: { 'x-user-id': String(uni.getStorageSync('userInfo')?.id || '') },
      success: (res) => {
        // 只有真拿到消息才覆盖缓存；404/500 一律保留缓存内容
        if (res.statusCode === 200 && res.data && typeof res.data === 'object' && res.data.id) {
          message.value = res.data.data || res.data
        }
      },
      complete: () => {
        loading.value = false
        if (!message.value.id) loadFromList(id, src)
      }
    })
  }
})

// 详情接口不可用时的兜底：从列表接口（第一页 100 条）里按 id + src 找
function loadFromList(id, src) {
  uni.request({
    url: '/api/messages',
    data: { page: 1, pageSize: 100 },
    header: { 'x-user-id': String(uni.getStorageSync('userInfo')?.id || '') },
    success: (r) => {
      const list = r.data?.list || (Array.isArray(r.data) ? r.data : [])
      const hit = list.find(x => String(x.id) === String(id) && (!src || !x.src || x.src === src))
      if (hit) message.value = hit
    }
  })
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; }

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
}
.loading-text { font-size: 28rpx; color: #999; }

.detail-content {
  background: #fff;
  margin: 20rpx;
  border-radius: 16rpx;
  padding: 32rpx;
}

.type-header {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}

.type-icon {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
  .icon { font-size: 40rpx; }
}

.type-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.type-tag {
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
}

.type-time {
  font-size: 24rpx;
  color: #999;
}

.message-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 20rpx;
  line-height: 1.5;
}

.message-body {
  font-size: 28rpx;
  color: #666;
  line-height: 1.8;
  white-space: pre-wrap;
}

.action-area {
  margin-top: 40rpx;
  padding-top: 30rpx;
  border-top: 1rpx solid #eee;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1E3A5F;
  color: #fff;
  padding: 24rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  
  .arrow {
    font-size: 32rpx;
    margin-left: 8rpx;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
}
.empty-icon { font-size: 80rpx; color: #ddd; margin-bottom: 20rpx; }
.empty-text { font-size: 28rpx; color: #999; }

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
