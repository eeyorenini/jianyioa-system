<template>
  <div class="customers">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>客户列表</span>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            新增客户
          </el-button>
        </div>
      </template>
      <el-table :data="customerList" style="width: 100%">
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column prop="source" label="来源" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="等级" width="80">
          <template #default="scope">
            <el-tag :type="getLevelType(scope.row.level)">{{ scope.row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="budget" label="预算" width="120">
          <template #default="scope">
            ¥{{ formatNumber(scope.row.budget) }}
          </template>
        </el-table-column>
        <el-table-column prop="follow_user" label="跟进人" width="100" />
        <el-table-column prop="next_follow_date" label="下次跟进" width="120" />
        <el-table-column label="操作" width="150">
          <template #default="scope">
            <el-button size="small" @click="handleEdit(scope.row)">编辑</el-button>
            <el-button type="danger" size="small" @click="handleDelete(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showAddDialog" :title="isEdit ? '编辑客户' : '新增客户'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="客户姓名">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="客户来源">
          <el-select v-model="form.source" placeholder="请选择">
            <el-option label="自然到访" value="自然到访" />
            <el-option label="电话咨询" value="电话咨询" />
            <el-option label="网络推广" value="网络推广" />
            <el-option label="老客户推荐" value="老客户推荐" />
            <el-option label="异业联盟" value="异业联盟" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="客户状态">
          <el-select v-model="form.status">
            <el-option label="意向客户" value="意向客户" />
            <el-option label="量房中" value="量房中" />
            <el-option label="设计中" value="设计中" />
            <el-option label="预算中" value="预算中" />
            <el-option label="已签约" value="已签约" />
            <el-option label="已流失" value="已流失" />
          </el-select>
        </el-form-item>
        <el-form-item label="客户等级">
          <el-select v-model="form.level">
            <el-option label="普通" value="普通" />
            <el-option label="潜在" value="潜在" />
            <el-option label="重点" value="重点" />
            <el-option label="VIP" value="VIP" />
          </el-select>
        </el-form-item>
        <el-form-item label="跟进人">
          <el-input v-model="form.follow_user" />
        </el-form-item>
        <el-form-item label="房屋地址">
          <el-input v-model="form.address" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="房屋面积">
              <el-input-number v-model="form.area" :min="0" :precision="1" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预算金额">
              <el-input-number v-model="form.budget" :min="0" :precision="2" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="客户需求">
          <el-input v-model="form.demand" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="下次跟进">
          <el-date-picker v-model="form.next_follow_date" type="date" value-format="YYYY-MM-DD" />
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

const customerList = ref([])
const showAddDialog = ref(false)
const isEdit = ref(false)
const form = reactive({
  id: null,
  name: '',
  phone: '',
  source: '',
  status: '意向客户',
  level: '普通',
  follow_user: '',
  address: '',
  area: 0,
  budget: 0,
  demand: '',
  next_follow_date: ''
})

const formatNumber = (num) => num ? Number(num).toLocaleString('zh-CN') : '0'

const getStatusType = (status) => {
  const types = { '意向客户': 'info', '量房中': 'warning', '设计中': 'primary', '预算中': 'warning', '已签约': 'success', '已流失': 'danger' }
  return types[status] || 'info'
}

const getLevelType = (level) => {
  const types = { '普通': 'info', '潜在': 'primary', '重点': 'warning', 'VIP': 'success' }
  return types[level] || 'info'
}

const loadData = async () => {
  try {
    const res = await axios.get('/api/customers')
    customerList.value = res.data
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
      await axios.put(`/api/customers/${form.id}`, form)
      ElMessage.success('更新成功')
    } else {
      await axios.post('/api/customers', form)
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
    await axios.delete(`/api/customers/${id}`)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    ElMessage.error('删除失败')
  }
}

const closeDialog = () => {
  showAddDialog.value = false
  isEdit.value = false
  Object.keys(form).forEach(key => {
    if (key === 'status') form[key] = '意向客户'
    else if (key === 'level') form[key] = '普通'
    else if (key === 'area' || key === 'budget') form[key] = 0
    else form[key] = ''
  })
}

onMounted(() => { loadData() })
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
