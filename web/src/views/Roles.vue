<template>
  <div class="roles">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>角色列表</span>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            新增角色
          </el-button>
        </div>
      </template>
      <el-table :data="roleList" style="width: 100%">
        <el-table-column prop="name" label="角色名称" width="150" />
        <el-table-column prop="code" label="角色编码" width="150" />
        <el-table-column prop="description" label="描述" />
        <el-table-column label="权限数量" width="100">
          <template #default="scope">
            {{ getPermissionCount(scope.row.permissions) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="scope">
            <el-button size="small" @click="handleEdit(scope.row)">编辑</el-button>
            <el-button type="danger" size="small" @click="handleDelete(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showAddDialog" :title="isEdit ? '编辑角色' : '新增角色'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="角色名称">
          <el-input v-model="form.name" placeholder="如：项目经理" />
        </el-form-item>
        <el-form-item label="角色编码">
          <el-input v-model="form.code" placeholder="输入角色名称后自动生成，也可手动填写" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="权限分配">
          <el-checkbox-group v-model="selectedPermissions">
            <el-checkbox v-for="perm in permissionList" :key="perm.id" :label="perm.code" :value="perm.code">
              {{ perm.name }}
            </el-checkbox>
          </el-checkbox-group>
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
import { ref, reactive, onMounted, watch } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const roleList = ref([])
const permissionList = ref([])
const showAddDialog = ref(false)
const isEdit = ref(false)
const selectedPermissions = ref([])
const form = reactive({
  id: null,
  name: '',
  code: '',
  description: '',
  permissions: []
})

const getPermissionCount = (perms) => {
  try {
    return JSON.parse(perms || '[]').length
  } catch {
    return 0
  }
}

const loadData = async () => {
  try {
    const [roleRes, permRes] = await Promise.all([
      axios.get('/api/roles'),
      axios.get('/api/permissions')
    ])
    roleList.value = roleRes.data
    permissionList.value = permRes.data
  } catch (error) {
    console.error('加载失败:', error)
  }
}

const handleEdit = (row) => {
  isEdit.value = true
  form.id = row.id
  form.name = row.name
  form.code = row.code
  form.description = row.description
  try {
    selectedPermissions.value = JSON.parse(row.permissions || '[]')
  } catch {
    selectedPermissions.value = []
  }
  showAddDialog.value = true
}

const handleSave = async () => {
  try {
    const data = {
      name: form.name,
      code: form.code,
      description: form.description,
      permissions: selectedPermissions.value
    }
    if (isEdit.value) {
      await axios.put(`/api/roles/${form.id}`, data)
      ElMessage.success('更新成功')
    } else {
      await axios.post('/api/roles', data)
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
    await axios.delete(`/api/roles/${id}`)
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
  form.name = ''
  form.code = ''
  form.description = ''
  selectedPermissions.value = []
}

// 根据角色名称自动生成角色编码
const generateCode = (name) => {
  if (!name) return ''
  // 移除空格、转小写、替换特殊字符
  return name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
    .split('')
    .map(c => {
      // 汉字转拼音首字母（简单映射常见字）
      const map = { '超': 'c', '管': 'g', '理': 'l', '员': 'y', '工': 'g', '设': 's', '计': 'j', '财': 'c', '务': 'w', '普': 'p', '通': 't' }
      return map[c] || c
    })
    .join('')
    .replace(/[a-z]+/g, m => m) // 保留英文字母
    .slice(0, 20)
}

// 监听名称变化，自动生成编码
watch(() => form.name, (newVal) => {
  if (!isEdit.value && newVal) {
    form.code = generateCode(newVal)
  }
})

onMounted(() => { loadData() })
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.el-checkbox { margin-right: 15px; margin-bottom: 10px; }
</style>
