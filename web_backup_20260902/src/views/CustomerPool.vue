<template>
  <div class="customer-pool">
    <h2>🌊 公海客户池</h2>
    
    <el-card>
      <el-form :inline="true" :model="searchForm">
        <el-form-item label="姓名">
          <el-input v-model="searchForm.name" placeholder="请输入姓名" clearable />
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="searchForm.source" placeholder="请选择" clearable>
            <el-option label="自然到店" value="自然到店" />
            <el-option label="电话咨询" value="电话咨询" />
            <el-option label="网络推广" value="网络推广" />
            <el-option label="老客户推荐" value="老客户推荐" />
            <el-option label="异业联盟" value="异业联盟" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadData">搜索</el-button>
          <el-button type="success" @click="handleAdd">新增客户</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="tableData" border style="width: 100%; margin-top: 20px;">
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column prop="source" label="来源" width="100" />
        <el-table-column prop="area" label="面积(㎡)" width="80" />
        <el-table-column prop="budget" label="预算" width="100">
          <template #default="{ row }">
            ¥{{ row.budget?.toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column prop="demand" label="需求" min-width="150" />
        <el-table-column prop="lost_reason" label="流失原因" width="120" />
        <el-table-column prop="lost_date" label="流失日期" width="100" />
        <el-table-column prop="created_at" label="录入日期" width="100">
          <template #default="{ row }">
            {{ row.created_at?.split('T')[0] }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑客户' : '新增客户'" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="姓名">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="form.source" style="width: 100%">
            <el-option label="自然到店" value="自然到店" />
            <el-option label="电话咨询" value="电话咨询" />
            <el-option label="网络推广" value="网络推广" />
            <el-option label="老客户推荐" value="老客户推荐" />
            <el-option label="异业联盟" value="异业联盟" />
          </el-select>
        </el-form-item>
        <el-form-item label="面积">
          <el-input-number v-model="form.area" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="预算">
          <el-input-number v-model="form.budget" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="需求">
          <el-input v-model="form.demand" type="textarea" rows="2" />
        </el-form-item>
        <el-form-item label="流失原因">
          <el-input v-model="form.lost_reason" />
        </el-form-item>
        <el-form-item label="流失日期">
          <el-date-picker v-model="form.lost_date" type="date" style="width: 100%" />
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
const searchForm = ref({ name: '', source: '' })
const dialogVisible = ref(false)
const isEdit = ref(false)
const form = ref({
  id: null,
  name: '',
  phone: '',
  source: '',
  area: null,
  budget: null,
  demand: '',
  lost_reason: '',
  lost_date: ''
})

const loadData = async () => {
  try {
    const res = await fetch('/api/customer-pool')
    let data = await res.json()
    if (searchForm.value.name) {
      data = data.filter(d => d.name.includes(searchForm.value.name))
    }
    if (searchForm.value.source) {
      data = data.filter(d => d.source === searchForm.value.source)
    }
    tableData.value = data
  } catch (error) {
    ElMessage.error('加载失败')
  }
}

const handleAdd = () => {
  isEdit.value = false
  form.value = { id: null, name: '', phone: '', source: '', area: null, budget: null, demand: '', lost_reason: '', lost_date: '' }
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
    const url = isEdit.value ? `/api/customer-pool/${form.value.id}` : '/api/customer-pool'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value)
    })
    ElMessage.success('保存成功')
    dialogVisible.value = false
    loadData()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除吗?', '提示', { type: 'warning' })
    await fetch(`/api/customer-pool/${id}`, { method: 'DELETE' })
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}

onMounted(loadData)
</script>

<style scoped>
.customer-pool {
  padding: 20px;
}
</style>
