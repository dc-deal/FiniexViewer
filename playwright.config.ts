import { defineConfig, devices } from '@playwright/test'

/**
 * Browser-level verification (viewer#23).
 *
 * The runner lives in the `finiex-viewer` container; the BROWSER does not. The image is Alpine
 * (measured 2026-09-28: Alpine 3.23.4, musl 1.2.5) and Playwright ships its browsers as glibc
 * builds, so none of them runs here. The browser therefore runs on the developer's machine and is
 * driven over CDP — see `e2e/cdp_fixture.ts` for the connection and what it needs.
 *
 * `baseURL` is written from the BROWSER's point of view, not the runner's. Both happen to be
 * `localhost:5173` because Vite's port is published to the host, but they are two different
 * machines answering and it is worth knowing which one a failure came from.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],

  /**
   * The performance spec is NOT part of the ordinary run — `npm run test:perf` runs it alone, with
   * one worker. Measured 2026-09-29: the warm run-list load reads 776 ms serially and 2304 ms while
   * two other specs hammer the same dev server. That is contention, not a regression, but a budget
   * that fails depending on how many workers are running is a flaky test — precisely what
   * `retries: 0` exists to make visible rather than to hide.
   *
   * Same shape as the backend's own benchmark suite: excluded from the daily run, executed
   * deliberately around a release.
   */
  testIgnore: process.env['PERF'] ? [] : ['**/performance.spec.ts'],

  /**
   * Zero, deliberately. A test that goes green on the third attempt is flaky and we would never
   * see it — the same reasoning as the quality gates: an instrument that cannot report a problem
   * gets believed.
   */
  retries: 0,

  // a trace file and an HTML report are useful in front of a person and useless in a log
  reporter: process.env['CI'] ? 'list' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env['VIEWER_URL'] ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  /**
   * No `webServer` block, deliberately. Playwright's requires a `command` it can run and own, and
   * the dev server here is a CONTAINER of its own that this process must neither start nor stop.
   * A wait-only form does not exist — the issue's starting sketch assumed one, and the type-check
   * said otherwise the moment `e2e/` was given a scope.
   *
   * The cost of leaving it out is one worse error message when the server is down: the first
   * `goto` fails instead of a named wait timing out. That is an acceptable trade for not having a
   * test runner with a kill switch on someone else's container.
   */
})
