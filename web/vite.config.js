import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

// 2026-10-13：版本号自动注入（v2.3.5 起根治"侧边栏硬编码 v 2.2.2"漏改问题）
// build 时从 web/package.json 读取 version，作为全局常量 __APP_VERSION__ 注入
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'))

export default defineConfig({
  // 2026-10-13：把版本号作为全局常量注入；build 后产物体内的 __APP_VERSION__ 会被替换为字面量
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5555,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3002',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    include: ['tinymce', '@tinymce/tinymce-vue', 'chinese-number-format']
  },
  build: {
    rollupOptions: {
      external: {
        tinymce: 'tinymce'
      }
    }
  }
})
