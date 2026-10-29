/**
 * 非 axios 请求的鉴权头
 * ---------------------------------------------------------------
 * 背景（v2.5.3）：
 *   PC 端只在 main.js 里给「全局 axios」装了拦截器注入 x-user-id，
 *   但下面这几类请求根本不走 axios：
 *     - el-upload 组件（内部用自己的 XMLHttpRequest）
 *     - 直接 fetch(...)
 *     - 手写 new XMLHttpRequest()
 *   它们发出去的请求没有 x-user-id，后端 getUserId() 只能返回 0，
 *   于是这些接口长期「不能加鉴权」——一加就 401。
 *
 * 用法：
 *   import { authHeaders } from '@/utils/authHeaders'
 *   <el-upload :headers="authHeaders()" />
 *
 *   fetch(url, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } })
 *
 * 注意：未登录时返回空对象（不抛错），由后端 401 兜底。
 *       和后端 server.js 的 getUserId 口径一致：优先 x-user-id。
 */

export function authHeaders() {
  const h = {}
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    if (u && u.id) h['x-user-id'] = String(u.id)
    const role = u && (u.role_code || u.role_name)
    if (role) h['x-user-role'] = role
  } catch (e) {
    /* localStorage 里存的不是合法 JSON，当作未登录 */
  }
  return h
}

export default authHeaders
