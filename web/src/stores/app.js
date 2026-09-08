/**
 * 全局应用状态管理
 * 管理 loading、侧边栏状态等
 */

import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    // 全局 loading
    loading: false,
    loadingText: '加载中...',
    
    // 侧边栏折叠状态
    sidebarCollapsed: false,
    
    // 移动端菜单
    mobileMenuVisible: false
  }),
  
  actions: {
    // 设置 loading 状态
    setLoading(loading, text = '加载中...') {
      this.loading = loading
      this.loadingText = text
    },
    
    // 切换侧边栏
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    },
    
    // 切换移动端菜单
    toggleMobileMenu() {
      this.mobileMenuVisible = !this.mobileMenuVisible
    },
    
    closeMobileMenu() {
      this.mobileMenuVisible = false
    }
  }
})
