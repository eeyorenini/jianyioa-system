<template>
  <div class="personal-center">
    <!-- 顶部欢迎 hero -->
    <div class="hero-bar">
      <div class="hero-left">
        <div class="hero-avatar">👤</div>
        <div>
          <h2 class="hero-title">{{ greeting }}，{{ userName }}</h2>
          <p class="hero-sub">个人中心 · 管理你的业务入口、账号安全</p>
        </div>
      </div>
      <div class="hero-right">
        <!-- 安全管理区块（v2.3.6 10-15：把修改密码从底部搬上来） -->
        <div class="hero-security">
          <span class="hero-security-title">🔒 安全管理</span>
          <el-button type="primary" size="small" plain @click="pwdDialogVisible = true">
            修改密码
          </el-button>
          <span class="hero-tag">{{ userRole }}</span>
          <span class="hero-time">{{ currentTime }}</span>
        </div>
      </div>
    </div>

    <!-- 修改密码弹窗 -->
    <el-dialog v-model="pwdDialogVisible" title="🔒 修改密码" width="420px" :close-on-click-modal="false">
      <el-form :model="pwdForm" label-width="100px" class="pwd-form">
        <el-form-item label="账号">
          <el-input :value="userName" disabled />
        </el-form-item>
        <el-form-item label="旧密码">
          <el-input v-model="pwdForm.old_password" type="password" show-password placeholder="请输入旧密码" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="pwdForm.new_password" type="password" show-password placeholder="请输入新密码（至少 6 位）" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="pwdForm.confirm_password" type="password" show-password placeholder="再输入一次新密码" />
        </el-form-item>
        <el-form-item>
          <div class="pwd-tip">建议大小写 + 数字组合，定期更换</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetPwdForm">清空</el-button>
        <el-button type="primary" :loading="pwdSubmitting" @click="handleChangePassword">确认修改</el-button>
      </template>
    </el-dialog>

    <!-- 业务分组入口 -->
    <div v-for="section in sections" :key="section.title" class="section">
      <div class="section-header">
        <span class="section-title">{{ section.icon }} {{ section.title }}</span>
        <span class="section-count">{{ section.items.length }} 项</span>
      </div>
      <el-row :gutter="12">
        <el-col :xs="12" :sm="8" :md="6" v-for="item in section.items" :key="item.path">
          <div class="entry-card" :class="item.theme" @click="handleJump(item)">
            <div class="entry-icon">{{ item.emoji }}</div>
            <div class="entry-info">
              <div class="entry-name">{{ item.name }}</div>
              <div class="entry-desc">{{ item.desc }}</div>
            </div>
            <div class="entry-arrow">›</div>
          </div>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { reactive, ref, onMounted, onUnmounted, computed } from 'vue'

const router = useRouter()

// v2.3.6 hotfix（10-15）：个人中心入口清理
//   - 删除 6 项明确无交集：个人奖罚、个人领用、个人零售、个人采购、个人借款、工资详情
//   - 改名 5 项：我的项目 / 我的巡检 / 我的审批 / 公司财务
//   - 修 1 个死链 path：我的巡检 `/inspections` → `/inspection-logs`
//   - 新增 1 项：公司财务大盘 → `/finance-projects`（v2.3.6 新接口页）
//   - "修改密码"从底部独立卡片搬到 hero 右侧"安全管理"区块，点击弹 Element Plus dialog
const sections = [
  {
    title: '业务工作',
    icon: '📋',
    items: [
      { name: '我的项目', desc: '查看/管理参与项目', emoji: '📁', path: '/projects', theme: 'blue' },
      { name: '我的巡检', desc: '工程巡检记录', emoji: '🔍', path: '/inspection-logs', theme: 'red' },
      { name: '我的汇报', desc: '财务报表', emoji: '📊', path: '/reports', theme: 'purple' },
      { name: '我的审批', desc: '请假 / 报销 / 通用审批', emoji: '📝', path: '/approvals', theme: 'orange' },
    ]
  },
  {
    title: '客户渠道',
    icon: '👥',
    items: [
      { name: '我的客户', desc: '客户档案', emoji: '👤', path: '/customers', theme: 'cyan' },
      { name: '我的渠道', desc: '渠道资源', emoji: '📡', path: '/channels', theme: 'teal' },
    ]
  },
  {
    title: '财务',
    icon: '💰',
    items: [
      { name: '公司财务', desc: '项目财务 / 应收实收 / 月度趋势', emoji: '💼', path: '/finance-projects', theme: 'green' },
    ]
  }
]

const handleJump = (item) => {
  if (!item.path) {
    ElMessage.info('该功能正在建设中')
    return
  }
  router.push(item.path)
}

// ====== 修改密码（弹窗形态，v2.3.6 10-15 从底部搬上来） ======
const pwdDialogVisible = ref(false)
const pwdForm = reactive({
  old_password: '',
  new_password: '',
  confirm_password: '',
})
const pwdSubmitting = ref(false)

const handleChangePassword = async () => {
  if (!pwdForm.old_password) {
    ElMessage.warning('请输入旧密码')
    return
  }
  if (!pwdForm.new_password || pwdForm.new_password.length < 6) {
    ElMessage.warning('新密码至少 6 位')
    return
  }
  if (pwdForm.new_password !== pwdForm.confirm_password) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  pwdSubmitting.value = true
  try {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}')
    await axios.put(`/api/employees/${currentUser.id}/password`, {
      old_password: pwdForm.old_password,
      new_password: pwdForm.new_password
    })
    ElMessage.success('密码修改成功')
    resetPwdForm()
    pwdDialogVisible.value = false
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '修改失败')
  } finally {
    pwdSubmitting.value = false
  }
}

const resetPwdForm = () => {
  pwdForm.old_password = ''
  pwdForm.new_password = ''
  pwdForm.confirm_password = ''
}

// ====== 顶部 hero 信息 ======
const userInfo = ref({})
const currentTime = ref('')
let timer = null

const updateTime = () => {
  const d = new Date()
  currentTime.value = d.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? '上午好' : h < 18 ? '下午好' : '晚上好'
})

const userName = computed(() => {
  return userInfo.value.name || userInfo.value.username || '用户'
})
const userRole = computed(() => {
  const code = userInfo.value.role_code || ''
  const name = userInfo.value.role_name || ''
  if (code === 'admin' || name.includes('管理')) return '管理员'
  if (code === 'finance' || name.includes('财务')) return '财务'
  if (code === 'designer' || name.includes('设计')) return '设计师'
  if (code === 'project_manager' || name.includes('经理')) return '项目经理'
  if (code === 'supervisor' || name.includes('监理')) return '工程监理'
  if (code === 'material' || name.includes('主材')) return '主材员'
  if (code === 'customer' || name.includes('业主')) return '客户'
  return name || '员工'
})

onMounted(() => {
  try {
    userInfo.value = JSON.parse(localStorage.getItem('user') || '{}')
  } catch (_) { userInfo.value = {} }
  updateTime()
  timer = setInterval(updateTime, 60000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.personal-center {
  padding: 20px 24px 40px;
  background: linear-gradient(180deg, #f5f7fa 0%, #fafbfc 100%);
  min-height: 100vh;
}

/* ===== Hero ===== */
.hero-bar {
  display: flex; justify-content: space-between; align-items: center;
  background: linear-gradient(135deg, #1E3A5F 0%, #2D5A8F 100%);
  color: #fff;
  padding: 20px 24px;
  border-radius: 12px;
  margin-bottom: 20px;
  box-shadow: 0 4px 16px rgba(30, 58, 95, 0.2);
}
.hero-left { display: flex; align-items: center; gap: 16px; }
.hero-avatar {
  width: 56px; height: 56px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 28px;
  border: 2px solid rgba(255, 255, 255, 0.3);
}
.hero-title { font-size: 20px; font-weight: 700; margin: 0; }
.hero-sub { font-size: 13px; margin: 4px 0 0; opacity: 0.85; }

/* hero 右侧：安全管理 + 角色 tag + 时间 */
.hero-right { display: flex; align-items: center; }
.hero-security {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.hero-security-title {
  font-size: 13px;
  opacity: 0.9;
  display: flex; align-items: center; gap: 4px;
}
.hero-tag {
  padding: 4px 12px; border-radius: 16px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 12px;
  font-weight: 500;
}
.hero-time { font-size: 12px; opacity: 0.8; }

/* ===== Section ===== */
.section { margin-bottom: 20px; }
.section-header {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 12px;
  padding-left: 4px;
}
.section-title { font-size: 16px; font-weight: 600; color: #303133; }
.section-count { font-size: 12px; color: #909399; }

/* ===== Entry Card ===== */
.entry-card {
  display: flex; align-items: center; gap: 12px;
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  margin-bottom: 12px;
  cursor: pointer;
  border-left: 4px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.25s ease;
  position: relative;
  overflow: hidden;
}
.entry-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
.entry-card.blue { border-left-color: #409EFF; }
.entry-card.green { border-left-color: #67C23A; }
.entry-card.orange { border-left-color: #E6A23C; }
.entry-card.red { border-left-color: #F56C6C; }
.entry-card.purple { border-left-color: #8B5CF6; }
.entry-card.cyan { border-left-color: #06B6D4; }
.entry-card.teal { border-left-color: #14B8A6; }

.entry-icon {
  width: 44px; height: 44px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}
.entry-card.blue .entry-icon { background: #ecf5ff; }
.entry-card.green .entry-icon { background: #f0f9eb; }
.entry-card.orange .entry-icon { background: #fdf6ec; }
.entry-card.red .entry-icon { background: #fef0f0; }
.entry-card.purple .entry-icon { background: #f5f3ff; }
.entry-card.cyan .entry-icon { background: #ecfeff; }
.entry-card.teal .entry-icon { background: #f0fdfa; }

.entry-info { flex: 1; min-width: 0; }
.entry-name {
  font-size: 14px; font-weight: 600; color: #303133;
  margin-bottom: 2px;
}
.entry-desc {
  font-size: 12px; color: #909399;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.entry-arrow {
  font-size: 22px; color: #c0c4cc;
  font-weight: 300;
  transition: all 0.2s;
}
.entry-card:hover .entry-arrow {
  color: #409eff;
  transform: translateX(3px);
}

/* ===== 弹窗 ===== */
.pwd-form { padding: 8px 0 0; }
.pwd-tip {
  font-size: 12px; color: #909399;
  margin-top: -8px;
}

/* ===== 响应式 ===== */
@media (max-width: 992px) {
  .hero-bar { flex-direction: column; align-items: flex-start; gap: 12px; }
  .hero-security { width: 100%; flex-wrap: wrap; }
}
@media (max-width: 768px) {
  .personal-center { padding: 12px; }
  .entry-card { padding: 12px; }
}
</style>
