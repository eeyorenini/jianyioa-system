import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../stores/user'

// 静态导入所有视图
const Dashboard = () => import('../views/Dashboard.vue')
const Finance = () => import('../views/Finance.vue')
const Projects = () => import('../views/Projects.vue')
const Quotes = () => import('../views/Quotes.vue')
const Warehouse = () => import('../views/Warehouse.vue')
const Customers = () => import('../views/Customers.vue')
const WechatUsers = () => import('../views/WechatUsers.vue')
const Contracts = () => import('../views/Contracts.vue')
const ContractTemplates = () => import('../views/ContractTemplates.vue')
const ContractTemplatesEditor = () => import('../views/ContractTemplatesEditor.vue')
const OperationLogs = () => import('../views/OperationLogs.vue')
const SystemLogs = () => import('../views/SystemLogs.vue')
const Budgets = () => import('../views/Budgets.vue')
const MaterialOrders = () => import('../views/MaterialOrders.vue')
const Employees = () => import('../views/Employees.vue')
const Roles = () => import('../views/Roles.vue')
const CustomerVisibility = () => import('../views/CustomerVisibility.vue')
const ExternalContacts = () => import('../views/ExternalContacts.vue')
const Departments = () => import('../views/Departments.vue')
const SystemSettings = () => import('../views/SystemSettings.vue')
const Approvals = () => import('../views/Approvals.vue')
const Reports = () => import('../views/Reports.vue')
const Notices = () => import('../views/Notices.vue')
const Acceptance = () => import('../views/Acceptance.vue')
const Invoices = () => import('../views/Invoices.vue')
const Channels = () => import('../views/Channels.vue')
const PersonalCenter = () => import('../views/PersonalCenter.vue')
const MainMaterials = () => import('../views/MainMaterials.vue')
const SmsTemplates = () => import('../views/SmsTemplates.vue')
const ProgressNodeTemplates = () => import('../views/ProgressNodeTemplates.vue')
const Login = () => import('../views/Login.vue')
const MessageCenter = () => import('../views/MessageCenter.vue')
const TodoCenter = () => import('../views/TodoCenter.vue')
const ProjectLogs = () => import('../views/ProjectLogs.vue')
const InspectionLogs = () => import('../views/InspectionLogs.vue')
// const Suppliers = () => import('../views/Suppliers.vue')  // v2.3.1 已合并到外部联系人
const PurchaseRequests = () => import('../views/PurchaseRequests.vue')
const ChangeOrders = () => import('../views/ChangeOrders.vue')
const FinanceProjectList = () => import('../views/FinanceProjectList.vue')
// v2.3.6 hotfix 10-15：补上 v2.3.4 缺失的 ProjectFiles.vue 源文件
const ProjectFiles = () => import('../views/ProjectFiles.vue')

// meta.perm = 访问该页面所需的权限模块标识（对应后端权限码的模块前缀）
// 无 meta.perm 表示所有登录用户可访问
const routes = [
  { path: '/login', name: 'Login', component: Login, meta: { requiresAuth: false } },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'Dashboard', component: Dashboard },
  { path: '/personal-center', name: 'PersonalCenter', component: PersonalCenter },
  { path: '/message-center', name: 'MessageCenter', component: MessageCenter },
  { path: '/todo', name: 'TodoCenter', component: TodoCenter },

  { path: '/customers', name: 'Customers', component: Customers, meta: { perm: 'customer' } },
  { path: '/wechat-users', name: 'WechatUsers', component: WechatUsers, meta: { perm: 'customer' } },
  { path: '/channels', name: 'Channels', component: Channels, meta: { perm: 'customer' } },
  { path: '/sms-templates', name: 'SmsTemplates', component: SmsTemplates, meta: { perm: 'sms' } },

  { path: '/contracts', name: 'Contracts', component: Contracts, meta: { perm: 'contract' } },
  { path: '/contract-templates', name: 'ContractTemplates', component: ContractTemplates, meta: { perm: 'contract' } },
  { path: '/contract-templates/:id/edit', name: 'ContractTemplatesEditor', component: ContractTemplatesEditor, meta: { perm: 'contract' } },

  { path: '/projects', name: 'Projects', component: Projects, meta: { perm: 'project' } },
  { path: '/change-orders', name: 'ChangeOrders', component: ChangeOrders, meta: { perm: 'contract_change' } },
  { path: '/project-logs', name: 'ProjectLogs', component: ProjectLogs, meta: { perm: 'project_log' } },
  { path: '/project-files', name: 'ProjectFiles', component: ProjectFiles, meta: { perm: 'project_file' } },
  { path: '/inspection-logs', name: 'InspectionLogs', component: InspectionLogs, meta: { perm: 'inspection' } },
  { path: '/quotes', name: 'Quotes', component: Quotes, meta: { perm: 'quote' } },
  { path: '/acceptance', name: 'Acceptance', component: Acceptance, meta: { perm: 'acceptance' } },
  { path: '/progress-node-templates', name: 'ProgressNodeTemplates', component: ProgressNodeTemplates, meta: { perm: 'project' } },

  { path: '/main-materials', name: 'MainMaterials', component: MainMaterials, meta: { perm: 'material' } },
  // { path: '/suppliers', name: 'Suppliers', component: Suppliers, meta: { perm: 'supplier' } }, // v2.3.1 已合并到外部联系人
  { path: '/warehouse', name: 'Warehouse', component: Warehouse, meta: { perm: 'warehouse' } },
  { path: '/material-orders', name: 'MaterialOrders', component: MaterialOrders, meta: { perm: 'purchase' } },
  { path: '/purchase-requests', name: 'PurchaseRequests', component: PurchaseRequests, meta: { perm: 'purchase' } },

  { path: '/approvals', name: 'Approvals', component: Approvals, meta: { perm: 'approval' } },
  { path: '/reports', name: 'Reports', component: Reports, meta: { perm: 'report' } },
  { path: '/notices', name: 'Notices', component: Notices, meta: { perm: 'notice' } },

  { path: '/employees', name: 'Employees', component: Employees, meta: { perm: 'employee' } },
  // v2.3.1 外部联系人（工人/供应商/设计师等）：独立模块
  { path: '/external-contacts', name: 'ExternalContacts', component: ExternalContacts, meta: { perm: 'external_contact' } },
  { path: '/roles', name: 'Roles', component: Roles, meta: { perm: 'role' } },
  // v2.3.1 客户端可见配置（业主 App 8 项开关，全局一份）
  { path: '/customer-visibility', name: 'CustomerVisibility', component: CustomerVisibility, meta: { perm: 'settings' } },
  { path: '/departments', name: 'Departments', component: Departments, meta: { perm: 'department' } },

  { path: '/finance', name: 'Finance', component: Finance, meta: { perm: 'finance' } },
  { path: '/finance-projects', name: 'FinanceProjectList', component: FinanceProjectList, meta: { perm: 'finance' } },
  { path: '/budgets', name: 'Budgets', component: Budgets, meta: { perm: 'budget' } },
  { path: '/invoices', name: 'Invoices', component: Invoices, meta: { perm: 'invoice' } },

  { path: '/system-settings', name: 'SystemSettings', component: SystemSettings, meta: { perm: 'settings' } },
  { path: '/operation-logs', name: 'OperationLogs', component: OperationLogs, meta: { perm: 'settings' } },
  { path: '/system-logs', name: 'SystemLogs', component: SystemLogs, meta: { perm: 'settings' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const userStore = useUserStore()

  // 如果已登录，访问登录页则跳转到首页
  if (to.path === '/login') {
    if (userStore.isLoggedIn) {
      next('/')
    } else {
      next()
    }
    return
  }

  // 需要登录的页面，检查登录状态
  if (to.meta?.requiresAuth !== false && !userStore.isLoggedIn) {
    next('/login')
    return
  }

  // 已登录用户访问首页，重定向到 dashboard
  if (to.path === '/' && userStore.isLoggedIn) {
    next('/dashboard')
    return
  }

  // 权限校验：无权限则退回数据看板
  if (to.meta?.perm && !userStore.can(to.meta.perm)) {
    ElMessage.warning('没有权限访问该模块')
    next('/dashboard')
    return
  }

  next()
})

// 路由错误处理
// v2.3.13：前端重新构建后，旧标签页仍在用上一版 index-*.js，其懒加载 chunk 文件名已不存在，
// 请求会拿到 index.html → 浏览器报 "'text/html' is not a valid JavaScript MIME type"。
// 这类错误不是代码问题，静默重载一次拿新产物即可（30 秒内只自动重载一次，防死循环）。
const CHUNK_ERROR_RE = /dynamically imported module|MIME type|Importing a module script failed|Failed to fetch/i

router.onError((error, to) => {
  const msg = String(error?.message || error || '')
  if (!CHUNK_ERROR_RE.test(msg)) {
    console.error('路由错误:', error)
    return
  }
  const KEY = 'chunk_reload_at'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last < 30 * 1000) {
    console.error('路由错误（资源加载失败，短时间内已重载过，不再自动重试）:', error)
    return
  }
  sessionStorage.setItem(KEY, String(Date.now()))
  console.warn('检测到前端资源版本不一致，正在重载页面…')
  const target = to?.fullPath || window.location.pathname + window.location.search
  window.location.replace(target)
})

export default router
