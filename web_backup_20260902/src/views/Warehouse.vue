<template>
  <div class="warehouse">
    <el-row :gutter="20">
      <el-col :span="16">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>物料列表</span>
              <el-button type="primary" size="small" @click="showAddMaterial = true">
                <el-icon><Plus /></el-icon>
                添加物料
              </el-button>
            </div>
          </template>
          <el-table :data="materialList" style="width: 100%">
            <el-table-column prop="name" label="物料名称" width="150" />
            <el-table-column prop="category" label="类别" width="120" />
            <el-table-column prop="unit" label="单位" width="80" />
            <el-table-column prop="quantity" label="库存" width="100">
              <template #default="scope">
                <span :class="{ 'low-stock': scope.row.quantity < 10 }">
                  {{ scope.row.quantity }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="price" label="单价" width="100">
              <template #default="scope">
                ¥{{ formatNumber(scope.row.price) }}
              </template>
            </el-table-column>
            <el-table-column prop="supplier" label="供应商" />
            <el-table-column label="操作" width="150">
              <template #default="scope">
                <el-button size="small" type="success" @click="openInDialog(scope.row)">入库</el-button>
                <el-button size="small" type="warning" @click="openOutDialog(scope.row)">出库</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header>
            <span>快捷操作</span>
          </template>
          <el-space direction="vertical" :size="20" style="width: 100%;">
            <el-button type="primary" style="width: 100%;" @click="showAddMaterial = true">
              <el-icon><Plus /></el-icon>
              添加新物料
            </el-button>
            <el-button type="success" style="width: 100%;" @click="showInDialog = true">
              <el-icon><Bottom /></el-icon>
              物料入库
            </el-button>
            <el-button type="warning" style="width: 100%;" @click="showOutDialog = true">
              <el-icon><Top /></el-icon>
              物料出库
            </el-button>
          </el-space>
        </el-card>
        <el-card style="margin-top: 20px;">
          <template #header>
            <span>库存统计</span>
          </template>
          <div class="stat-item">
            <span>物料种类</span>
            <span class="value">{{ materialList.length }}</span>
          </div>
          <div class="stat-item">
            <span>库存总值</span>
            <span class="value">¥{{ formatNumber(totalValue) }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="showAddMaterial" title="添加物料" width="500px">
      <el-form :model="materialForm" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="materialForm.name" />
        </el-form-item>
        <el-form-item label="类别">
          <el-select v-model="materialForm.category" placeholder="请选择">
            <el-option label="建材" value="建材" />
            <el-option label="电线" value="电线" />
            <el-option label="水管" value="水管" />
            <el-option label="油漆" value="油漆" />
            <el-option label="板材" value="板材" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="单位">
          <el-input v-model="materialForm.unit" placeholder="如: 个, 米, 箱" />
        </el-form-item>
        <el-form-item label="初始库存">
          <el-input-number v-model="materialForm.quantity" :min="0" />
        </el-form-item>
        <el-form-item label="单价">
          <el-input-number v-model="materialForm.price" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="供应商">
          <el-input v-model="materialForm.supplier" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddMaterial = false">取消</el-button>
        <el-button type="primary" @click="handleAddMaterial">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showInDialog" title="物料入库" width="400px">
      <el-form :model="ioForm" label-width="80px">
        <el-form-item label="物料">
          <el-select v-model="ioForm.material_id" placeholder="请选择">
            <el-option v-for="item in materialList" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="ioForm.quantity" :min="1" />
        </el-form-item>
        <el-form-item label="操作人">
          <el-input v-model="ioForm.operator" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="ioForm.note" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showInDialog = false">取消</el-button>
        <el-button type="primary" @click="handleIn">确认入库</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showOutDialog" title="物料出库" width="400px">
      <el-form :model="ioForm" label-width="80px">
        <el-form-item label="物料">
          <el-select v-model="ioForm.material_id" placeholder="请选择">
            <el-option v-for="item in materialList" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="ioForm.quantity" :min="1" />
        </el-form-item>
        <el-form-item label="操作人">
          <el-input v-model="ioForm.operator" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="ioForm.note" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showOutDialog = false">取消</el-button>
        <el-button type="primary" @click="handleOut">确认出库</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const materialList = ref([])
const showAddMaterial = ref(false)
const showInDialog = ref(false)
const showOutDialog = ref(false)

const materialForm = reactive({
  name: '',
  category: '',
  unit: '',
  quantity: 0,
  price: 0,
  supplier: ''
})

const ioForm = reactive({
  material_id: null,
  quantity: 1,
  operator: '',
  note: '',
  date: new Date().toISOString().split('T')[0]
})

const totalValue = computed(() => {
  return materialList.value.reduce((sum, item) => sum + (item.quantity * item.price), 0)
})

const formatNumber = (num) => {
  return num ? Number(num).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00'
}

const loadData = async () => {
  try {
    const res = await axios.get('/api/materials')
    materialList.value = res.data
  } catch (error) {
    console.error('加载失败:', error)
  }
}

const handleAddMaterial = async () => {
  try {
    await axios.post('/api/materials', materialForm)
    ElMessage.success('添加成功')
    showAddMaterial.value = false
    loadData()
    materialForm.name = ''
    materialForm.category = ''
    materialForm.unit = ''
    materialForm.quantity = 0
    materialForm.price = 0
    materialForm.supplier = ''
  } catch (error) {
    ElMessage.error('添加失败')
  }
}

const openInDialog = (row) => {
  ioForm.material_id = row.id
  showInDialog.value = true
}

const openOutDialog = (row) => {
  ioForm.material_id = row.id
  showOutDialog.value = true
}

const handleIn = async () => {
  try {
    await axios.post('/api/materials/in', ioForm)
    ElMessage.success('入库成功')
    showInDialog.value = false
    loadData()
    ioForm.material_id = null
    ioForm.quantity = 1
    ioForm.operator = ''
    ioForm.note = ''
  } catch (error) {
    ElMessage.error('入库失败')
  }
}

const handleOut = async () => {
  try {
    await axios.post('/api/materials/out', ioForm)
    ElMessage.success('出库成功')
    showOutDialog.value = false
    loadData()
    ioForm.material_id = null
    ioForm.quantity = 1
    ioForm.operator = ''
    ioForm.note = ''
  } catch (error) {
    ElMessage.error('出库失败')
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

.low-stock {
  color: #F56C6C;
  font-weight: bold;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  padding: 15px 0;
  border-bottom: 1px solid #eee;
}

.stat-item:last-child {
  border-bottom: none;
}

.stat-item .value {
  font-weight: bold;
  font-size: 18px;
  color: #409EFF;
}
</style>
