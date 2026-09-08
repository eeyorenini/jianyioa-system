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
            <div class="value">¥{{ formatNumber(summary.totalIncome) }}</div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="summary-item expense">
            <div class="label">总支出</div>
            <div class="value">¥{{ formatNumber(summary.totalExpense) }}</div>
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
          <span>财务记录</span>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            添加记录
          </el-button>
        </div>
      </template>
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

const financeList = ref([])
const summary = ref({ totalIncome: 0, totalExpense: 0, balance: 0 })
const showAddDialog = ref(false)
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
    financeList.value = listRes.data
    summary.value = summaryRes.data
  } catch (error) {
    console.error('加载失败:', error)
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
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
</style>
