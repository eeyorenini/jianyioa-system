<template>
  <view class="page">
    <!-- 顶部导航 -->
    <!-- 小程序端：右侧「我的订单」会被微信胶囊遮挡，用 navStyleCapsule 垂直避让 -->
    <view class="nav-bar" :style="navStyleCapsule">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">材料商城</text>
      <text class="nav-right" @click="goOrders">我的订单</text>
    </view>

    <view class="page-body">
      <!-- 搜索 -->
      <view class="searchbar">
        <text class="s-icon">🔍</text>
        <input
          class="s-input" v-model="keyword" type="text" confirm-type="search"
          placeholder="搜商品名 / 品牌 / 型号" @confirm="reload" @input="onKeywordInput"
        />
        <text v-if="keyword" class="s-clear" @click="clearKeyword">✕</text>
      </view>

      <!-- 品类 -->
      <scroll-view class="catbar" scroll-x :show-scrollbar="false">
        <view class="cat-list">
          <view class="cat" :class="{ on: !categoryId }" @click="pickCat(0)">全部</view>
          <view
            v-for="c in categories" :key="c.id" class="cat"
            :class="{ on: categoryId === c.id }" @click="pickCat(c.id)"
          >{{ c.name }}<text class="cat-n">{{ c.count }}</text></view>
        </view>
      </scroll-view>

      <!-- 商品列表 -->
      <view v-if="loading && !list.length" class="hint-box">加载中…</view>
      <view v-else-if="!list.length" class="hint-box">
        <text class="hint-emoji">🛍️</text>
        <text class="hint-text">{{ keyword ? '没找到相关商品' : '商城还没有上架商品' }}</text>
        <text class="hint-sub">如需上架请联系您的项目经理</text>
      </view>

      <view v-else class="plist">
        <view v-for="g in list" :key="g.id" class="pcard" @click="showDetail(g)">
          <view class="pimg">
            <image v-if="g.cover_image" class="pimg-img" :src="imgUrl(g.cover_image)" mode="aspectFill" />
            <view v-else class="pimg-none"><text class="pimg-emoji">{{ catEmoji(g.category_name) }}</text></view>
          </view>
          <view class="pbody">
            <view class="pname">{{ g.name }}</view>
            <view class="psub">{{ [g.specification || g.model, g.brand_name].filter(Boolean).join(' · ') || '—' }}</view>
            <view class="pfoot">
              <view class="pprice">
                <text class="cny">¥</text><text class="num">{{ fmt(g.price) }}</text>
                <text class="unit">/{{ g.quote_unit || '件' }}</text>
              </view>
              <view class="addbtn" @click.stop="onAdd(g)">加入</view>
            </view>
          </view>
        </view>

        <view v-if="loadingMore" class="more-tip">加载更多…</view>
        <view v-else-if="noMore && list.length > 4" class="more-tip">没有更多了</view>
      </view>
    </view>

    <!-- 底部购物车条 -->
    <view class="cart-bar" :class="{ empty: !cartQty }">
      <view class="cb-left" @click="goCart">
        <view class="cb-icon">🛒<text v-if="cartQty" class="cb-badge">{{ cartQty > 99 ? '99+' : cartQty }}</text></view>
        <view class="cb-info">
          <view class="cb-amount" v-if="cartQty">¥{{ fmt(cartTotal) }}</view>
          <view class="cb-amount dim" v-else>购物车是空的</view>
          <view class="cb-tip" v-if="cartQty">共 {{ cartQty }} 件</view>
        </view>
      </view>
      <view class="cb-btn" :class="{ disabled: !cartQty }" @click="goCart">去结算</view>
    </view>

    <!-- 商品详情弹层 -->
    <view v-if="detail" class="mask" @click="detail = null">
      <view class="sheet" @click.stop>
        <view class="sheet-img">
          <image v-if="detail.cover_image" class="sheet-img-i" :src="imgUrl(detail.cover_image)" mode="aspectFill" />
          <view v-else class="pimg-none"><text class="pimg-emoji big">{{ catEmoji(detail.category_name) }}</text></view>
        </view>
        <view class="sheet-body">
          <view class="sheet-name">{{ detail.name }}</view>
          <view class="sheet-meta">{{ [detail.specification || detail.model, detail.brand_name, detail.category_name].filter(Boolean).join(' · ') }}</view>
          <view class="sheet-price">
            <text class="cny">¥</text><text class="num">{{ fmt(detail.price) }}</text>
            <text class="unit">/{{ detail.quote_unit || '件' }}</text>
          </view>
          <view v-if="detail.mall_stock > 0" class="sheet-stock">库存 {{ detail.mall_stock }}{{ detail.quote_unit || '' }}</view>
          <view v-if="detail.remark" class="sheet-remark">{{ detail.remark }}</view>
          <view class="sheet-tip">下单后我们会联系您确认，支持银行转账（无在线支付）</view>
          <view class="sheet-btn" @click="onAdd(detail, true)">加入购物车</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onShow, onReachBottom } from '@dcloudio/uni-app'
import { getImageUrl } from '@/utils/api'
import { readCart, cartCount, cartAmount, addToCart } from '@/utils/mallCart'

const list = ref([])
const categories = ref([])
const keyword = ref('')
const categoryId = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const noMore = ref(false)
const page = ref(1)
const PAGE_SIZE = 10

const detail = ref(null)

// 购物车（每次 onShow 刷新，从结算页返回时能同步）
const cartQty = ref(0)
const cartTotal = ref(0)
const refreshCart = () => {
  const items = readCart()
  cartQty.value = cartCount(items)
  cartTotal.value = cartAmount(items)
}

const imgUrl = (p) => getImageUrl(p)

const fmt = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

const CAT_EMOJI = {
  瓷砖: '🧱', '门/垭口': '🚪', 洁具: '🚿', 开关面板: '🔌',
  地板: '🪵', 吊顶: '💡', 橱柜: '🗄️', 家电: '📺',
  软装: '🛋️', 灯具: '💡', 护墙板: '🧱', 玻璃: '🪟',
  水管电线: '🔧', 油漆涂料: '🎨', 防水辅料: '🧴', 五金: '🔩'
}
const catEmoji = (n) => CAT_EMOJI[n] || '📦'

const buildQuery = () => {
  const q = [`page=${page.value}`, `page_size=${PAGE_SIZE}`]
  if (keyword.value.trim()) q.push('keyword=' + encodeURIComponent(keyword.value.trim()))
  if (categoryId.value) q.push('category_id=' + categoryId.value)
  return '/api/mall/products?' + q.join('&')
}

const loadList = async (append) => {
  if (append) loadingMore.value = true
  else loading.value = true
  try {
    const res = await uni.request({ url: buildQuery() })
    const data = res.data || {}
    const rows = Array.isArray(data.list) ? data.list : []
    if (append) {
      list.value = list.value.concat(rows)
    } else {
      list.value = rows
    }
    noMore.value = rows.length < PAGE_SIZE
  } catch (e) {
    if (!append) list.value = []
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const loadCategories = async () => {
  try {
    const res = await uni.request({ url: '/api/mall/categories' })
    categories.value = Array.isArray(res.data) ? res.data : []
  } catch (e) {
    categories.value = []
  }
}

const reload = () => {
  page.value = 1
  noMore.value = false
  loadList(false)
}

const pickCat = (id) => {
  categoryId.value = categoryId.value === id ? 0 : id
  reload()
}

let kwTimer = null
const onKeywordInput = () => {
  if (kwTimer) clearTimeout(kwTimer)
  kwTimer = setTimeout(() => { reload() }, 450)
}
const clearKeyword = () => { keyword.value = ''; reload() }

const onAdd = (g, closeSheet) => {
  const r = addToCart(g, 1)
  if (!r.ok) {
    uni.showToast({ title: r.msg, icon: 'none' })
    return
  }
  refreshCart()
  uni.showToast({ title: '已加入购物车', icon: 'none' })
  if (closeSheet) detail.value = null
}

const showDetail = (g) => { detail.value = g }

const goCart = () => {
  if (!cartQty.value) {
    uni.showToast({ title: '先挑几件材料吧', icon: 'none' })
    return
  }
  uni.navigateTo({ url: '/pages/customer/mall-cart' })
}

const goOrders = () => uni.navigateTo({ url: '/pages/customer/mall-orders' })

const goBack = () => {
  const pages = getCurrentPages()
  if (pages.length <= 1) uni.redirectTo({ url: '/pages/customer/home' })
  else uni.navigateBack()
}

onReachBottom(() => {
  if (loadingMore.value || noMore.value) return
  page.value += 1
  loadList(true)
})

onShow(() => { refreshCart() })

onMounted(() => {
  refreshCart()
  loadCategories()
  loadList(false)
})

onUnmounted(() => { if (kwTimer) clearTimeout(kwTimer) })
</script>

<style scoped>
/* 全局 .page 有 16px padding，这里必须清零，否则 nav-bar 贴不到边 */
.page { padding: 0; padding-bottom: 76px; background: #F5F7FA; }

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

/* 搜索 */
.searchbar {
  display: flex; align-items: center; gap: 8px;
  background: #fff; border-radius: 12px; padding: 10px 12px; margin-bottom: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,.04);
}
.s-icon { font-size: 14px; opacity: .5; }
.s-input { flex: 1; font-size: 14px; color: #1A1F36; }
.s-clear { font-size: 14px; color: #98A1AE; padding: 0 4px; }

/* 品类 */
.catbar { white-space: nowrap; margin-bottom: 10px; }
.cat-list { display: inline-flex; gap: 8px; padding-bottom: 2px; }
.cat {
  display: inline-flex; align-items: center; gap: 4px;
  background: #fff; color: #4B5563; font-size: 13px;
  padding: 7px 13px; border-radius: 18px; white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0,0,0,.04);
}
.cat.on { background: #1E3A5F; color: #fff; font-weight: 600; }
.cat-n { font-size: 11px; opacity: .6; }

/* 商品列表 */
.plist { display: flex; flex-direction: column; gap: 10px; }
.pcard {
  display: flex; gap: 12px; background: #fff; border-radius: 14px; padding: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,.04);
}
.pimg { width: 84px; height: 84px; border-radius: 10px; overflow: hidden; flex: 0 0 84px; background: #F4F6F8; }
.pimg-img { width: 100%; height: 100%; }
.pimg-none { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.pimg-emoji { font-size: 32px; opacity: .55; }
.pimg-emoji.big { font-size: 60px; }
.pbody { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pname { font-size: 15px; font-weight: 600; color: #1A1F36; line-height: 1.3; }
.psub {
  font-size: 12px; color: #98A1AE; margin-top: 4px; line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.pfoot { display: flex; align-items: flex-end; justify-content: space-between; margin-top: auto; padding-top: 6px; }
.pprice { display: flex; align-items: baseline; color: #C0392B; }
.cny { font-size: 12px; }
.num { font-size: 19px; font-weight: 700; margin-left: 1px; }
.unit { font-size: 11px; color: #98A1AE; margin-left: 2px; }
.addbtn {
  background: #1E3A5F; color: #fff; font-size: 13px; font-weight: 600;
  padding: 7px 16px; border-radius: 16px;
}
.addbtn:active { opacity: .82; }

.more-tip, .hint-box { text-align: center; font-size: 12.5px; color: #A9B1BC; padding: 18px 0; }
.hint-box { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 60px 20px; }
.hint-emoji { font-size: 44px; opacity: .5; }
.hint-text { font-size: 14px; color: #6B7280; }
.hint-sub { font-size: 12px; color: #A9B1BC; }

/* 底部购物车条 */
.cart-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 200;
  display: flex; align-items: center; gap: 12px;
  background: #fff; padding: 10px 15px;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
  box-shadow: 0 -2px 12px rgba(0,0,0,.07);
}
.cb-left { flex: 1; display: flex; align-items: center; gap: 10px; }
.cb-icon { position: relative; font-size: 24px; }
.cb-badge {
  position: absolute; top: -6px; right: -10px; min-width: 16px; height: 16px;
  background: #EF4444; color: #fff; font-size: 10px; line-height: 16px;
  text-align: center; border-radius: 8px; padding: 0 4px;
}
.cb-amount { font-size: 17px; font-weight: 700; color: #C0392B; }
.cb-amount.dim { font-size: 13px; color: #A9B1BC; font-weight: 400; }
.cb-tip { font-size: 11px; color: #98A1AE; margin-top: 1px; }
.cb-btn {
  background: #1E3A5F; color: #fff; font-size: 15px; font-weight: 600;
  padding: 11px 28px; border-radius: 22px; letter-spacing: 1px;
}
.cb-btn.disabled { background: #C7CEDA; }
.cb-btn:active { opacity: .86; }

/* 详情弹层 */
.mask {
  position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 900;
  display: flex; align-items: flex-end;
}
.sheet {
  width: 100%; background: #fff; border-radius: 18px 18px 0 0;
  max-height: 82vh; overflow-y: auto;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}
.sheet-img { width: 100%; height: 200px; background: #F4F6F8; display: flex; align-items: center; justify-content: center; }
.sheet-img-i { width: 100%; height: 100%; }
.sheet-body { padding: 16px; }
.sheet-name { font-size: 18px; font-weight: 700; color: #1A1F36; }
.sheet-meta { font-size: 12.5px; color: #98A1AE; margin-top: 6px; }
.sheet-price { display: flex; align-items: baseline; color: #C0392B; margin-top: 12px; }
.sheet-price .num { font-size: 26px; }
.sheet-stock { font-size: 12.5px; color: #B45309; margin-top: 6px; }
.sheet-remark { font-size: 12.5px; color: #6B7280; margin-top: 10px; line-height: 1.6; background: #F8FAFC; padding: 10px; border-radius: 8px; }
.sheet-tip { font-size: 12px; color: #98A1AE; margin-top: 12px; line-height: 1.6; }
.sheet-btn {
  margin-top: 16px; background: #1E3A5F; color: #fff; text-align: center;
  font-size: 16px; font-weight: 600; padding: 14px; border-radius: 12px; letter-spacing: 1px;
}
.sheet-btn:active { opacity: .86; }
</style>
