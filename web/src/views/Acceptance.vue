<template>
  <div class="acceptance">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>验收管理</span>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            新增验收
          </el-button>
        </div>
      </template>
      <el-table :data="acceptanceList" style="width: 100%">
        <el-table-column prop="project_name" label="项目名称" width="180" />
        <el-table-column prop="stage" label="验收阶段" width="120">
          <template #default="scope">
            <el-tag>{{ scope.row.stage }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="quality_score" label="质量评分" width="100">
          <template #default="scope">
            <el-tag :type="getScoreType(scope.row.quality_score)">{{ scope.row.quality_score }}分</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="issues" label="问题记录" />
        <el-table-column prop="accept_status" label="验收状态" width="120">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.accept_status)">{{ scope.row.accept_status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="accept_date" label="验收日期" width="120" />
        <el-table-column prop="created_at" label="创建时间" width="120" />
        <el-table-column label="操作" width="180">
          <template #default="scope">
            <el-button size="small" @click="handleEdit(scope.row)">验收</el-button>
            <el-button type="danger" size="small" @click="handleDelete(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showAddDialog" :title="isEdit ? '验收记录' : '新增验收'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="项目名称">
          <el-input v-model="form.project_name" />
        </el-form-item>
        <el-form-item label="验收阶段">
          <el-select v-model="form.stage">
            <el-option label="水电验收" value="水电验收" />
            <el-option label="泥木验收" value="泥木验收" />
            <el-option label="油漆验收" value="油漆验收" />
            <el-option label="竣工验收" value="竣工验收" />
          </el-select>
        </el-form-item>
        <el-form-item label="质量评分">
          <el-input-number v-model="form.quality_score" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="问题记录">
          <el-input v-model="form.issues" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="验收状态">
          <el-select v-model="form.accept_status">
            <el-option label="待验收" value="待验收" />
            <el-option label="已通过" value="已通过" />
            <el-option label="需整改" value="需整改" />
          </el-select>
        </el-form-item>
        <el-form-item label="验收日期">
          <el-date-picker v-model="form.accept_date" type="date" value-format="YYYY-MM-DD" />
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
import { ElMessage, ElMessageBox } from 'element-plus'

const acceptanceList = ref([])
const showAddDialog = ref(false)
const isEdit = ref(false)
const form = reactive({
  id: null,
  project_id: null,
  project_name: '',
  stage: '水电验收',
  accept_status: '待验收',
  accept_date: '',
  quality_score: 100,
  issues: '',
  attachment: ''
})

const getScoreType = (score) => {
  if (score >= 90) return 'success'
  if (score >= 60) return 'warning'
  return 'danger'
}

const getStatusType = (status) => {
  const types = { '待验收': 'warning', '已通过': 'success', '需整改': 'danger' }
  return types[status] || 'info'
}

const loadData = async () => {
  try {
    const res = await axios.get('/api/acceptance')
    acceptanceList.value = res.data
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
      await axios.put(`/api/acceptance/${form.id}`, form)
      ElMessage.success('更新成功')
    } else {
      await axios.post('/api/acceptance', form)
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
    await ElMessageBox.confirm('此操作将永久删除该数据，是否继续？', '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await axios.delete(`/api/acceptance/${id}`)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}

const closeDialog = () => {
  showAddDialog.value = false
  isEdit.value = false
  form.id = null
  form.project_id = null
  form.project_name = ''
  form.stage = '水电验收'
  form.accept_status = '待验收'
  form.accept_date = ''
  form.quality_score = 100
  form.issues = ''
  form.attachment = ''
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
