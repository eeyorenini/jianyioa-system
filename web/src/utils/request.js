/**
 * API 请求封装
 * 功能：
 * - 自动携带 Token
 * - 统一错误处理
 * - 401 自动跳转登录
 * - 请求 loading 状态
 */

import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

// 创建 axios 实例
const request = axios.create({
  baseURL: '/api',
  timeout: 15000
})

// 请求计数器，用于控制 loading
let loadingCount = 0

// 显示 loading（简单实现，有需要可以用全局 loading 组件）
const showLoading = () => {
  loadingCount++
  // 如果需要全局 loading，可以在这里触发
}

const hideLoading = () => {
  loadingCount--
  if (loadingCount < 0) loadingCount = 0
}

// 请求拦截器
request.interceptors.request.use(
  config => {
    showLoading()
    
    // 自动携带 token
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // 自动携带 x-user-id（用于后端权限过滤）
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        if (user?.id) {
          config.headers['x-user-id'] = user.id
        }
      } catch (e) { /* ignore */ }
    }

    return config
  },
  error => {
    hideLoading()
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  response => {
    hideLoading()
    return response.data
  },
  error => {
    hideLoading()
    
    // 统一错误处理
    const status = error.response?.status
    const message = error.response?.data?.message || error.message
    
    switch (status) {
      case 401:
        // Token 过期或无效，跳转登录
        localStorage.removeItem('user')
        localStorage.removeItem('token')
        ElMessage.error('登录已过期，请重新登录')
        router.push('/login')
        break
        
      case 403:
        ElMessage.error('没有权限访问')
        break
        
      case 404:
        ElMessage.error('请求的资源不存在')
        break
        
      case 409:
        // 业务冲突，由调用方自行处理，不弹全局消息
        break

      case 500:
        ElMessage.error('服务器错误，请稍后重试')
        break

      case 0:
        // 网络错误
        ElMessage.error('网络连接失败，请检查网络')
        break

      default:
        if (message) {
          ElMessage.error(message)
        }
    }
    
    return Promise.reject(error)
  }
)

export default request
