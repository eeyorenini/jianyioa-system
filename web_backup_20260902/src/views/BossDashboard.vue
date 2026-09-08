<template>
  <div class="boss-dashboard">
    <h2>📊 Boss经营看板</h2>
    
    <!-- 核心指标卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card customer-card">
          <div class="stat-icon">👥</div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.customer.total }}</div>
            <div class="stat-label">客户总数</div>
            <div class="stat-sub">今日+{{ stats.customer.today }} | 本月+{{ stats.customer.thisMonth }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card contract-card">
          <div class="stat-icon">📄</div>
          <div class="stat-content">
            <div class="stat-value">¥{{ formatMoney(stats.contract.totalAmount) }}</div>
            <div class="stat-label">合同总金额</div>
            <div class="stat-sub">已签: {{ stats.contract.signed }} 单</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card project-card">
          <div class="stat-icon">🏠</div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.project.active }}</div>
            <div class="stat-label">进行中项目</div>
            <div class="stat-sub">完工: {{ stats.project.finished }} | 总计: {{ stats.project.total }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card finance-card">
          <div class="stat-icon">💰</div>
          <div class="stat-content">
            <div class="stat-value" :class="{ positive: stats.finance.income - stats.finance.expense > 0 }">
              ¥{{ formatMoney(stats.finance.income - stats.finance.expense) }}
            </div>
            <div class="stat-label">账户结余</div>
            <div class="stat-sub">本月收入: ¥{{ formatMoney(stats.finance.thisMonthIncome) }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 财务趋势 -->
    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>📈 月度收支趋势</span>
          </template>
          <div class="chart-container">
            <div class="chart-bars">
              <div v-for="item in monthlyTrend" :key="item.month" class="bar-item">
                <div class="bar-group">
                  <div class="bar income-bar" :style="{ height: getBarHeight(item.income) + '%' }">
                    <span class="bar-value">{{ formatMoney(item.income, true) }}</span>
                  </div>
                  <div class="bar expense-bar" :style="{ height: getBarHeight(item.expense) + '%' }">
                    <span class="bar-value">{{ formatMoney(item.expense, true) }}</span>
                  </div>
                </div>
                <div class="bar-label">{{ item.month.slice(5) }}</div>
              </div>
            </div>
            <div class="chart-legend">
              <span class="legend-item"><span class="legend-dot income"></span>收入</span>
              <span class="legend-item"><span class="legend-dot expense"></span>支出</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>🏆 项目利润排行</span>
          </template>
          <el-table :data="projectProfit" max-height="300">
            <el-table-column prop="name" label="项目名称" width="150" />
            <el-table-column prop="budget" label="合同金额" width="100">
              <template #default="{ row }">
                ¥{{ formatMoney(row.budget) }}
              </template>
            </el-table-column>
            <el-table-column prop="cost" label="成本" width="100">
              <template #default="{ row }">
                ¥{{ formatMoney(row.cost) }}
              </template>
            </el-table-column>
            <el-table-column prop="profit" label="利润" width="100">
              <template #default="{ row }">
                <span :class="{ 'profit-positive': row.profit > 0, 'profit-negative': row.profit < 0 }">
                  ¥{{ formatMoney(row.profit) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="profit_rate" label="利润率" width="80">
              <template #default="{ row }">
                <el-tag :type="row.profit_rate > 20 ? 'success' : row.profit_rate > 10 ? 'warning' : 'danger'">
                  {{ row.profit_rate.toFixed(1) }}%
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 仓库和员工概览 -->
    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="8">
        <el-card>
          <template #header>
            <span>📦 仓库库存预警</span>
          </template>
          <div class="mini-stats">
            <div class="mini-item">
              <span class="mini-label">材料总数</span>
              <span class="mini-value">{{ stats.warehouse.totalMaterials }}</span>
            </div>
            <div class="mini-item warning">
              <span class="mini-label">库存预警</span>
              <span class="mini-value">{{ stats.warehouse.lowStock }}</span>
            </div>
            <div class="mini-item">
              <span class="mini-label">库存价值</span>
              <span class="mini-value">¥{{ formatMoney(stats.warehouse.totalValue) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header>
            <span>👷 员工状态</span>
          </template>
          <div class="mini-stats">
            <div class="mini-item">
              <span class="mini-label">在职员工</span>
              <span class="mini-value">{{ stats.employee.total }}</span>
            </div>
            <div class="mini-item">
              <span class="mini-label">本月新增</span>
              <span class="mini-value">-</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header>
            <span>💵 本月财务</span>
          </template>
          <div class="mini-stats">
            <div class="mini-item success">
              <span class="mini-label">本月收入</span>
              <span class="mini-value">¥{{ formatMoney(stats.finance.thisMonthIncome) }}</span>
            </div>
            <div class="mini-item danger">
              <span class="mini-label">本月支出</span>
              <span class="mini-value">¥{{ formatMoney(stats.finance.thisMonthExpense) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const stats = ref({
  customer: { total: 0, today: 0, thisMonth: 0 },
  contract: { total: 0, signed: 0, totalAmount: 0 },
  project: { total: 0, active: 0, finished: 0 },
  finance: { income: 0, expense: 0, thisMonthIncome: 0, thisMonthExpense: 0 },
  warehouse: { totalMaterials: 0, lowStock: 0, totalValue: 0 },
  employee: { total: 0 }
})

const projectProfit = ref([])
const monthlyTrend = ref([])

const formatMoney = (value, short = false) => {
  if (short && value >= 10000) {
    return (value / 10000).toFixed(1) + '万'
  }
  return value.toLocaleString()
}

const getBarHeight = (value) => {
  if (!monthlyTrend.value.length) return 0
  const max = Math.max(...monthlyTrend.value.map(t => Math.max(t.income, t.expense)))
  return max > 0 ? (value / max * 100 * 0.8) : 0
}

const loadData = async () => {
  try {
    const [dashRes, profitRes, trendRes] = await Promise.all([
      fetch('/api/boss-dashboard').then(r => r.json()),
      fetch('/api/project-profit').then(r => r.json()),
      fetch('/api/monthly-trend').then(r => r.json())
    ])
    stats.value = dashRes
    projectProfit.value = profitRes
    monthlyTrend.value = trendRes
  } catch (error) {
    ElMessage.error('加载数据失败')
  }
}

onMounted(loadData)
</script>

<style scoped>
.boss-dashboard {
  padding: 20px;
}
.stats-row {
  margin-top: 20px;
}
.stat-card {
  display: flex;
  align-items: center;
  padding: 20px;
}
.stat-card .stat-icon {
  font-size: 40px;
  margin-right: 20px;
}
.stat-card .stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #333;
}
.stat-card .stat-value.positive {
  color: #67c23a;
}
.stat-card .stat-label {
  font-size: 14px;
  color: #666;
}
.stat-card .stat-sub {
  font-size: 12px;
  color: #999;
  margin-top: 5px;
}
.chart-container {
  height: 300px;
  padding: 20px 0;
}
.chart-bars {
  display: flex;
  align-items: flex-end;
  height: 220px;
  gap: 10px;
}
.bar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.bar-group {
  display: flex;
  gap: 3px;
  height: 200px;
  align-items: flex-end;
  width: 100%;
  justify-content: center;
}
.bar {
  width: 20px;
  min-height: 5px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.bar-value {
  font-size: 10px;
  writing-mode: vertical-lr;
  margin-bottom: 5px;
  color: #666;
}
.income-bar {
  background: #67c23a;
}
.expense-bar {
  background: #f56c6c;
}
.bar-label {
  margin-top: 10px;
  font-size: 12px;
  color: #666;
}
.chart-legend {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 10px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
}
.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}
.legend-dot.income {
  background: #67c23a;
}
.legend-dot.expense {
  background: #f56c6c;
}
.mini-stats {
  padding: 10px 0;
}
.mini-item {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
}
.mini-item:last-child {
  border-bottom: none;
}
.mini-label {
  color: #666;
}
.mini-value {
  font-weight: bold;
  font-size: 18px;
}
.mini-item.warning .mini-value {
  color: #e6a23c;
}
.mini-item.success .mini-value {
  color: #67c23a;
}
.mini-item.danger .mini-value {
  color: #f56c6c;
}
.profit-positive {
  color: #67c23a;
}
.profit-negative {
  color: #f56c6c;
}
</style>
