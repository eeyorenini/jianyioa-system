<template>
  <!-- 登录页：不渲染后台框架 -->
  <router-view v-if="isLoginPage" />

  <el-container v-else class="layout-container">
    <!-- 移动端遮罩 -->
    <div class="mobile-overlay" :class="{ show: mobileMenuShow }" @click="mobileMenuShow = false"></div>

    <!-- 移动端顶部导航 -->
    <div class="mobile-navbar" v-if="isMobile">
      <div class="mobile-navbar-left">
        <button class="mobile-menu-btn" @click="mobileMenuShow = !mobileMenuShow">
          <el-icon><Fold v-if="!mobileMenuShow" /><Expand v-else /></el-icon>
        </button>
        <span class="mobile-logo">简逸ERP</span>
      </div>
      <div class="mobile-navbar-right">
        <div class="header-bell mobile-bell" title="消息中心" @click="router.push('/message-center')">
          <el-icon :size="18"><Bell /></el-icon>
          <span v-if="msgUnread > 0" class="bell-badge">{{ badgeText(msgUnread) }}</span>
        </div>
        <el-dropdown trigger="click">
          <el-icon><User /></el-icon>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="router.push('/personal-center')">{{ userStore.userName }}</el-dropdown-item>
              <el-dropdown-item divided @click="handleLogout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 左侧菜单（电脑端） -->
    <el-aside v-if="!isMobile" width="220px">
      <div class="logo">
        <el-icon><OfficeBuilding /></el-icon>
        <span>简逸ERP</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        class="el-menu-vertical"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
      >
        <template v-for="m in visibleMenus" :key="m.index || m.path">
          <el-menu-item v-if="m.type === 'item'" :index="m.path">
            <el-icon><component :is="m.icon" /></el-icon>
            <span>{{ m.title }}</span>
            <span v-if="badgeOf(m.path)" class="menu-badge">{{ badgeText(badgeOf(m.path)) }}</span>
          </el-menu-item>
          <el-sub-menu v-else :index="m.index">
            <template #title><el-icon><component :is="m.icon" /></el-icon><span>{{ m.title }}</span></template>
            <el-menu-item v-for="c in m.children" :key="c.path" :index="c.path">{{ c.title }}</el-menu-item>
          </el-sub-menu>
        </template>
      </el-menu>
      <div class="sidebar-version">v {{ appVersion }}</div>
    </el-aside>

    <!-- 移动端侧边栏（从左侧滑出） -->
    <div class="mobile-sidebar" :class="{ show: mobileMenuShow && isMobile }">
      <div class="mobile-sidebar-header">
        <el-icon><OfficeBuilding /></el-icon>
        <span>简逸ERP</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        class="mobile-menu"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
        @select="mobileMenuShow = false"
      >
        <template v-for="m in visibleMenus" :key="m.index || m.path">
          <el-menu-item v-if="m.type === 'item'" :index="m.path">
            <el-icon><component :is="m.icon" /></el-icon>
            <span>{{ m.title }}</span>
            <span v-if="badgeOf(m.path)" class="menu-badge">{{ badgeText(badgeOf(m.path)) }}</span>
          </el-menu-item>
          <el-sub-menu v-else :index="m.index">
            <template #title><el-icon><component :is="m.icon" /></el-icon><span>{{ m.title }}</span></template>
            <el-menu-item v-for="c in m.children" :key="c.path" :index="c.path">{{ c.title }}</el-menu-item>
          </el-sub-menu>
        </template>
      </el-menu>
      <div class="sidebar-version">v {{ appVersion }}</div>
    </div>

    <!-- 主内容区 -->
    <el-container class="main-container">
      <!-- 借权模式全局横幅（仅 admin 借权期间出现，任何页面都能看到并结束） -->
      <div v-if="userStore.impersonating" class="imp-banner">
        <div class="imp-banner-left">
          <span class="imp-banner-icon">🔓</span>
          <div>
            <div class="imp-banner-title">借权模式中 · 当前身份 {{ userStore.targetName }}<span v-if="userStore.targetRole">（{{ userStore.targetRole }}）</span></div>
            <div class="imp-banner-sub">你正在以该员工的身份操作，原账号：{{ userStore.impersonatorName || '管理员' }}</div>
          </div>
        </div>
        <el-button size="small" type="warning" plain :loading="impStopping" @click="exitImpersonate">结束借权</el-button>
      </div>

      <!-- 电脑端顶部header -->
      <el-header v-if="!isMobile">
        <div class="header-title">{{ pageTitle }}</div>
        <div class="header-user">
          <!-- 消息铃铛：与移动端首页铃铛一致，未读角标 + 直接跳转对应模块 -->
          <el-popover
            placement="bottom-end"
            :width="360"
            trigger="click"
            popper-class="bell-popper"
            @show="loadRecentMessages"
          >
            <template #reference>
              <div class="header-bell" title="消息中心">
                <el-icon :size="18"><Bell /></el-icon>
                <span v-if="msgUnread > 0" class="bell-badge">{{ badgeText(msgUnread) }}</span>
              </div>
            </template>
            <div class="bell-panel">
              <div class="bell-head">
                <span class="bell-head-title">未读消息</span>
                <el-link type="primary" :underline="false" @click="goMessageCenter">查看全部 →</el-link>
              </div>
              <div v-if="recentLoading" class="bell-empty">加载中…</div>
              <div v-else-if="!recentMessages.length" class="bell-empty">暂无未读消息</div>
              <div
                v-for="m in recentMessages"
                :key="m.src + '-' + m.id"
                class="bell-item"
                @click="openMessage(m)"
              >
                <span
                  class="bell-item-icon"
                  :style="{ background: msgTypeConfig(m.type).color + '1A', color: msgTypeConfig(m.type).color }"
                >{{ msgTypeConfig(m.type).icon }}</span>
                <div class="bell-item-main">
                  <div class="bell-item-title">{{ m.title || msgTypeConfig(m.type).text }}</div>
                  <div class="bell-item-meta">
                    <span class="bell-item-type" :style="{ color: msgTypeConfig(m.type).color }">{{ msgTypeConfig(m.type).text }}</span>
                    <span class="bell-item-time">{{ fmtShortTime(m.created_at) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </el-popover>

          <el-dropdown>
            <span class="user-dropdown">
              <el-icon><User /></el-icon>
              <span>{{ userStore.userName }}</span>
              <el-tag v-if="userStore.userRole" size="small" type="info" style="margin-left:6px">{{ userStore.userRole }}</el-tag>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="router.push('/personal-center')">个人信息</el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 主内容 -->
      <el-main :class="{ 'mobile-main': isMobile }">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from './stores/user'
import { OfficeBuilding, User, Fold, Expand, Bell } from '@element-plus/icons-vue'
import { msgTypeConfig, resolvePcTarget } from './utils/message-link'
import { MENU_CONFIG } from './utils/menu-config'

// 2026-10-13：版本号由 vite.config.js 的 define 在 build 时从 web/package.json 自动注入
// （根治"侧边栏硬编码 v 2.2.2"漏改问题，下次发版自动同步）
const appVersion = __APP_VERSION__

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => route.path)
const mobileMenuShow = ref(false)
const isMobile = ref(false)

// 登录页不渲染后台框架
const isLoginPage = computed(() => route.path === '/login')

// ==================== 菜单配置（权限驱动） ====================
// 2026-10-21：配置搬到 utils/menu-config.js 作为全站唯一数据源
// （个人中心卡片也读它，避免两份手写菜单再次漂移）
const menuConfig = MENU_CONFIG

// 按权限过滤后的菜单
const visibleMenus = computed(() => {
  const result = []
  for (const m of menuConfig) {
    if (m.type === 'item') {
      if (!m.perm || userStore.can(m.perm)) result.push(m)
    } else {
      const children = (m.children || []).filter((c) => !c.perm || userStore.can(c.perm))
      if (children.length) result.push({ ...m, children })
    }
  }
  return result
})

const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768
  if (!isMobile.value) mobileMenuShow.value = false
}

// ==================== 未读角标（待办 / 消息） ====================
// 2026-10-21：移动端首页有铃铛红点，PC 端原来完全没有提醒。
// 这里统一拉两个计数，挂在侧边栏菜单项 + 顶部铃铛上，不进页面也能看到。
const msgUnread = ref(0)
const todoCount = ref(0)
const recentMessages = ref([])
const recentLoading = ref(false)
let badgeTimer = null

const badgeText = (n) => (n > 99 ? '99+' : String(n))

/** 菜单项 → 角标数字（只对待办/消息两个入口生效） */
const badgeOf = (path) => {
  if (path === '/message-center') return msgUnread.value
  if (path === '/todo') return todoCount.value
  return 0
}

const loadBadges = async () => {
  if (!userStore.token) return
  const [msgRes, todoRes] = await Promise.all([
    axios.get('/api/messages/unread-count').catch(() => null),
    axios.get('/api/todo/count').catch(() => null)
  ])
  if (msgRes) msgUnread.value = msgRes.data?.count ?? msgRes.data?.total ?? 0
  if (todoRes) todoCount.value = todoRes.data?.total ?? 0
}

/** 铃铛展开时拉最新未读消息（只取前 6 条） */
const loadRecentMessages = async () => {
  recentLoading.value = true
  try {
    const res = await axios.get('/api/messages', { params: { is_read: 0, page: 1, pageSize: 6 } })
    recentMessages.value = res.data?.list || []
  } catch {
    recentMessages.value = []
  } finally {
    recentLoading.value = false
  }
}

const fmtShortTime = (t) => {
  if (!t) return ''
  const s = String(t).replace('T', ' ').substring(0, 16)
  return s.length >= 16 ? s.substring(5) : s
}

const goMessageCenter = () => router.push('/message-center')/** 点铃铛里的某条消息：标已读 → 有业务页面直接跳，没有就进消息中心 */
const openMessage = async (m) => {
  if (m.is_read === 0) {
    axios.put(`/api/messages/${m.id}/read`).catch(() => {})
    m.is_read = 1
    msgUnread.value = Math.max(0, msgUnread.value - 1)
  }
  const target = resolvePcTarget(m)
  if (target) router.push(target)
  else router.push('/message-center')
}

// 切页面时刷新一次（处理完事项回来角标要立刻更新）
watch(() => route.path, () => { loadBadges() })

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  loadBadges()
  // 60 秒轮询一次，避免长时间停留看不到新消息
  badgeTimer = setInterval(loadBadges, 60000)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  if (badgeTimer) clearInterval(badgeTimer)
})

const handleLogout = () => {
  userStore.logout()
  router.push('/login')
}

// ==================== 借权（仅 admin 可发起，结束按钮人人可见） ====================
// 2026-10-21：与移动端同一套逻辑 —— 借权期间当前用户就是目标员工，
// 权限也完全按目标员工算（admin 特权一并失去，看到的才是对方真实视角）。
const impStopping = ref(false)
const exitImpersonate = async () => {
  try {
    await ElMessageBox.confirm('结束后将恢复管理员身份，期间以该员工身份产生的操作记录不会撤销。', '结束借权', {
      confirmButtonText: '结束借权',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }
  impStopping.value = true
  try {
    const targetId = userStore.userId
    await axios.post('/api/admin/impersonate/stop', { target_employee_id: targetId }).catch(() => {})
    userStore.stopImpersonate()
    ElMessage.success('已结束借权，恢复管理员身份')
    router.push('/dashboard')
    loadBadges()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '结束借权失败')
  } finally {
    impStopping.value = false
  }
}

const pageTitle = computed(() => {
  const titles = {
    '/dashboard': '数据看板', '/personal-center': '个人中心',
    '/customers': '客户服务', '/channels': '渠道管理',
    '/wechat-users': '微信客户',
    '/contracts': '合同编辑', '/contract-templates': '合同模板',
    '/operation-logs': '操作日志', '/budgets': '预算报价',
    '/finance': '财务管理', '/finance-projects': '财务管理', '/projects': '工程管理',
    '/quotes': '报价管理', '/main-materials': '主材管理',
    '/warehouse': '仓库管理', '/material-orders': '采购订单',
    // '/suppliers': '供应商管理（已合并到外部联系人）',
    '/purchase-requests': '采购申请',
    '/change-orders': '增减项管理',
    '/approvals': '审批管理', '/reports': '工作汇报',
    '/notices': '公告管理', '/acceptance': '验收管理',
    '/invoices': '发票管理', '/employees': '员工管理', '/roles': '角色权限',
    '/departments': '部门管理', '/sms-templates': '短信模板',
    '/progress-node-templates': '节点模板',
    '/system-settings': '系统设置', '/system-logs': '系统日志',
    '/project-logs': '施工日志', '/project-files': '项目文件', '/inspection-logs': '巡检日志',
    '/message-center': '消息中心', '/todo': '待办中心'
  }
  return titles[route.path] || '简逸ERP'
})
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.layout-container { height: 100vh; display: flex; }

/* 电脑端侧边栏 */
.el-aside {
  background-color: #304156;
  display: flex;
  flex-direction: column;
}
.logo { height: 60px; display: flex; align-items: center; justify-content: center; gap: 10px; color: #fff; font-size: 20px; font-weight: bold; border-bottom: 1px solid #404854; }
.el-menu-vertical { border-right: none; }
.sidebar-version {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #606266;
  font-size: 12px;
  border-top: 1px solid #404854;
  margin-top: auto;
}

/* header */
.el-header { background-color: #fff; display: flex; justify-content: space-between; align-items: center; padding: 0 20px; box-shadow: 0 1px 4px rgba(0,21,41,0.08); }
.header-title { font-size: 18px; font-weight: 500; color: #333; }
.header-user { display: flex; align-items: center; gap: 8px; color: #666; }
.user-dropdown { display: flex; align-items: center; gap: 5px; cursor: pointer; }
.el-main { background-color: #f0f2f5; padding: 20px; }
.el-card { margin-bottom: 20px; }

/* ==================== 借权模式横幅 ==================== */
.imp-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px;
  background: linear-gradient(90deg, #FDF6EC 0%, #FDF0DC 100%);
  border-bottom: 1px solid #F5DAB1;
  border-left: 4px solid #E6A23C;
  flex-shrink: 0;
}
.imp-banner-left { display: flex; align-items: center; gap: 10px; }
.imp-banner-icon { font-size: 20px; line-height: 1; }
.imp-banner-title { font-size: 14px; font-weight: 600; color: #8A5A00; }
.imp-banner-sub { font-size: 12px; color: #B88230; margin-top: 2px; }

/* ==================== 侧边栏未读角标 ==================== */
.menu-badge {
  display: inline-block;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  margin-left: auto;
  border-radius: 9px;
  background: #f56c6c;
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  font-weight: 600;
}
.el-menu-item.is-active .menu-badge { background: #f56c6c; }

/* ==================== 顶部消息铃铛 ==================== */
.header-bell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  cursor: pointer;
  color: #606266;
  transition: background 0.2s;
}
.header-bell:hover { background: #f2f3f5; color: #409eff; }
.bell-badge {
  position: absolute;
  top: 2px;
  right: 1px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #f56c6c;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  font-weight: 600;
}

/* 铃铛下拉面板（popover 是 teleport 到 body 的，必须用全局类名） */
.bell-popper { padding: 0 !important; }
.bell-panel { max-height: 380px; overflow-y: auto; }
.bell-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid #f0f0f0;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 1;
}
.bell-head-title { font-size: 14px; font-weight: 600; color: #303133; }
.bell-empty { padding: 28px 0; text-align: center; color: #909399; font-size: 13px; }
.bell-item {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid #fafafa;
  transition: background 0.15s;
}
.bell-item:hover { background: #f5f7fa; }
.bell-item-icon {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.bell-item-main { flex: 1; min-width: 0; }
.bell-item-title {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bell-item-meta { display: flex; gap: 8px; align-items: center; margin-top: 3px; }
.bell-item-type { font-size: 11px; }
.bell-item-time { font-size: 11px; color: #c0c4cc; }

/* ==================== 表格全局样式 ==================== */
.el-table__header th {
  font-weight: 700 !important;
  font-size: 14px !important;
  color: #303133 !important;
  background-color: #f5f7fa !important;
}
.el-table__header td {
  font-weight: 600 !important;
}

/* ==================== 移动端样式 ==================== */
@media screen and (max-width: 768px) {
  .layout-container { flex-direction: column; }

  /* 移动端顶部导航 */
  .mobile-navbar {
    display: flex !important;
    position: fixed; top: 0; left: 0; right: 0; height: 50px;
    background: #304156; color: #fff; z-index: 1001;
    justify-content: space-between; align-items: center; padding: 0 15px;
  }
  .mobile-navbar-left { display: flex; align-items: center; gap: 12px; }
  .mobile-navbar-right { display: flex; align-items: center; gap: 10px; }
  .mobile-bell { color: #fff; }
  .mobile-bell:hover { background: rgba(255,255,255,0.12); color: #fff; }
  .mobile-logo { font-size: 16px; font-weight: bold; }

  /* 移动端菜单按钮 */
  .mobile-menu-btn {
    background: none; border: none; cursor: pointer;
    font-size: 22px; color: #fff; padding: 0;
  }

  /* 遮罩层 */
  .mobile-overlay {
    display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); z-index: 999;
  }
  .mobile-overlay.show { display: block; }

  /* 移动端侧边栏 - 从左侧滑出 */
  .mobile-sidebar {
    display: flex; flex-direction: column;
    position: fixed; top: 0; left: 0; width: 260px; height: 100%; background: #304156;
    z-index: 1000; transform: translateX(-100%);
    transition: transform 0.3s; overflow-y: auto;
  }
  .mobile-sidebar.show { transform: translateX(0); }
  .mobile-sidebar-header {
    height: 50px; display: flex; align-items: center;
    gap: 10px; color: #fff; font-size: 18px; font-weight: bold;
    padding: 0 15px; border-bottom: 1px solid #404854;
  }
  .mobile-menu { border-right: none; background: transparent !important; }

  /* 主内容区 */
  .main-container { margin-top: 50px; }
  .mobile-main {
    padding: 12px !important; margin: 0;
    min-height: calc(100vh - 50px); background: #f0f2f5;
  }

  /* 移动端通用样式 */
  .mobile-main .el-card {
    margin-bottom: 12px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  .mobile-main .el-table { font-size: 13px; }
  .mobile-main .el-button { padding: 10px 14px; font-size: 14px; }
  .mobile-main .el-input__inner { font-size: 14px; }
  .mobile-main .el-form-item { margin-bottom: 12px; }
  .mobile-main .el-dialog {
    width: 95% !important; margin: 10px auto !important;
  }
  .mobile-main .el-table .el-button { padding: 6px 10px; font-size: 12px; }
  .mobile-main .el-tag { font-size: 11px; padding: 0 6px; }
  .mobile-main h2, .mobile-main h3 { font-size: 16px; }
  .mobile-main .el-page-header__title { font-size: 16px; }
  .mobile-main .el-page-header__content { font-size: 14px; }
}

/* 平板端 */
@media screen and (min-width: 769px) and (max-width: 1024px) {
  .el-aside { width: 180px !important; }
  .logo { font-size: 18px; }
  .el-main { padding: 15px; }
}

/* 电脑端隐藏移动端元素 */
@media screen and (min-width: 769px) {
  .mobile-navbar, .mobile-sidebar, .mobile-overlay { display: none !important; }
  .mobile-main { margin-top: 0; }
}
</style>
