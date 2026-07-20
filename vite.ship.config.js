import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({
  plugins: [vue()],
  base: './',
  cacheDir: fileURLToPath(new URL('./.vite-cache', import.meta.url)),
  build: { outDir: 'dist', emptyOutDir: true },
})
