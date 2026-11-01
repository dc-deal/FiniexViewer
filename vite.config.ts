import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { viteServersPlugin } from './vite_servers_plugin'

// Both prefixes are named explicitly rather than reading the whole environment: VITE_* is what the
// client may see, FINIEX_* is what only this Node process may see. Loaded at module scope so the
// export stays an object — `vitest.config.ts` merges this file, and mergeConfig cannot merge a
// function. `.env.local` is read in every mode, so the mode here only decides whether an additional
// `.env.<mode>` is read as well.
const env = loadEnv(process.env['NODE_ENV'] ?? 'development', process.cwd(), ['VITE_', 'FINIEX_'])

// Deliberately NOT a VITE_ variable. Anything with that prefix is inlined into the client bundle at
// build time, and a bearer token in a bundle is a published string — a value a browser transmits is
// a value its user possesses. This one stays in this process and is attached to the proxied
// request, so the browser never receives it. Empty means no header at all: inert until a token
// exists. A variable set in the real environment wins over a .env file, which is why Compose keeps
// deciding the API target while the token can come from .env.local.
const apiToken = env['FINIEX_API_TOKEN'] ?? ''

export default defineConfig({
  plugins: [
    vue(),
    viteServersPlugin({
      // Forwards all /api/* requests to the backend.
      // VITE_API_BASE_URL is set to http://finiex-dev:8000 inside Docker Compose.
      defaultUrl: env['VITE_API_BASE_URL'] ?? 'http://localhost:8000',
      defaultToken: apiToken,
      secretsDir: '.secrets',
    }),
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
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/github_issues/**', '**/.secrets/**', '**/.claude/**'],
      interval: 300
    },
    hmr: {
      clientPort: 5173  // tells the browser to connect HMR WebSocket to localhost:5173, not the internal Docker address
    }
  }
})
