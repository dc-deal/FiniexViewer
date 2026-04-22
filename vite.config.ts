import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    proxy: {
      '/api': {
        // Forwards all /api/* requests to the backend.
        // VITE_API_BASE_URL is set to http://finiex-dev:8000 inside Docker Compose.
        target: process.env['VITE_API_BASE_URL'] ?? 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
})
