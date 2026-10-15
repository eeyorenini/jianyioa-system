<template>
  <div class="dashboard">
    <!-- 顶部欢迎条（hero 区） -->
    <div class="hero-bar">
      <div class="hero-left">
        <h2 class="hero-title">📊 数据看板</h2>
        <p class="hero-sub">{{ heroSubText }}</p>
      </div>
      <div class="hero-right" v-if="lastUpdateTime">
        <span class="hero-time-label">最后更新</span>
        <span class="hero-time">{{ lastUpdateTime }}</span>
        <el-button type="primary" link size="small" @click="loadData">↻ 刷新</el-button>
      </div>
    </div>

    <!-- 4 个核心业务卡片（hero 风格） -->
    <el-row :gutter="16" class="stat-row">
      <el-col :xs="12" :sm="12" :md="6">
        <div class="hero-card hero-blue" @click="$router.push('/customers')">
          <div class="hero-icon">
            <el-icon><User /></el-icon>
          </div>
          <div class="hero-info">
            <div class="hero-label">客户总数</div>
            <div class="hero-value">{{ stats.customerCount }}</div>
            <div class="hero-foot">本月新增 {{ stats.customerThisMonth }}</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <div class="hero-card hero-green" @click="$router.push('/contracts')">
          <div class="hero-icon">
            <el-icon><Document /></el-icon>
          </div>
          <div class="hero-info">
            <div class="hero-label">已签合同</div>
            <div class="hero-value">{{ stats.contractCount }}</div>
            <div class="hero-foot">总额 ¥{{ formatNumber(stats.contractTotalAmount) }}</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <div class="hero-card hero-orange" @click="$router.push('/projects')">
          <div class="hero-icon">
            <el-icon><FolderOpened /></el-icon>
          </div>
          <div class="hero-info">
            <div class="hero-label">进行中项目</div>
            <div class="hero-value">{{ stats.projectCount }}</div>
            <div class="hero-foot">合计 {{ stats.projectTotal }} 个</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <div class="hero-card hero-red" @click="$router.push('/quotes')">
          <div class="hero-icon">
            <el-icon><Warning /></el-icon>
          </div>
          <div class="hero-info">
            <div class="hero-label">待确认报价</div>
            <div class="hero-value">{{ stats.pendingQuote }}</div>
            <div class="hero-foot">需尽快处理</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 财务概览（核心区） + 月度趋势 mini chart -->
    <el-row :gutter="16" class="row-finance">
      <!-- 左侧：财务 8 项关键指标 -->
      <el-col :xs="24" :md="14">
        <div class="finance-card">
          <div class="card-header">
            <div>
              <div class="card-title">💰 公司财务概览 <span class="version-tag">v2.3.6 真实收支</span></div>
              <div class="card-sub">排除合同增减项占位（合同应收/增项/减项不参与收支计算）</div>
            </div>
            <el-button type="primary" size="small" @click="$router.push('/finance-projects')">
              查看项目财务 →
            </el-button>
          </div>

          <!-- 利润 hero 大数字 -->
          <div class="profit-hero" :class="stats.profit >= 0 ? 'profit-pos' : 'profit-neg'">
            <div class="profit-hero-label">{{ stats.profit >= 0 ? '📈 当前利润' : '📉 当前亏损' }}</div>
            <div class="profit-hero-value">
              <span class="profit-hero-sign">{{ stats.profit >= 0 ? '+' : '-' }}</span>
              ¥{{ formatNumber(Math.abs(stats.profit || 0)) }}
            </div>
            <div class="profit-hero-sub">实收 {{ formatNumber(stats.collected) }} − 已支 {{ formatNumber(stats.expensed) }}</div>
          </div>

          <!-- 6 项关键指标 grid -->
          <div class="finance-grid">
            <div class="fin-cell">
              <div class="fin-label">合同营收</div>
              <div class="fin-value primary">¥{{ formatNumber(stats.contract_amount) }}</div>
              <div class="fin-sub">已审核合同</div>
            </div>
            <div class="fin-cell">
              <div class="fin-label">应收</div>
              <div class="fin-value primary">¥{{ formatNumber(stats.receivable) }}</div>
              <div class="fin-sub">合同 + 增 - 减</div>
            </div>
            <div class="fin-cell">
              <div class="fin-label">已收（实收）</div>
              <div class="fin-value income">¥{{ formatNumber(stats.collected) }}</div>
              <div class="fin-sub">催收已确认</div>
            </div>
            <div class="fin-cell">
              <div class="fin-label">未收</div>
              <div class="fin-value" :class="stats.unpaid > 0 ? 'expense' : 'income'">¥{{ formatNumber(stats.unpaid) }}</div>
              <div class="fin-sub">应收 - 实收</div>
            </div>
            <div class="fin-cell">
              <div class="fin-label">已支出</div>
              <div class="fin-value expense">¥{{ formatNumber(stats.expensed) }}</div>
              <div class="fin-sub">派工 / 采购已支付</div>
            </div>
            <div class="fin-cell">
              <div class="fin-label">增减项净额</div>
              <div class="fin-value" :class="finClass(stats.change_net)">
                {{ stats.change_net > 0 ? '+' : stats.change_net < 0 ? '-' : '' }}¥{{ formatNumber(Math.abs(stats.change_net || 0)) }}
              </div>
              <div class="fin-sub">增 {{ formatNumber(stats.increase_total) }} − 减 {{ formatNumber(stats.decrease_total) }}</div>
            </div>
          </div>

          <!-- 待确认支出 / 待确认催收（条件显示） -->
          <div class="finance-pending" v-if="stats.pending_expense || stats.unconfirmed">
            <div class="pending-item" v-if="stats.pending_expense">
              <span class="dot warn"></span>
              <span class="pending-label">待确认支出</span>
              <span class="pending-value">¥{{ formatNumber(stats.pending_expense) }}</span>
              <span class="pending-tag">派工待财务受理</span>
            </div>
            <div class="pending-item" v-if="stats.unconfirmed">
              <span class="dot info"></span>
              <span class="pending-label">待确认催收</span>
              <span class="pending-value">¥{{ formatNumber(stats.unconfirmed) }}</span>
              <span class="pending-tag">催收待确认</span>
            </div>
          </div>
        </div>
      </el-col>

      <!-- 右侧：月度趋势 mini chart + 库存预警 -->
      <el-col :xs="24" :md="10">
        <!-- 月度趋势 -->
        <div class="trend-card">
          <div class="card-header">
            <div class="card-title">📈 月度真实收支</div>
            <div class="card-sub">{{ trendSubText }}</div>
          </div>
          <div v-if="monthlyTrend.length === 0" class="trend-empty">
            <div class="empty-icon">📊</div>
            <div class="empty-text">暂无月度数据</div>
            <div class="empty-tip">派工 / 催收录入后会自动生成</div>
          </div>
          <div v-else class="trend-chart">
            <!-- SVG 折线图 -->
            <svg :viewBox="`0 0 ${chartW} ${chartH}`" class="trend-svg" preserveAspectRatio="none">
              <!-- 网格线 -->
              <line v-for="i in 4" :key="'g'+i"
                :x1="0" :x2="chartW"
                :y1="chartH * i / 4" :y2="chartH * i / 4"
                stroke="#f0f0f0" stroke-width="1" stroke-dasharray="3 3" />
              <!-- 收入折线（绿色） -->
              <polyline v-if="incomePoints.length > 1"
                :points="incomePoints"
                fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              <!-- 收入点 -->
              <circle v-for="(p, i) in incomeCircles" :key="'ic'+i"
                :cx="p.x" :cy="p.y" r="3" fill="#10B981" />
              <!-- 支出折线（红色） -->
              <polyline v-if="expensePoints.length > 1"
                :points="expensePoints"
                fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                stroke-dasharray="4 2" />
              <!-- 支出点 -->
              <circle v-for="(p, i) in expenseCircles" :key="'ec'+i"
                :cx="p.x" :cy="p.y" r="3" fill="#EF4444" />
            </svg>
            <!-- X 轴标签 -->
            <div class="trend-axis">
              <span v-for="item in monthlyTrend" :key="'x'+item.month" class="axis-label">
                {{ formatMonthShort(item.month) }}
              </span>
            </div>
            <!-- 图例 -->
            <div class="trend-legend">
              <span class="legend-item"><span class="dot income"></span>实收</span>
              <span class="legend-item"><span class="dot expense"></span>实支</span>
            </div>
          </div>
        </div>

        <!-- 库存预警（环形进度） -->
        <div class="warn-card">
          <div class="card-header">
            <div class="card-title">📦 库存预警</div>
            <el-button type="warning" size="small" link @click="$router.push('/warehouse')">查看 →</el-button>
          </div>
          <div class="warn-ring-wrap">
            <svg viewBox="0 0 120 120" class="warn-ring">
              <circle cx="60" cy="60" r="50" fill="none" stroke="#f0f0f0" stroke-width="10" />
              <circle cx="60" cy="60" r="50" fill="none"
                :stroke="stats.lowStock > 5 ? '#EF4444' : stats.lowStock > 0 ? '#F59E0B' : '#10B981'"
                stroke-width="10" stroke-linecap="round"
                :stroke-dasharray="`${warnDashLen} 314`"
                transform="rotate(-90 60 60)" />
              <text x="60" y="60" text-anchor="middle" dominant-baseline="central"
                font-size="28" font-weight="700"
                :fill="stats.lowStock > 5 ? '#EF4444' : stats.lowStock > 0 ? '#F59E0B' : '#10B981'">
                {{ stats.lowStock }}
              </text>
              <text x="60" y="82" text-anchor="middle" font-size="11" fill="#909399">
                库存不足
              </text>
            </svg>
            <div class="warn-info">
              <div class="warn-info-title">{{ warnTitleText }}</div>
              <div class="warn-info-sub">点击右上"查看"进入仓库模块</div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 底部：最近项目 + 最近报价 -->
    <el-row :gutter="16" class="row-bottom">
      <el-col :xs="24" :md="12">
        <div class="table-card">
          <div class="card-header">
            <div class="card-title">🏠 最近项目</div>
            <el-button type="primary" link size="small" @click="$router.push('/projects')">查看全部 →</el-button>
          </div>
          <el-table :data="recentProjects" style="width: 100%" :empty-text="'暂无项目数据'" stripe>
            <el-table-column prop="name" label="项目名称" min-width="160">
              <template #default="scope">
                <span class="table-name">📁 {{ scope.row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="customer" label="客户" min-width="100">
              <template #default="scope">
                <span class="table-customer">👤 {{ scope.row.customer }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="progress" label="进度" width="140">
              <template #default="scope">
                <el-progress :percentage="scope.row.progress || 0"
                  :stroke-width="8"
                  :color="progressColor(scope.row.progress)" />
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="scope">
                <el-tag :type="statusTagType(scope.row.status)" size="small" effect="light">
                  {{ scope.row.status }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      <el-col :xs="24" :md="12">
        <div class="table-card">
          <div class="card-header">
            <div class="card-title">💵 最近报价</div>
            <el-button type="primary" link size="small" @click="$router.push('/quotes')">查看全部 →</el-button>
          </div>
          <el-table :data="recentQuotes" style="width: 100%" :empty-text="'暂无报价数据'" stripe>
            <el-table-column prop="customer_name" label="客户" min-width="100">
              <template #default="scope">
                <span class="table-customer">👤 {{ scope.row.customer_name }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="project_name" label="项目" min-width="160">
              <template #default="scope">
                <span class="table-name">📁 {{ scope.row.project_name }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="total_amount" label="金额" width="120" align="right">
              <template #default="scope">
                <span class="amount">¥{{ formatNumber(scope.row.total_amount) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="scope">
                <el-tag :type="statusTagType(scope.row.status)" size="small" effect="light">
                  {{ scope.row.status }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'

const stats = ref({
  customerCount: 0, customerThisMonth: 0,
  contractCount: 0, contractTotalAmount: 0,
  projectCount: 0, projectTotal: 0,
  pendingQuote: 0, lowStock: 0,
  // v2.3.6 hotfix（10-15）: 财务卡片按真实收支口径（排除增减项占位）
  contract_amount: 0, change_net: 0, increase_total: 0, decrease_total: 0,
  receivable: 0, collected: 0, unpaid: 0, unconfirmed: 0,
  expensed: 0, pending_expense: 0, profit: 0,
})
const recentProjects = ref([])
const recentQuotes = ref([])
const monthlyTrend = ref([])
const lastUpdateTime = ref('')

const formatNumber = (num) => {
  return num ? Number(num).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00'
}

const finClass = (n) => n > 0 ? 'income' : n < 0 ? 'expense' : ''
const formatMonthShort = (m) => {
  if (!m) return ''
  const p = m.split('-')
  return p.length === 2 ? `${parseInt(p[1])}月` : m
}

const progressColor = (p) => {
  if (!p) return '#909399'
  if (p >= 80) return '#10B981'
  if (p >= 50) return '#409EFF'
  if (p >= 20) return '#F59E0B'
  return '#EF4444'
}
const statusTagType = (s) => {
  const done = ['已完成', '已完工', '已确认', '已签订', '已竣工']
  return done.includes(s) ? 'success' : 'primary'
}

// ====== SVG 月度趋势图表 ======
const chartW = 600
const chartH = 180
const chartPadX = 30
const chartPadY = 20

const trendSubText = computed(() => {
  if (!monthlyTrend.value.length) return '——'
  const last = monthlyTrend.value[monthlyTrend.value.length - 1]
  return `${last.month} 实收 ¥${formatNumber(last.income)} | 实支 ¥${formatNumber(last.expense)}`
})

const heroSubText = computed(() => {
  const d = new Date()
  const h = d.getHours()
  const greet = h < 12 ? '上午好' : h < 18 ? '下午好' : '晚上好'
  return `${greet}，欢迎回来。当前共 ${stats.value.projectCount} 个项目进行中。`
})

const warnTitleText = computed(() => {
  const n = stats.value.lowStock || 0
  if (n === 0) return '🎉 库存充足，无需补货'
  if (n <= 3) return `⚠️ ${n} 项物料库存偏低，建议尽快补货`
  if (n <= 5) return `🟠 ${n} 项物料库存预警，需安排采购`
  return `🔴 ${n} 项物料严重不足，请立即处理`
})

const warnDashLen = computed(() => {
  // 假设总量 20 项（无总数时按比例），半径 50 → 周长 2πr ≈ 314
  const total = Math.max(stats.value.lowStock || 0, 20)
  const ratio = Math.min(stats.value.lowStock || 0, total) / total
  return Math.round(314 * ratio)
})

const _toPoints = (key) => {
  const data = monthlyTrend.value
  if (!data.length) return { line: '', circles: [] }
  const max = Math.max(...data.map(d => Math.max(Number(d.income || 0), Number(d.expense || 0))), 1)
  const xStep = data.length > 1 ? (chartW - chartPadX * 2) / (data.length - 1) : 0
  const pts = data.map((d, i) => {
    const x = chartPadX + i * xStep
    const y = chartH - chartPadY - ((chartH - chartPadY * 2) * (Number(d[key] || 0) / max))
    return { x, y }
  })
  return {
    line: pts.map(p => `${p.x},${p.y}`).join(' '),
    circles: pts,
  }
}
const incomePoints = computed(() => _toPoints('income').line)
const expensePoints = computed(() => _toPoints('expense').line)
const incomeCircles = computed(() => _toPoints('income').circles)
const expenseCircles = computed(() => _toPoints('expense').circles)

const loadData = async () => {
  try {
    // v2.3.6: 财务部分走新接口 /api/finance/dashboard（替代死的 /api/dashboard/stats）
    const [dashRes, finRes, projectsRes, quotesRes] = await Promise.all([
      axios.get('/api/dashboard/stats').catch(() => ({ data: {} })),
      axios.get('/api/finance/dashboard').catch(() => ({ data: { data: {} } })),
      axios.get('/api/projects'),
      axios.get('/api/quotes')
    ])
    const finData = (finRes.data && finRes.data.data) || {}
    stats.value = {
      customerCount: dashRes.data.customerCount || 0,
      customerThisMonth: dashRes.data.customerThisMonth || 0,
      contractCount: dashRes.data.contractCount || 0,
      contractTotalAmount: dashRes.data.contractTotalAmount || 0,
      projectCount: dashRes.data.projectCount || 0,
      projectTotal: dashRes.data.projectTotal || 0,
      pendingQuote: dashRes.data.pendingQuote || 0,
      lowStock: dashRes.data.lowStock || 0,
      // v2.3.6 hotfix（10-15）: 财务卡片按真实收支口径
      contract_amount: finData.contract_amount || 0,
      change_net: finData.change_net || 0,
      increase_total: finData.increase_total || 0,
      decrease_total: finData.decrease_total || 0,
      receivable: finData.receivable || 0,
      collected: finData.collected || 0,
      unpaid: finData.unpaid || 0,
      unconfirmed: finData.unconfirmed || 0,
      expensed: finData.expensed || 0,
      pending_expense: finData.pending_expense || 0,
      profit: finData.profit || 0,
    }
    recentProjects.value = (projectsRes.data || []).slice(0, 5)
    recentQuotes.value = (quotesRes.data || []).slice(0, 5)
    monthlyTrend.value = finData.monthly_trend || []
    lastUpdateTime.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (error) {
    console.error('加载数据失败:', error)
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.dashboard {
  padding: 20px 24px 40px;
  background: linear-gradient(180deg, #f5f7fa 0%, #fafbfc 100%);
  min-height: 100vh;
}

/* ===== Hero 顶部条 ===== */
.hero-bar {
  display: flex; justify-content: space-between; align-items: flex-end;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e8eaec;
}
.hero-title { font-size: 24px; font-weight: 700; color: #1E3A5F; margin: 0; }
.hero-sub { font-size: 13px; color: #909399; margin: 6px 0 0; }
.hero-right { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #909399; }
.hero-time { color: #303133; font-weight: 500; }

/* ===== 4 张 hero 卡片 ===== */
.stat-row { margin-bottom: 16px; }
.hero-card {
  display: flex; align-items: center; gap: 16px;
  padding: 20px; border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.25s ease;
  cursor: pointer;
  border: 1px solid transparent;
  position: relative;
  overflow: hidden;
}
.hero-card::before {
  content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%;
}
.hero-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
.hero-card.hero-blue::before { background: linear-gradient(180deg, #409EFF, #66b1ff); }
.hero-card.hero-green::before { background: linear-gradient(180deg, #67C23A, #85ce61); }
.hero-card.hero-orange::before { background: linear-gradient(180deg, #E6A23C, #ebb563); }
.hero-card.hero-red::before { background: linear-gradient(180deg, #F56C6C, #f89898); }

.hero-icon {
  width: 56px; height: 56px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 28px;
  flex-shrink: 0;
}
.hero-card.hero-blue .hero-icon { background: linear-gradient(135deg, #409EFF, #66b1ff); }
.hero-card.hero-green .hero-icon { background: linear-gradient(135deg, #67C23A, #85ce61); }
.hero-card.hero-orange .hero-icon { background: linear-gradient(135deg, #E6A23C, #ebb563); }
.hero-card.hero-red .hero-icon { background: linear-gradient(135deg, #F56C6C, #f89898); }

.hero-info { flex: 1; min-width: 0; }
.hero-label { font-size: 13px; color: #909399; margin-bottom: 4px; }
.hero-value { font-size: 28px; font-weight: 700; color: #303133; line-height: 1.1; }
.hero-foot { font-size: 12px; color: #909399; margin-top: 4px; }

/* ===== 中段布局 ===== */
.row-finance { margin-bottom: 16px; }
.row-bottom { margin-top: 16px; }

/* 通用 card 头 */
.card-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 16px;
}
.card-title { font-size: 16px; font-weight: 600; color: #303133; }
.card-sub { font-size: 12px; color: #909399; margin-top: 4px; }
.version-tag {
  display: inline-block; margin-left: 8px;
  padding: 2px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 500;
  background: #ecf5ff; color: #409EFF;
}

/* ===== 财务概览卡片 ===== */
.finance-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  height: 100%;
}
.profit-hero {
  margin-bottom: 20px;
  padding: 20px 24px;
  border-radius: 10px;
  position: relative;
  overflow: hidden;
}
.profit-hero::before {
  content: ''; position: absolute; top: -50%; right: -10%; width: 200px; height: 200px;
  border-radius: 50%; opacity: 0.1;
}
.profit-hero.profit-pos {
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  color: #047857;
}
.profit-hero.profit-pos::before { background: #10B981; }
.profit-hero.profit-neg {
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
  color: #b91c1c;
}
.profit-hero.profit-neg::before { background: #EF4444; }
.profit-hero-label { font-size: 13px; opacity: 0.8; }
.profit-hero-value { font-size: 36px; font-weight: 800; margin: 6px 0; letter-spacing: -1px; }
.profit-hero-sign { font-size: 22px; font-weight: 600; margin-right: 4px; }
.profit-hero-sub { font-size: 12px; opacity: 0.7; }

.finance-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.fin-cell {
  padding: 14px 16px;
  background: #f8fafc;
  border-radius: 8px;
  border-left: 3px solid #e5e7eb;
  transition: all 0.2s;
}
.fin-cell:hover { background: #f1f5f9; }
.fin-label { font-size: 12px; color: #606266; margin-bottom: 6px; }
.fin-value {
  font-size: 20px; font-weight: 700; color: #303133;
  letter-spacing: -0.5px;
}
.fin-value.income { color: #10B981; }
.fin-value.expense { color: #EF4444; }
.fin-value.primary { color: #409EFF; }
.fin-sub { font-size: 11px; color: #909399; margin-top: 4px; }

.finance-pending {
  margin-top: 14px;
  padding: 12px 14px;
  background: #fffbeb;
  border-radius: 8px;
  display: flex; flex-direction: column; gap: 8px;
}
.pending-item {
  display: flex; align-items: center; gap: 10px;
  font-size: 13px;
}
.pending-item .dot {
  width: 8px; height: 8px; border-radius: 50%;
  display: inline-block;
}
.pending-item .dot.warn { background: #F59E0B; }
.pending-item .dot.info { background: #409EFF; }
.pending-label { color: #606266; flex: 1; }
.pending-value { font-weight: 700; color: #303133; }
.pending-tag { font-size: 11px; color: #909399; padding: 2px 8px; background: #fff; border-radius: 4px; }

/* ===== 月度趋势卡 ===== */
.trend-card, .warn-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  margin-bottom: 12px;
}
.trend-chart { padding-top: 8px; }
.trend-svg { width: 100%; height: 160px; display: block; }
.trend-axis {
  display: flex; justify-content: space-between;
  padding: 6px 30px 0; font-size: 11px; color: #909399;
}
.trend-legend {
  display: flex; justify-content: center; gap: 24px;
  margin-top: 12px; font-size: 12px; color: #606266;
}
.trend-legend .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.trend-legend .dot.income { background: #10B981; }
.trend-legend .dot.expense { background: #EF4444; }

.trend-empty {
  text-align: center; padding: 40px 0; color: #909399;
}
.trend-empty .empty-icon { font-size: 48px; opacity: 0.4; }
.trend-empty .empty-text { font-size: 14px; margin-top: 8px; }
.trend-empty .empty-tip { font-size: 12px; margin-top: 4px; opacity: 0.7; }

/* ===== 库存预警 ===== */
.warn-ring-wrap { display: flex; align-items: center; gap: 20px; padding: 8px 0; }
.warn-ring { width: 120px; height: 120px; flex-shrink: 0; }
.warn-info { flex: 1; }
.warn-info-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 6px; }
.warn-info-sub { font-size: 12px; color: #909399; }

/* ===== 底部表格卡 ===== */
.table-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.table-name { font-size: 13px; color: #303133; font-weight: 500; }
.table-customer { font-size: 12px; color: #606266; }
.amount { font-weight: 600; color: #409EFF; font-family: 'SF Mono', Menlo, monospace; }

/* ===== 响应式 ===== */
@media (max-width: 768px) {
  .dashboard { padding: 12px; }
  .hero-bar { flex-direction: column; align-items: flex-start; gap: 8px; }
  .finance-grid { grid-template-columns: repeat(2, 1fr); }
  .hero-value { font-size: 22px; }
  .profit-hero-value { font-size: 28px; }
}
</style>
