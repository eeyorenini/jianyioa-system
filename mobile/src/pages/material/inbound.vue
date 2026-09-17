<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">到货验收</text>
      <view class="nav-placeholder"></view>
    </view>
    <view class="project-banner" v-if="projectName">
      📁 {{ projectName }}
    </view>

    <!-- 扫码/输入 -->
    <view class="search-card">
      <view class="search-row">
        <input class="search-input" v-model="orderNo" placeholder="输入采购单号" @confirm="fetchOrder" />
        <button class="scan-btn" @click="scanCode">
          <text class="iconfont icon-scan"></text>
          扫码
        </button>
      </view>
    </view>

    <!-- 采购单信息 -->
    <view v-if="order" class="order-card">
      <view class="card-title">采购单信息</view>
      <view class="info-row">
        <text class="info-label">单号</text>
        <text class="info-value">{{ order.order_no }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">材料</text>
        <text class="info-value">{{ order.material_name }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">采购数量</text>
        <text class="info-value">{{ order.quantity }} {{ order.unit }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">供应商</text>
        <text class="info-value">{{ order.supplier }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">申请人</text>
        <text class="info-value">{{ order.applicant_name }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">状态</text>
        <text class="status-tag" :class="'status-' + order.status">{{ orderStatusText }}</text>
      </view>
    </view>

    <!-- 验收表单 -->
    <view v-if="order && order.status !== 'received'" class="form-card">
      <view class="form-title">验收信息</view>
      <view class="form-item">
        <text class="form-label">实到数量</text>
        <input class="form-input" v-model="form.actual_quantity" type="number" :placeholder="'应为 ' + order.quantity + ' ' + order.unit" />
      </view>
      <view class="form-item">
        <text class="form-label">质量验收</text>
        <radio-group @change="onQualityChange">
          <label class="quality-option"><radio value="ok" color="#1E3A5F" /> 合格</label>
          <label class="quality-option"><radio value="reject" color="#F44336" /> 不合格</label>
        </radio-group>
      </view>
      <view class="form-item">
        <text class="form-label">备注</text>
        <textarea class="form-textarea" v-model="form.remark" placeholder="备注信息" rows="2" />
      </view>
    </view>

    <!-- 提交 -->
    <view v-if="order && order.status !== 'received'" class="submit-bar">
      <button class="btn-primary" :disabled="submitting" @click="submitInbound">确认验收</button>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const orderNo = ref('')
const projectId = ref('')
const projectName = ref('')
const order = ref(null)
const submitting = ref(false)
const form = ref({ actual_quantity: '', quality: 'ok', remark: '' })

onMounted(() => {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const options = (current).options || {}
  const no = options.order_no
  if (no) { orderNo.value = no; fetchOrder() }
  if (options.projectId) projectId.value = options.projectId
  if (options.projectName) projectName.value = decodeURIComponent(options.projectName)
})

function fetchOrder() {
  if (!orderNo.value) return
  uni.request({
    url: `/api/material/order?order_no=${orderNo.value}`,
    success: (res) => {
      if (res.data.code === 0) {
        order.value = res.data.data
        form.value.actual_quantity = order.value.quantity
      } else {
        uni.showToast({ title: '未找到采购单', icon: 'none' })
      }
    }
  })
}

function scanCode() {
  // #ifdef H5
  uni.showToast({ title: '请手动输入单号', icon: 'none' })
  // #endif
}

const orderStatusText = computed(() => {
  const map = { pending: '待发货', shipped: '已发货', received: '已验收' }
  return map[order.value?.status] || '未知'
})

function onQualityChange(e) { form.value.quality = e.detail.value }

function goBack() { uni.navigateBack() }

function submitInbound() {
  if (!form.value.actual_quantity) {
    uni.showToast({ title: '请填写实到数量', icon: 'none' }); return
  }
  submitting.value = true
  uni.request({
    url: '/api/material/inbound',
    method: 'POST',
    data: { order_no: orderNo.value, ...form.value },
    success: (res) => {
      if (res.data.code === 0) {
        uni.showToast({ title: '验收成功', icon: 'success' })
        setTimeout(() => { uni.navigateBack() }, 1500)
      } else {
        uni.showToast({ title: res.data.msg || '验收失败', icon: 'none' })
      }
    },
    complete: () => { submitting.value = false }
  })
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding-bottom: 120rpx; }

.project-banner {
  font-size: 13px;
  color: #1E3A5F;
  background: #DBEAFE;
  padding: 8px 14px;
  font-weight: 500;
}



.search-card { margin: 20rpx; background: #fff; border-radius: 16rpx; padding: 24rpx; }
.search-row { display: flex; gap: 20rpx; align-items: center; }
.search-input { flex: 1; height: 72rpx; border: 1rpx solid #eee; border-radius: 36rpx; padding: 0 30rpx; font-size: 28rpx; }
.scan-btn { display: flex; align-items: center; gap: 8rpx; background: #1E3A5F; color: #fff; border-radius: 36rpx; padding: 0 28rpx; height: 72rpx; font-size: 26rpx; white-space: nowrap; }
.order-card { margin: 0 20rpx 20rpx; background: #fff; border-radius: 16rpx; padding: 28rpx; }
.card-title { font-size: 28rpx; font-weight: 600; color: #1E3A5F; margin-bottom: 20rpx; }
.info-row { display: flex; justify-content: space-between; padding: 14rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.info-row:last-child { border-bottom: none; }
.info-label { font-size: 26rpx; color: #999; }
.info-value { font-size: 26rpx; color: #333; }
.status-tag { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 20rpx; }
.status-pending { background: #FFF3E0; color: #FF9800; }
.status-shipped { background: #E3F2FD; color: #2196F3; }
.status-received { background: #E8F5E9; color: #4CAF50; }
.form-card { margin: 0 20rpx 20rpx; background: #fff; border-radius: 16rpx; padding: 30rpx; }
.form-title { font-size: 28rpx; font-weight: 600; color: #1E3A5F; margin-bottom: 24rpx; }
.form-item { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid #f5f5f5; }
.form-item:last-child { border-bottom: none; }
.form-label { width: 160rpx; font-size: 26rpx; color: #666; flex-shrink: 0; }
.form-input { flex: 1; font-size: 28rpx; color: #333; }
.form-textarea { flex: 1; font-size: 28rpx; color: #333; border: 1rpx solid #eee; border-radius: 8rpx; padding: 16rpx; resize: none; }
.quality-option { margin-right: 40rpx; font-size: 28rpx; }
.submit-bar { position: fixed; bottom: 0; left: 0; right: 0; padding: 20rpx 40rpx; background: #fff; box-shadow: 0 -2rpx 10rpx rgba(0,0,0,0.05); }
.btn-primary { background: #1E3A5F; color: #fff; border-radius: 40rpx; font-size: 28rpx; height: 88rpx; line-height: 88rpx; }
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
