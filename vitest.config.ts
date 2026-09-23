import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    // browser interfaces jsdom lacks — see the note in tests/setup.ts
    setupFiles: ['./tests/setup.ts'],
  },
}))
