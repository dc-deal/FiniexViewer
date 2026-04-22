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
    watch: {
      usePolling: true,  // required on Windows/WSL2 — inotify events don't reach the Docker container
      interval: 100
    },
    hmr: {
      clientPort: 5173  // tells the browser to connect HMR WebSocket to localhost:5173, not the internal Docker address
    },
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
