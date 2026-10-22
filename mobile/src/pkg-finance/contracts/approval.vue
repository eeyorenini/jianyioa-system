<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar" :style="navStyle">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">{{ tab === 'change' ? '增减项审核' : '合同审核' }}</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 切换 -->
    <view class="tabs">
      <view class="tab" :class="{ active: tab === 'contract' }" @click="switchTab('contract')">合同审核</view>
      <view class="tab" :class="{ active: tab === 'change' }" @click="switchTab('change')">增减项审核</view>
    </view>

    <scroll-view class="list" scroll-y>
      <view v-if="loading" class="empty">
        <text class="empty-icon">⟳</text>
        <text class="empty-text">加载中...</text>
      </view>
      <view v-else-if="!list.length" class="empty">
        <text class="empty-icon">✅</text>
        <text class="empty-text">暂无待审核{{ tab === 'change' ? '增减项' : '合同' }}</text>
      </view>
      <view v-else>
        <view
          v-for="item in list"
          :key="item.id"
          class="card"
          :class="{ highlight: item.id === pendingId }"
        >
          <!-- 头部 -->
          <view class="card-head">
            <text class="card-title">
              {{ tab === 'change'
                ? ((item.change_type === 'decrease' ? '减项 · ' : '增项 · ') + (item.title || ''))
                : (item.project_name || ('合同#' + item.id)) }}
            </text>
            <text class="card-amount" :class="{ minus: tab === 'change' && item.change_type === 'decrease' }">
              {{ tab === 'change' && item.change_type === 'decrease' ? '-' : '' }}¥{{ fmtMoney(tab === 'change' ? item.amount : item.contract_amount) }}
            </text>
          </view>

          <!-- 信息 -->
          <view class="card-info">
            <view v-if="tab === 'change'" class="info-row">
              <text class="info-label">项目</text>
              <text class="info-val">{{ item.project_name || '-' }}</text>
            </view>
            <view v-if="tab === 'change' && item.description" class="info-row">
              <text class="info-label">说明</text>
              <text class="info-val">{{ item.description }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">提交人</text>
              <text class="info-val">{{ submitterName(item) }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">提交时间</text>
              <text class="info-val">{{ fmtTime(item.created_at || item.submitted_at) }}</text>
            </view>
          </view>

          <!-- 附件（合同） -->
          <view v-if="tab === 'contract' && attachments(item).length" class="atts">
            <text class="atts-label">附件</text>
            <view class="atts-row">
              <template v-for="(a, i) in attachments(item)" :key="i">
                <image
                  v-if="isImage(a)"
                  class="att-thumb"
                  :src="imgUrl(a)"
                  mode="aspectFill"
                  @click="previewImg(attachments(item).filter(isImage), a)"
                />
                <view v-else class="att-file" @click="openFile(a)">
                  <text class="att-file-icon">📎</text>
                  <text class="att-file-name">{{ fileName(a) }}</text>
                </view>
              </template>
            </view>
          </view>

          <!-- 操作 -->
          <view class="actions">
            <view class="btn btn-reject" @click="doReject(item)">驳回</view>
            <view class="btn btn-approve" @click="doApprove(item)">通过</view>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getImageUrl } from '@/utils/upload'

const tab = ref('contract')
const pendingId = ref(null)
const list = ref([])
const loading = ref(false)
const reviewing = ref(false)

const userInfo = () => uni.getStorageSync('userInfo') || {}

/** uni-h5 hash 路由下，页面参数在 hash 段里；这里做统一解析 */
const parseQuery = () => {
  const out = {}
  try {
    if (typeof window === 'undefined') return out
    const hash = window.location.hash || ''
    let qs = ''
    if (hash.includes('?')) qs = hash.split('?')[1] || ''
    else if (window.location.search) qs = window.location.search.replace(/^\?/, '')
    new URLSearchParams(qs).forEach((v, k) => { out[k] = v })
  } catch (e) { /* ignore */ }
  return out
}

onLoad((options) => {
  const q = { ...parseQuery(), ...(options || {}) }
  tab.value = q.tab === 'change' ? 'change' : 'contract'
  pendingId.value = q.id ? Number(q.id) : null
  fetchList()
})

const goBack = () => uni.navigateBack()

const switchTab = (t) => {
  if (tab.value === t) return
  tab.value = t
  pendingId.value = null
  fetchList()
}

const fetchList = () => {
  loading.value = true
  list.value = []
  const url = tab.value === 'change' ? '/api/contract-changes?status=pending' : '/api/contract-reviews/pending'
  uni.request({
    url,
    header: { 'x-user-id': String(userInfo().id || '') },
    success: (res) => {
      let data = (res.data && res.data.data) || []
      // 增减项接口返回待审列表；这里再做一次兜底过滤
      if (tab.value === 'change') data = data.filter((x) => x.status === 'pending')
      list.value = data
    },
    fail: () => { list.value = [] },
    complete: () => { loading.value = false },
  })
}

/* ---------- 展示辅助 ---------- */
const fmtMoney = (n) => {
  const num = Number(n) || 0
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const fmtTime = (t) => {
  if (!t) return '-'
  return String(t).replace('T', ' ').substring(0, 16)
}
const imgUrl = (p) => getImageUrl(p)
/** 提交人字段兼容两种命名：新接口 submitter_name，旧接口 submitted_by_name */
const submitterName = (item) => item.submitter_name || item.submitted_by_name || '-'
const isImage = (p) => /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(String(p))
const fileName = (p) => String(p).split('/').pop() || '附件'
const attachments = (item) => {
  const att = item.attachment
  if (!att) return []
  if (Array.isArray(att)) return att
  try {
    const j = JSON.parse(att)
    if (Array.isArray(j)) return j
  } catch (e) { /* 非 JSON，按逗号分隔 */ }
  return String(att).split(',').map((s) => s.trim()).filter(Boolean)
}
const previewImg = (urls, current) => {
  if (!urls.length) return
  uni.previewImage({ urls, current })
}
const openFile = (url) => {
  // #ifdef H5
  window.open(url, '_blank')
  // #endif
  // #ifndef H5
  uni.showToast({ title: '请在电脑端查看附件', icon: 'none' })
  // #endif
}

/* ---------- 审核操作 ---------- */
const doApprove = (item) => {
  uni.showModal({
    title: '确认通过',
    content: tab.value === 'change'
      ? '通过后该增减项金额将自动计入项目收款/付款记录'
      : '通过后会自动生成一条该项目的应收记录',
    success: (r) => { if (r.confirm) submitReview(item, 'approve', '') },
  })
}

const doReject = (item) => {
  uni.showModal({
    title: '驳回原因',
    editable: true,
    placeholderText: '请填写驳回原因（选填）',
    success: (r) => { if (r.confirm) submitReview(item, 'reject', r.content || '') },
  })
}

const submitReview = (item, action, remark) => {
  if (reviewing.value) return
  reviewing.value = true
  uni.showLoading({ title: '提交中...' })
  const url = tab.value === 'change'
    ? `/api/contract-changes/${item.id}/review`
    : `/api/contracts/${item.id}/review`
  uni.request({
    url,
    method: 'PUT',
    header: { 'x-user-id': String(userInfo().id || ''), 'Content-Type': 'application/json' },
    data: { action, remark },
    success: (res) => {
      uni.hideLoading()
      const ok = res.statusCode === 200 && !(res.data && res.data.error)
      if (ok) {
        uni.showToast({ title: action === 'approve' ? '已通过' : '已驳回', icon: 'success' })
        list.value = list.value.filter((x) => x.id !== item.id)
      } else {
        uni.showToast({ title: (res.data && (res.data.error || res.data.message)) || '操作失败', icon: 'none' })
      }
    },
    fail: () => { uni.hideLoading(); uni.showToast({ title: '网络错误', icon: 'none' }) },
    complete: () => { reviewing.value = false },
  })
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f7fa; display: flex; flex-direction: column; }

.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.tabs { display: flex; background: #fff; border-bottom: 1px solid #eee; }
.tab {
  flex: 1; text-align: center; padding: 12px 0; font-size: 14px; color: #666;
  position: relative;
}
.tab.active { color: #1E3A5F; font-weight: 600; }
.tab.active::after {
  content: ''; position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
  width: 48px; height: 3px; border-radius: 2px; background: #1E3A5F;
}

.list { flex: 1; padding: 12px; box-sizing: border-box; }

.empty { display: flex; flex-direction: column; align-items: center; padding: 90px 0; }
.empty-icon { font-size: 44px; }
.empty-text { font-size: 14px; color: #999; margin-top: 10px; }

.card {
  background: #fff; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.card.highlight { box-shadow: 0 0 0 2px #1E3A5F inset, 0 1px 6px rgba(30,58,95,.2); }

.card-head { display: flex; justify-content: space-between; align-items: flex-start; }
.card-title { font-size: 15px; font-weight: 600; color: #333; flex: 1; margin-right: 10px; }
.card-amount { font-size: 16px; font-weight: 700; color: #ff4d4f; }
.card-amount.minus { color: #52c41a; }

.card-info { margin-top: 10px; }
.info-row { display: flex; padding: 4px 0; }
.info-label { width: 64px; font-size: 12px; color: #999; flex-shrink: 0; }
.info-val { flex: 1; font-size: 12px; color: #555; word-break: break-all; }

.atts { margin-top: 10px; }
.atts-label { font-size: 12px; color: #999; }
.atts-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.att-thumb { width: 64px; height: 64px; border-radius: 8px; background: #f0f0f0; }
.att-file {
  display: flex; align-items: center; max-width: 100%;
  padding: 8px 10px; border-radius: 8px; background: #f5f7fa;
}
.att-file-icon { font-size: 14px; margin-right: 6px; }
.att-file-name { font-size: 12px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }

.actions {
  display: flex; gap: 12px; margin-top: 12px; padding-top: 12px;
  border-top: 1px solid #f2f2f2;
}
.btn {
  flex: 1; text-align: center; padding: 9px 0; border-radius: 8px;
  font-size: 14px; font-weight: 600;
}
.btn-reject { background: #fff1f0; color: #ff4d4f; }
.btn-approve { background: #1E3A5F; color: #fff; }
</style>
