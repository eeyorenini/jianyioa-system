<template>
  <div class="employees">
    <!-- 概览卡片 -->
    <div class="stat-row" :class="{ 'is-3': !canBind }">
      <div class="stat-card">
        <div class="stat-icon total"><el-icon><UserFilled /></el-icon></div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">员工总数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon active"><el-icon><CircleCheckFilled /></el-icon></div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.onJob }}</div>
          <div class="stat-label">在职</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon off"><el-icon><RemoveFilled /></el-icon></div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.offJob }}</div>
          <div class="stat-label">非在职</div>
        </div>
      </div>
      <!-- 没有 employee:write 权限时拿不到绑定状态，这块不显示，免得看着像「一个都没绑」 -->
      <div class="stat-card" v-if="canBind">
        <div class="stat-icon wx"><el-icon><ChatDotSquare /></el-icon></div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.bound }}</div>
          <div class="stat-label">已绑微信</div>
        </div>
      </div>
    </div>

    <!-- 员工列表 -->
    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <span class="card-title">员工列表</span>
            <span class="card-sub">{{ filteredList.length }} 人</span>
          </div>
          <div class="header-actions">
            <el-input
              v-model="keyword"
              placeholder="搜索姓名 / 用户名 / 电话 / 职位"
              clearable
              style="width: 240px"
            >
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <el-select v-model="filterDept" placeholder="全部部门" clearable style="width: 130px">
              <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
            </el-select>
            <el-select v-model="filterRole" placeholder="全部角色" clearable style="width: 130px">
              <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
            </el-select>
            <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 120px">
              <el-option label="在职" value="在职" />
              <el-option label="离职" value="离职" />
              <el-option label="停薪留职" value="停薪留职" />
            </el-select>
            <el-tooltip content="刷新" placement="top">
              <el-button class="icon-btn" @click="refresh">
                <el-icon><Refresh /></el-icon>
              </el-button>
            </el-tooltip>
            <el-button type="primary" @click="openAdd">
              <el-icon><Plus /></el-icon>
              新增员工
            </el-button>
          </div>
        </div>
      </template>

      <el-table
        :data="pagedList"
        style="width: 100%"
        v-loading="loading"
        row-key="id"
        empty-text="没有符合条件的员工"
      >
        <el-table-column label="员工" min-width="180">
          <template #default="{ row }">
            <div class="emp-cell">
              <div class="emp-avatar" :style="avatarStyle(row)">{{ (row.name || '?').slice(0, 1) }}</div>
              <div class="emp-info">
                <div class="emp-name">
                  <span class="name-text">{{ row.name || '-' }}</span>
                  <el-tag v-if="Number(row.is_external)" size="small" type="info" effect="plain" class="tag-ext">外部</el-tag>
                </div>
                <div class="emp-sub">{{ row.username || '—' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="电话" width="130">
          <template #default="{ row }">
            <span v-if="row.phone" class="mono">{{ row.phone }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>

        <el-table-column label="部门" width="110">
          <template #default="{ row }">
            <span v-if="row.department_name">{{ row.department_name }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>

        <el-table-column label="职位" width="110">
          <template #default="{ row }">
            <span v-if="row.position">{{ row.position }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>

        <el-table-column label="角色" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.role_name" :type="getRoleType(row.role_name)" size="small" effect="light">
              {{ row.role_name }}
            </el-tag>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <span class="status-cell">
              <span class="status-dot" :class="statusClass(row.status)"></span>
              <span class="status-text">{{ row.status || '—' }}</span>
            </span>
          </template>
        </el-table-column>

        <!-- 微信绑定：员工扫管理员生成的码即可免密登录，不用每次输账号密码 -->
        <el-table-column label="微信绑定" width="160">
          <template #default="{ row }">
            <div class="bind-cell">
              <template v-if="bindMap[row.id]">
                <el-tooltip :content="bindTip(row.id)" placement="top">
                  <el-tag type="success" size="small" effect="light">已绑定</el-tag>
                </el-tooltip>
                <el-button v-if="canBind" link type="danger" size="small" @click="handleUnbind(row)">解绑</el-button>
              </template>
              <template v-else>
                <el-tag type="info" size="small" effect="plain">未绑定</el-tag>
                <el-button
                  v-if="canBind"
                  link
                  type="primary"
                  size="small"
                  :disabled="row.status !== '在职'"
                  @click="openBindDialog(row)"
                >生成码</el-button>
              </template>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="130" fixed="right" align="center">
          <template #default="{ row }">
            <div class="op-row">
              <el-button link type="primary" size="small" @click="handleEdit(row)">编辑</el-button>
              <el-dropdown trigger="click" @command="(cmd) => handleCommand(cmd, row)">
                <el-button link type="primary" size="small">
                  更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="canResetPassword" command="reset">
                      <el-icon><Key /></el-icon>重置密码
                    </el-dropdown-item>
                    <el-dropdown-item command="delete" divided>
                      <el-icon><Delete /></el-icon>删除员工
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager" v-if="filteredList.length > pageSize">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="filteredList.length"
          layout="total, prev, pager, next"
          background
        />
      </div>
    </el-card>

    <!-- 新增 / 编辑 -->
    <el-dialog v-model="showAddDialog" :title="isEdit ? '编辑员工' : '新增员工'" width="720px" top="8vh">
      <el-form :model="form" label-width="92px">
        <div class="form-section">
          <div class="section-title">基本信息</div>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="姓名" required>
                <el-input v-model="form.name" placeholder="请输入姓名" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="电话" required>
                <el-input v-model="form.phone" placeholder="请输入手机号" maxlength="11" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="邮箱">
                <el-input v-model="form.email" placeholder="选填" />
              </el-form-item>
            </el-col>
            <el-col :span="12" v-if="!isEdit">
              <el-form-item label="初始密码">
                <span class="hint-text">电话后 6 位（保存后自动设置）</span>
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <div class="form-section">
          <div class="section-title">岗位信息</div>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="部门">
                <el-select v-model="form.department_id" placeholder="请选择部门" clearable style="width: 100%">
                  <el-option v-for="dept in departments" :key="dept.id" :label="dept.name" :value="dept.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="职位">
                <el-input v-model="form.position" placeholder="如：项目经理" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="角色">
                <el-select v-model="form.role_id" placeholder="请选择角色" clearable style="width: 100%">
                  <el-option v-for="role in roles" :key="role.id" :label="role.name" :value="role.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="入职日期">
                <el-date-picker
                  v-model="form.entry_date"
                  type="date"
                  value-format="YYYY-MM-DD"
                  placeholder="选择日期"
                  style="width: 100%"
                />
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
              <el-form-item label="外部人员">
                <el-switch v-model="form.is_external" :active-value="1" :inactive-value="0" />
                <span class="hint-text inline">外部人员不在通讯录显示</span>
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <el-alert type="info" :closable="false" class="form-tip">
          工资 / 身份证 / 紧急联系人等字段已移除；外部人员请到「组织结构 → 外部联系人」独立管理。
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">确定</el-button>
      </template>
    </el-dialog>

    <!-- 员工微信绑定：生成一次性小程序码，员工扫码即完成绑定 -->
    <el-dialog
      v-model="showBindDialog"
      :title="bindEmp ? `绑定微信 · ${bindEmp.name}` : '绑定微信'"
      width="420px"
      :close-on-click-modal="false"
      @closed="closeBindDialog"
    >
      <div class="bind-box" v-loading="bindLoading" element-loading-text="正在生成绑定码...">
        <template v-if="bindQr">
          <img class="bind-qr" :src="bindQr" alt="绑定小程序码" />
          <p class="bind-tip">请让 <b>{{ bindEmp && bindEmp.name }}</b> 用微信扫一扫</p>
          <p class="bind-count" :class="{ 'is-warn': bindLeft <= 60 }">
            {{ bindLeft > 0 ? `${fmtLeft} 后失效` : '已失效，请重新生成' }}
          </p>
        </template>

        <!-- 小程序码生成失败：降级为手动输入绑定码 -->
        <template v-else-if="bindFallback">
          <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 14px;">
            <template #title>小程序码生成失败，请改用绑定码</template>
            <div class="bind-warn">{{ bindWarn || '微信接口暂不可用' }}</div>
          </el-alert>
          <p class="bind-tip">让员工在小程序内打开「绑定微信」页，手动输入下面这串绑定码：</p>
        </template>

        <div v-if="bindTicket" class="bind-ticket">
          <span class="bind-ticket-text">{{ bindTicket }}</span>
          <el-button link type="primary" size="small" @click="copyTicket">复制</el-button>
        </div>

        <p class="bind-note">
          绑定后该员工打开小程序自动以本人身份登录，无需再输账号密码；<br />
          解绑后下次打开小程序才失效，当前会话不受影响。
        </p>
      </div>
      <template #footer>
        <el-button @click="showBindDialog = false">关闭</el-button>
        <el-button type="primary" :loading="bindLoading" @click="genCode">重新生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'
import { useUserStore } from '@/stores/user'

const employeeList = ref([])
const departments = ref([])
const roles = ref([])
const loading = ref(false)
const saving = ref(false)
const showAddDialog = ref(false)
const isEdit = ref(false)
const userStore = useUserStore()
// 绑定关系 employee_id → 绑定信息（stats 里要用，先声明）
const bindMap = ref({})
// 是否可重置他人密码（与后端 employee:reset_password 权限对齐）
const canResetPassword = computed(() => userStore.canAction('employee', 'reset_password'))

// ===== 筛选 / 分页 =====
const keyword = ref('')
const filterDept = ref(null)
const filterRole = ref(null)
const filterStatus = ref('')
const page = ref(1)
const pageSize = 20

const filteredList = computed(() => {
  const kw = String(keyword.value || '').trim().toLowerCase()
  return employeeList.value.filter((e) => {
    if (filterDept.value && e.department_id !== filterDept.value) return false
    if (filterRole.value && e.role_id !== filterRole.value) return false
    if (filterStatus.value && e.status !== filterStatus.value) return false
    if (!kw) return true
    return [e.name, e.username, e.phone, e.position, e.department_name, e.role_name]
      .some((v) => String(v || '').toLowerCase().includes(kw))
  })
})

const pagedList = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredList.value.slice(start, start + pageSize)
})

// 筛选条件变了回到第 1 页
watch([keyword, filterDept, filterRole, filterStatus], () => { page.value = 1 })
// 删人后当前页可能越界
watch(filteredList, (list) => {
  const max = Math.max(1, Math.ceil(list.length / pageSize))
  if (page.value > max) page.value = max
})

const stats = computed(() => {
  const list = employeeList.value
  return {
    total: list.length,
    onJob: list.filter((e) => e.status === '在职').length,
    offJob: list.filter((e) => e.status && e.status !== '在职').length,
    bound: Object.keys(bindMap.value).length,
  }
})

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

// 头像色板：按 id 取色，保证同一个人每次颜色一致
const AVATAR_COLORS = [
  ['#409EFF', '#6AA9FF'],
  ['#07C160', '#3DDC84'],
  ['#E6A23C', '#F3C078'],
  ['#9B59B6', '#B98AD1'],
  ['#F56C6C', '#F89C9C'],
  ['#13C2C2', '#5BD6D6'],
  ['#5B8FF9', '#87AEFF'],
]
const avatarStyle = (row) => {
  const c = AVATAR_COLORS[Math.abs(Number(row.id) || 0) % AVATAR_COLORS.length]
  return { background: `linear-gradient(135deg, ${c[0]}, ${c[1]})` }
}

const statusClass = (status) => {
  if (status === '在职') return 'is-on'
  if (status === '离职') return 'is-off'
  return 'is-pause'
}

const loadData = async () => {
  loading.value = true
  try {
    const [empRes, deptRes, roleRes] = await Promise.all([
      request.get('/employees'),
      request.get('/departments'),
      request.get('/roles')
    ])
    employeeList.value = empRes.data || empRes || []
    departments.value = deptRes.data || deptRes || []
    roles.value = roleRes.data || roleRes || []
  } catch (error) {
    console.error('加载失败:', error)
  } finally {
    loading.value = false
  }
}

const refresh = async () => {
  await loadData()
  await loadBindStatus()
  ElMessage.success('已刷新')
}

const handleResetPassword = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要重置 ${row.name} 的密码吗？重置后密码将变为 888888。`,
      '重置密码',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
    await request.post(`/employees/${row.id}/reset-password`)
    ElMessage.success('密码已重置为 888888')
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('重置失败')
  }
}

const openAdd = () => {
  isEdit.value = false
  closeDialog()
  showAddDialog.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || '',
    department_id: row.department_id ?? null,
    position: row.position || '',
    role_id: row.role_id ?? null,
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
  saving.value = true
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
  } finally {
    saving.value = false
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定删除员工「${row.name}」？删除后该账号将无法登录，此操作不可恢复。`,
      '删除员工',
      { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' }
    )
    await request.delete(`/employees/${row.id}`)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}

const handleCommand = (cmd, row) => {
  if (cmd === 'reset') return handleResetPassword(row)
  if (cmd === 'delete') return handleDelete(row)
}

// ==================== 员工微信绑定 ====================
// 绑定关系存 wechat_users.employee_id；这里只做展示与发码，身份判定全在后端。
const canBind = computed(() => userStore.canAction('employee', 'write'))
const showBindDialog = ref(false)
const bindEmp = ref(null)
const bindLoading = ref(false)
const bindQr = ref('')                  // 小程序码 dataURL；空 = 生成失败
const bindTicket = ref('')
const bindFallback = ref(false)
const bindWarn = ref('')
const bindLeft = ref(0)                 // 剩余秒数
let bindCountdown = null
let bindPoll = null

const fmtLeft = computed(() => {
  const s = Math.max(0, bindLeft.value)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

// 库里 DATETIME 是 UTC 字符串，按 UTC 解析再转本地，否则少 8 小时
const parseUtc = (v) => {
  if (!v) return null
  const s = String(v)
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? null : d
}

const bindTip = (id) => {
  const b = bindMap.value[id]
  if (!b) return ''
  const t = parseUtc(b.bind_time)
  return `微信 ${b.openid_mask || '***'}${t ? ' · ' + t.toLocaleString('zh-CN') : ''}`
}

const loadBindStatus = async () => {
  if (!canBind.value) return
  try {
    const res = await request.get('/admin/employees/bind-status')
    if (res && res.success) bindMap.value = res.data || {}
  } catch (e) {
    // 静默失败：绑定状态拿不到不应影响员工列表本身
  }
}

const clearBindTimers = () => {
  if (bindCountdown) { clearInterval(bindCountdown); bindCountdown = null }
  if (bindPoll) { clearInterval(bindPoll); bindPoll = null }
}

const closeBindDialog = () => {
  clearBindTimers()
  bindEmp.value = null
  bindQr.value = ''
  bindTicket.value = ''
  bindFallback.value = false
  bindWarn.value = ''
  bindLeft.value = 0
}

const startBindPoll = (empId) => {
  bindPoll = setInterval(async () => {
    try {
      const res = await request.get('/admin/employees/bind-status')
      if (!res || !res.success) return
      bindMap.value = res.data || {}
      if (bindMap.value[empId]) {
        clearBindTimers()
        ElMessage.success(`${bindEmp.value ? bindEmp.value.name : ''} 已绑定微信`)
        showBindDialog.value = false
        loadData()
      }
    } catch (e) { /* 单次轮询失败忽略，下次再来 */ }
  }, 3000)
}

const genCode = async () => {
  if (!bindEmp.value) return
  clearBindTimers()
  bindLoading.value = true
  try {
    const res = await request.post(`/admin/employees/${bindEmp.value.id}/bind-qrcode`)
    if (!res || !res.success) {
      ElMessage.warning((res && res.message) || '生成绑定码失败')
      showBindDialog.value = false
      return
    }
    bindTicket.value = res.ticket || ''
    bindQr.value = res.qrcode || ''
    bindFallback.value = !!res.fallback
    bindWarn.value = res.warn || ''
    const exp = res.expires_at ? new Date(res.expires_at).getTime() : Date.now() + 10 * 60 * 1000
    bindLeft.value = Math.max(0, Math.round((exp - Date.now()) / 1000))
    bindCountdown = setInterval(() => {
      bindLeft.value = Math.max(0, bindLeft.value - 1)
      if (bindLeft.value <= 0 && bindCountdown) { clearInterval(bindCountdown); bindCountdown = null }
    }, 1000)
    startBindPoll(bindEmp.value.id)
  } catch (e) {
    ElMessage.error('生成绑定码失败')
    showBindDialog.value = false
  } finally {
    bindLoading.value = false
  }
}

const openBindDialog = (row) => {
  bindEmp.value = row
  bindQr.value = ''
  bindTicket.value = ''
  bindFallback.value = false
  bindWarn.value = ''
  bindLeft.value = 0
  showBindDialog.value = true
  genCode()
}

const copyTicket = async () => {
  try {
    await navigator.clipboard.writeText(bindTicket.value)
    ElMessage.success('已复制绑定码')
  } catch (e) {
    ElMessage.warning('复制失败，请手动选中复制')
  }
}

const handleUnbind = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定解除 ${row.name} 的微信绑定？解绑后该员工下次打开小程序需重新扫码绑定。`,
      '解除绑定',
      { confirmButtonText: '确定解绑', cancelButtonText: '取消', type: 'warning' }
    )
    const res = await request.post('/admin/wechat/unbind-employee', { employee_id: row.id })
    if (res && res.success) {
      ElMessage.success(res.message || '已解除绑定')
      loadBindStatus()
    } else {
      ElMessage.warning((res && res.message) || '解绑失败')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('解绑失败')
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

onMounted(() => { loadData(); loadBindStatus() })
onUnmounted(() => { clearBindTimers() })
</script>

<style scoped>
.employees { padding: 0; }

/* ==================== 概览卡片 ==================== */
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.stat-row.is-3 { grid-template-columns: repeat(3, 1fr); }

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 8px;
  padding: 16px 18px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.stat-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #fff;
  flex-shrink: 0;
}
.stat-icon.total  { background: linear-gradient(135deg, #409eff, #6aa9ff); }
.stat-icon.active { background: linear-gradient(135deg, #07c160, #3ddc84); }
.stat-icon.off    { background: linear-gradient(135deg, #909399, #b1b3b8); }
.stat-icon.wx     { background: linear-gradient(135deg, #13c2c2, #5bd6d6); }

.stat-body { min-width: 0; }
.stat-value { font-size: 24px; font-weight: 600; line-height: 1.2; color: #303133; }
.stat-label { font-size: 12px; color: #909399; margin-top: 2px; white-space: nowrap; }

/* ==================== 卡片头部 ==================== */
.table-card { border-radius: 8px; }

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.header-left { display: flex; align-items: baseline; gap: 8px; }
.card-title { font-size: 15px; font-weight: 600; color: #303133; }
.card-sub { font-size: 12px; color: #909399; }

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.header-actions .el-button + .el-button { margin-left: 0; }

.icon-btn {
  width: 32px;
  padding: 0;
  height: 32px;
}

/* ==================== 表格 ==================== */
.emp-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }

.emp-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  letter-spacing: 0;
}

.emp-info { min-width: 0; }
.emp-name { display: flex; align-items: center; gap: 6px; }
.name-text {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-ext { transform: scale(0.9); transform-origin: left center; }
.emp-sub {
  font-size: 12px;
  color: #a8abb2;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mono { font-family: Menlo, Consolas, monospace; font-size: 13px; color: #606266; }
.muted { color: #c0c4cc; }

/* 状态：圆点 + 文字 */
.status-cell { display: inline-flex; align-items: center; gap: 6px; }
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.is-on   { background: #07c160; box-shadow: 0 0 0 3px rgba(7, 193, 96, 0.12); }
.status-dot.is-off  { background: #c0c4cc; box-shadow: 0 0 0 3px rgba(192, 196, 204, 0.15); }
.status-dot.is-pause{ background: #e6a23c; box-shadow: 0 0 0 3px rgba(230, 162, 60, 0.15); }
.status-text { font-size: 13px; color: #606266; }

/* 微信绑定列 */
.bind-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.bind-cell .el-button + .el-button { margin-left: 0; }
.bind-cell :deep(.el-tag) { border-radius: 4px; }

/* 操作列 */
.op-row {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}
.op-row .el-button + .el-button { margin-left: 0; }
.op-row :deep(.el-dropdown) { margin-left: 0; }

/* 分页 */
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* ==================== 新增/编辑弹窗 ==================== */
.form-section + .form-section { margin-top: 4px; }

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  padding-left: 9px;
  border-left: 3px solid #409eff;
  line-height: 1.2;
  margin-bottom: 16px;
}

.hint-text { font-size: 12px; color: #909399; }
.hint-text.inline { margin-left: 10px; }

.form-tip { margin-top: 4px; }
.form-tip :deep(.el-alert__content) { font-size: 12px; line-height: 1.6; }

/* ==================== 绑定弹窗 ==================== */
.bind-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 200px;
  padding: 4px 0;
}
.bind-qr {
  width: 190px;
  height: 190px;
  border-radius: 8px;
  border: 1px solid #ebeef5;
  background: #fff;
}
.bind-tip {
  font-size: 13px;
  color: #303133;
  margin: 14px 0 4px;
  text-align: center;
  line-height: 1.6;
}
.bind-count {
  font-size: 12px;
  color: #909399;
  margin: 0 0 4px;
}
.bind-count.is-warn { color: #e6a23c; }
.bind-warn {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  word-break: break-all;
}
.bind-ticket {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0 2px;
  padding: 8px 14px;
  background: #f5f7fa;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
}
.bind-ticket-text {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 15px;
  letter-spacing: 2px;
  color: #303133;
  user-select: all;
}
.bind-note {
  font-size: 12px;
  color: #a8abb2;
  line-height: 1.8;
  text-align: center;
  margin: 16px 0 0;
}

/* ==================== 响应式 ==================== */
@media (max-width: 1200px) {
  .stat-row { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 900px) {
  .stat-row { grid-template-columns: repeat(2, 1fr); }
  .header-actions { width: 100%; }
  .header-actions .el-input { width: 100% !important; }
}
</style>
