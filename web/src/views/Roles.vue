<template>
  <div class="roles">
    <!-- 顶部预设角色快捷创建区 -->
    <el-card class="preset-card">
      <div class="preset-roles">
        <span class="preset-label">快捷创建：</span>
        <el-button
          v-for="preset in presetRoles"
          :key="preset.code"
          type="primary"
          plain
          @click="handleQuickCreate(preset)"
        >
          <el-icon><Plus /></el-icon>
          创建{{ preset.name }}
        </el-button>
      </div>
    </el-card>

    <el-card>
      <template #header>
        <div class="card-header">
          <span>角色列表</span>
          <el-button type="primary" @click="handleAdd">
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

    <!-- 编辑弹窗 -->
    <el-dialog v-model="showDialog" :title="isEdit ? '编辑角色' : '新增角色'" width="800px" @closed="resetForm">
      <el-tabs v-model="activeTab">
        <!-- Tab1 - 角色信息 -->
        <el-tab-pane label="角色信息" name="info">
          <el-form :model="form" label-width="100px">
            <el-form-item label="角色名称" required>
              <el-input v-model="form.name" placeholder="请输入角色名称" />
            </el-form-item>
            <el-form-item label="角色编码" required>
              <el-input
                v-model="form.code"
                placeholder="请输入角色编码"
                :disabled="form.code === 'admin'"
              />
            </el-form-item>
            <el-form-item label="描述">
              <el-input v-model="form.description" type="textarea" :rows="3" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- Tab2 - 功能权限 -->
        <el-tab-pane label="功能权限" name="permissions">
          <el-table :data="moduleList" border style="width: 100%">
            <el-table-column prop="name" label="模块" width="150" />
            <el-table-column label="全部" width="70">
              <template #default="scope">
                <el-checkbox
                  v-model="scope.row.hasAll"
                  :disabled="isAllPermission"
                  @change="handlePermissionChange(scope.row, 'hasAll')"
                />
              </template>
            </el-table-column>
            <el-table-column label="读" width="70">
              <template #default="scope">
                <el-checkbox
                  v-model="scope.row.read"
                  :disabled="isAllPermission"
                  @change="handlePermissionChange(scope.row, 'read')"
                />
              </template>
            </el-table-column>
            <el-table-column label="写" width="70">
              <template #default="scope">
                <el-checkbox
                  v-model="scope.row.write"
                  :disabled="isAllPermission"
                  @change="handlePermissionChange(scope.row, 'write')"
                />
              </template>
            </el-table-column>
            <el-table-column label="删" width="70">
              <template #default="scope">
                <el-checkbox
                  v-model="scope.row.delete"
                  :disabled="isAllPermission || !scope.row.hasDelete"
                />
              </template>
            </el-table-column>
            <el-table-column label="重置密码" width="100">
              <template #default="scope">
                <el-checkbox
                  v-model="scope.row.reset_password"
                  :disabled="isAllPermission || !scope.row.hasResetPassword"
                />
              </template>
            </el-table-column>
          </el-table>
          <div style="margin-top: 10px; color: #909399; font-size: 12px;">
            注：admin角色拥有全部权限，无需单独设置
          </div>
        </el-tab-pane>

        <!-- Tab3 - 消息订阅 -->
        <el-tab-pane label="消息订阅" name="notifications">
          <el-checkbox-group v-model="selectedNotifications">
            <el-row>
              <el-col
                v-for="notif in notificationTypes"
                :key="notif.value"
                :span="8"
                style="margin-bottom: 10px;"
              >
                <el-checkbox :value="notif.value" :disabled="isAllNotification">
                  {{ notif.label }}
                </el-checkbox>
              </el-col>
            </el-row>
          </el-checkbox-group>
        </el-tab-pane>

        <!-- Tab4 - 可管理部门 -->
        <el-tab-pane label="可管理部门" name="departments">
          <el-checkbox-group v-model="selectedDepartments">
            <el-row>
              <el-col
                v-for="dept in departments"
                :key="dept.id"
                :span="8"
                style="margin-bottom: 10px;"
              >
                <el-checkbox :value="dept.id">
                  {{ dept.name }}
                </el-checkbox>
              </el-col>
            </el-row>
          </el-checkbox-group>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSave">确定</el-button>
      </template>
    </el-dialog>

    <!-- 快捷创建弹窗 -->
    <el-dialog v-model="showQuickDialog" :title="quickForm.name" width="500px">
      <el-form :model="quickForm" label-width="100px">
        <el-form-item label="角色名称">
          <el-input v-model="quickForm.name" disabled />
        </el-form-item>
        <el-form-item label="角色编码">
          <el-input v-model="quickForm.code" disabled />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="quickForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showQuickDialog = false">取消</el-button>
        <el-button type="primary" @click="handleQuickSave">确定创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'

const roleList = ref([])
const departments = ref([])
const showDialog = ref(false)
const showQuickDialog = ref(false)
const isEdit = ref(false)
const activeTab = ref('info')

// 预设角色数据
const presetRoles = [
  {
    name: '管理员',
    code: 'admin',
    permissions: ['*'],
    notification_types: [
      'contract_created', 'contract_updated', 'project_created', 'project_status_changed',
      'node_status_changed', 'project_progress', 'inspection_submit', 'acceptance_submit',
      'dispatch_created', 'dispatch_status_changed', 'approval_submit', 'approval_result',
      'notice_published', 'customer_follow', 'invoice_created', 'system_notice'
    ],
    description: '系统超级管理员，拥有全部权限'
  },
  {
    name: '项目经理',
    code: 'project_manager',
    permissions: [
      'customer:read', 'contract:read', 'project:write', 'inspection:read',
      'acceptance:read', 'finance:read', 'notice:read', 'notice:write',
      'dispatch:write', 'approval:read', 'approval:write', 'budget:read'
    ],
    notification_types: [
      'contract_created', 'contract_updated', 'project_created', 'project_status_changed',
      'node_status_changed', 'project_progress', 'inspection_submit', 'acceptance_submit',
      'dispatch_created', 'approval_submit'
    ],
    description: '负责项目整体管理和协调'
  },
  {
    name: '设计师',
    code: 'designer',
    permissions: [
      'customer:read', 'customer:write', 'project:read', 'project:write',
      'contract:read', 'inspection:read', 'notice:read'
    ],
    notification_types: [
      'project_created', 'node_status_changed', 'project_progress', 'acceptance_submit'
    ],
    description: '负责设计方案和客户沟通'
  },
  {
    name: '监理',
    code: 'supervisor',
    permissions: [
      'project:read', 'inspection:write', 'acceptance:write', 'notice:read'
    ],
    notification_types: [
      'inspection_submit', 'acceptance_submit', 'dispatch_created'
    ],
    description: '负责工程质量和进度监督'
  },
  {
    name: '财务',
    code: 'finance',
    permissions: [
      'finance:read', 'finance:write', 'contract:read',
      'invoice:read', 'invoice:write', 'notice:read'
    ],
    notification_types: [
      'contract_created', 'contract_updated', 'invoice_created', 'approval_result'
    ],
    description: '负责财务和发票管理'
  },
  {
    name: '客户',
    code: 'customer',
    permissions: [
      'project:read', 'contract:read', 'notice:read'
    ],
    notification_types: [
      'project_created', 'node_status_changed', 'project_progress',
      'inspection_submit', 'acceptance_submit', 'notice_published'
    ],
    description: '客户角色'
  }
]

// 模块列表
const moduleList = ref([
  { key: 'customer', name: '客户管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'contract', name: '合同管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'project', name: '项目管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'inspection', name: '巡检验房', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'acceptance', name: '验收管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'approval', name: '审批管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'employee', name: '员工管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: true },
  { key: 'notice', name: '通知公告', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'report', name: '报表管理', hasAll: false, read: false, write: false, delete: false, hasDelete: false, hasResetPassword: false },
  { key: 'budget', name: '预算管理', hasAll: false, read: false, write: false, delete: false, hasDelete: false, hasResetPassword: false },
  { key: 'warehouse', name: '仓库管理', hasAll: false, read: false, write: false, delete: false, hasDelete: false, hasResetPassword: false },
  { key: 'settings', name: '系统设置', hasAll: false, read: false, write: false, delete: false, hasDelete: false, hasResetPassword: false },
  { key: 'sms', name: '短信模板', hasAll: false, read: false, write: false, delete: false, hasDelete: false, hasResetPassword: false },
  { key: 'role', name: '角色管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'dispatch', name: '派工管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'purchase', name: '采购管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'invoice', name: '发票管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false }
])

// 消息类型
const notificationTypes = [
  { value: 'contract_created', label: '新增合同' },
  { value: 'contract_updated', label: '合同变更' },
  { value: 'project_created', label: '新增项目' },
  { value: 'project_status_changed', label: '项目状态变更' },
  { value: 'node_status_changed', label: '节点状态变更' },
  { value: 'project_progress', label: '项目进展' },
  { value: 'inspection_submit', label: '巡检提交' },
  { value: 'acceptance_submit', label: '验收提交' },
  { value: 'dispatch_created', label: '新增派工' },
  { value: 'dispatch_status_changed', label: '派工状态变更' },
  { value: 'approval_submit', label: '审批提交' },
  { value: 'approval_result', label: '审批结果' },
  { value: 'notice_published', label: '发布公告' },
  { value: 'customer_follow', label: '客户跟进' },
  { value: 'invoice_created', label: '新增发票' },
  { value: 'system_notice', label: '系统通知' }
]

const form = reactive({
  id: null,
  name: '',
  code: '',
  description: '',
  permissions: [],
  notification_types: [],
  managed_department_ids: []
})

const quickForm = reactive({
  name: '',
  code: '',
  description: '',
  permissions: [],
  notification_types: []
})

const selectedNotifications = ref([])
const selectedDepartments = ref([])

const isAllPermission = computed(() => form.code === 'admin')
const isAllNotification = computed(() => form.code === 'admin')

const getPermissionCount = (perms) => {
  try {
    const parsed = JSON.parse(perms || '[]')
    return parsed.includes('*') ? '全部' : parsed.length
  } catch {
    return 0
  }
}

const loadRoles = async () => {
  try {
    const res = await request.get('/roles')
    roleList.value = res.data || res
  } catch (error) {
    console.error('加载角色失败:', error)
  }
}

const loadDepartments = async () => {
  try {
    const res = await request.get('/departments')
    departments.value = res.data || res
  } catch (error) {
    console.error('加载部门失败:', error)
  }
}

const handleAdd = () => {
  isEdit.value = false
  activeTab.value = 'info'
  resetFormData()
  showDialog.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  activeTab.value = 'info'
  form.id = row.id
  form.name = row.name
  form.code = row.code
  form.description = row.description || ''

  // 解析权限
  try {
    const perms = JSON.parse(row.permissions || '[]')
    if (perms.includes('*')) {
      // admin角色本身，form.code保持原值，不强制覆盖
    } else {
      parsePermissionsToModules(perms)
    }
  } catch {
    parsePermissionsToModules([])
  }

  // 解析消息订阅
  try {
    selectedNotifications.value = JSON.parse(row.notification_types || '[]')
  } catch {
    selectedNotifications.value = []
  }

  // 解析可管理部门
  try {
    selectedDepartments.value = JSON.parse(row.managed_department_ids || '[]')
  } catch {
    selectedDepartments.value = []
  }

  showDialog.value = true
}

const parsePermissionsToModules = (perms) => {
  moduleList.value.forEach(module => {
    module.hasAll = perms.includes(`${module.key}:read_all`);
    module.read = perms.includes(`${module.key}:read`);
    module.write = perms.includes(`${module.key}:write`);
    module.delete = perms.includes(`${module.key}:delete`);
    module.reset_password = perms.includes(`${module.key}:reset_password`);
  });
}

const handlePermissionChange = (row, type) => {
  // 权限变化时的处理
}

const handleQuickCreate = (preset) => {
  Object.assign(quickForm, {
    name: preset.name,
    code: preset.code,
    description: preset.description,
    permissions: preset.permissions,
    notification_types: preset.notification_types
  })
  showQuickDialog.value = true
}

const handleQuickSave = async () => {
  try {
    await request.post('/roles', {
      name: quickForm.name,
      code: quickForm.code,
      description: quickForm.description,
      permissions: quickForm.permissions,
      notification_types: quickForm.notification_types,
      managed_department_ids: null
    })
    ElMessage.success('创建成功')
    showQuickDialog.value = false
    loadRoles()
  } catch (error) {
    ElMessage.error('创建失败')
  }
}

const handleSave = async () => {
  if (!form.name) {
    ElMessage.warning('请输入角色名称')
    return
  }
  if (!form.code) {
    ElMessage.warning('请输入角色编码')
    return
  }

  // 构建权限数组
  let permissions = [];
  if (form.code === 'admin') {
    permissions = ['*'];
  } else {
    moduleList.value.forEach(module => {
      if (module.hasAll) permissions.push(`${module.key}:read_all`);
      if (module.read) permissions.push(`${module.key}:read`);
      if (module.write) permissions.push(`${module.key}:write`);
      if (module.delete) permissions.push(`${module.key}:delete`);
      if (module.reset_password) permissions.push(`${module.key}:reset_password`);
    });
  }

  try {
    const data = {
      name: form.name,
      code: form.code,
      description: form.description,
      permissions,
      notification_types: selectedNotifications.value,
      managed_department_ids: selectedDepartments.value.length > 0 ? selectedDepartments.value : null
    }

    if (isEdit.value) {
      await request.put(`/roles/${form.id}`, data)
      ElMessage.success('更新成功')
    } else {
      await request.post('/roles', data)
      ElMessage.success('添加成功')
    }
    showDialog.value = false
    loadRoles()
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
    await request.delete(`/roles/${id}`)
    ElMessage.success('删除成功')
    loadRoles()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}

const resetForm = () => {
  resetFormData()
}

const resetFormData = () => {
  form.id = null
  form.name = ''
  form.code = ''
  form.description = ''
  form.permissions = []
  form.notification_types = []
  form.managed_department_ids = []
  selectedNotifications.value = []
  selectedDepartments.value = []
  moduleList.value.forEach(module => {
    module.hasAll = false;
    module.read = false;
    module.write = false;
    module.delete = false;
    module.reset_password = false;
  });
}

onMounted(() => {
  loadRoles()
  loadDepartments()
})
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.preset-card { margin-bottom: 20px; }
.preset-roles {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.preset-label {
  font-weight: 500;
  color: #303133;
}
</style>
