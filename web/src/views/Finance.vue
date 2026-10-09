<template>
  <div class="finance">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>财务概览</span>
        </div>
      </template>
      <el-row :gutter="20">
        <el-col :span="8">
          <div class="summary-item income">
            <div class="label">总收入</div>
            <div class="value">¥{{ formatNumber(summary.collected) }}</div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="summary-item expense">
            <div class="label">总支出</div>
            <div class="value">¥{{ formatNumber(summary.expensed) }}</div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="summary-item balance">
            <div class="label">账户余额</div>
            <div class="value">¥{{ formatNumber(summary.balance) }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <el-card style="margin-top: 20px;">
      <template #header>
        <div class="card-header">
          <el-tabs v-model="activeTab" class="finance-tabs">
            <el-tab-pane label="收支流水" name="records" />
            <el-tab-pane label="应收统计" name="receivable" />
          </el-tabs>
          <el-button v-if="activeTab === 'records'" type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            添加记录
          </el-button>
        </div>
      </template>

      <!-- 收支流水 -->
      <div v-if="activeTab === 'records'">
        <el-table :data="financeList" style="width: 100%">
          <el-table-column prop="type" label="类型" width="80">
            <template #default="scope">
              <el-tag :type="scope.row.type === 'income' ? 'success' : 'danger'">
                {{ scope.row.type === 'income' ? '收入' : '支出' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="amount" label="金额" width="150">
            <template #default="scope">
              <span :style="{ color: scope.row.type === 'income' ? '#67C23A' : '#F56C6C' }">
                {{ scope.row.type === 'income' ? '+' : '-' }}¥{{ formatNumber(scope.row.amount) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="category" label="类别" width="120" />
          <el-table-column prop="description" label="描述" />
          <el-table-column prop="date" label="日期" width="120" />
          <el-table-column label="操作" width="100">
            <template #default="scope">
              <el-button type="danger" size="small" @click="handleDelete(scope.row.id)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 应收统计 -->
      <div v-if="activeTab === 'receivable'">
        <!-- 全局汇总 -->
        <el-row :gutter="16" style="margin-bottom: 20px;">
          <el-col :span="4">
            <div class="stat-box">
              <div class="stat-label">合同总额</div>
              <div class="stat-value">¥{{ formatNumber(grandTotal.contract_amount) }}</div>
            </div>
          </el-col>
          <el-col :span="4">
            <div class="stat-box increase">
              <div class="stat-label">增项总额</div>
              <div class="stat-value">+¥{{ formatNumber(grandTotal.increase_total) }}</div>
            </div>
          </el-col>
          <el-col :span="4">
            <div class="stat-box decrease">
              <div class="stat-label">减项总额</div>
              <div class="stat-value">-¥{{ formatNumber(grandTotal.decrease_total) }}</div>
            </div>
          </el-col>
          <el-col :span="4">
            <div class="stat-box primary">
              <div class="stat-label">应收总额</div>
              <div class="stat-value">¥{{ formatNumber(grandTotal.receivable) }}</div>
            </div>
          </el-col>
          <el-col :span="4">
            <div class="stat-box success">
              <div class="stat-label">已收总额</div>
              <div class="stat-value">¥{{ formatNumber(grandTotal.collected) }}</div>
            </div>
          </el-col>
          <el-col :span="4">
            <div class="stat-box warning">
              <div class="stat-label">未收总额</div>
              <div class="stat-value">¥{{ formatNumber(grandTotal.unpaid) }}</div>
            </div>
          </el-col>
        </el-row>

        <el-table :data="receivableList" size="small" border>
          <el-table-column prop="project_name" label="项目" min-width="180" />
          <el-table-column prop="contract_amount" label="合同金额" width="120" align="right">
            <template #default="{ row }">¥{{ formatNumber(row.contract_amount) }}</template>
          </el-table-column>
          <el-table-column label="增项" width="100" align="right">
            <template #default="{ row }">
              <span style="color:#67C23A">+¥{{ formatNumber(row.increase_total) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="减项" width="100" align="right">
            <template #default="{ row }">
              <span style="color:#F56C6C">-¥{{ formatNumber(row.decrease_total) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="receivable" label="应收金额" width="120" align="right">
            <template #default="{ row }">
              <span style="font-weight:600;color:#409EFF">¥{{ formatNumber(row.receivable) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="collected" label="已收" width="100" align="right">
            <template #default="{ row }">
              <span style="color:#67C23A">¥{{ formatNumber(row.collected) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="unpaid" label="未收" width="100" align="right">
            <template #default="{ row }">
              <span :style="{ color: row.unpaid > 0 ? '#F56C6C' : '#67C23A', fontWeight: 600 }">
                ¥{{ formatNumber(row.unpaid) }}
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <el-dialog v-model="showAddDialog" title="添加财务记录" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="类型">
          <el-radio-group v-model="form.type">
            <el-radio label="income">收入</el-radio>
            <el-radio label="expense">支出</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="金额">
          <el-input-number v-model="form.amount" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="类别">
          <el-select v-model="form.category" placeholder="请选择">
            <el-option label="工程款" value="工程款" />
            <el-option label="材料采购" value="材料采购" />
            <el-option label="人工费" value="人工费" />
            <el-option label="办公费用" value="办公费用" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" />
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="handleAdd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

const activeTab = ref('records')
const financeList = ref([])
const summary = ref({ collected: 0, expensed: 0, balance: 0 })
const showAddDialog = ref(false)
const receivableList = ref([])
const grandTotal = ref({ contract_amount: 0, increase_total: 0, decrease_total: 0, receivable: 0, collected: 0, unpaid: 0 })
const form = reactive({
  type: 'income',
  amount: 0,
  category: '',
  description: '',
  date: new Date().toISOString().split('T')[0]
})

const formatNumber = (num) => {
  return num ? Number(num).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00'
}

const loadData = async () => {
  try {
    const [listRes, summaryRes] = await Promise.all([
      axios.get('/api/finance'),
      axios.get('/api/finance/summary')
    ])
    financeList.value = listRes || []
    summary.value = summaryRes.data
  } catch (error) {
    console.error('加载失败:', error)
  }
}

const loadReceivable = async () => {
  try {
    const res = await axios.get('/api/finance/receivable-by-project')
    receivableList.value = res?.list || []
    grandTotal.value = res?.grand || { contract_amount: 0, increase_total: 0, decrease_total: 0, receivable: 0, collected: 0, unpaid: 0 }
  } catch (error) {
    receivableList.value = []
  }
}

const handleAdd = async () => {
  try {
    await axios.post('/api/finance', form)
    ElMessage.success('添加成功')
    showAddDialog.value = false
    loadData()
    form.type = 'income'
    form.amount = 0
    form.category = ''
    form.description = ''
    form.date = new Date().toISOString().split('T')[0]
  } catch (error) {
    ElMessage.error('添加失败')
  }
}

const handleDelete = async (id) => {
  try {
    await axios.delete(`/api/finance/${id}`)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    ElMessage.error('删除失败')
  }
}

onMounted(() => {
  loadData()
})

// 切换 Tab 时加载应收数据
import { watch } from 'vue'
watch(activeTab, (val) => {
  if (val === 'receivable' && receivableList.value.length === 0) loadReceivable()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.finance-tabs {
  flex: 1;
}

.summary-item {
  padding: 20px;
  border-radius: 8px;
  text-align: center;
}

.summary-item.income {
  background: linear-gradient(135deg, #67C23A 0%, #85CE61 100%);
  color: #fff;
}

.summary-item.expense {
  background: linear-gradient(135deg, #F56C6C 0%, #F78989 100%);
  color: #fff;
}

.summary-item.balance {
  background: linear-gradient(135deg, #409EFF 0%, #66B1FF 100%);
  color: #fff;
}

.summary-item .label {
  font-size: 14px;
  margin-bottom: 10px;
  opacity: 0.9;
}

.summary-item .value {
  font-size: 24px;
  font-weight: bold;
}

.stat-box {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 14px 12px;
  text-align: center;
  border: 1px solid #e8e8e8;
}

.stat-box.increase { background: #f0f9eb; border-color: #c2e7b0; }
.stat-box.decrease { background: #fef0f0; border-color: #fad7d7; }
.stat-box.primary { background: #ecf5ff; border-color: #b3d8fd; }
.stat-box.success { background: #f0f9eb; border-color: #b2e6ab; }
.stat-box.warning { background: #fef9f3; border-color: #f5dab1; }

.stat-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 6px;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: #333;
}

.stat-box.increase .stat-value { color: #67C23A; }
.stat-box.decrease .stat-value { color: #F56C6C; }
.stat-box.primary .stat-value { color: #409EFF; }
.stat-box.success .stat-value { color: #67C23A; }
.stat-box.warning .stat-value { color: #E6A23C; }
</style>
