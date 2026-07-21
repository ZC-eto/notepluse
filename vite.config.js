import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// ZTools 开发模式读 public/plugin.json 的 development.main（默认 http://localhost:5173）。
// 在宿主内联调试时请占用 5173；仅浏览器预览可用 `npm run dev:any` 让端口自动分配。
export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
