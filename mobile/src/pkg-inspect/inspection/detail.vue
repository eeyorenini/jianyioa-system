<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar" :style="navStyle">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">巡检详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <view v-if="loading" class="loading-wrap">
      <text class="loading-icon iconfont icon-loading"></text>
    </view>

    <view v-else-if="!detail" class="empty-state">
      <text class="empty-text">巡检记录不存在或已被删除</text>
      <text class="empty-hint">请返回列表下拉刷新后再试</text>
    </view>

    <view v-else class="detail-wrap">
      <!-- 摘要卡：状态 / 问题标题 / 项目 · 位置 / 提交时间 -->
      <view class="hero">
        <view class="hero-top">
          <text class="status-tag" :class="statusClass">{{ statusText }}</text>
          <text v-if="urgency === 'overdue'" class="urgency-badge urgency-overdue">已逾期 {{ overdueDays }} 天</text>
          <text v-else-if="urgency === 'urgent'" class="urgency-badge urgency-urgent">还剩 {{ daysLeft }} 天</text>
        </view>
        <text class="hero-title">{{ detail.title || detail.issue_desc || '巡检问题' }}</text>
        <view class="hero-meta">
          <text class="hero-meta-text">📁 {{ detail.project_name || '未关联项目' }}</text>
          <text class="hero-meta-text">📍 {{ detail.location || '未填位置' }}</text>
        </view>
        <text class="hero-time">提交于 {{ formatDate(detail.created_at) }}</text>
      </view>

      <!-- 巡检信息 -->
      <view class="card">
        <view class="card-head">
          <view class="card-bar"></view>
          <text class="card-title">巡检信息</text>
        </view>
        <view class="info-row">
          <text class="info-label">检查项</text>
          <text class="info-value">{{ detail.category || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">严重程度</text>
          <view class="sev-tag" :class="severity.cls">
            <view class="sev-dot"></view>
            <text class="sev-text">{{ severity.text }}</text>
          </view>
        </view>
        <view class="info-row">
          <text class="info-label">负责人</text>
          <text class="info-value" :class="{ 'text-muted': !detail.responsible_name }">{{ detail.responsible_name || '未指派' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">整改期限</text>
          <text class="info-value" :class="isOverdue ? 'text-red' : (detail.due_date ? '' : 'text-muted')">
            {{ detail.due_date || '未设置' }}
          </text>
        </view>
      </view>

      <!-- 问题描述 -->
      <view class="card">
        <view class="card-head">
          <view class="card-bar"></view>
          <text class="card-title">问题描述</text>
        </view>
        <view class="desc-box">
          <text class="desc-text">{{ detail.issue_desc || '无' }}</text>
        </view>
      </view>

      <!-- 现场照片 -->
      <view v-if="getPhotos(detail).length > 0" class="card">
        <view class="card-head">
          <view class="card-bar"></view>
          <text class="card-title">现场照片</text>
          <text class="card-count">{{ getPhotos(detail).length }} 张</text>
        </view>
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
        <view class="card-head">
          <view class="card-bar"></view>
          <text class="card-title">整改记录</text>
        </view>
        <view class="desc-box">
          <text class="desc-text">{{ detail.fix_record }}</text>
        </view>
        <text v-if="detail.fix_time" class="fix-time">整改于 {{ detail.fix_time }}</text>
      </view>

      <!-- 受理信息 -->
      <view v-if="detail.accept_name || detail.accept_date" class="card">
        <view class="card-head">
          <view class="card-bar"></view>
          <text class="card-title">受理信息</text>
        </view>
        <view class="info-row">
          <text class="info-label">受理人</text>
          <text class="info-value">{{ detail.accept_name || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">受理时间</text>
          <text class="info-value">{{ detail.accept_date || '-' }}</text>
        </view>
      </view>

      <!-- 延期记录（时间轴） -->
      <view v-if="delayLogs.length > 0" class="card">
        <view class="card-head">
          <view class="card-bar"></view>
          <text class="card-title">延期记录</text>
          <text class="card-count">共 {{ delayLogs.length }} 次</text>
        </view>
        <view class="timeline">
          <view v-for="(d, i) in delayLogs" :key="i" class="tl-item">
            <view class="tl-axis">
              <view class="tl-dot"></view>
              <view v-if="i < delayLogs.length - 1" class="tl-line"></view>
            </view>
            <view class="tl-body">
              <view class="tl-head">
                <text class="tl-no">第 {{ i + 1 }} 次延期</text>
                <text class="tl-time">{{ d.at }}</text>
              </view>
              <view class="tl-dates">
                <text class="tl-from">{{ d.from || '未设置' }}</text>
                <text class="tl-arrow">→</text>
                <text class="tl-to">{{ d.to }}</text>
              </view>
              <text class="tl-reason">原因：{{ d.reason }}</text>
              <text class="tl-by">操作人：{{ d.by }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 整改操作：按业务流程分状态 -->
      <view v-if="rectifyState === 'pending'" class="action-bar">
        <button class="btn-primary" @click="openAccept">受理整改</button>
      </view>
      <view v-else-if="rectifyState === 'fixing'" class="action-bar">
        <button class="btn-secondary" @click="openDelay">申请延期</button>
        <button class="btn-primary" @click="openComplete">申报完成</button>
      </view>
      <view v-else class="action-bar action-done">
        <text class="done-tip">✓ 已结案{{ detail.finish_date ? ' · ' + detail.finish_date : '' }}</text>
      </view>
    </view>

    <!-- 受理弹窗 -->
    <view v-if="showAcceptDialog" class="dialog-mask" @click="showAcceptDialog = false">
      <view class="dialog" @click.stop>
        <view class="dialog-title">受理整改</view>
        <view class="dialog-tip">受理后状态变为「处理中」。如原定整改时间不合理，可一并调整：</view>
        <view class="dialog-row">
          <text class="dialog-label">原截止时间</text>
          <text class="dialog-value">{{ detail.due_date || '未设置' }}</text>
        </view>
        <view class="dialog-row">
          <text class="dialog-label">调整为</text>
          <picker mode="date" :value="acceptDueDate" @change="onAcceptDateChange" class="dialog-picker">
            <view class="picker-text">{{ acceptDueDate || '不变' }}</view>
          </picker>
        </view>
        <textarea class="fix-input" v-model="acceptRemark" placeholder="受理说明（选填）" rows="2" />
        <view class="dialog-actions">
          <button class="btn-cancel" @click="showAcceptDialog = false">取消</button>
          <button class="btn-primary" @click="submitAccept">确认受理</button>
        </view>
      </view>
    </view>

    <!-- 延期弹窗 -->
    <view v-if="showDelayDialog" class="dialog-mask" @click="showDelayDialog = false">
      <view class="dialog" @click.stop>
        <view class="dialog-title">申请延期</view>
        <view class="dialog-tip">当前截止时间：{{ detail.due_date || '未设置' }}</view>
        <view class="dialog-row">
          <text class="dialog-label">延期至</text>
          <picker mode="date" :value="delayDueDate" @change="onDelayDateChange" class="dialog-picker">
            <view class="picker-text">{{ delayDueDate || '请选择日期' }}</view>
          </picker>
        </view>
        <textarea class="fix-input" v-model="delayReason" placeholder="请填写延期原因（必填）" rows="3" />
        <view class="dialog-actions">
          <button class="btn-cancel" @click="showDelayDialog = false">取消</button>
          <button class="btn-primary" @click="submitDelay">提交延期</button>
        </view>
      </view>
    </view>

    <!-- 完成申报弹窗 -->
    <view v-if="showCompleteDialog" class="dialog-mask" @click="showCompleteDialog = false">
      <view class="dialog" @click.stop>
        <view class="dialog-title">申报完成</view>
        <view class="dialog-tip">提交后该问题结案，状态变为「已完成」。</view>
        <textarea
          class="fix-input"
          v-model="completeRemark"
          placeholder="选填：整改完成说明 / 后续注意事项..."
          rows="3"
        />
        <view class="dialog-actions">
          <button class="btn-cancel" @click="showCompleteDialog = false">取消</button>
          <button class="btn-primary" @click="submitComplete">确认已完成</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { absAsset } from "@/utils/api";
import { toDate } from "@/utils/date";
import { normalizeRectifyStatus, rectifyStatusText, parseDelayLog } from "@/pkg-inspect/utils/rectify";

const loading = ref(true)
const detail = ref(null)
// 三个弹窗：受理 / 延期 / 完成申报
const showAcceptDialog = ref(false)
const showDelayDialog = ref(false)
const showCompleteDialog = ref(false)
const acceptDueDate = ref('')
const acceptRemark = ref('')
const delayDueDate = ref('')
const delayReason = ref('')
const completeRemark = ref('')
const submitting = ref(false)

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  // 兼容 uni-h5 hash 路由（id 在 ?id= 里，可能挂在 options 或 $page 上）
  const options = currentPage?.options || currentPage?.$page?.options || {}
  let id = options.id
  if (!id) {
    try {
      const hash = window.location.hash || ''
      const qs = hash.includes('?') ? hash.split('?')[1] : (window.location.search || '').replace(/^\?/, '')
      id = new URLSearchParams(qs).get('id')
    } catch (_) {}
  }
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
  // 关键修复：原代码用 `?id=X` 打到列表接口（/api/rectification-issues），
  // 但列表接口只过滤 project_id，导致拿到的是全部记录中的第一条，
  // 与用户想看的完全不是同一条。正确做法是打详情接口 /api/rectification-issues/:id
  // 该接口在 server.js:6236 已实现（GET /api/rectification-issues/:id）。
  uni.request({
    url: `/api/rectification-issues/${id}`,
    success: (res) => {
      if (res.data && (res.data.id || res.data.data)) {
        detail.value = res.data.data || res.data;
        return;
      }
      if (Array.isArray(res.data) && res.data[0]) {
        detail.value = res.data[0];
        return;
      }
      detail.value = null;
      // 2026-10-30：记录已被删除时后端返回 404 {"error":"记录不存在"}。
      // 页面虽有「记录不存在」空态，但用户分不清是"被删了"还是"系统坏了"，
      // 这里补一句明确提示。触发场景：列表页停留在旧数据上，点了已删除的整改单。
      if (res.statusCode === 404) {
        uni.showToast({ title: '该巡检记录已被删除', icon: 'none' });
      }
    },
    fail: () => { detail.value = null },
    complete: () => { loading.value = false }
  })
}

// 整改状态统一走 utils/rectify 的归一化口径（与 PC 端一致）。
// 库里 status 实际存的是「待处理」，旧的本地白名单判断会漏掉它 → 按钮不显示。
const rectifyState = computed(() => normalizeRectifyStatus(detail.value?.rectify_status || detail.value?.status))

const statusClass = computed(() => {
  const st = rectifyState.value
  if (st === 'done') return 'status-fixed'
  if (st === 'fixing') return 'status-fixing'
  return 'status-pending'
})

const statusText = computed(() => rectifyStatusText(detail.value?.rectify_status || detail.value?.status))

// 严重程度：统一映射成 { text, cls }。
// ⚠️ 2026-10-23 修复：原实现是 'severity-' + detail.level 直接拼类名，
//   但库里 level 实际只有 normal / serious / stop 三种（PC 端录入用的是这套），
//   而 CSS 只写了 severity-low / medium / high —— 三个真实值全都没样式，
//   「一般」「严重」「停工」渲染成裸文本，跟其他标签字号/底色对不上。
//   这里改成显式映射（含中文脏值兜底），类名固定为 sev-*，不再拼中文类名。
const SEVERITY_MAP = {
  low: { text: '轻微', cls: 'sev-low' },
  medium: { text: '中等', cls: 'sev-medium' },
  high: { text: '严重', cls: 'sev-high' },
  serious: { text: '严重', cls: 'sev-high' },
  stop: { text: '停工', cls: 'sev-stop' },
  normal: { text: '一般', cls: 'sev-normal' },
  // 中文脏值兜底（历史数据 / 其他端写入）
  轻微: { text: '轻微', cls: 'sev-low' },
  一般: { text: '一般', cls: 'sev-normal' },
  中等: { text: '中等', cls: 'sev-medium' },
  严重: { text: '严重', cls: 'sev-high' },
  停工: { text: '停工', cls: 'sev-stop' }
}

const severity = computed(() => {
  const lv = detail.value?.level
  return SEVERITY_MAP[lv] || { text: lv || '一般', cls: 'sev-normal' }
})

// urgency 计算：基于 due_date + 当前状态
// - overdue：已逾期（除了 markup 里完成的）
// - urgent：3天内到期（含）
// - normal：否则
const daysLeft = computed(() => {
  if (!detail.value?.due_date) return null
  const due = toDate(detail.value.due_date)
  const today = new Date()
  // 仅比较日期部分（去掉时分秒）
  due.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86400000)
})

const overdueDays = computed(() => {
  const d = daysLeft.value
  return d != null && d < 0 ? Math.abs(d) : 0
})

const urgency = computed(() => {
  if (!detail.value?.due_date) return 'normal'
  // 已完成类不再提示逾期
  if (rectifyState.value === 'done') return 'normal'
  const d = daysLeft.value
  if (d == null) return 'normal'
  if (d < 0) return 'overdue'
  if (d <= 3) return 'urgent'
  return 'normal'
})

const isOverdue = computed(() => urgency.value === 'overdue')

// 延期历史（delay_log 是 JSON 字符串）
const delayLogs = computed(() => parseDelayLog(detail.value?.delay_log))

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
    if (Array.isArray(p)) return p.filter(x => x && x.trim()).map(absAsset)
    return []
  } catch { return [] }
}

function previewImage(index) {
  const photos = getPhotos(detail.value)
  uni.previewImage({ urls: photos, current: photos[index] })
}

// ===== 业务流程三动作：受理 / 延期 / 申报完成 =====

// 打开受理弹窗（默认不带新日期 = 沿用原截止时间）
function openAccept() {
  acceptDueDate.value = ''
  acceptRemark.value = ''
  showAcceptDialog.value = true
}
function onAcceptDateChange(e) {
  acceptDueDate.value = e.detail.value
}

// 受理：待处理 → 处理中（可同步修改整改截止时间）
function submitAccept() {
  if (!detail.value?.id || submitting.value) return
  submitting.value = true
  const data = { action: 'accept', remark: acceptRemark.value }
  // 只有用户真的选了新日期才传，避免把空串覆盖掉原时间
  if (acceptDueDate.value) data.new_due_date = acceptDueDate.value
  uni.request({
    url: `/api/rectification-issues/${detail.value.id}`,
    method: 'PUT',
    data,
    success: (res) => {
      if (res.statusCode === 200 && res.data && !res.data.error) {
        uni.showToast({ title: '已受理', icon: 'success' })
        showAcceptDialog.value = false
        detail.value.status = '处理中'
        if (res.data.accept_name) detail.value.accept_name = res.data.accept_name
        if (res.data.accept_date) detail.value.accept_date = res.data.accept_date
        if (acceptDueDate.value) detail.value.due_date = acceptDueDate.value
      } else {
        uni.showToast({ title: res.data?.error || '受理失败', icon: 'none' })
      }
    },
    fail: () => uni.showToast({ title: '网络错误', icon: 'none' }),
    complete: () => { submitting.value = false }
  })
}

// 打开延期弹窗
function openDelay() {
  delayDueDate.value = ''
  delayReason.value = ''
  showDelayDialog.value = true
}
function onDelayDateChange(e) {
  delayDueDate.value = e.detail.value
}

// 延期：处理中 → 处理中（改截止时间 + 必填原因，后端记 delay_log）
function submitDelay() {
  if (!detail.value?.id || submitting.value) return
  if (!delayDueDate.value) {
    uni.showToast({ title: '请选择延期后的截止时间', icon: 'none' })
    return
  }
  if (!delayReason.value.trim()) {
    uni.showToast({ title: '请填写延期原因', icon: 'none' })
    return
  }
  submitting.value = true
  uni.request({
    url: `/api/rectification-issues/${detail.value.id}`,
    method: 'PUT',
    data: {
      action: 'delay',
      new_due_date: delayDueDate.value,
      delay_reason: delayReason.value.trim()
    },
    success: (res) => {
      if (res.statusCode === 200 && res.data && !res.data.error) {
        uni.showToast({ title: '已延期', icon: 'success' })
        showDelayDialog.value = false
        detail.value.due_date = delayDueDate.value
        if (Array.isArray(res.data.delay_log)) detail.value.delay_log = JSON.stringify(res.data.delay_log)
      } else {
        uni.showToast({ title: res.data?.error || '延期失败', icon: 'none' })
      }
    },
    fail: () => uni.showToast({ title: '网络错误', icon: 'none' }),
    complete: () => { submitting.value = false }
  })
}

// 打开完成申报弹窗
function openComplete() {
  completeRemark.value = ''
  showCompleteDialog.value = true
}

// 申报完成：处理中（或历史遗留的待处理）→ 已完成（终态）
function submitComplete() {
  if (!detail.value?.id || submitting.value) return
  submitting.value = true
  uni.showLoading({ title: '提交中...' })
  uni.request({
    url: `/api/rectification-issues/${detail.value.id}`,
    method: 'PUT',
    data: {
      action: 'complete',
      remark: completeRemark.value || '已整改完成'
    },
    success: (res) => {
      uni.hideLoading()
      if (res.statusCode === 200 && res.data && !res.data.error) {
        uni.showToast({ title: '已结案', icon: 'success' })
        showCompleteDialog.value = false
        detail.value.status = '已完成'
        if (res.data.finish_date) detail.value.finish_date = res.data.finish_date
        // 1.2 秒后返回上一页（让用户看到 toast）
        setTimeout(() => { uni.navigateBack({ delta: 1, fail: () => {} }) }, 1200)
      } else {
        uni.showToast({ title: res.data?.error || '提交失败', icon: 'none' })
      }
    },
    fail: () => {
      uni.hideLoading()
      uni.showToast({ title: '网络错误', icon: 'none' })
    },
    complete: () => { submitting.value = false }
  })
}

const goBack = () => {
  uni.navigateBack();
};
</script>

<style lang="scss" scoped>
/* ============ 页面骨架 ============ */
.page {
  min-height: 100vh;
  background: #F2F4F7;
  /* ⚠️ 必须显式 padding: 0：App.vue 全局 .page 有 padding:16px，
     不覆盖会让自定义导航栏左右内缩、贴不到屏幕边（卡片自己用 margin 控制留白） */
  padding: 0;
  /* 底部固定操作栏留位（含 iPhone 安全区） */
  padding-bottom: calc(180rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(180rpx + env(safe-area-inset-bottom));
}

/* ============ 导航栏 ============ */
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
  line-height: 1;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 1rpx;
}

.nav-placeholder {
  width: 40px;
}

/* ============ 加载 / 空态 ============ */
.loading-wrap { display: flex; justify-content: center; padding: 160rpx 0; }
.loading-icon { font-size: 60rpx; color: #1E3A5F; animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 160rpx 0; }
.empty-text { font-size: 28rpx; color: #9AA3B2; }
.empty-hint { font-size: 24rpx; color: #C3C9D4; margin-top: 12rpx; }

.detail-wrap {
  padding: 24rpx;
}

/* ============ 摘要卡 ============ */
.hero {
  background: #fff;
  border-radius: 24rpx;
  padding: 32rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(30, 58, 95, 0.05);
  border-left: 8rpx solid #1E3A5F;
}

.hero-top {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.status-tag {
  font-size: 22rpx;
  font-weight: 600;
  padding: 6rpx 20rpx;
  border-radius: 22rpx;
  line-height: 1.4;
  margin-right: 12rpx;
}

.status-pending { background: #FFF7ED; color: #C2410C; }
.status-fixing { background: #EFF6FF; color: #1D4ED8; }
.status-fixed { background: #ECFDF5; color: #047857; }

.urgency-badge {
  font-size: 22rpx;
  font-weight: 600;
  padding: 6rpx 18rpx;
  border-radius: 22rpx;
  line-height: 1.4;
}

.urgency-overdue { background: #FEF2F2; color: #B91C1C; border: 1rpx solid #FCA5A5; }
.urgency-urgent { background: #FFF7ED; color: #C2410C; border: 1rpx solid #FED7AA; }

.hero-title {
  display: block;
  font-size: 36rpx;
  font-weight: 700;
  color: #1F2937;
  line-height: 1.45;
  margin-bottom: 18rpx;
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 12rpx;
}

.hero-meta-text {
  font-size: 24rpx;
  color: #5B6678;
  margin-right: 24rpx;
}

.hero-time {
  display: block;
  font-size: 22rpx;
  color: #A8B0BF;
}

/* ============ 卡片 ============ */
.card {
  background: #fff;
  border-radius: 24rpx;
  padding: 28rpx 32rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(30, 58, 95, 0.05);
}

.card-head {
  display: flex;
  align-items: center;
  margin-bottom: 8rpx;
}

.card-bar {
  width: 6rpx;
  height: 28rpx;
  border-radius: 4rpx;
  background: #1E3A5F;
  margin-right: 14rpx;
}

.card-title {
  flex: 1;
  font-size: 29rpx;
  font-weight: 600;
  color: #1E3A5F;
}

.card-count {
  font-size: 22rpx;
  color: #9AA3B2;
}

/* ============ 信息行 ============ */
.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 0;
  border-bottom: 1rpx solid #F1F3F7;
}

.info-row:last-child {
  border-bottom: none;
  padding-bottom: 4rpx;
}

.info-label {
  font-size: 26rpx;
  color: #8A93A3;
  flex-shrink: 0;
}

.info-value {
  font-size: 27rpx;
  color: #1F2937;
  font-weight: 500;
  text-align: right;
  margin-left: 24rpx;
  word-break: break-all;
}

.text-muted { color: #A8B0BF; font-weight: 400; }
.text-red { color: #DC2626; font-weight: 600; }

/* ============ 严重程度标签（颜色全覆盖） ============ */
.sev-tag {
  display: flex;
  align-items: center;
  padding: 6rpx 18rpx;
  border-radius: 22rpx;
  border: 1rpx solid transparent;
}

.sev-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  margin-right: 10rpx;
}

.sev-text {
  font-size: 23rpx;
  font-weight: 600;
  line-height: 1.4;
}

/* 轻微 */
.sev-low { background: #ECFDF5; border-color: #A7F3D0; }
.sev-low .sev-dot { background: #059669; }
.sev-low .sev-text { color: #047857; }

/* 一般（中性蓝灰，与状态标签区分开） */
.sev-normal { background: #EFF2F7; border-color: #D5DCE8; }
.sev-normal .sev-dot { background: #64748B; }
.sev-normal .sev-text { color: #475569; }

/* 中等 */
.sev-medium { background: #FFF7ED; border-color: #FED7AA; }
.sev-medium .sev-dot { background: #EA580C; }
.sev-medium .sev-text { color: #C2410C; }

/* 严重 */
.sev-high { background: #FEF2F2; border-color: #FCA5A5; }
.sev-high .sev-dot { background: #DC2626; }
.sev-high .sev-text { color: #B91C1C; }

/* 停工 */
.sev-stop { background: #7F1D1D; border-color: #7F1D1D; }
.sev-stop .sev-dot { background: #FCA5A5; }
.sev-stop .sev-text { color: #FEE2E2; }

/* ============ 描述块 ============ */
.desc-box {
  background: #F7F9FC;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-top: 20rpx;
}

.desc-text {
  font-size: 27rpx;
  color: #1F2937;
  line-height: 1.7;
}

.fix-time {
  display: block;
  font-size: 22rpx;
  color: #9AA3B2;
  margin-top: 14rpx;
}

/* ============ 照片 ============ */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  margin-top: 20rpx;
}

.photo-item {
  width: 100%;
  height: 200rpx;
  border-radius: 12rpx;
  background: #F2F4F7;
}

/* ============ 延期时间轴 ============ */
.timeline {
  margin-top: 20rpx;
}

.tl-item {
  display: flex;
}

.tl-axis {
  width: 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.tl-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #1E3A5F;
  margin-top: 10rpx;
}

.tl-line {
  flex: 1;
  width: 2rpx;
  background: #E3E8F0;
  margin-top: 8rpx;
}

.tl-body {
  flex: 1;
  padding-bottom: 28rpx;
  margin-left: 8rpx;
}

.tl-item:last-child .tl-body {
  padding-bottom: 0;
}

.tl-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.tl-no {
  font-size: 26rpx;
  font-weight: 600;
  color: #1F2937;
}

.tl-time {
  font-size: 22rpx;
  color: #A8B0BF;
}

.tl-dates {
  display: flex;
  align-items: center;
  margin-top: 10rpx;
}

.tl-from {
  font-size: 24rpx;
  color: #8A93A3;
  text-decoration: line-through;
}

.tl-arrow {
  font-size: 24rpx;
  color: #C7CDD6;
  margin: 0 12rpx;
}

.tl-to {
  font-size: 25rpx;
  color: #1E3A5F;
  font-weight: 600;
}

.tl-reason {
  display: block;
  font-size: 24rpx;
  color: #5B6678;
  margin-top: 10rpx;
  line-height: 1.55;
}

.tl-by {
  display: block;
  font-size: 22rpx;
  color: #A8B0BF;
  margin-top: 6rpx;
}

/* ============ 底部操作栏 ============ */
.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  background: #fff;
  padding: 16rpx 32rpx;
  padding-bottom: calc(16rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -4rpx 20rpx rgba(30, 58, 95, 0.08);
  display: flex;
  align-items: center;
}

.action-bar.action-done {
  justify-content: center;
  padding-top: 28rpx;
  padding-bottom: calc(28rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(28rpx + env(safe-area-inset-bottom));
}

.done-tip {
  font-size: 27rpx;
  color: #047857;
  font-weight: 600;
}

/* ============ 按钮 ============ */
.btn-primary {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border: none;
  border-radius: 44rpx;
  background: linear-gradient(135deg, #1E3A5F 0%, #2B4C7E 100%);
  color: #fff;
  font-size: 29rpx;
  font-weight: 600;
  padding: 0;
  box-shadow: 0 8rpx 20rpx rgba(30, 58, 95, 0.22);
}

.btn-secondary {
  flex: 1;
  height: 88rpx;
  line-height: 84rpx;
  border: 2rpx solid #1E3A5F;
  border-radius: 44rpx;
  background: #fff;
  color: #1E3A5F;
  font-size: 29rpx;
  font-weight: 600;
  padding: 0;
  margin-right: 20rpx;
}

.btn-primary::after,
.btn-secondary::after,
.btn-cancel::after {
  border: none;
}

.btn-cancel {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border: none;
  border-radius: 44rpx;
  background: #F2F4F7;
  color: #5B6678;
  font-size: 29rpx;
  font-weight: 600;
  padding: 0;
}

/* ============ 弹窗 ============ */
.dialog-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(17, 24, 39, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.dialog {
  width: 620rpx;
  background: #fff;
  border-radius: 24rpx;
  padding: 40rpx 36rpx;
  box-sizing: border-box;
}

.dialog-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #1E3A5F;
  margin-bottom: 16rpx;
  text-align: center;
}

.dialog-tip {
  font-size: 23rpx;
  color: #8A93A3;
  line-height: 1.6;
  margin-bottom: 20rpx;
  text-align: center;
}

.dialog-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 0;
  border-bottom: 1rpx solid #F1F3F7;
}

.dialog-label {
  font-size: 26rpx;
  color: #8A93A3;
}

.dialog-value {
  font-size: 26rpx;
  color: #1F2937;
  font-weight: 500;
}

.dialog-picker {
  flex: 1;
  text-align: right;
}

.picker-text {
  font-size: 26rpx;
  color: #1E3A5F;
  font-weight: 600;
}

.fix-input {
  width: 100%;
  box-sizing: border-box;
  margin-top: 20rpx;
  padding: 20rpx 24rpx;
  background: #F7F9FC;
  border: none;
  border-radius: 16rpx;
  font-size: 27rpx;
  color: #1F2937;
  line-height: 1.6;
}

.dialog-actions {
  display: flex;
  margin-top: 32rpx;
}

.dialog-actions .btn-cancel {
  margin-right: 20rpx;
}
</style>
