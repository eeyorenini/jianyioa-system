<template>
  <div class="buildings">
    <h2>🏢 楼盘管理</h2>
    
    <el-card>
      <el-form :inline="true">
        <el-form-item label="楼盘名称">
          <el-input v-model="searchForm.name" placeholder="请输入楼盘名称" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadData">搜索</el-button>
          <el-button type="success" @click="handleAdd">新增楼盘</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="tableData" border style="width: 100%; margin-top: 20px;">
        <el-table-column prop="name" label="楼盘名称" min-width="150" />
        <el-table-column prop="address" label="地址" min-width="200" />
        <el-table-column prop="area" label="区域" width="100" />
        <el-table-column prop="building_type" label="类型" width="80" />
        <el-table-column prop="total_houses" label="总户数" width="80" />
        <el-table-column prop="decoration_count" label="已装修" width="80" />
        <el-table-column prop="developer" label="开发商" width="120" />
        <el-table-column prop="property_fee" label="物业费" width="80">
          <template #default="{ row }">
            ¥{{ row.property_fee }}/㎡
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === '在售' ? 'success' : 'info'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑楼盘' : '新增楼盘'" width="550px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="楼盘名称">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="form.address" />
        </el-form-item>
        <el-form-item label="区域">
          <el-input v-model="form.area" />
        </el-form-item>
        <el-form-item label="楼盘类型">
          <el-select v-model="form.building_type" style="width: 100%">
            <el-option label="住宅" value="住宅" />
            <el-option label="别墅" value="别墅" />
            <el-option label="商铺" value="商铺" />
            <el-option label="写字楼" value="写字楼" />
          </el-select>
        </el-form-item>
        <el-form-item label="总户数">
          <el-input-number v-model="form.total_houses" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="开发商">
          <el-input v-model="form.developer" />
        </el-form-item>
        <el-form-item label="物业费">
          <el-input-number v-model="form.property_fee" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio label="在售">在售</el-radio>
            <el-radio label="售罄">售罄</el-radio>
          </el-radio-group>
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
const searchForm = ref({ name: '' })
const dialogVisible = ref(false)
const isEdit = ref(false)
const form = ref({
  id: null, name: '', address: '', area: '', building_type: '住宅',
  total_houses: null, developer: '', property_fee: null, status: '在售'
})

const loadData = async () => {
  try {
    const res = await fetch('/api/buildings')
    let data = await res.json()
    if (searchForm.value.name) {
      data = data.filter(d => d.name.includes(searchForm.value.name))
    }
    tableData.value = data
  } catch (error) {
    ElMessage.error('加载失败')
  }
}

const handleAdd = () => {
  isEdit.value = false
  form.value = { id: null, name: '', address: '', area: '', building_type: '住宅', total_houses: null, developer: '', property_fee: null, status: '在售' }
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
    const url = isEdit.value ? `/api/buildings/${form.value.id}` : '/api/buildings'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form.value) })
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
    await fetch(`/api/buildings/${id}`, { method: 'DELETE' })
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}

onMounted(loadData)
</script>

<style scoped>
.buildings { padding: 20px; }
</style>
