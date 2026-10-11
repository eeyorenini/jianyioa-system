<template>
  <div class="employees">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>员工列表</span>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            新增员工
          </el-button>
        </div>
      </template>
      <el-table :data="employeeList" style="width: 100%">
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="phone" label="电话" width="120" />
        <el-table-column prop="department_name" label="部门" width="100" />
        <el-table-column prop="position" label="职位" width="100" />
        <el-table-column prop="role_name" label="角色" width="100">
          <template #default="scope">
            <el-tag :type="getRoleType(scope.row.role_name)">{{ scope.row.role_name || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="scope">
            <el-tag :type="scope.row.status === '在职' ? 'success' : 'info'">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="scope">
            <div class="op-row">
              <el-button size="small" @click="handleEdit(scope.row)">编辑</el-button>
              <el-button size="small" type="warning" @click="handleResetPassword(scope.row)" v-if="canResetPassword">重置密码</el-button>
              <el-button type="danger" size="small" @click="handleDelete(scope.row.id)">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showAddDialog" :title="isEdit ? '编辑员工' : '新增员工'" width="700px">
      <el-form :model="form" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="姓名" required>
              <el-input v-model="form.name" placeholder="请输入姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="电话" required>
              <el-input v-model="form.phone" placeholder="请输入手机号" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20" v-if="!isEdit">
          <el-col :span="24">
            <el-form-item label="初始密码">
              <span style="color: #909399;">电话后6位（添加后自动设置）</span>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="邮箱">
              <el-input v-model="form.email" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="部门">
              <el-select v-model="form.department_id" placeholder="请选择部门" style="width: 100%">
                <el-option v-for="dept in departments" :key="dept.id" :label="dept.name" :value="dept.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="职位">
              <el-input v-model="form.position" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="角色">
              <el-select v-model="form.role_id" placeholder="请选择角色" style="width: 100%">
                <el-option v-for="role in roles" :key="role.id" :label="role.name" :value="role.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="form.status" style="width: 100%">
                <el-option label="在职" value="在职" />
                <el-option label="离职" value="离职" />
                <el-option label="停薪留职" value="停薪留职" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入职日期">
              <el-date-picker v-model="form.entry_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="外部人员">
              <el-switch
                v-model="form.is_external"
                :active-value="1"
                :inactive-value="0"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item>
              <div style="color:#909399; font-size:12px; line-height:1.4; padding-top:6px;">
                v2.3.1：工资/身份证/紧急联系人等字段已移除（无用）；外部人员请到 <b>组织结构 → 外部联系人</b> 独立模块管理。
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" @click="handleSave">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'
import { useUserStore } from '@/stores/user'

const employeeList = ref([])
const departments = ref([])
const roles = ref([])
const showAddDialog = ref(false)
const isEdit = ref(false)
const userStore = useUserStore()
// 是否可重置他人密码（与后端 employee:reset_password 权限对齐）
const canResetPassword = computed(() => userStore.canAction('employee', 'reset_password'))
const form = reactive({
  id: null,
  name: '',
  phone: '',
  email: '',
  department_id: null,
  position: '',
  role_id: null,
  status: '在职',
  entry_date: '',
  // v2.3.1：保留 is_external 字段以兼容现有数据；外部人员请到「外部联系人」独立模块管理
  is_external: 0,
})

const getRoleType = (role) => {
  const types = { '超级管理员': 'danger', '项目经理': 'warning', '设计师': 'primary', '财务': 'success', '普通员工': 'info' }
  return types[role] || 'info'
}

const loadData = async () => {
  try {
    const [empRes, deptRes, roleRes] = await Promise.all([
      request.get('/employees'),
      request.get('/departments'),
      request.get('/roles')
    ])
    employeeList.value = empRes.data || empRes
    departments.value = deptRes.data || deptRes
    roles.value = roleRes.data || roleRes
  } catch (error) {
    console.error('加载失败:', error)
  }
}

const handleResetPassword = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要重置 ${row.name} 的密码吗？重置后密码将变为 888888。`,
      '重置密码',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
    const res = await request.post(`/employees/${row.id}/reset-password`)
    ElMessage.success(`密码已重置为 888888`)
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('重置失败')
  }
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || '',
    department_id: row.department_id,
    position: row.position || '',
    role_id: row.role_id,
    status: row.status || '在职',
    entry_date: row.entry_date || '',
    // 外部人员标记：用 Number() 把 0/1/null 都规整
    is_external: Number(row.is_external) || 0,
  })
  showAddDialog.value = true
}

const handleSave = async () => {
  if (!form.phone) {
    ElMessage.warning('请输入手机号')
    return
  }
  if (!form.name) {
    ElMessage.warning('请输入姓名')
    return
  }
  try {
    if (isEdit.value) {
      await request.put(`/employees/${form.id}`, form)
      ElMessage.success('更新成功')
    } else {
      const res = await request.post('/employees', form)
      ElMessage.success(`添加成功，初始密码：${res.password || '888888'}`)
    }
    closeDialog()
    loadData()
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '操作失败')
  }
}

const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('此操作将永久删除该数据，是否继续？', '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await request.delete(`/employees/${id}`)
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
  form.phone = ''
  form.email = ''
  form.department_id = null
  form.position = ''
  form.role_id = null
  form.status = '在职'
  form.entry_date = ''
  form.is_external = 0
}

onMounted(() => { loadData() })
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }

/* 操作列：3 个按钮横排不折行 */
.op-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.op-row .el-button + .el-button { margin-left: 0; }
</style>
