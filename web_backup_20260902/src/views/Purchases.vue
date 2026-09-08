<template>
  <div class="purchases">
    <h2>🛒 采购管理</h2>
    <el-card>
      <el-form :inline="true">
        <el-form-item label="采购单号">
          <el-input v-model="searchForm.purchase_no" placeholder="请输入采购单号" clearable />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择" clearable>
            <el-option label="待审核" value="待审核" />
            <el-option label="待采购" value="待采购" />
            <el-option label="采购中" value="采购中" />
            <el-option label="已完成" value="已完成" />
            <el-option label="已取消" value="已取消" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadData">搜索</el-button>
          <el-button type="success" @click="handleAdd">新增采购</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="tableData" border style="width: 100%; margin-top: 20px;">
        <el-table-column prop="purchase_no" label="采购单号" width="140" />
        <el-table-column prop="supplier_name" label="供应商" min-width="150" />
        <el-table-column prop="project_name" label="项目" min-width="120" />
        <el-table-column prop="total_amount" label="采购金额" width="100">
          <template #default="{ row }">
            ¥{{ row.total_amount?.toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column prop="paid_amount" label="已付金额" width="100">
          <template #default="{ row }">
            <span style="color: #409eff;">¥{{ row.paid_amount?.toLocaleString() }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="purchase_date" label="采购日期" width="100" />
        <el-table-column prop="expected_date" label="预计到货" width="100" />
        <el-table-column prop="operator" label="操作人" width="80" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑采购' : '新增采购'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="采购单号">
          <el-input v-model="form.purchase_no" placeholder="系统自动生成" :disabled="isEdit" />
        </el-form-item>
        <el-form-item label="供应商">
          <el-select v-model="form.supplier_id" @change="onSupplierChange" style="width: 100%" filterable>
            <el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="项目">
          <el-select v-model="form.project_id" style="width: 100%" filterable clearable>
            <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="采购金额">
          <el-input-number v-model="form.total_amount" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="采购日期">
          <el-date-picker v-model="form.purchase_date" type="date" style="width: 100%" />
        </el-form-item>
        <el-form-item label="预计到货">
          <el-date-picker v-model="form.expected_date" type="date" style="width: 100%" />
        </el-form-item>
        <el-form-item label="操作人">
          <el-input v-model="form.operator" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="待审核" value="待审核" />
            <el-option label="待采购" value="待采购" />
            <el-option label="采购中" value="采购中" />
            <el-option label="已完成" value="已完成" />
            <el-option label="已取消" value="已取消" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const tableData = ref([])
const suppliers = ref([])
const projects = ref([])
const searchForm = ref({ purchase_no: '', status: '' })
const dialogVisible = ref(false)
const isEdit = ref(false)
const form = ref({
  id: null, purchase_no: '', supplier_id: null, supplier_name: '', project_id: null, project_name: '',
  total_amount: 0, paid_amount: 0, status: '待审核', purchase_date: '', expected_date: '', operator: '', remark: ''
})

const getStatusType = (status) => {
  const map = { '待审核': 'warning', '待采购': 'info', '采购中': 'primary', '已完成': 'success', '已取消': 'info' }
  return map[status] || 'info'
}

const loadData = async () => {
  try {
    const [purchasesRes, suppliersRes, projectsRes] = await Promise.all([
      fetch('/api/purchases'), fetch('/api/suppliers'), fetch('/api/projects')
    ])
    let data = await purchasesRes.json()
    const supplierData = await suppliersRes.json()
    const projectData = await projectsRes.json()
    suppliers.value = supplierData
    projects.value = projectData
    if (searchForm.value.purchase_no) data = data.filter(d => d.purchase_no?.includes(searchForm.value.purchase_no))
    if (searchForm.value.status) data = data.filter(d => d.status === searchForm.value.status)
    tableData.value = data
  } catch (error) { ElMessage.error('加载失败') }
}

const onSupplierChange = (supplierId) => {
  const supplier = suppliers.value.find(s => s.id === supplierId)
  if (supplier) form.value.supplier_name = supplier.name
}

const handleAdd = () => {
  isEdit.value = false
  const no = 'CG' + Date.now()
  form.value = { id: null, purchase_no: no, supplier_id: null, supplier_name: '', project_id: null, project_name: '', total_amount: 0, paid_amount: 0, status: '待审核', purchase_date: new Date(), expected_date: '', operator: '', remark: '' }
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  form.value = { ...row }
  dialogVisible.value = true
}

const handleSave = async () => {
  try {
    const method = isEdit.value ? 'PUT' : 'POST'
    const url = isEdit.value ? `/api/purchases/${form.value.id}` : '/api/purchases'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form.value) })
    ElMessage.success('保存成功'); dialogVisible.value = false; loadData()
  } catch (error) { ElMessage.error('保存失败') }
}

const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除吗?', '提示', { type: 'warning' })
    await fetch(`/api/purchases/${id}`, { method: 'DELETE' })
    ElMessage.success('删除成功'); loadData()
  } catch (error) { if (error !== 'cancel') ElMessage.error('删除失败') }
}

onMounted(loadData)
</script>

<style scoped>.purchases { padding: 20px; }</style>
