<template>
  <view class="page">
    <!-- 小程序端：右侧「去商城」会被微信胶囊遮挡，用 navStyleCapsule 垂直避让 -->
    <view class="nav-bar" :style="navStyleCapsule">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">我的订单</text>
      <text class="nav-right" @click="goMall">去商城</text>
    </view>

    <view class="page-body">
      <view v-if="loading && !list.length" class="hint-box">加载中…</view>

      <view v-else-if="!list.length" class="empty">
        <text class="empty-emoji">📋</text>
        <text class="empty-text">还没有订单</text>
        <view class="empty-btn" @click="goMall">去挑材料</view>
      </view>

      <view v-else class="olist">
        <view v-for="o in list" :key="o.id" class="ocard">
          <view class="ohead">
            <text class="ono">{{ o.order_no }}</text>
            <text class="ost" :class="o.status">{{ statusText(o.status) }}</text>
          </view>

          <view class="oitems">
            <view v-for="(it, i) in o.items" :key="i" class="oitem">
              <view class="oimg">
                <image v-if="it.image" class="oimg-i" :src="imgUrl(it.image)" mode="aspectFill" />
                <view v-else class="oimg-none"><text class="oimg-emoji">📦</text></view>
              </view>
              <view class="omain">
                <view class="oname">{{ it.name }}</view>
                <view class="osub">{{ [it.spec, it.brand].filter(Boolean).join(' · ') || '—' }}</view>
              </view>
              <view class="onum">
                <view class="oprice">¥{{ fmt(it.unit_price) }}</view>
                <view class="oqty">×{{ it.qty }}</view>
              </view>
            </view>
          </view>

          <view class="ofoot">
            <text class="otime">{{ fmtTime(o.created_at) }}</text>
            <view class="ototal">共 {{ o.total_qty }} 件　合计 <text class="amt">¥{{ fmt(o.total_amount) }}</text></view>
          </view>

          <view v-if="o.status === 'pending'" class="opay">
            <text class="opay-tip">请转账后联系项目经理核对</text>
            <view class="opay-btn" @click="copyNo(o)">复制订单号</view>
          </view>
          <view v-else-if="o.status === 'paid'" class="opaid">✅ 已收款，我们会尽快联系您安排发货</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getImageUrl } from '@/utils/api'

const list = ref([])
const loading = ref(false)

const imgUrl = (p) => getImageUrl(p)
const fmt = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}
const statusText = (s) => ({ pending: '待收款', paid: '已收款', cancelled: '已取消' }[s] || s)
const fmtTime = (s) => {
  if (!s) return ''
  const str = String(s).replace(' ', 'T')
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(s) ? str : str + 'Z')
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 16).replace('T', ' ')
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const load = async () => {
  loading.value = true
  try {
    const res = await uni.request({ url: '/api/mall/orders' })
    list.value = Array.isArray(res.data) ? res.data : []
  } catch (e) {
    list.value = []
  } finally {
    loading.value = false
  }
}

const copyNo = (o) => {
  uni.setClipboardData({
    data: o.order_no,
    success: () => uni.showToast({ title: '订单号已复制', icon: 'none' })
  })
}

const goMall = () => uni.redirectTo({ url: '/pages/customer/mall' })
const goBack = () => {
  const pages = getCurrentPages()
  if (pages.length <= 1) uni.redirectTo({ url: '/pages/customer/home' })
  else uni.navigateBack()
}

onMounted(load)
</script>

<style scoped>
.page { padding: 0; background: #F5F7FA; }

.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  /* padding-top 由 navStyleCapsule 动态注入（env 在小程序端恒为 0） */
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 56px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-right { width: 56px; text-align: right; font-size: 13px; opacity: .92; }

.page-body { padding: 12px 15px 24px; }

.olist { display: flex; flex-direction: column; gap: 10px; }
.ocard { background: #fff; border-radius: 14px; padding: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.04); }

.ohead { display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px solid #F5F7FA; }
.ono { font-size: 14.5px; font-weight: 700; color: #1E3A5F; letter-spacing: .5px; font-variant-numeric: tabular-nums; }
.ost { font-size: 11.5px; padding: 2px 8px; border-radius: 5px; font-weight: 500; }
.ost.pending { background: #FDF3E7; color: #B45309; }
.ost.paid { background: #E9F7F0; color: #1E8E5A; }
.ost.cancelled { background: #F3F4F6; color: #8A93A0; }

.oitems { padding: 6px 0; }
.oitem { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.oimg { width: 52px; height: 52px; border-radius: 8px; overflow: hidden; flex: 0 0 52px; background: #F4F6F8; }
.oimg-i { width: 100%; height: 100%; }
.oimg-none { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.oimg-emoji { font-size: 20px; opacity: .5; }
.omain { flex: 1; min-width: 0; }
.oname { font-size: 13.5px; font-weight: 500; color: #1A1F36; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.osub { font-size: 11.5px; color: #98A1AE; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.onum { text-align: right; }
.oprice { font-size: 13px; color: #1A1F36; font-variant-numeric: tabular-nums; }
.oqty { font-size: 11.5px; color: #98A1AE; }

.ofoot { display: flex; align-items: center; justify-content: space-between; padding-top: 10px; border-top: 1px solid #F5F7FA; }
.otime { font-size: 11.5px; color: #A9B1BC; }
.ototal { font-size: 12.5px; color: #6B7280; }
.ototal .amt { font-size: 17px; font-weight: 700; color: #C0392B; }

.opay { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; background: #FEF6EC; border-radius: 10px; padding: 9px 12px; }
.opay-tip { font-size: 12px; color: #B45309; flex: 1; }
.opay-btn { font-size: 12.5px; color: #fff; background: #C77B2E; padding: 6px 14px; border-radius: 14px; font-weight: 600; }
.opaid { margin-top: 10px; font-size: 12px; color: #1E8E5A; background: #E9F7F0; border-radius: 10px; padding: 9px 12px; }

.empty { display: flex; flex-direction: column; align-items: center; padding: 80px 20px; }
.empty-emoji { font-size: 48px; opacity: .45; }
.empty-text { font-size: 14px; color: #6B7280; margin: 14px 0 20px; }
.empty-btn { background: #1E3A5F; color: #fff; font-size: 14px; padding: 11px 30px; border-radius: 22px; }
.hint-box { text-align: center; font-size: 12.5px; color: #A9B1BC; padding: 40px 0; }
</style>
