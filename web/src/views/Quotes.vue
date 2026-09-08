<template>
  <div class="quotes">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>报价列表</span>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            新增报价
          </el-button>
        </div>
      </template>
      <el-table :data="quoteList" style="width: 100%">
        <el-table-column prop="customer_name" label="客户名称" width="150" />
        <el-table-column prop="project_name" label="项目名称" width="150" />
        <el-table-column prop="total_amount" label="报价金额" width="150">
          <template #default="scope">
            <span class="amount">¥{{ formatNumber(scope.row.total_amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="valid_date" label="有效期" width="120" />
        <el-table-column prop="created_at" label="创建时间" width="180" />
        <el-table-column label="操作" width="100">
          <template #default="scope">
            <el-button type="danger" size="small" @click="handleDelete(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showAddDialog" title="新增报价" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="客户名称">
          <el-input v-model="form.customer_name" placeholder="请输入客户名称" />
        </el-form-item>
        <el-form-item label="项目名称">
          <el-input v-model="form.project_name" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="报价金额">
          <el-input-number v-model="form.total_amount" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status">
            <el-option label="待确认" value="待确认" />
            <el-option label="已确认" value="已确认" />
            <el-option label="已拒绝" value="已拒绝" />
            <el-option label="已过期" value="已过期" />
          </el-select>
        </el-form-item>
        <el-form-item label="有效期">
          <el-date-picker v-model="form.valid_date" type="date" value-format="YYYY-MM-DD" placeholder="选择有效期" />
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

const quoteList = ref([])
const showAddDialog = ref(false)
const form = reactive({
  customer_name: '',
  project_name: '',
  total_amount: 0,
  status: '待确认',
  valid_date: ''
})

const formatNumber = (num) => {
  return num ? Number(num).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00'
}

const getStatusType = (status) => {
  const types = { '待确认': 'warning', '已确认': 'success', '已拒绝': 'danger', '已过期': 'info' }
  return types[status] || 'info'
}

const loadData = async () => {
  try {
    const res = await axios.get('/api/quotes')
    quoteList.value = res.data
  } catch (error) {
    console.error('加载失败:', error)
  }
}

const handleAdd = async () => {
  try {
    await axios.post('/api/quotes', form)
    ElMessage.success('添加成功')
    showAddDialog.value = false
    loadData()
    form.customer_name = ''
    form.project_name = ''
    form.total_amount = 0
    form.status = '待确认'
    form.valid_date = ''
  } catch (error) {
    ElMessage.error('添加失败')
  }
}

const handleDelete = async (id) => {
  try {
    await axios.delete(`/api/quotes/${id}`)
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

.amount {
  color: #F56C6C;
  font-weight: bold;
}
</style>
