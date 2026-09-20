import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import axios from 'axios'

// 全局 axios 拦截器：自动注入权限头（所有页面共用）
axios.interceptors.request.use(config => {
  const userStr = localStorage.getItem('user')
  if (userStr) {
    try {
      const user = JSON.parse(userStr)
      if (user?.id) config.headers['x-user-id'] = user.id
      if (user?.role_code || user?.role_name) {
        config.headers['x-user-role'] = user.role_code || user.role_name || ''
      }
    } catch (e) {}
  }
  return config
})

const app = createApp(App)
const pinia = createPinia()

// 注册所有图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 使用插件
app.use(pinia)
app.use(ElementPlus)
app.use(router)

// 挂载前初始化用户状态
import { useUserStore } from './stores/user'
const userStore = useUserStore()
userStore.init()

app.mount('#app')
