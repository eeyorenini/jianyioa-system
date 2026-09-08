<template>
  <div class="dashboard">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #409EFF;">
              <el-icon><User /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">客户总数</div>
              <div class="stat-value">{{ stats.customerCount }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #67C23A;">
              <el-icon><Document /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">已签合同</div>
              <div class="stat-value">{{ stats.contractCount }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #E6A23C;">
              <el-icon><FolderOpened /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">进行中项目</div>
              <div class="stat-value">{{ stats.projectCount }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #F56C6C;">
              <el-icon><Warning /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">待确认报价</div>
              <div class="stat-value">{{ stats.pendingQuote }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="8">
        <el-card class="finance-card">
          <template #header>
            <span>财务概览</span>
          </template>
          <div class="finance-item">
            <span class="label">总收入</span>
            <span class="value income">¥{{ formatNumber(stats.totalIncome) }}</span>
          </div>
          <div class="finance-item">
            <span class="label">总支出</span>
            <span class="value expense">¥{{ formatNumber(stats.totalExpense) }}</span>
          </div>
          <div class="finance-item total">
            <span class="label">账户余额</span>
            <span class="value">¥{{ formatNumber(stats.balance) }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header>
            <span>库存预警</span>
          </template>
          <div class="warning-item">
            <el-icon><Warning /></el-icon>
            <span>库存不足物料</span>
            <span class="count">{{ stats.lowStock }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header>
            <span>快捷操作</span>
          </template>
          <el-space direction="vertical" :size="15" style="width: 100%;">
            <el-button type="primary" style="width: 100%;" @click="$router.push('/customers')">新增客户</el-button>
            <el-button type="success" style="width: 100%;" @click="$router.push('/contracts')">新增合同</el-button>
            <el-button type="warning" style="width: 100%;" @click="$router.push('/projects')">新建项目</el-button>
            <el-button type="info" style="width: 100%;" @click="$router.push('/finance')">财务收支</el-button>
          </el-space>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>最近项目</span>
          </template>
          <el-table :data="recentProjects" style="width: 100%">
            <el-table-column prop="name" label="项目名称" />
            <el-table-column prop="customer" label="客户" />
            <el-table-column prop="progress" label="进度" width="120">
              <template #default="scope">
                <el-progress :percentage="scope.row.progress" :color="'#409EFF'" />
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="scope">
                <el-tag :type="scope.row.status === '已完成' ? 'success' : 'primary'">
                  {{ scope.row.status }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>最近报价</span>
          </template>
          <el-table :data="recentQuotes" style="width: 100%">
            <el-table-column prop="customer_name" label="客户" />
            <el-table-column prop="project_name" label="项目" />
            <el-table-column prop="total_amount" label="金额">
              <template #default="scope">
                ¥{{ formatNumber(scope.row.total_amount) }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="scope">
                <el-tag :type="scope.row.status === '已确认' ? 'success' : 'warning'">
                  {{ scope.row.status }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const stats = ref({ customerCount: 0, contractCount: 0, projectCount: 0, pendingQuote: 0, totalIncome: 0, totalExpense: 0, balance: 0, lowStock: 0 })
const recentProjects = ref([])
const recentQuotes = ref([])

const formatNumber = (num) => {
  return num ? Number(num).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00'
}

const loadData = async () => {
  try {
    const [statsRes, projectsRes, quotesRes] = await Promise.all([
      axios.get('/api/dashboard/stats'),
      axios.get('/api/projects'),
      axios.get('/api/quotes')
    ])
    stats.value = statsRes.data
    recentProjects.value = projectsRes.data.slice(0, 5)
    recentQuotes.value = quotesRes.data.slice(0, 5)
  } catch (error) {
    console.error('加载数据失败:', error)
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.dashboard { padding: 20px; }
.stat-card { cursor: pointer; transition: transform 0.2s; }
.stat-card:hover { transform: translateY(-5px); }
.stat-content { display: flex; align-items: center; gap: 20px; }
.stat-icon { width: 60px; height: 60px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 28px; }
.stat-info { flex: 1; }
.stat-label { font-size: 14px; color: #909399; margin-bottom: 8px; }
.stat-value { font-size: 24px; font-weight: bold; color: #303133; }
.finance-card .finance-item { display: flex; justify-content: space-between; padding: 15px 0; border-bottom: 1px solid #eee; }
.finance-card .finance-item.total { border-bottom: none; font-weight: bold; }
.finance-card .finance-item .value.income { color: #67C23A; font-weight: bold; }
.finance-card .finance-item .value.expense { color: #F56C6C; font-weight: bold; }
.warning-item { display: flex; align-items: center; gap: 10px; padding: 20px; color: #E6A23C; font-size: 16px; }
.warning-item .count { margin-left: auto; font-size: 24px; font-weight: bold; color: #F56C6C; }
</style>
