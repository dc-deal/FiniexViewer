import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    // browser interfaces jsdom lacks — see the note in tests/setup.ts
    setupFiles: ['./tests/setup.ts'],
    /**
     * The unit suite is `tests/` and nothing else.
     *
     * Vitest's default pattern is repository-wide, so it collected `e2e/*.spec.ts` the moment that
     * folder appeared — and a Playwright spec loaded by Vitest fails at import, which read as a
     * broken suite rather than as two runners colliding. Naming the directory keeps each runner to
     * its own, and neither can quietly adopt the other's files again.
     */
    include: ['tests/**/*.test.ts'],
  },
}))
