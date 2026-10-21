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
          <el-button type="primary" size="small" plain @click="openPwdDialog">
            修改密码
          </el-button>
          <!-- 借用权限：仅 admin 可用（借权期间自动隐藏，避免套娃借权） -->
          <el-button
            v-if="canBorrow"
            type="warning"
            size="small"
            plain
            @click="openBorrowDialog"
          >
            🔓 借用权限
          </el-button>
          <span class="hero-tag">{{ userRole }}</span>
          <span class="hero-time">{{ currentTime }}</span>
        </div>
      </div>
    </div>

    <!-- 借权中提示条（个人中心内的补充说明，全局横幅在 App.vue） -->
    <div v-if="userStore.impersonating" class="imp-tip">
      <span>🔓 当前处于借权模式，身份为 <b>{{ userStore.targetName }}</b><span v-if="userStore.targetRole">（{{ userStore.targetRole }}）</span>，权限按该员工计算。</span>
    </div>

    <!-- 借用权限弹窗 -->
    <el-dialog v-model="borrowVisible" title="🔓 借用权限（以员工身份登录）" width="560px" :close-on-click-modal="false">
      <div class="borrow-warn">
        <div class="borrow-warn-title">⚠️ 操作须知</div>
        <div class="borrow-warn-body">
          借权后系统会<b>完全以该员工的身份运行</b>，你的管理员权限会一并失去，用于核对权限配置、复现员工反馈的问题。<br />
          所有借权操作都会写入操作日志（谁借了谁的权），结束后可一键恢复。
        </div>
      </div>

      <el-input
        v-model="borrowKeyword"
        placeholder="搜索姓名 / 账号 / 角色"
        clearable
        style="margin-bottom: 12px"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>

      <div v-loading="borrowLoading" class="borrow-list">
        <div
          v-for="e in filteredTargets"
          :key="e.id"
          class="borrow-item"
          :class="{ active: borrowSelected === e.id }"
          @click="borrowSelected = e.id"
        >
          <span class="borrow-avatar">{{ e.role_code === 'admin' ? '👑' : '👤' }}</span>
          <div class="borrow-info">
            <div class="borrow-name">
              {{ e.name }}
              <el-tag size="small" :type="e.role_code === 'admin' ? 'danger' : 'info'" effect="plain">
                {{ e.role_name || '无角色' }}
              </el-tag>
            </div>
            <div class="borrow-meta">{{ e.username }}<span v-if="e.position"> · {{ e.position }}</span></div>
          </div>
          <span v-if="borrowSelected === e.id" class="borrow-check">✓</span>
        </div>
        <el-empty v-if="!borrowLoading && !filteredTargets.length" description="没有匹配的在职员工" :image-size="60" />
      </div>

      <template #footer>
        <el-button @click="borrowVisible = false">取消</el-button>
        <el-button type="warning" :disabled="!borrowSelected" :loading="borrowSubmitting" @click="confirmBorrow">
          确认借权并切换
        </el-button>
      </template>
    </el-dialog>

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
import { Search } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { buildPersonalSections } from '@/utils/menu-config'

const router = useRouter()
const userStore = useUserStore()

// 2026-10-21：模块列表不再手写，改由 utils/menu-config.js 的 buildPersonalSections 生成。
//   - 数据源与左侧菜单同一份 → 不会再出现"个人中心和系统实际模块不一致"
//   - 权限口径与左侧菜单相同（userStore.can(perm)），没权限的模块直接不显示
//   - 按用户确认：只放业务模块（客户/合同/项目/材料/审批/财务/待办/消息），
//     不含「组织结构」「系统设置」这类管理配置
const sections = computed(() => buildPersonalSections((perm) => userStore.can(perm)))

const handleJump = (item) => {
  if (!item.path) {
    ElMessage.info('该功能正在建设中')
    return
  }
  router.push(item.path)
}

// ====== 借用权限（仅 admin；借权期间入口自动隐藏，避免套娃借权） ======
const canBorrow = computed(() => userStore.isAdmin && !userStore.impersonating)

const borrowVisible = ref(false)
const borrowLoading = ref(false)
const borrowSubmitting = ref(false)
const borrowTargets = ref([])
const borrowKeyword = ref('')
const borrowSelected = ref(null)

const filteredTargets = computed(() => {
  const kw = borrowKeyword.value.trim().toLowerCase()
  if (!kw) return borrowTargets.value
  return borrowTargets.value.filter((e) => {
    const hay = `${e.name || ''} ${e.username || ''} ${e.role_name || ''} ${e.position || ''}`.toLowerCase()
    return hay.includes(kw)
  })
})

const openBorrowDialog = async () => {
  borrowKeyword.value = ''
  borrowSelected.value = null
  borrowVisible.value = true
  borrowLoading.value = true
  try {
    const res = await axios.get('/api/admin/impersonate-targets')
    borrowTargets.value = Array.isArray(res.data) ? res.data : []
  } catch (e) {
    borrowTargets.value = []
    ElMessage.error(e.response?.data?.error || '加载员工列表失败')
  } finally {
    borrowLoading.value = false
  }
}

const confirmBorrow = async () => {
  if (!borrowSelected.value) return
  borrowSubmitting.value = true
  try {
    const res = await axios.post('/api/admin/impersonate', {
      target_employee_id: borrowSelected.value
    })
    const d = res.data || {}
    if (!d.success || !d.user) {
      ElMessage.error(d.error || '借权失败')
      return
    }
    userStore.startImpersonate(d.user)
    borrowVisible.value = false
    ElMessage.success(`已借权为 ${d.user.name}，权限已按该员工生效`)
    // 菜单/权限都变了，回首页重新渲染
    router.push('/dashboard')
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '借权失败')
  } finally {
    borrowSubmitting.value = false
  }
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
    // 这里用裸 axios（不是 utils/request），必须手动带上身份头，
    // 否则后端 getUserId(req) 取不到人 → 一律返回「旧密码错误」（v2.3.13 修正）
    await axios.put(
      `/api/employees/${currentUser.id}/password`,
      {
        old_password: pwdForm.old_password,
        new_password: pwdForm.new_password
      },
      {
        headers: {
          'x-user-id': currentUser.id,
          'x-user-role': currentUser.role_code || currentUser.role_name || ''
        }
      }
    )
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

// 打开弹窗：先清空上次残留的输入
const openPwdDialog = () => {
  resetPwdForm()
  pwdDialogVisible.value = true
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

/* ===== 借权 ===== */
.imp-tip {
  margin: -8px 0 16px;
  padding: 10px 14px;
  background: #fdf6ec;
  border: 1px solid #f5dab1;
  border-radius: 8px;
  font-size: 13px;
  color: #b88230;
}
.borrow-warn {
  padding: 10px 14px;
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  border-radius: 8px;
  margin-bottom: 14px;
}
.borrow-warn-title { font-size: 13px; font-weight: 600; color: #c45656; margin-bottom: 4px; }
.borrow-warn-body { font-size: 12px; line-height: 1.7; color: #a05252; }
.borrow-list { max-height: 340px; overflow-y: auto; border: 1px solid #ebeef5; border-radius: 8px; }
.borrow-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid #f5f7fa;
  transition: background 0.15s;
}
.borrow-item:last-child { border-bottom: none; }
.borrow-item:hover { background: #f5f7fa; }
.borrow-item.active { background: #fdf6ec; }
.borrow-avatar { font-size: 20px; width: 28px; text-align: center; }
.borrow-info { flex: 1; min-width: 0; }
.borrow-name {
  font-size: 14px; font-weight: 600; color: #303133;
  display: flex; align-items: center; gap: 8px;
}
.borrow-meta { font-size: 12px; color: #909399; margin-top: 2px; }
.borrow-check { color: #e6a23c; font-weight: 700; font-size: 16px; }

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
