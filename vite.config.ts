import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { viteServersPlugin } from './vite_servers_plugin'

export default defineConfig({
  plugins: [
    vue(),
    // the tokens stay in this process and are attached to the proxied request, so the browser never
    // receives one: anything named VITE_ is inlined into the bundle, which would publish it
    viteServersPlugin({ tracked: 'configs', user: 'user_configs' }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    watch: {
      usePolling: true,  // required on Windows/WSL2 — inotify events don't reach the Docker container
      // Polling walks whatever it is pointed at, so what it is pointed at decides the cost.
      // Measured 2026-09-23: watching the whole tree (14,762 files in node_modules against 61 in
      // src) held the container at 56 % CPU idle and starved the event loop — a request that does
      // no work at all took 1.7 s, and the index page 6.5 s. Only `src` can change under an
      // editor, so only `src` is worth ten looks a second.
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/github_issues/**', '**/user_configs/**', '**/configs/**', '**/.claude/**'],
      interval: 300
    },
    hmr: {
      clientPort: 5173  // tells the browser to connect HMR WebSocket to localhost:5173, not the internal Docker address
    }
  }
})
