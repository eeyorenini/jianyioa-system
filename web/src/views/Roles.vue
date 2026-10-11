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
            <el-table-column label="全部数据" width="90">
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
            <el-table-column label="审核" width="70">
              <template #default="scope">
                <el-checkbox
                  v-model="scope.row.approve"
                  :disabled="isAllPermission || !scope.row.hasApprove"
                />
              </template>
            </el-table-column>
            <el-table-column label="财务" width="70">
              <template #default="scope">
                <el-checkbox
                  v-model="scope.row.finance_action"
                  :disabled="isAllPermission || !scope.row.hasFinance"
                />
              </template>
            </el-table-column>
          </el-table>
          <div style="margin-top: 10px; color: #909399; font-size: 12px;">
            注：「全部数据」指可查看该模块的全部数据（read_all），不勾选则只能查看自己创建/相关的数据；「财务」列用于<b>金额类业务</b>（采购 / 合同 / 项目合同 / 增减项 / 催收），勾选后可进行财务受理与收款相关操作；「工资」列仅员工模块可用，勾选后可查看员工工资与身份证（敏感字段），不勾选则列表脱敏（本人始终可见自己的）。<br/>
            <b>员工模块（通讯录）</b>口径：勾「读」= 全内部员工可见；勾「全部数据」= 含外部人员；勾「工资」= 可见工资身份证；不勾读= 仅本人。可结合下方"可管理部门"页签收窄到指定部门。
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
          <el-alert type="info" :closable="false" show-icon style="margin-bottom: 14px;">
            <div style="line-height: 1.6; font-size: 13px;">
              <b>作用</b>：对<b>通讯录（员工模块）</b>做范围<b>收窄</b>。勾选后，该角色在通讯录里只能看到<b>所辖部门（含下级部门）</b>的员工 + 始终能看到自己。
              <br/>不勾选则不启用，按「员工模块 · 读」权限的口径：勾"读"= 全内部员工、勾"全部数据"= 含外部、不勾= 仅本人。
              <br/>适用：部门负责人 / 项目经理 / 财务需要限制查看范围时配置。
            </div>
          </el-alert>
          <el-checkbox-group v-model="selectedDepartments">
            <el-row>
              <el-col
                v-for="dept in deptOptions"
                :key="dept.id"
                :span="8"
                style="margin-bottom: 10px;"
              >
                <el-checkbox :value="dept.id">
                  <span :style="{ paddingLeft: (dept.depth * 14) + 'px' }">
                    {{ dept.depth > 0 ? '└ ' : '' }}{{ dept.name }}
                  </span>
                </el-checkbox>
              </el-col>
            </el-row>
          </el-checkbox-group>
          <div v-if="!departments.length" style="color: #909399; font-size: 13px; padding: 6px 0;">
            暂无部门，请先在「部门管理」中创建部门。
          </div>
        </el-tab-pane>

        <!-- Tab5 - 客户端可见（v2.3.1 新增）——
             业主（customers 表）不属于 roles，8 个开关是"全局一份"，存在 system_settings。
             这里只是入口跳转，不在角色内编辑；详见「客户端可见配置」独立页。 -->
        <el-tab-pane label="客户端可见" name="customer_visibility">
          <el-alert type="info" :closable="false" show-icon style="margin-bottom: 14px;">
            <div style="line-height: 1.6; font-size: 13px;">
              业主（clients）从 <code>/api/customers/login</code> 登录，<b>不在「角色」表中</b>，
              其可见的 8 项内容（项目信息、施工日志、巡检记录、验收记录、整改单、合同金额、家庭成员、消息通知）
              是 <b>全局一份</b>，存在 <code>system_settings.category='customer_visibility'</code>。
              <br/>⚠️ 前提：业主必须与项目相关联才谈得上"开不开"；不相关项目，开关不生效。
            </div>
          </el-alert>
          <el-button type="primary" plain @click="goCustomerVisibility">
            <el-icon><Setting /></el-icon>
            打开「客户端可见配置」页面
          </el-button>
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
import { useRouter } from 'vue-router'
import { Setting } from '@element-plus/icons-vue'
import request from '@/utils/request'

const roleList = ref([])
const departments = ref([])
const router = useRouter()
const goCustomerVisibility = () => router.push('/customer-visibility')

// 部门选项：按 parent_id 组织为层级并缩进展示（便于识别上下级部门）
const deptOptions = computed(() => {
  const list = departments.value || []
  const byParent = new Map()
  list.forEach((d) => {
    const p = d.parent_id ? d.parent_id : '__root__'
    if (!byParent.has(p)) byParent.set(p, [])
    byParent.get(p).push(d)
  })
  const out = []
  const walk = (key, depth) => {
    (byParent.get(key) || []).forEach((d) => {
      out.push({ id: d.id, name: d.name, depth })
      walk(d.id, depth + 1)
    })
  }
  walk('__root__', 0)
  // 兜底：parent_id 指向不存在部门的孤立节点也要展示
  const seen = new Set(out.map((o) => o.id))
  list.forEach((d) => { if (!seen.has(d.id)) out.push({ id: d.id, name: d.name, depth: 0 }) })
  return out
})
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
      'notice_published', 'customer_follow', 'invoice_created', 'system_notice',
      'purchase_submit', 'purchase_approved', 'purchase_rejected',
      'purchase_reimbursing', 'purchase_finance_confirmed', 'purchase_reimbursed'
    ],
    description: '系统超级管理员，拥有全部权限'
  },
  {
    name: '项目经理',
    code: 'project_manager',
    permissions: [
      'customer:read', 'contract:read', 'project:read', 'project:write', 'project:read_all',
      'inspection:read', 'acceptance:read', 'finance:read', 'notice:read', 'notice:write',
      'dispatch:write', 'approval:read', 'approval:write', 'budget:read',
      'quote:read', 'quote:write', 'purchase:read', 'purchase:approve'
    ],
    notification_types: [
      'contract_created', 'contract_updated', 'project_created', 'project_status_changed',
      'node_status_changed', 'project_progress', 'inspection_submit', 'acceptance_submit',
      'dispatch_created', 'approval_submit',
      'purchase_submit', 'purchase_approved', 'purchase_reimbursing', 'purchase_finance_confirmed', 'purchase_reimbursed'
    ],
    description: '负责项目整体管理和协调'
  },
  {
    name: '设计师',
    code: 'designer',
    permissions: [
      'customer:read', 'customer:write', 'project:read', 'project:write',
      'contract:read', 'inspection:read', 'notice:read',
      'quote:read', 'quote:write', 'purchase:read', 'purchase:approve'
    ],
    notification_types: [
      'project_created', 'node_status_changed', 'project_progress', 'acceptance_submit',
      'purchase_submit', 'purchase_approved', 'purchase_reimbursing'
    ],
    description: '负责设计方案和客户沟通'
  },
  {
    name: '监理',
    code: 'supervisor',
    permissions: [
      'project:read', 'inspection:write', 'acceptance:write', 'notice:read',
      'purchase:read'
    ],
    notification_types: [
      'inspection_submit', 'acceptance_submit', 'dispatch_created',
      'purchase_submit', 'purchase_approved', 'purchase_reimbursing'
    ],
    description: '负责工程质量和进度监督'
  },
  {
    name: '财务',
    code: 'finance',
    permissions: [
      'finance:read', 'finance:write', 'finance:delete', 'finance:read_all',
      'contract:read', 'invoice:read', 'invoice:write', 'notice:read',
      'purchase:read', 'purchase:finance'
    ],
    notification_types: [
      'contract_created', 'contract_updated', 'invoice_created', 'approval_result',
      'purchase_finance_confirmed', 'purchase_reimbursed'
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
// key 必须与后端权限码前缀一致（server.js 中 checkPermission / hasReadAllPermission 使用的模块名）
// hasDelete / hasResetPassword / hasApprove / hasFinance 控制该模块是否展示对应的动作列
const moduleList = ref([
  { key: 'customer', name: '客户管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'contract', name: '合同模板', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false, hasApprove: true, approve: false, hasFinance: true, finance_action: false },
  { key: 'project_contract', name: '项目合同', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false, hasApprove: true, approve: false, hasFinance: true, finance_action: false },
  { key: 'project', name: '项目管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  // v2.3.1 新增：施工日志（从 project 拆出来单独配置）
  { key: 'project_log', name: '施工日志', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'contract_change', name: '增减项', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false, hasApprove: true, approve: false, hasFinance: true, finance_action: false },
  { key: 'quote', name: '报价管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'inspection', name: '巡检验房', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'acceptance', name: '验收管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'approval', name: '审批管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'notice', name: '通知公告', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'report', name: '报表管理', hasAll: false, read: false, write: false, delete: false, hasDelete: false, hasResetPassword: false },
  { key: 'budget', name: '预算管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'finance', name: '财务管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  // v2.3.1 新增：催收记录（从 finance 拆出来单独配置）
  { key: 'collection', name: '催收记录', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'purchase', name: '采购管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false, hasApprove: true, approve: false, hasFinance: true, finance_action: false },
  { key: 'warehouse', name: '仓库管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  // v2.3.1 新增：主材管理（从 purchase 拆出来单独配置）
  { key: 'material', name: '主材管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  // { key: 'supplier', name: '供应商管理', hasAll: false, ... } -- 已合并到 external_contact
  { key: 'invoice', name: '发票管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'dispatch', name: '派工管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false, hasApprove: true, approve: false },
  { key: 'employee', name: '员工管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: true },
  // v2.3.1 新增：外部联系人（独立模块，工人/供应商/设计师）
  { key: 'external_contact', name: '外部联系人', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'role', name: '角色管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'department', name: '部门管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'sms', name: '短信模板', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'settings', name: '系统设置', hasAll: false, read: false, write: false, delete: false, hasDelete: false, hasResetPassword: false }
])

// 消息类型
const notificationTypes = [
  { value: 'contract_created', label: '新增合同' },
  { value: 'contract_updated', label: '合同变更' },
  { value: 'project_created', label: '新增项目' },
  { value: 'project_status_changed', label: '项目状态变更' },
  { value: 'project_archived', label: '项目归档/完成' },
  { value: 'node_status_changed', label: '节点状态变更' },
  { value: 'node_started', label: '节点开始' },
  { value: 'node_completed', label: '节点通过（验收合格自动）' },
  { value: 'node_overdue', label: '节点逾期' },
  { value: 'project_progress', label: '项目进展' },
  { value: 'log_submitted', label: '施工日志提交' },
  { value: 'inspection_submit', label: '巡检提交' },
  { value: 'rectification_created', label: '整改发起' },
  { value: 'rectification_done', label: '整改完成' },
  { value: 'rectification_passed', label: '整改复查通过' },
  { value: 'acceptance_submit', label: '验收提交' },
  { value: 'acceptance_passed', label: '验收合格（→ 节点自动通过）' },
  { value: 'acceptance_rejected', label: '验收不合格/驳回' },
  { value: 'dispatch_created', label: '新增派工' },
  { value: 'dispatch_status_changed', label: '派工状态变更' },
  { value: 'dispatch_completed', label: '派工完成' },
  { value: 'change_submitted', label: '增减项提交' },
  { value: 'change_approved', label: '增减项审核通过' },
  { value: 'change_rejected', label: '增减项审核驳回' },
  { value: 'contract_approved', label: '合同审核通过' },
  { value: 'contract_rejected', label: '合同审核驳回' },
  { value: 'collection_created', label: '催收记录' },
  { value: 'receivable_due', label: '待收款提醒/逾期' },
  { value: 'approval_submit', label: '审批提交' },
  { value: 'approval_result', label: '审批结果' },
  { value: 'notice_published', label: '发布公告' },
  { value: 'customer_follow', label: '客户跟进' },
  { value: 'customer_created', label: '新增客户' },
  { value: 'material_inbound', label: '主材入库' },
  { value: 'invoice_created', label: '新增发票' },
  { value: 'system_notice', label: '系统通知' },
  // 采购流程
  { value: 'purchase_submit', label: '采购提交' },
  { value: 'purchase_approved', label: '采购审批通过' },
  { value: 'purchase_rejected', label: '采购驳回' },
  { value: 'purchase_reimbursing', label: '采购报销中' },
  { value: 'purchase_finance_confirmed', label: '财务受理' },
  { value: 'purchase_reimbursed', label: '报销完成' }
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
    module.approve = perms.includes(`${module.key}:approve`);
    module.finance_action = perms.includes(`${module.key}:finance`);
    module.salary = perms.includes(`${module.key}:salary`);
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
      if (module.approve) permissions.push(`${module.key}:approve`);
      if (module.finance_action) permissions.push(`${module.key}:finance`);
      if (module.salary) permissions.push(`${module.key}:salary`);
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
    module.approve = false;
    module.finance_action = false;
    module.salary = false;
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
