import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/user'

// 静态导入所有视图
const Dashboard = () => import('../views/Dashboard.vue')
const Finance = () => import('../views/Finance.vue')
const Projects = () => import('../views/Projects.vue')
const Quotes = () => import('../views/Quotes.vue')
const Warehouse = () => import('../views/Warehouse.vue')
const Customers = () => import('../views/Customers.vue')
const Contracts = () => import('../views/Contracts.vue')
const ContractTemplates = () => import('../views/ContractTemplates.vue')
const ContractTemplatesEditor = () => import('../views/ContractTemplatesEditor.vue')
const OperationLogs = () => import('../views/OperationLogs.vue')
const SystemLogs = () => import('../views/SystemLogs.vue')
const Budgets = () => import('../views/Budgets.vue')
const MaterialOrders = () => import('../views/MaterialOrders.vue')
const Employees = () => import('../views/Employees.vue')
const Roles = () => import('../views/Roles.vue')
const Departments = () => import('../views/Departments.vue')
const SystemSettings = () => import('../views/SystemSettings.vue')
const Approvals = () => import('../views/Approvals.vue')
const Reports = () => import('../views/Reports.vue')
const Notices = () => import('../views/Notices.vue')
const Inspections = () => import('../views/Inspections.vue')
const Acceptance = () => import('../views/Acceptance.vue')
const Invoices = () => import('../views/Invoices.vue')
const Channels = () => import('../views/Channels.vue')
const PersonalCenter = () => import('../views/PersonalCenter.vue')
const MainMaterials = () => import('../views/MainMaterials.vue')
const SmsTemplates = () => import('../views/SmsTemplates.vue')
const ProgressNodeTemplates = () => import('../views/ProgressNodeTemplates.vue')
const Login = () => import('../views/Login.vue')
const MessageCenter = () => import('../views/MessageCenter.vue')

const routes = [
  { path: '/login', name: 'Login', component: Login, meta: { requiresAuth: false } },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'Dashboard', component: Dashboard },
  { path: '/personal-center', name: 'PersonalCenter', component: PersonalCenter },
  { path: '/customers', name: 'Customers', component: Customers },
  { path: '/channels', name: 'Channels', component: Channels },
  { path: '/contracts', name: 'Contracts', component: Contracts },
  { path: '/contract-templates', name: 'ContractTemplates', component: ContractTemplates },
  { path: '/contract-templates/:id/edit', name: 'ContractTemplatesEditor', component: ContractTemplatesEditor },
  { path: '/operation-logs', name: 'OperationLogs', component: OperationLogs },
  { path: '/system-logs', name: 'SystemLogs', component: SystemLogs },
  { path: '/budgets', name: 'Budgets', component: Budgets },
  { path: '/finance', name: 'Finance', component: Finance },
  { path: '/projects', name: 'Projects', component: Projects },
  { path: '/quotes', name: 'Quotes', component: Quotes },
  { path: '/warehouse', name: 'Warehouse', component: Warehouse },
  { path: '/main-materials', name: 'MainMaterials', component: MainMaterials },
  { path: '/material-orders', name: 'MaterialOrders', component: MaterialOrders },
  { path: '/approvals', name: 'Approvals', component: Approvals },
  { path: '/reports', name: 'Reports', component: Reports },
  { path: '/notices', name: 'Notices', component: Notices },
  { path: '/inspections', name: 'Inspections', component: Inspections },
  { path: '/acceptance', name: 'Acceptance', component: Acceptance },
  { path: '/invoices', name: 'Invoices', component: Invoices },
  { path: '/employees', name: 'Employees', component: Employees },
  { path: '/roles', name: 'Roles', component: Roles },
  { path: '/sms-templates', name: 'SmsTemplates', component: SmsTemplates },
  { path: '/progress-node-templates', name: 'ProgressNodeTemplates', component: ProgressNodeTemplates },
  { path: '/departments', name: 'Departments', component: Departments },
  { path: '/system-settings', name: 'SystemSettings', component: SystemSettings },
  { path: '/message-center', name: 'MessageCenter', component: MessageCenter },
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
  
  next()
})

// 路由错误处理
router.onError(error => {
  console.error('路由错误:', error)
})

export default router
