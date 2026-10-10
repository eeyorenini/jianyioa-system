/**
 * 用户状态管理
 * 管理登录状态、用户信息、权限等
 *
 * 权限说明（2026-10-10 改造）：
 * - permissions 为后端下发的权限码数组，形如 ['customer:read', 'contract:write', 'project:read_all']
 * - 管理员（role_code==='admin' 或 username==='admin'）默认拥有全部权限
 * - 兼容旧格式：若数组中是模块名（如 'customer'）而非 'customer:read'，同样视为可访问该模块
 * - 菜单、路由、按钮统一通过 store.can(module) / store.canAction(module, action) 判定
 */

import { defineStore } from 'pinia'
import { employeeApi } from '../utils/api'

const ADMIN_ROLE_CODES = ['admin', '超级管理员']

function isAdminUser(user) {
  if (!user) return false
  const role = user.role_code || user.role_name || user.role || ''
  return ADMIN_ROLE_CODES.includes(role) || user.username === 'admin'
}

function parsePerms(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    token: null,
    isLoggedIn: false,
    permissions: []
  }),

  getters: {
    // 获取用户名称
    userName: (state) => state.user?.name || state.user?.username || '管理员',

    // 获取用户角色
    userRole: (state) => state.user?.role_name || state.user?.role || '普通员工',

    // 是否是管理员
    isAdmin: (state) => isAdminUser(state.user),

    // 获取用户ID
    userId: (state) => state.user?.id || null,

    /**
     * 是否可访问某模块（用于菜单显隐、路由守卫）
     * @param {string} moduleKey 模块标识，如 'customer' / 'contract' / 'finance'
     */
    can: (state) => (moduleKey) => {
      if (!moduleKey) return true
      if (isAdminUser(state.user)) return true
      const perms = state.permissions || []
      if (perms.includes('*')) return true
      if (perms.includes(moduleKey)) return true
      return perms.some((p) => typeof p === 'string' && p.startsWith(moduleKey + ':'))
    },

    /**
     * 是否有某具体动作权限（用于页面内按钮显隐）
     * @param {string} moduleKey 模块标识
     * @param {string} action 动作，如 'write' / 'delete' / 'approve' / 'finance'
     */
    canAction: (state) => (moduleKey, action) => {
      if (isAdminUser(state.user)) return true
      const perms = state.permissions || []
      return perms.includes('*') || perms.includes(`${moduleKey}:${action}`)
    }
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
          // 恢复缓存的权限
          try {
            this.permissions = JSON.parse(localStorage.getItem('permissions') || '[]')
          } catch {
            this.permissions = []
          }
          // 异步向后端拉取最新权限（不阻塞启动）
          this.loadPermissions()
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

        // 登录接口已返回 role_permissions，先落地一份，保证首屏菜单立即正确
        const perms = parsePerms(res.user?.role_permissions)
        this.permissions = perms
        localStorage.setItem('permissions', JSON.stringify(perms))

        // 再向后端拉取权威权限（含管理员标记、借权切换等）
        this.loadPermissions()

        return { success: true }
      } else {
        return { success: false, message: res.message || '登录失败' }
      }
    },

    // 从服务端拉取"当前身份 + 权限"（权威）
    async loadPermissions() {
      try {
        const res = await employeeApi.me()
        if (!res) return
        const perms = Array.isArray(res.permissions) ? res.permissions : []
        this.permissions = perms
        localStorage.setItem('permissions', JSON.stringify(perms))
        // 服务端判定为管理员时，补全 role_code，避免前端误判
        if (res.is_admin && !isAdminUser(this.user)) {
          this.user = { ...(this.user || {}), ...res, role_code: 'admin' }
          localStorage.setItem('user', JSON.stringify(this.user))
        }
      } catch (e) {
        // 忽略：保留登录时落地的权限，不因接口异常导致菜单变空
      }
    },

    // 登出
    logout() {
      this.user = null
      this.token = null
      this.isLoggedIn = false
      this.permissions = []

      localStorage.removeItem('user')
      localStorage.removeItem('token')
      localStorage.removeItem('permissions')
    },

    // 更新用户信息
    updateUser(userData) {
      this.user = { ...this.user, ...userData }
      localStorage.setItem('user', JSON.stringify(this.user))
    }
  }
})
