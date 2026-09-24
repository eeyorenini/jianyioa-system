<template>
  <el-container class="layout-container">
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
        <el-menu-item index="/personal-center">
          <el-icon><User /></el-icon>
          <span>个人中心</span>
        </el-menu-item>
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>数据看板</span>
        </el-menu-item>
        <el-sub-menu index="customer-group">
          <template #title><el-icon><User /></el-icon><span>客户服务</span></template>
          <el-menu-item index="/customers">客户列表</el-menu-item>
          <el-menu-item index="/sms-templates">短信模板</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="contract-group">
          <template #title><el-icon><Document /></el-icon><span>合同管理</span></template>
          <el-menu-item index="/contracts">合同编辑</el-menu-item>
          <el-menu-item index="/contract-templates">合同模板</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="project-group">
          <template #title><el-icon><FolderOpened /></el-icon><span>项目管理</span></template>
          <el-menu-item index="/projects">工程管理</el-menu-item>
          <el-menu-item index="/project-logs">施工日志</el-menu-item>
          <el-menu-item index="/inspection-logs">巡检日志</el-menu-item>
          <el-menu-item index="/quotes">报价管理</el-menu-item>
          <el-menu-item index="/acceptance">验收管理</el-menu-item>
          <el-menu-item index="/progress-node-templates">节点模板</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="material-group">
          <template #title><el-icon><Box /></el-icon><span>材料管理</span></template>
          <el-menu-item index="/main-materials">主材管理</el-menu-item>
          <el-menu-item index="/warehouse">仓库管理</el-menu-item>
          <el-menu-item index="/material-orders">采购订单</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="approval-group">
          <template #title><el-icon><Checked /></el-icon><span>行政审批</span></template>
          <el-menu-item index="/approvals">审批管理</el-menu-item>
          <el-menu-item index="/reports">工作汇报</el-menu-item>
          <el-menu-item index="/notices">公告管理</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="org-group">
          <template #title><el-icon><Grid /></el-icon><span>组织结构</span></template>
          <el-menu-item index="/employees">员工管理</el-menu-item>
          <el-menu-item index="/roles">角色权限</el-menu-item>
          <el-menu-item index="/departments">部门管理</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="system-group">
          <template #title><el-icon><Tools /></el-icon><span>系统设置</span></template>
          <el-menu-item index="/system-settings">API接口</el-menu-item>
          <el-menu-item index="/operation-logs">操作日志</el-menu-item>
          <el-menu-item index="/system-logs">系统日志</el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/finance"><el-icon><Wallet /></el-icon><span>财务管理</span></el-menu-item>
        <el-menu-item index="/budgets"><el-icon><Money /></el-icon><span>预算报价</span></el-menu-item>
        <el-menu-item index="/invoices"><el-icon><Ticket /></el-icon><span>发票管理</span></el-menu-item>
        <el-menu-item index="/message-center"><el-icon><Bell /></el-icon><span>消息中心</span></el-menu-item>
      </el-menu>
      <div class="sidebar-version">v 2.1.19</div>
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
        <el-menu-item index="/personal-center">
          <el-icon><User /></el-icon><span>个人中心</span>
        </el-menu-item>
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon><span>数据看板</span>
        </el-menu-item>
        <el-sub-menu index="customer-group">
          <template #title><el-icon><User /></el-icon><span>客户服务</span></template>
          <el-menu-item index="/customers">客户列表</el-menu-item>
          <el-menu-item index="/sms-templates">短信模板</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="contract-group">
          <template #title><el-icon><Document /></el-icon><span>合同管理</span></template>
          <el-menu-item index="/contracts">合同编辑</el-menu-item>
          <el-menu-item index="/contract-templates">合同模板</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="project-group">
          <template #title><el-icon><FolderOpened /></el-icon><span>项目管理</span></template>
          <el-menu-item index="/projects">工程管理</el-menu-item>
          <el-menu-item index="/project-logs">施工日志</el-menu-item>
          <el-menu-item index="/inspection-logs">巡检日志</el-menu-item>
          <el-menu-item index="/quotes">报价管理</el-menu-item>
          <el-menu-item index="/acceptance">验收管理</el-menu-item>
          <el-menu-item index="/progress-node-templates">节点模板</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="material-group">
          <template #title><el-icon><Box /></el-icon><span>材料管理</span></template>
          <el-menu-item index="/main-materials">主材管理</el-menu-item>
          <el-menu-item index="/warehouse">仓库管理</el-menu-item>
          <el-menu-item index="/material-orders">采购订单</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="approval-group">
          <template #title><el-icon><Checked /></el-icon><span>行政审批</span></template>
          <el-menu-item index="/approvals">审批管理</el-menu-item>
          <el-menu-item index="/reports">工作汇报</el-menu-item>
          <el-menu-item index="/notices">公告管理</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="org-group">
          <template #title><el-icon><Grid /></el-icon><span>组织结构</span></template>
          <el-menu-item index="/employees">员工管理</el-menu-item>
          <el-menu-item index="/roles">角色权限</el-menu-item>
          <el-menu-item index="/departments">部门管理</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="system-group">
          <template #title><el-icon><Tools /></el-icon><span>系统设置</span></template>
          <el-menu-item index="/system-settings">API接口</el-menu-item>
          <el-menu-item index="/operation-logs">操作日志</el-menu-item>
          <el-menu-item index="/system-logs">系统日志</el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/finance"><el-icon><Wallet /></el-icon><span>财务管理</span></el-menu-item>
        <el-menu-item index="/budgets"><el-icon><Money /></el-icon><span>预算报价</span></el-menu-item>
        <el-menu-item index="/invoices"><el-icon><Ticket /></el-icon><span>发票管理</span></el-menu-item>
        <el-menu-item index="/message-center"><el-icon><Bell /></el-icon><span>消息中心</span></el-menu-item>
      </el-menu>
      <div class="sidebar-version">v 2.1.19</div>
    </div>
    
    <!-- 主内容区 -->
    <el-container class="main-container">
      <!-- 电脑端顶部header -->
      <el-header v-if="!isMobile">
        <div class="header-title">{{ pageTitle }}</div>
        <div class="header-user">
          <el-dropdown>
            <span class="user-dropdown">
              <el-icon><User /></el-icon>
              <span>{{ userStore.userName }}</span>
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
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from './stores/user'
import {
  OfficeBuilding, User, DataAnalysis, FolderOpened, Box, Checked,
  Wallet, Setting, Ticket, Fold, Expand, Document, Money, Grid, Tools, Bell, Message
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => route.path)
const mobileMenuShow = ref(false)
const isMobile = ref(false)

const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768
  if (!isMobile.value) mobileMenuShow.value = false
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

const handleLogout = () => {
  userStore.logout()
  router.push('/login')
}

const pageTitle = computed(() => {
  const titles = {
    '/dashboard': '数据看板', '/personal-center': '个人中心',
    '/customers': '客户服务', '/channels': '渠道管理',
    '/contracts': '合同编辑', '/contract-templates': '合同模板',
    '/operation-logs': '操作日志', '/budgets': '预算报价',
    '/finance': '财务管理', '/projects': '工程管理',
    '/quotes': '报价管理', '/main-materials': '主材管理',
    '/warehouse': '仓库管理', '/material-orders': '采购订单',
    '/approvals': '审批管理', '/reports': '工作汇报',
    '/notices': '公告管理',
    '/acceptance': '验收管理', '/invoices': '发票管理',
    '/employees': '员工管理', '/roles': '角色权限',
    '/departments': '部门管理', '/sms-templates': '短信模板',
    '/system-settings': '系统设置', '/operation-logs': '操作日志', '/system-logs': '系统日志',
    '/message-center': '消息中心'
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
  .mobile-navbar-right { display: flex; align-items: center; }
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
    position: fixed; top: 0; left: 0;
    width: 260px; height: 100%; background: #304156;
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
