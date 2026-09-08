import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import Finance from '../views/Finance.vue'
import Projects from '../views/Projects.vue'
import Quotes from '../views/Quotes.vue'
import Warehouse from '../views/Warehouse.vue'
import Customers from '../views/Customers.vue'
import Contracts from '../views/Contracts.vue'
import ContractTemplates from '../views/ContractTemplates.vue'
import OperationLogs from '../views/OperationLogs.vue'
import Budgets from '../views/Budgets.vue'
import MaterialOrders from '../views/MaterialOrders.vue'
import Employees from '../views/Employees.vue'
import Roles from '../views/Roles.vue'
import Departments from '../views/Departments.vue'
import Approvals from '../views/Approvals.vue'
import Reports from '../views/Reports.vue'
import Notices from '../views/Notices.vue'
import Inspections from '../views/Inspections.vue'
import Acceptance from '../views/Acceptance.vue'
import Invoices from '../views/Invoices.vue'
import Channels from '../views/Channels.vue'
import PersonalCenter from '../views/PersonalCenter.vue'
import MainMaterials from '../views/MainMaterials.vue'
import Login from '../views/Login.vue'

const routes = [
  { path: '/login', name: 'Login', component: Login },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'Dashboard', component: Dashboard },
  { path: '/personal-center', name: 'PersonalCenter', component: PersonalCenter },
  { path: '/customers', name: 'Customers', component: Customers },
  { path: '/channels', name: 'Channels', component: Channels },
  { path: '/contracts', name: 'Contracts', component: Contracts },
  { path: '/contract-templates', name: 'ContractTemplates', component: ContractTemplates },
  { path: '/operation-logs', name: 'OperationLogs', component: OperationLogs },
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
  { path: '/departments', name: 'Departments', component: Departments }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫 - 检查登录状态
router.beforeEach((to, from, next) => {
  const user = localStorage.getItem('user')
  const token = localStorage.getItem('token')
  
  if (to.path === '/login') {
    // 如果已登录，直接跳转到首页
    if (user && token) {
      next('/')
    } else {
      next()
    }
  } else {
    // 其他页面需要登录
    if (user && token) {
      next()
    } else {
      next('/login')
    }
  }
})

export default router
