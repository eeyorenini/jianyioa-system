<template>
  <div class="mall-page">
    <!-- 概览 -->
    <div class="stat-row">
      <div class="stat">
        <div class="s-lab">已上架商品</div>
        <div class="s-val">{{ stats.on_sale }}<i>件</i></div>
        <div class="s-sub" :class="{ warn: stats.no_image > 0 }">{{ stats.no_image }} 件缺主图</div>
      </div>
      <div class="stat">
        <div class="s-lab">待收款订单</div>
        <div class="s-val accent">{{ stats.pending_count }}<i>单</i></div>
        <div class="s-sub">合计 ¥{{ fmt(stats.pending_amount) }}</div>
      </div>
      <div class="stat">
        <div class="s-lab">已收款订单</div>
        <div class="s-val ok">{{ stats.paid_count }}<i>单</i></div>
        <div class="s-sub">合计 ¥{{ fmt(stats.paid_amount) }}</div>
      </div>
      <div class="stat">
        <div class="s-lab">收款方式</div>
        <div class="s-val small">银行转账</div>
        <div class="s-sub">无在线支付，人工核对</div>
      </div>
    </div>

    <el-tabs v-model="tab" class="mall-tabs">
      <!-- ================= 商品上架 ================= -->
      <el-tab-pane label="商品上架" name="products">
        <div class="toolbar">
          <el-input
            v-model="pq.keyword" placeholder="搜商品名 / 型号 / 品牌 / 拼音" clearable
            style="width: 300px" @keyup.enter="loadProducts" @clear="loadProducts"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-radio-group v-model="pq.on_sale" @change="reloadProducts">
            <el-radio-button label="">全部</el-radio-button>
            <el-radio-button label="1">已上架</el-radio-button>
            <el-radio-button label="0">未上架</el-radio-button>
          </el-radio-group>
          <el-button @click="loadProducts">查询</el-button>
          <span class="sp"></span>
          <el-button type="primary" @click="goMainMaterials">去主材管理上架 →</el-button>
        </div>

        <el-table :data="products" v-loading="pLoading" border stripe style="width: 100%" empty-text="没有商品">
          <el-table-column label="商品" min-width="250">
            <template #default="{ row }">
              <div class="pcell">
                <div class="pimg">
                  <el-image v-if="row.cover_image" :src="assetUrl(row.cover_image)" fit="cover" style="width:100%;height:100%" />
                  <div v-else class="pimg-none"><el-icon><Picture /></el-icon></div>
                </div>
                <div class="pinfo">
                  <div class="pname">{{ row.name }}</div>
                  <div class="psub">{{ [row.model, row.specification].filter(Boolean).join(' · ') || '—' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="品类" width="120">
            <template #default="{ row }">
              <span v-if="row.category_name" class="badge">{{ row.category_name }}</span>
              <span v-else class="dim">—</span>
            </template>
          </el-table-column>
          <el-table-column label="品牌" width="110">
            <template #default="{ row }"><span class="dim">{{ row.brand_name || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="报价" width="96" align="right">
            <template #default="{ row }">¥{{ fmt(row.quote_price) }}</template>
          </el-table-column>
          <el-table-column label="商城价" width="110" align="right">
            <template #default="{ row }">
              <b class="price">¥{{ fmt(row.price) }}</b>
              <span v-if="!row.mall_price" class="inherit">同报价</span>
            </template>
          </el-table-column>
          <el-table-column label="库存" width="86" align="center">
            <template #default="{ row }">
              <span v-if="row.mall_stock > 0">{{ row.mall_stock }}</span>
              <span v-else class="dim">不限</span>
            </template>
          </el-table-column>
          <el-table-column label="上架" width="82" align="center">
            <template #default="{ row }">
              <el-switch
                :model-value="row.mall_status === 1"
                :loading="row._saving"
                @change="(v) => toggleSale(row, v)"
              />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openProduct(row)">设置</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager">
          <span>共 {{ pTotal }} 条</span>
          <span class="sp"></span>
          <el-pagination
            v-model:current-page="pq.page" v-model:page-size="pq.page_size"
            :page-sizes="[20, 50, 100]" :total="pTotal"
            layout="sizes, prev, pager, next, jumper"
            @current-change="loadProducts" @size-change="reloadProducts"
          />
        </div>
      </el-tab-pane>

      <!-- ================= 订单 ================= -->
      <el-tab-pane label="订单" name="orders">
        <div class="toolbar">
          <el-input
            v-model="oq.keyword" placeholder="搜订单号 / 客户名 / 电话" clearable
            style="width: 280px" @keyup.enter="loadOrders" @clear="loadOrders"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-radio-group v-model="oq.status" @change="reloadOrders">
            <el-radio-button label="">全部</el-radio-button>
            <el-radio-button label="pending">待收款</el-radio-button>
            <el-radio-button label="paid">已收款</el-radio-button>
            <el-radio-button label="cancelled">已取消</el-radio-button>
          </el-radio-group>
          <el-button @click="loadOrders">查询</el-button>
        </div>

        <el-table :data="orders" v-loading="oLoading" border stripe style="width: 100%" empty-text="还没有订单">
          <el-table-column label="订单号" width="170">
            <template #default="{ row }">
              <span class="ono" @click="openOrder(row)">{{ row.order_no }}</span>
            </template>
          </el-table-column>
          <el-table-column label="客户" width="150">
            <template #default="{ row }">
              <div>{{ row.customer_name || '—' }}</div>
              <div class="psub">{{ row.phone || '' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="金额" width="120" align="right">
            <template #default="{ row }"><b class="price">¥{{ fmt(row.total_amount) }}</b></template>
          </el-table-column>
          <el-table-column label="明细" min-width="220">
            <template #default="{ row }">
              <span class="dim">{{ orderBrief(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="96" align="center">
            <template #default="{ row }">
              <span class="ost" :class="row.status">{{ statusText(row.status) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="下单时间" width="150">
            <template #default="{ row }"><span class="dim">{{ fmtTime(row.created_at) }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="150" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openOrder(row)">详情</el-button>
              <el-button
                v-if="row.status === 'pending'" link type="success" size="small"
                @click="confirmOrder(row)"
              >确认收款</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager">
          <span>共 {{ oTotal }} 条</span>
          <span class="sp"></span>
          <el-pagination
            v-model:current-page="oq.page" v-model:page-size="oq.page_size"
            :page-sizes="[20, 50, 100]" :total="oTotal"
            layout="sizes, prev, pager, next, jumper"
            @current-change="loadOrders" @size-change="reloadOrders"
          />
        </div>
      </el-tab-pane>

      <!-- ================= 收款设置 ================= -->
      <el-tab-pane label="收款设置" name="settings">
        <div class="set-wrap">
          <el-alert
            type="info" :closable="false" show-icon
            title="业主下单后只会拿到订单编号，看不到在线支付按钮"
            description="请在下方填写对公账户。业主转账时把订单编号填入备注，财务核对后到「订单」里点确认收款。"
          />
          <el-form :model="bank" label-width="110px" class="set-form">
            <el-form-item label="开户银行">
              <el-input v-model="bank.bank_name" placeholder="如 中国建设银行 深圳福田支行" />
            </el-form-item>
            <el-form-item label="户名">
              <el-input v-model="bank.account_name" placeholder="公司全称" />
            </el-form-item>
            <el-form-item label="账号">
              <el-input v-model="bank.account_no" placeholder="银行账号" />
            </el-form-item>
            <el-form-item label="温馨提示">
              <el-input
                v-model="bank.note" type="textarea" :rows="3"
                placeholder="如：转账后请联系项目经理核对，我们会在1个工作日内确认"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingBank" @click="saveBank">保存</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- ============ 商品设置弹窗 ============ -->
    <el-dialog v-model="pVisible" title="商城设置" width="560px" destroy-on-close>
      <div v-if="pForm.id" class="dlg-head">
        <div class="pimg lg">
          <el-image v-if="pForm.cover_image" :src="assetUrl(pForm.cover_image)" fit="cover" style="width:100%;height:100%" />
          <div v-else class="pimg-none"><el-icon><Picture /></el-icon></div>
        </div>
        <div>
          <div class="pname">{{ pForm.name }}</div>
          <div class="psub">{{ [pForm.category_name, pForm.brand_name, pForm.model].filter(Boolean).join(' · ') }}</div>
        </div>
      </div>
      <el-form :model="pForm" label-width="96px" class="set-form">
        <el-form-item label="上架状态">
          <el-switch v-model="pForm.mall_status" :active-value="1" :inactive-value="0" />
          <span class="hint">关掉后业主端立刻看不到</span>
        </el-form-item>
        <el-form-item label="商城价">
          <el-input-number v-model="pForm.mall_price" :min="0" :precision="2" style="width: 200px" placeholder="留空" />
          <span class="hint">留空则用报价 ¥{{ fmt(pForm.quote_price) }}</span>
        </el-form-item>
        <el-form-item label="库存">
          <el-input-number v-model="pForm.mall_stock" :min="0" style="width: 200px" />
          <span class="hint">填 0 = 不限库存</span>
        </el-form-item>
        <el-form-item label="商城编码">
          <el-input v-model="pForm.mall_sku_code" placeholder="选填，用于对接商城/报价系统" />
        </el-form-item>
        <el-form-item label="主图">
          <div class="cover-line">
            <div class="pimg lg">
              <el-image v-if="pForm.cover_image" :src="assetUrl(pForm.cover_image)" fit="cover" style="width:100%;height:100%" />
              <div v-else class="pimg-none"><el-icon><Picture /></el-icon></div>
            </div>
            <el-upload
              :show-file-list="false" action="/api/upload-image" name="file"
              :headers="uploadHeaders" accept="image/*"
              :on-success="onCoverOk" :on-error="onCoverErr"
            >
              <el-button size="small" plain>上传主图</el-button>
            </el-upload>
            <span class="hint">没主图的商品在业主端会显示占位图</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pVisible = false">取消</el-button>
        <el-button type="primary" :loading="pSaving" @click="saveProduct">保存</el-button>
      </template>
    </el-dialog>

    <!-- ============ 订单详情抽屉 ============ -->
    <el-drawer v-model="oVisible" title="订单详情" size="520px" destroy-on-close>
      <div v-if="curOrder" class="odetail">
        <div class="ono-big">{{ curOrder.order_no }}</div>
        <div class="ono-tip">业主转账备注填这个编号，财务按它核对</div>

        <div class="o-meta">
          <div><span>状态</span><b class="ost" :class="curOrder.status">{{ statusText(curOrder.status) }}</b></div>
          <div><span>客户</span><b>{{ curOrder.customer_name || '—' }}</b></div>
          <div><span>电话</span><b>{{ curOrder.phone || '—' }}</b></div>
          <div><span>下单</span><b>{{ fmtTime(curOrder.created_at) }}</b></div>
          <div v-if="curOrder.paid_at"><span>收款</span><b>{{ fmtTime(curOrder.paid_at) }}</b></div>
          <div v-if="curOrder.remark"><span>备注</span><b>{{ curOrder.remark }}</b></div>
        </div>

        <div class="o-items">
          <div v-for="(it, i) in curOrder.items || []" :key="i" class="o-item">
            <div class="pimg">
              <el-image v-if="it.image" :src="assetUrl(it.image)" fit="cover" style="width:100%;height:100%" />
              <div v-else class="pimg-none"><el-icon><Picture /></el-icon></div>
            </div>
            <div class="oi-main">
              <div class="pname">{{ it.name }}</div>
              <div class="psub">{{ [it.spec, it.brand].filter(Boolean).join(' · ') || '—' }}</div>
            </div>
            <div class="oi-num">
              <div>¥{{ fmt(it.unit_price) }} × {{ it.qty }}{{ it.unit }}</div>
              <div class="sub">¥{{ fmt(it.subtotal) }}</div>
            </div>
          </div>
        </div>

        <div class="o-total">
          <span>共 {{ curOrder.total_qty }} 件</span>
          <b>合计 ¥{{ fmt(curOrder.total_amount) }}</b>
        </div>

        <div class="o-actions">
          <el-button v-if="curOrder.status === 'pending'" type="success" @click="confirmOrder(curOrder)">确认收款</el-button>
          <el-button v-if="curOrder.status === 'pending'" @click="cancelOrder(curOrder)">取消订单</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const tab = ref('products')

const fmt = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
const fmtTime = (s) => {
  if (!s) return '—'
  // 后端 dateStrings:true，库里是 UTC 字符串，补 Z 再本地化
  const d = new Date(String(s).replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'))
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 16)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const assetUrl = (p) => {
  if (!p) return ''
  if (/^https?:/i.test(p)) return p
  return p.startsWith('/') ? p : '/' + p
}
const statusText = (s) => ({ pending: '待收款', paid: '已收款', cancelled: '已取消' }[s] || s)
const orderBrief = (o) => {
  const items = o.items || []
  if (!items.length) return '—'
  const head = items.slice(0, 2).map((i) => `${i.name}×${i.qty}`).join('、')
  return items.length > 2 ? `${head} 等 ${items.length} 种` : head
}

/* ---------------- 概览 ---------------- */
const stats = reactive({
  on_sale: 0, no_image: 0, no_price: 0,
  pending_count: 0, pending_amount: 0, paid_count: 0, paid_amount: 0
})
const loadStats = async () => {
  try {
    const { data } = await axios.get('/api/mall/admin/stats')
    Object.assign(stats, data)
  } catch (e) { /* 概览失败不影响主流程 */ }
}

/* ---------------- 商品 ---------------- */
const products = ref([])
const pTotal = ref(0)
const pLoading = ref(false)
const pq = reactive({ keyword: '', on_sale: '', page: 1, page_size: 20 })

const loadProducts = async () => {
  pLoading.value = true
  try {
    const { data } = await axios.get('/api/mall/admin/products', { params: pq })
    products.value = (data.list || []).map((r) => Object.assign({}, r, { _saving: false }))
    pTotal.value = data.total || 0
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '加载失败')
    products.value = []
    pTotal.value = 0
  } finally {
    pLoading.value = false
  }
}
const reloadProducts = () => { pq.page = 1; loadProducts() }

const toggleSale = async (row, v) => {
  row._saving = true
  try {
    await axios.put(`/api/mall/admin/products/${row.id}`, { mall_status: v ? 1 : 0 })
    row.mall_status = v ? 1 : 0
    ElMessage.success(v ? '已上架' : '已下架')
    loadStats()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '操作失败')
  } finally {
    row._saving = false
  }
}

/* ---------------- 商品设置弹窗 ---------------- */
const pVisible = ref(false)
const pSaving = ref(false)
const pForm = reactive({
  id: null, name: '', category_name: '', brand_name: '', model: '',
  cover_image: '', quote_price: 0,
  mall_status: 0, mall_price: null, mall_stock: 0, mall_sku_code: ''
})

const openProduct = (row) => {
  Object.assign(pForm, {
    id: row.id,
    name: row.name,
    category_name: row.category_name || '',
    brand_name: row.brand_name || '',
    model: row.model || '',
    cover_image: row.cover_image || '',
    quote_price: row.quote_price,
    mall_status: row.mall_status === 1 ? 1 : 0,
    mall_price: row.mall_price == null || row.mall_price === '' ? null : Number(row.mall_price),
    mall_stock: Number(row.mall_stock) || 0,
    mall_sku_code: row.mall_sku_code || ''
  })
  pVisible.value = true
}

const saveProduct = async () => {
  pSaving.value = true
  try {
    await axios.put(`/api/mall/admin/products/${pForm.id}`, {
      mall_status: pForm.mall_status,
      mall_price: pForm.mall_price,
      mall_stock: pForm.mall_stock,
      mall_sku_code: pForm.mall_sku_code
    })
    // 主图单独端点
    if (pForm.cover_image !== undefined) {
      await axios.put(`/api/main-materials/${pForm.id}/cover`, { cover_image: pForm.cover_image })
    }
    ElMessage.success('已保存')
    pVisible.value = false
    loadProducts()
    loadStats()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  } finally {
    pSaving.value = false
  }
}

/* el-upload 不走 axios 拦截器，权限头要自己带 */
const uploadHeaders = computed(() => {
  const h = {}
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    if (u && u.id) h['x-user-id'] = String(u.id)
    const role = u && (u.role_code || u.role_name)
    if (role) h['x-user-role'] = role
  } catch (e) { /* 未登录留空，后端 401 兜底 */ }
  return h
})
const onCoverOk = (res) => {
  pForm.cover_image = (res && res.url) || ''
  ElMessage.success('主图已上传，记得点保存')
}
const onCoverErr = () => ElMessage.error('上传失败')

/* ---------------- 订单 ---------------- */
const orders = ref([])
const oTotal = ref(0)
const oLoading = ref(false)
const oq = reactive({ keyword: '', status: '', page: 1, page_size: 20 })

const loadOrders = async () => {
  oLoading.value = true
  try {
    const { data } = await axios.get('/api/mall/admin/orders', { params: oq })
    orders.value = data.list || []
    oTotal.value = data.total || 0
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '加载失败')
    orders.value = []
    oTotal.value = 0
  } finally {
    oLoading.value = false
  }
}
const reloadOrders = () => { oq.page = 1; loadOrders() }

const oVisible = ref(false)
const curOrder = ref(null)
const openOrder = (row) => { curOrder.value = row; oVisible.value = true }

const confirmOrder = async (row) => {
  try {
    await ElMessageBox.confirm(`确认已收到「${row.order_no}」的 ¥${fmt(row.total_amount)} 转账？`, '确认收款', { type: 'warning' })
  } catch (e) { return }
  try {
    await axios.put(`/api/mall/admin/orders/${row.id}`, { action: 'confirm' })
    ElMessage.success('已确认收款')
    oVisible.value = false
    loadOrders()
    loadStats()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '操作失败')
  }
}

const cancelOrder = async (row) => {
  try {
    await ElMessageBox.confirm(`确认取消订单「${row.order_no}」？`, '取消订单', { type: 'warning' })
  } catch (e) { return }
  try {
    await axios.put(`/api/mall/admin/orders/${row.id}`, { action: 'cancel' })
    ElMessage.success('已取消')
    oVisible.value = false
    loadOrders()
    loadStats()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '操作失败')
  }
}

/* ---------------- 收款设置 ---------------- */
const bank = reactive({ bank_name: '', account_name: '', account_no: '', note: '' })
const savingBank = ref(false)
const loadBank = async () => {
  try {
    const { data } = await axios.get('/api/mall/admin/settings')
    Object.assign(bank, data)
  } catch (e) { /* 忽略 */ }
}
const saveBank = async () => {
  savingBank.value = true
  try {
    await axios.put('/api/mall/admin/settings', bank)
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  } finally {
    savingBank.value = false
  }
}

const goMainMaterials = () => router.push('/main-materials')

onMounted(async () => {
  await Promise.all([loadStats(), loadProducts(), loadOrders(), loadBank()])
})
</script>

<style scoped>
.mall-page { color: #1F2937; }

/* ---------- 概览 ---------- */
.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
.stat { background: #fff; border: 1px solid #EDF0F4; border-radius: 10px; padding: 14px 16px; }
.s-lab { font-size: 12.5px; color: #8A93A0; margin-bottom: 6px; }
.s-val { font-size: 24px; font-weight: 700; color: #1E3A5F; line-height: 1.2; }
.s-val i { font-size: 12px; font-weight: 400; color: #98A1AE; margin-left: 4px; font-style: normal; }
.s-val.accent { color: #C77B2E; }
.s-val.ok { color: #1E8E5A; }
.s-val.small { font-size: 17px; }
.s-sub { font-size: 12px; color: #98A1AE; margin-top: 6px; }
.s-sub.warn { color: #C0392B; }

/* ---------- 工具条 ---------- */
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.toolbar .sp { flex: 1; }

/* ---------- 商品单元格 ---------- */
.pcell { display: flex; align-items: center; gap: 10px; }
.pimg { width: 40px; height: 40px; border-radius: 7px; overflow: hidden; flex: 0 0 40px; border: 1px solid #F2F4F7; }
.pimg.lg { width: 56px; height: 56px; flex: 0 0 56px; }
.pimg-none { width: 100%; height: 100%; display: grid; place-items: center; color: #C4CBD4; background: #F7F9FB; }
.pimg-none .el-icon { font-size: 16px; }
.pinfo { min-width: 0; }
.pname { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.psub { font-size: 11.5px; color: #98A1AE; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.price { color: #1E3A5F; font-variant-numeric: tabular-nums; }
.inherit { display: block; font-size: 10.5px; color: #A9B1BC; }
.badge { font-size: 11px; padding: 1px 7px; border-radius: 4px; background: #EEF3FA; color: #1E3A5F; font-weight: 500; }
.dim { color: #98A1AE; }

/* ---------- 订单 ---------- */
.ono { color: #2F6FEB; font-weight: 600; cursor: pointer; font-variant-numeric: tabular-nums; }
.ono:hover { text-decoration: underline; }
.ost { font-size: 11.5px; padding: 2px 8px; border-radius: 5px; font-weight: 500; }
.ost.pending { background: #FDF3E7; color: #B45309; }
.ost.paid { background: #E9F7F0; color: #1E8E5A; }
.ost.cancelled { background: #F3F4F6; color: #8A93A0; }

.pager { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 13px; color: #6B7280; }
.pager .sp { flex: 1; }

/* ---------- 订单详情 ---------- */
.odetail { padding: 0 4px; }
.ono-big {
  font-size: 26px; font-weight: 700; color: #1E3A5F; letter-spacing: 1px;
  font-variant-numeric: tabular-nums; text-align: center; margin: 6px 0 4px;
}
.ono-tip { font-size: 12px; color: #98A1AE; text-align: center; margin-bottom: 16px; }
.o-meta { background: #F8FAFC; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; }
.o-meta > div { display: flex; gap: 10px; font-size: 13px; padding: 4px 0; }
.o-meta span { color: #98A1AE; flex: 0 0 48px; }
.o-meta b { color: #1F2937; font-weight: 500; }
.o-items { border-top: 1px solid #F0F2F5; }
.o-item { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid #F5F7FA; }
.oi-main { flex: 1; min-width: 0; }
.oi-num { text-align: right; font-size: 12.5px; color: #6B7280; }
.oi-num .sub { color: #1E3A5F; font-weight: 600; font-size: 14px; margin-top: 2px; }
.o-total { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; font-size: 13px; color: #6B7280; }
.o-total b { font-size: 19px; color: #C77B2E; }
.o-actions { display: flex; gap: 10px; padding-top: 6px; }

/* ---------- 设置 ---------- */
.set-wrap { max-width: 720px; }
.set-form { margin-top: 16px; }
.hint { font-size: 12px; color: #98A1AE; margin-left: 10px; }
.dlg-head { display: flex; align-items: center; gap: 12px; padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid #F0F2F5; }
.cover-line { display: flex; align-items: center; gap: 12px; }
</style>
