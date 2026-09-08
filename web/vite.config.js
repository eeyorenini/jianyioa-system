import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5555,
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
