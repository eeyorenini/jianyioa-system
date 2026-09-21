<template>
  <div class="material-orders">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>采购订单列表</span>
          <el-button type="primary" @click="openAddDialog">
            <el-icon><Plus /></el-icon>
            新增采购
          </el-button>
        </div>
      </template>
      <el-table :data="orderList" style="width: 100%" table-layout="auto">
        <el-table-column prop="id" label="订单号" min-width="70" />
        <el-table-column label="项目" min-width="150">
          <template #default="scope">
            {{ scope.row.project_name || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="物料名称" min-width="160">
          <template #default="scope">
            {{ scope.row.material_name || getMaterialName(scope.row.material_id) || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="spec" label="规格型号" min-width="120" />
        <el-table-column label="数量" min-width="90">
          <template #default="scope">
            {{ scope.row.quantity }}{{ scope.row.unit || '' }}
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="预计金额" min-width="100">
          <template #default="scope">
            {{ scope.row.amount ? '¥' + Number(scope.row.amount).toFixed(2) : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="supplier" label="供应商" min-width="130" />
        <el-table-column prop="status" label="状态" min-width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" min-width="100" />
        <el-table-column prop="note" label="备注" min-width="120" />
        <el-table-column label="操作" min-width="180">
          <template #default="scope">
            <el-button size="small" @click="handleEdit(scope.row)">编辑</el-button>
            <el-button v-if="scope.row.status === '待采购'" type="success" size="small" @click="handleConfirm(scope.row.id)">确认采购</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="showAddDialog" :title="isEdit ? '编辑采购订单' : '新增采购订单'" width="650px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="选择项目">
          <el-select v-model="form.project_id" placeholder="请选择项目" style="width: 100%" filterable clearable>
            <el-option v-for="p in projectList" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="物料名称">
          <el-input v-model="form.material_name" placeholder="请输入材料名称" />
        </el-form-item>
        <el-form-item label="规格型号">
          <el-input v-model="form.spec" placeholder="如：300×600" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="采购数量">
              <el-input-number v-model="form.quantity" :min="1" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位">
              <el-input v-model="form.unit" placeholder="如：块、米、个" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="供应商">
              <el-input v-model="form.supplier" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预计金额">
              <el-input-number v-model="form.amount" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="下单日期">
              <el-date-picker v-model="form.order_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预计到货">
              <el-date-picker v-model="form.expected_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="待采购" value="待采购" />
            <el-option label="采购中" value="采购中" />
            <el-option label="已到货" value="已到货" />
            <el-option label="已取消" value="已取消" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作人">
          <el-input v-model="form.operator" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" />
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

const orderList = ref([])
const materialList = ref([])
const projectList = ref([])
const showAddDialog = ref(false)
const isEdit = ref(false)
const form = reactive({
  id: null,
  project_id: null,
  material_id: null,
  material_name: '',
  spec: '',
  quantity: 1,
  unit: '',
  supplier: '',
  amount: '',
  status: '待采购',
  order_date: '',
  expected_date: '',
  operator: '',
  note: ''
})

const getStatusType = (status) => {
  const types = { '待采购': 'warning', '采购中': 'primary', '已到货': 'success', '已取消': 'info' }
  return types[status] || 'info'
}

const getMaterialName = (id) => {
  const material = materialList.value.find(m => m.id === id)
  return material ? material.name : ''
}

const loadOrders = async () => {
  try {
    const res = await axios.get('/api/material-orders')
    orderList.value = res.data
  } catch (error) {
    console.error('加载订单失败:', error)
  }
}

const loadMaterials = async () => {
  try {
    const res = await axios.get('/api/materials')
    materialList.value = res.data
  } catch (error) {
    console.error('加载物料失败:', error)
  }
}

const loadProjects = async () => {
  try {
    const res = await axios.get('/api/projects/list')
    if (res.data.code === 0) {
      projectList.value = res.data.data?.list || []
    } else if (Array.isArray(res.data)) {
      projectList.value = res.data
    }
  } catch (error) {
    console.error('加载项目失败:', error)
  }
}

const loadData = async () => {
  await Promise.all([loadOrders(), loadMaterials(), loadProjects()])
}

const openAddDialog = () => {
  isEdit.value = false
  resetForm()
  showAddDialog.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, {
    id: row.id,
    project_id: row.project_id || null,
    material_id: row.material_id,
    material_name: row.material_name || '',
    spec: row.spec || '',
    quantity: row.quantity,
    unit: row.unit || '',
    supplier: row.supplier || '',
    amount: row.amount || '',
    status: row.status || '待采购',
    order_date: row.order_date || '',
    expected_date: row.expected_date || '',
    operator: row.operator || '',
    note: row.note || ''
  })
  showAddDialog.value = true
}

const handleSave = async () => {
  try {
    if (isEdit.value) {
      await axios.put(`/api/material-orders/${form.id}`, form)
      ElMessage.success('更新成功')
    } else {
      await axios.post('/api/material-orders', form)
      ElMessage.success('添加成功')
    }
    closeDialog()
    loadOrders()
  } catch (error) {
    console.error('操作失败:', error)
    ElMessage.error('操作失败')
  }
}

const handleConfirm = async (id) => {
  try {
    const order = orderList.value.find(o => o.id === id)
    await axios.put(`/api/material-orders/${id}`, { ...order, status: '已到货' })
    if (order.material_id) {
      await axios.post('/api/materials/in', {
        material_id: order.material_id,
        quantity: order.quantity,
        supplier: order.supplier,
        operator: order.operator,
        note: '采购到货入库',
        date: new Date().toISOString().split('T')[0]
      })
    }
    ElMessage.success('采购已确认并入库')
    loadOrders()
  } catch (error) {
    console.error('确认采购失败:', error)
    ElMessage.error('操作失败')
  }
}

const resetForm = () => {
  form.id = null
  form.project_id = null
  form.material_id = null
  form.material_name = ''
  form.spec = ''
  form.quantity = 1
  form.unit = ''
  form.supplier = ''
  form.amount = ''
  form.status = '待采购'
  form.order_date = ''
  form.expected_date = ''
  form.operator = ''
  form.note = ''
}

const closeDialog = () => {
  showAddDialog.value = false
  isEdit.value = false
  resetForm()
}

onMounted(() => { loadData() })
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
