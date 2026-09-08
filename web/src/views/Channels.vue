<template>
  <div class="channels">
    <h2>🤝 渠道管理</h2>
    <el-card>
      <el-form :inline="true">
        <el-form-item label="渠道名称">
          <el-input v-model="searchForm.name" placeholder="请输入渠道名称" clearable />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="searchForm.type" placeholder="请选择" clearable>
            <el-option label="装修公司" value="装修公司" />
            <el-option label="设计工作室" value="设计工作室" />
            <el-option label="建材商" value="建材商" />
            <el-option label="物业" value="物业" />
            <el-option label="个人推荐" value="个人推荐" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadData">搜索</el-button>
          <el-button type="success" @click="handleAdd">新增渠道</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="tableData" border style="width: 100%; margin-top: 20px;">
        <el-table-column prop="name" label="渠道名称" min-width="120" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="contact_person" label="联系人" width="80" />
        <el-table-column prop="contact_phone" label="电话" width="120" />
        <el-table-column prop="address" label="地址" min-width="150" />
        <el-table-column prop="commission_rate" label="佣金比例" width="80">
          <template #default="{ row }">
            {{ row.commission_rate }}%
          </template>
        </el-table-column>
        <el-table-column prop="total_customer" label="客户数" width="80" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === '合作中' ? 'success' : 'info'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑渠道' : '新增渠道'" width="550px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="渠道名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="装修公司" value="装修公司" />
            <el-option label="设计工作室" value="设计工作室" />
            <el-option label="建材商" value="建材商" />
            <el-option label="物业" value="物业" />
            <el-option label="个人推荐" value="个人推荐" />
          </el-select>
        </el-form-item>
        <el-form-item label="联系人"><el-input v-model="form.contact_person" /></el-form-item>
        <el-form-item label="联系电话"><el-input v-model="form.contact_phone" /></el-form-item>
        <el-form-item label="地址"><el-input v-model="form.address" /></el-form-item>
        <el-form-item label="佣金比例">
          <el-input-number v-model="form.commission_rate" :min="0" :max="100" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio label="合作中">合作中</el-radio>
            <el-radio label="已终止">已终止</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" rows="2" /></el-form-item>
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
const searchForm = ref({ name: '', type: '' })
const dialogVisible = ref(false)
const isEdit = ref(false)
const form = ref({ id: null, name: '', type: '', contact_person: '', contact_phone: '', address: '', commission_rate: 0, status: '合作中', remark: '' })

const loadData = async () => {
  try {
    const res = await fetch('/api/channels')
    let data = await res.json()
    if (searchForm.value.name) data = data.filter(d => d.name.includes(searchForm.value.name))
    if (searchForm.value.type) data = data.filter(d => d.type === searchForm.value.type)
    tableData.value = data
  } catch (error) { ElMessage.error('加载失败') }
}

const handleAdd = () => { isEdit.value = false; form.value = { id: null, name: '', type: '', contact_person: '', contact_phone: '', address: '', commission_rate: 0, status: '合作中', remark: '' }; dialogVisible.value = true }
const handleEdit = (row) => { isEdit.value = true; form.value = { ...row }; dialogVisible.value = true }

const handleSave = async () => {
  try {
    const method = isEdit.value ? 'PUT' : 'POST'
    const url = isEdit.value ? `/api/channels/${form.value.id}` : '/api/channels'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form.value) })
    ElMessage.success('保存成功'); dialogVisible.value = false; loadData()
  } catch (error) { ElMessage.error('保存失败') }
}

const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除吗?', '提示', { type: 'warning' })
    await fetch(`/api/channels/${id}`, { method: 'DELETE' })
    ElMessage.success('删除成功'); loadData()
  } catch (error) { if (error !== 'cancel') ElMessage.error('删除失败') }
}

onMounted(loadData)
</script>

<style scoped>.channels { padding: 20px; }</style>
