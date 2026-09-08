<template>
  <div class="material-orders">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>采购订单列表</span>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            新增采购
          </el-button>
        </div>
      </template>
      <el-table :data="orderList" style="width: 100%">
        <el-table-column prop="id" label="订单号" width="80" />
        <el-table-column label="物料名称" width="180">
          <template #default="scope">
            {{ getMaterialName(scope.row.material_id) }}
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="采购数量" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="supplier" label="供应商" width="150" />
        <el-table-column prop="order_date" label="下单日期" width="120" />
        <el-table-column prop="expected_date" label="预计到货" width="120" />
        <el-table-column prop="operator" label="操作人" width="100" />
        <el-table-column prop="note" label="备注" />
        <el-table-column label="操作" width="150">
          <template #default="scope">
            <el-button size="small" @click="handleEdit(scope.row)">编辑</el-button>
            <el-button v-if="scope.row.status === '待采购'" type="success" size="small" @click="handleConfirm(scope.row.id)">确认采购</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showAddDialog" :title="isEdit ? '编辑采购订单' : '新增采购订单'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="选择物料">
          <el-select v-model="form.material_id" placeholder="请选择物料" style="width: 100%">
            <el-option v-for="item in materialList" :key="item.id" :label="item.name" :value="item.id">
              <span>{{ item.name }}</span>
              <span style="float: right; color: #8492a6; font-size: 12px">库存: {{ item.quantity }}{{ item.unit }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="采购数量">
          <el-input-number v-model="form.quantity" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="供应商">
          <el-input v-model="form.supplier" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status">
            <el-option label="待采购" value="待采购" />
            <el-option label="采购中" value="采购中" />
            <el-option label="已到货" value="已到货" />
            <el-option label="已取消" value="已取消" />
          </el-select>
        </el-form-item>
        <el-row :gutter="20">
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
const showAddDialog = ref(false)
const isEdit = ref(false)
const form = reactive({
  id: null,
  material_id: null,
  quantity: 1,
  status: '待采购',
  supplier: '',
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
  return material ? material.name : '-'
}

const loadData = async () => {
  try {
    const [orderRes, materialRes] = await Promise.all([
      axios.get('/api/material-orders'),
      axios.get('/api/materials')
    ])
    orderList.value = orderRes.data
    materialList.value = materialRes.data
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
    if (isEdit.value) {
      await axios.put(`/api/material-orders/${form.id}`, form)
      ElMessage.success('更新成功')
    } else {
      await axios.post('/api/material-orders', form)
      ElMessage.success('添加成功')
    }
    closeDialog()
    loadData()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const handleConfirm = async (id) => {
  try {
    const order = orderList.value.find(o => o.id === id)
    await axios.put(`/api/material-orders/${id}`, { ...order, status: '已到货' })
    await axios.post('/api/materials/in', {
      material_id: order.material_id,
      quantity: order.quantity,
      supplier: order.supplier,
      operator: order.operator,
      note: '采购到货',
      date: new Date().toISOString().split('T')[0]
    })
    ElMessage.success('采购确认并入库成功')
    loadData()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const closeDialog = () => {
  showAddDialog.value = false
  isEdit.value = false
  form.id = null
  form.material_id = null
  form.quantity = 1
  form.status = '待采购'
  form.supplier = ''
  form.order_date = ''
  form.expected_date = ''
  form.operator = ''
  form.note = ''
}

onMounted(() => { loadData() })
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
