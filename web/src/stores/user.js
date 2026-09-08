/**
 * 用户状态管理
 * 管理登录状态、用户信息、权限等
 */

import { defineStore } from 'pinia'
import { employeeApi } from '../utils/api'

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    token: null,
    isLoggedIn: false
  }),
  
  getters: {
    // 获取用户名称
    userName: (state) => state.user?.name || state.user?.username || '管理员',
    
    // 获取用户角色
    userRole: (state) => state.user?.role_name || state.user?.role || '普通员工',
    
    // 是否是管理员
    isAdmin: (state) => {
      const role = state.user?.role_name || state.user?.role || ''
      return role === '超级管理员' || role === 'admin'
    },
    
    // 获取用户ID
    userId: (state) => state.user?.id || null
  },
  
  actions: {
    // 初始化 - 从 localStorage 恢复登录状态
    init() {
      const userStr = localStorage.getItem('user')
      const tokenStr = localStorage.getItem('token')
      
      if (userStr && tokenStr) {
        try {
          this.user = JSON.parse(userStr)
          this.token = tokenStr
          this.isLoggedIn = true
        } catch (e) {
          this.logout()
        }
      }
    },
    
    // 登录
    async login(formData) {
      const res = await employeeApi.login(formData)
      
      if (res.success) {
        this.user = res.user
        this.token = res.token || 'logged_in'
        this.isLoggedIn = true
        
        // 持久化到 localStorage
        localStorage.setItem('user', JSON.stringify(res.user))
        localStorage.setItem('token', this.token)
        
        return { success: true }
      } else {
        return { success: false, message: res.message || '登录失败' }
      }
    },
    
    // 登出
    logout() {
      this.user = null
      this.token = null
      this.isLoggedIn = false
      
      localStorage.removeItem('user')
      localStorage.removeItem('token')
    },
    
    // 更新用户信息
    updateUser(userData) {
      this.user = { ...this.user, ...userData }
      localStorage.setItem('user', JSON.stringify(this.user))
    }
  }
})
