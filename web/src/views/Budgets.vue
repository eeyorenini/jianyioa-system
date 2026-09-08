<template>
  <div class="budgets">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>预算报价列表</span>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            新增预算
          </el-button>
        </div>
      </template>
      <el-table :data="budgetList" style="width: 100%">
        <el-table-column prop="project_name" label="项目名称" width="180" />
        <el-table-column prop="house_area" label="房屋面积" width="100">
          <template #default="scope">{{ scope.row.house_area }}㎡</template>
        </el-table-column>
        <el-table-column prop="style" label="装修风格" width="100" />
        <el-table-column prop="total_amount" label="预算金额" width="140">
          <template #default="scope">
            <span class="amount">¥{{ formatNumber(scope.row.total_amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="profit_rate" label="利润率" width="100">
          <template #default="scope">{{ scope.row.profit_rate }}%</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180" />
        <el-table-column label="操作" width="100">
          <template #default="scope">
            <el-button type="danger" size="small" @click="handleDelete(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showAddDialog" title="新增预算" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="项目名称">
          <el-input v-model="form.project_name" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="房屋面积">
              <el-input-number v-model="form.house_area" :min="0" :precision="1" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="装修风格">
              <el-select v-model="form.style" style="width: 100%">
                <el-option label="现代简约" value="现代简约" />
                <el-option label="北欧风格" value="北欧风格" />
                <el-option label="中式风格" value="中式风格" />
                <el-option label="欧式风格" value="欧式风格" />
                <el-option label="美式风格" value="美式风格" />
                <el-option label="日式风格" value="日式风格" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="预算金额">
              <el-input-number v-model="form.total_amount" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="利润率(%)">
              <el-input-number v-model="form.profit_rate" :min="0" :max="100" :precision="1" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="状态">
          <el-select v-model="form.status">
            <el-option label="草稿" value="草稿" />
            <el-option label="审核中" value="审核中" />
            <el-option label="已提交" value="已提交" />
            <el-option label="已通过" value="已通过" />
            <el-option label="已拒绝" value="已拒绝" />
          </el-select>
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
import { ElMessage, ElMessageBox } from 'element-plus'

const budgetList = ref([])
const showAddDialog = ref(false)
const form = reactive({
  project_name: '',
  house_area: 0,
  style: '',
  total_amount: 0,
  profit_rate: 20,
  status: '草稿'
})

const formatNumber = (num) => num ? Number(num).toLocaleString('zh-CN') : '0'

const getStatusType = (status) => {
  const types = { '草稿': 'info', '审核中': 'warning', '已提交': 'primary', '已通过': 'success', '已拒绝': 'danger' }
  return types[status] || 'info'
}

const loadData = async () => {
  try {
    const res = await axios.get('/api/budgets')
    budgetList.value = res.data
  } catch (error) {
    console.error('加载失败:', error)
  }
}

const handleAdd = async () => {
  try {
    await axios.post('/api/budgets', form)
    ElMessage.success('添加成功')
    showAddDialog.value = false
    loadData()
    form.project_name = ''
    form.house_area = 0
    form.style = ''
    form.total_amount = 0
    form.profit_rate = 20
    form.status = '草稿'
  } catch (error) {
    ElMessage.error('添加失败')
  }
}

const handleDelete = async (id) => {
    try {
    await ElMessageBox.confirm('此操作将永久删除该数据，是否继续？', '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await axios.delete(`/api/budgets/${id}`)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}

onMounted(() => { loadData() })
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.amount { color: #F56C6C; font-weight: bold; }
</style>
