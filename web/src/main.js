import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import axios from 'axios'
import { authHeaders } from './utils/authHeaders'

// 全局 axios 拦截器：自动注入权限头（所有页面共用）
// v2.5.3：取值逻辑统一收拢到 utils/authHeaders.js，
// 让 el-upload / 裸 fetch / 裸 XHR 也能用同一份口径（它们不走 axios）。
axios.interceptors.request.use(config => {
  const h = authHeaders()
  Object.keys(h).forEach(k => { config.headers[k] = h[k] })
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
app.use(ElementPlus, { locale: zhCn })
app.use(router)

// 挂载前初始化用户状态
import { useUserStore } from './stores/user'
const userStore = useUserStore()
userStore.init()

app.mount('#app')
