<template>
  <view class="page">
    <!-- 小程序端：右侧「我的订单」会被微信胶囊遮挡，用 navStyleCapsule 垂直避让 -->
    <view class="nav-bar" :style="navStyleCapsule">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">购物车</text>
      <text class="nav-right" @click="goOrders">我的订单</text>
    </view>

    <view class="page-body">
      <view v-if="!items.length" class="empty">
        <text class="empty-emoji">🛒</text>
        <text class="empty-text">购物车是空的</text>
        <view class="empty-btn" @click="goMall">去挑材料</view>
      </view>

      <template v-else>
        <!-- 商品 -->
        <view class="card">
          <view v-for="it in items" :key="it.id" class="citem">
            <view class="cimg">
              <image v-if="it.image" class="cimg-i" :src="imgUrl(it.image)" mode="aspectFill" />
              <view v-else class="cimg-none"><text class="cimg-emoji">📦</text></view>
            </view>
            <view class="cbody">
              <view class="cname">{{ it.name }}</view>
              <view class="csub">{{ [it.spec, it.brand].filter(Boolean).join(' · ') || '—' }}</view>
              <view class="cfoot">
                <view class="cprice"><text class="cny">¥</text><text class="num">{{ fmt(it.price) }}</text><text class="unit">/{{ it.unit || '件' }}</text></view>
                <view class="stepper">
                  <text class="st-btn" @click="dec(it)">−</text>
                  <input class="st-input" type="number" :value="String(it.qty)" @blur="onQtyInput(it, $event)" />
                  <text class="st-btn" @click="inc(it)">＋</text>
                </view>
              </view>
            </view>
            <text class="del" @click="del(it)">✕</text>
          </view>
        </view>

        <!-- 备注 -->
        <view class="card">
          <view class="c-title">备注</view>
          <textarea
            class="remark" v-model="remark" maxlength="200"
            placeholder="有特殊要求可以写在这里（选填）" :auto-height="true"
          />
        </view>

        <!-- 转账说明 -->
        <view class="card tipcard">
          <view class="c-title">怎么付款？</view>
          <view class="tip-line">1. 提交后系统会给出<b>订单编号</b></view>
          <view class="tip-line">2. 复制编号，银行转账时填在<b>备注</b>里</view>
          <view class="tip-line">3. 财务核对后确认收款，我们再联系您安排发货</view>
          <view class="tip-warn">本商城不支持在线支付，只走银行转账</view>
        </view>
      </template>
    </view>

    <!-- 底部结算条 -->
    <view v-if="items.length" class="bottom-bar">
      <view class="bb-left">
        <view class="bb-amount">合计 <text class="cny">¥</text><text class="num">{{ fmt(total) }}</text></view>
        <view class="bb-tip">共 {{ totalQty }} 件</view>
      </view>
      <view class="btn-submit" :class="{ disabled: submitting }" @click="submit">提交订单</view>
    </view>

    <!-- 下单成功：订单号 -->
    <view v-if="done" class="mask">
      <view class="done-box">
        <view class="done-ico">✅</view>
        <view class="done-title">下单成功</view>
        <view class="done-sub">请复制下面的订单编号</view>

        <view class="ono-box" @click="copyNo">
          <text class="ono">{{ done.order_no }}</text>
          <text class="ono-copy">点击复制</text>
        </view>

        <view class="done-amount">应付金额 <text class="amt">¥{{ fmt(done.total_amount) }}</text></view>

        <view class="bank">
          <view class="bank-t">请银行转账到</view>
          <view v-if="pay.bank_name" class="bank-row"><text class="bl">开户行</text><text class="bv">{{ pay.bank_name }}</text></view>
          <view v-if="pay.account_name" class="bank-row"><text class="bl">户名</text><text class="bv">{{ pay.account_name }}</text></view>
          <view v-if="pay.account_no" class="bank-row" @click="copyAccount">
            <text class="bl">账号</text>
            <text class="bv mono">{{ pay.account_no }}</text>
            <text class="bcopy">复制</text>
          </view>
          <view v-if="!pay.account_no" class="bank-empty">收款账户未配置，请联系项目经理获取</view>
        </view>

        <view class="done-warn">
          ⚠️ 转账时请务必在【备注】里填写订单编号 <text class="warn-no">{{ done.order_no }}</text>，否则财务无法核对到账。
        </view>
        <view v-if="pay.note" class="done-note">{{ pay.note }}</view>

        <view class="done-btns">
          <view class="dbtn ghost" @click="goOrders">查看我的订单</view>
          <view class="dbtn" @click="goMall">继续逛</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getImageUrl } from '@/utils/api'
import { readCart, writeCart, removeItem, cartAmount, cartCount, clearCart } from '@/utils/mallCart'

const items = ref([])
const remark = ref('')
const submitting = ref(false)
const done = ref(null)
const pay = ref({ bank_name: '', account_name: '', account_no: '', note: '' })

const imgUrl = (p) => getImageUrl(p)
const fmt = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

const total = computed(() => cartAmount(items.value))
const totalQty = computed(() => cartCount(items.value))

const sync = () => {
  items.value = readCart()
}

const inc = (it) => {
  if (it.stock > 0 && it.qty >= it.stock) {
    uni.showToast({ title: `库存仅剩 ${it.stock}`, icon: 'none' })
    return
  }
  it.qty += 1
  writeCart(items.value)
}
const dec = (it) => {
  if (it.qty <= 1) { del(it); return }
  it.qty -= 1
  writeCart(items.value)
}
const onQtyInput = (it, e) => {
  let n = parseInt(e.detail.value, 10)
  if (!Number.isFinite(n) || n <= 0) n = 1
  if (it.stock > 0 && n > it.stock) n = it.stock
  it.qty = n
  writeCart(items.value)
}
const del = (it) => {
  uni.showModal({
    title: '提示',
    content: `从购物车移除「${it.name}」？`,
    success: (r) => {
      if (!r.confirm) return
      removeItem(it.id)
      sync()
      if (!items.value.length) uni.showToast({ title: '购物车空了', icon: 'none' })
    }
  })
}

const loadPay = async () => {
  try {
    const res = await uni.request({ url: '/api/mall/payinfo' })
    pay.value = res.data || {}
  } catch (e) { /* 拿不到就只显示文案 */ }
}

const submit = async () => {
  if (submitting.value || !items.value.length) return
  submitting.value = true
  uni.showLoading({ title: '提交中…', mask: true })
  try {
    const res = await uni.request({
      url: '/api/mall/orders',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        items: items.value.map((i) => ({ material_id: i.id, qty: i.qty })),
        remark: remark.value
      }
    })
    const data = res.data || {}
    if (!data.order_no) {
      uni.showToast({ title: data.error || '提交失败', icon: 'none' })
      return
    }
    clearCart()
    sync()
    done.value = data
    loadPay()
  } catch (e) {
    uni.showToast({ title: '提交失败，请重试', icon: 'none' })
  } finally {
    uni.hideLoading()
    submitting.value = false
  }
}

const copyNo = () => {
  if (!done.value) return
  uni.setClipboardData({
    data: done.value.order_no,
    success: () => uni.showToast({ title: '订单编号已复制', icon: 'none' })
  })
}
const copyAccount = () => {
  if (!pay.value.account_no) return
  uni.setClipboardData({
    data: String(pay.value.account_no).replace(/\s/g, ''),
    success: () => uni.showToast({ title: '账号已复制', icon: 'none' })
  })
}

const goMall = () => {
  const pages = getCurrentPages()
  // 从商城页过来的直接回退，避免页面栈越堆越深
  const prev = pages[pages.length - 2]
  if (prev && String(prev.route || '').indexOf('customer/mall') >= 0) uni.navigateBack()
  else uni.redirectTo({ url: '/pages/customer/mall' })
}
const goOrders = () => {
  done.value = null
  uni.redirectTo({ url: '/pages/customer/mall-orders' })
}
const goBack = () => {
  const pages = getCurrentPages()
  if (pages.length <= 1) uni.redirectTo({ url: '/pages/customer/mall' })
  else uni.navigateBack()
}

onMounted(() => {
  sync()
  loadPay()
})
</script>

<style scoped>
.page { padding: 0; padding-bottom: 84px; background: #F5F7FA; }

.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  /* padding-top 由 navStyleCapsule 动态注入（env 在小程序端恒为 0） */
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 56px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-right { width: 56px; text-align: right; font-size: 13px; opacity: .92; }

.page-body { padding: 12px 15px 0; }

.card { background: #fff; border-radius: 14px; padding: 12px; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.04); }

/* 购物车项 */
.citem { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #F5F7FA; position: relative; }
.citem:first-child { padding-top: 2px; }
.citem:last-child { border-bottom: none; padding-bottom: 2px; }
.cimg { width: 72px; height: 72px; border-radius: 10px; overflow: hidden; flex: 0 0 72px; background: #F4F6F8; }
.cimg-i { width: 100%; height: 100%; }
.cimg-none { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.cimg-emoji { font-size: 26px; opacity: .5; }
.cbody { flex: 1; min-width: 0; }
.cname { font-size: 14.5px; font-weight: 600; color: #1A1F36; padding-right: 22px; }
.csub { font-size: 12px; color: #98A1AE; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cfoot { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.cprice { display: flex; align-items: baseline; color: #C0392B; }
.cny { font-size: 11px; }
.num { font-size: 17px; font-weight: 700; }
.unit { font-size: 11px; color: #98A1AE; margin-left: 2px; }

.stepper { display: flex; align-items: center; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden; }
.st-btn { width: 30px; height: 28px; line-height: 28px; text-align: center; font-size: 16px; color: #4B5563; background: #F9FAFB; }
.st-btn:active { background: #EEF1F5; }
.st-input { width: 42px; height: 28px; text-align: center; font-size: 13px; color: #1A1F36; }

.del { position: absolute; right: 0; top: 8px; font-size: 13px; color: #C4CBD4; padding: 2px 4px; }

.c-title { font-size: 14px; font-weight: 600; color: #1A1F36; margin-bottom: 10px; }
.remark {
  width: 100%; background: #F8FAFC; border-radius: 10px; padding: 10px;
  font-size: 13.5px; color: #1A1F36; min-height: 64px; box-sizing: border-box;
}

.tipcard { background: #F8FAFC; }
.tip-line { font-size: 12.5px; color: #6B7280; line-height: 1.9; }
.tip-line b { color: #1E3A5F; }
.tip-warn { font-size: 12px; color: #B45309; margin-top: 8px; }

/* 空态 */
.empty { display: flex; flex-direction: column; align-items: center; padding: 80px 20px; }
.empty-emoji { font-size: 48px; opacity: .45; }
.empty-text { font-size: 14px; color: #6B7280; margin: 14px 0 20px; }
.empty-btn { background: #1E3A5F; color: #fff; font-size: 14px; padding: 11px 30px; border-radius: 22px; }

/* 底部结算 */
.bottom-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 200;
  display: flex; align-items: center; gap: 12px;
  background: #fff; padding: 10px 15px;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
  box-shadow: 0 -2px 12px rgba(0,0,0,.07);
}
.bb-left { flex: 1; }
.bb-amount { font-size: 13px; color: #6B7280; }
.bb-amount .cny { font-size: 12px; color: #C0392B; }
.bb-amount .num { font-size: 21px; font-weight: 700; color: #C0392B; }
.bb-tip { font-size: 11px; color: #98A1AE; margin-top: 2px; }
/* App.vue 里 .bottom-bar 是 flex，.btn-submit 不写 flex 会被压成内容宽度 */
.btn-submit {
  flex: 1; max-width: 180px; background: #1E3A5F; color: #fff;
  text-align: center; font-size: 16px; font-weight: 600; letter-spacing: 2px;
  padding: 13px 0; border-radius: 10px;
}
.btn-submit.disabled { background: #C7CEDA; }
.btn-submit:active { opacity: .86; }

/* 成功弹层 */
.mask {
  position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 900;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.done-box {
  width: 100%; max-width: 420px; background: #fff; border-radius: 18px;
  padding: 22px 18px; max-height: 86vh; overflow-y: auto;
}
.done-ico { text-align: center; font-size: 40px; }
.done-title { text-align: center; font-size: 19px; font-weight: 700; color: #1A1F36; margin-top: 6px; }
.done-sub { text-align: center; font-size: 12.5px; color: #98A1AE; margin-top: 4px; }

.ono-box {
  margin: 14px 0 12px; background: #F0F5FB; border: 1px dashed #B9CCE4;
  border-radius: 12px; padding: 14px; text-align: center;
}
.ono {
  display: block; font-size: 24px; font-weight: 700; color: #1E3A5F;
  letter-spacing: 2px; font-variant-numeric: tabular-nums;
}
.ono-copy { display: block; font-size: 12px; color: #2F6FEB; margin-top: 6px; }

.done-amount { text-align: center; font-size: 13px; color: #6B7280; margin-bottom: 14px; }
.done-amount .amt { font-size: 20px; font-weight: 700; color: #C0392B; margin-left: 4px; }

.bank { background: #F8FAFC; border-radius: 12px; padding: 12px; }
.bank-t { font-size: 12.5px; color: #6B7280; margin-bottom: 8px; }
.bank-row { display: flex; align-items: baseline; gap: 8px; padding: 4px 0; }
.bl { font-size: 12px; color: #98A1AE; flex: 0 0 42px; }
.bv { font-size: 13px; color: #1A1F36; flex: 1; word-break: break-all; }
.bv.mono { font-variant-numeric: tabular-nums; letter-spacing: .5px; }
.bcopy { font-size: 11.5px; color: #2F6FEB; flex: 0 0 auto; }
.bank-empty { font-size: 12.5px; color: #B45309; }

.done-warn {
  font-size: 12.5px; color: #B45309; line-height: 1.7;
  background: #FEF6EC; border-radius: 10px; padding: 10px 12px; margin-top: 12px;
}
.warn-no { font-weight: 700; font-variant-numeric: tabular-nums; }
.done-note { font-size: 12px; color: #98A1AE; margin-top: 8px; line-height: 1.6; }

.done-btns { display: flex; gap: 10px; margin-top: 16px; }
.dbtn { flex: 1; text-align: center; font-size: 14.5px; font-weight: 600; padding: 12px 0; border-radius: 10px; background: #1E3A5F; color: #fff; }
.dbtn.ghost { background: #fff; color: #1E3A5F; border: 1px solid #C9D4E2; }
.dbtn:active { opacity: .86; }
</style>
