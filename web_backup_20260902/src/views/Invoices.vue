<template>
  <div class="invoices">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>发票管理</span>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            新增发票
          </el-button>
        </div>
      </template>
      <el-table :data="invoiceList" style="width: 100%">
        <el-table-column prop="invoice_no" label="发票号" width="150" />
        <el-table-column prop="customer_name" label="客户名称" width="150" />
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="scope">
            ¥{{ formatNumber(scope.row.amount) }}
          </template>
        </el-table-column>
        <el-table-column prop="tax_rate" label="税率" width="80">
          <template #default="scope">
            {{ scope.row.tax_rate }}%
          </template>
        </el-table-column>
        <el-table-column prop="total_amount" label="含税金额" width="120">
          <template #default="scope">
            ¥{{ formatNumber(scope.row.total_amount) }}
          </template>
        </el-table-column>
        <el-table-column prop="type" label="发票类型" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="issue_date" label="开票日期" width="120" />
        <el-table-column label="操作" width="150">
          <template #default="scope">
            <el-button size="small" @click="handleEdit(scope.row)">编辑</el-button>
            <el-button type="danger" size="small" @click="handleDelete(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showAddDialog" :title="isEdit ? '编辑发票' : '新增发票'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="发票号">
          <el-input v-model="form.invoice_no" />
        </el-form-item>
        <el-form-item label="客户名称">
          <el-input v-model="form.customer_name" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="金额">
              <el-input-number v-model="form.amount" :min="0" :precision="2" style="width: 100%" @change="calcTotal" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="税率">
              <el-input-number v-model="form.tax_rate" :min="0" :max="100" :precision="2" style="width: 100%" @change="calcTotal" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="含税金额">
          <el-input v-model="form.total_amount" disabled>
            <template #prefix>¥</template>
          </el-input>
        </el-form-item>
        <el-form-item label="发票类型">
          <el-select v-model="form.type">
            <el-option label="增值税专用发票" value="增值税专用发票" />
            <el-option label="增值税普通发票" value="增值税普通发票" />
            <el-option label="电子发票" value="电子发票" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status">
            <el-option label="待开具" value="待开具" />
            <el-option label="已开具" value="已开具" />
            <el-option label="已寄出" value="已寄出" />
            <el-option label="已收到" value="已收到" />
          </el-select>
        </el-form-item>
        <el-form-item label="开票日期">
          <el-date-picker v-model="form.issue_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" @click="handleSave">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const invoiceList = ref([])
const showAddDialog = ref(false)
const isEdit = ref(false)
const form = reactive({
  id: null,
  invoice_no: '',
  customer_id: null,
  customer_name: '',
  amount: 0,
  tax_rate: 0,
  tax_amount: 0,
  total_amount: 0,
  type: '增值税普通发票',
  status: '待开具',
  issue_date: '',
  remark: ''
})

const formatNumber = (num) => {
  return num ? Number(num).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00'
}

const calcTotal = () => {
  form.tax_amount = form.amount * (form.tax_rate / 100)
  form.total_amount = form.amount + form.tax_amount
}

const getStatusType = (status) => {
  const types = { '待开具': 'warning', '已开具': 'primary', '已寄出': 'info', '已收到': 'success' }
  return types[status] || 'info'
}

const loadData = async () => {
  try {
    const res = await axios.get('/api/invoices')
    invoiceList.value = res.data
  } catch (error) {
    console.error('加载失败:', error)
  }
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, row)
  showAddDialog.value = true
}

const handleSave = async () => {
  try {
    calcTotal()
    if (isEdit.value) {
      await axios.put(`/api/invoices/${form.id}`, form)
      ElMessage.success('更新成功')
    } else {
      await axios.post('/api/invoices', form)
      ElMessage.success('添加成功')
    }
    closeDialog()
    loadData()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const handleDelete = async (id) => {
  try {
    await axios.delete(`/api/invoices/${id}`)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    ElMessage.error('删除失败')
  }
}

const closeDialog = () => {
  showAddDialog.value = false
  isEdit.value = false
  form.id = null
  form.invoice_no = ''
  form.customer_id = null
  form.customer_name = ''
  form.amount = 0
  form.tax_rate = 0
  form.tax_amount = 0
  form.total_amount = 0
  form.type = '增值税普通发票'
  form.status = '待开具'
  form.issue_date = ''
  form.remark = ''
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
</style>
