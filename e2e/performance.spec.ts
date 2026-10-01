import { test, expect } from './cdp_fixture'
import { mockApi, FIXTURE_RUN } from './api_mock'

/**
 * How long the views take to become USABLE.
 *
 * The API is mocked, deliberately: this measures OUR rendering and nothing else. A slow answer
 * from the backend is a different finding with a different owner, and mixing the two produces a
 * number nobody can act on — §14 already says to name whose slowness it is before reporting it.
 *
 * What is measured is not a paint but the moment a reader can DO the next thing: the first run row
 * present, the panels present, the narrowing applied. That is the only definition that degrades
 * honestly — a page that paints fast and is inert for two seconds is a slow page.
 *
 * The budgets are deliberately loose. They are a REGRESSION alarm, not a target: they exist to
 * catch the day something doubles, and a tight budget on a developer machine under load is a
 * flaky test, which is worse than none.
 */

type Timed = { label: string, ms: number }
const timings: Timed[] = []

async function timed(label: string, work: () => Promise<unknown>): Promise<number> {
  const started = Date.now()
  await work()
  const ms = Date.now() - started
  timings.push({ label, ms })
  return ms
}

test.afterAll(() => {
  // one table, read by a person or by an assistant — cheaper than any screenshot. It names WHICH
  // server it measured, because the same numbers mean different things: the dev server transforms
  // every module on demand and the preview build does not, so a figure quoted without that is a
  // claim about the product the run cannot support.
  const against = process.env['VIEWER_URL'] ?? 'http://localhost:5173 (dev server)'
  const rows = timings.map(t => `  ${t.label.padEnd(38)} ${String(t.ms).padStart(6)} ms`)
  console.log(['', `PERFORMANCE — against ${against}`, ...rows, ''].join('\n'))
})

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

/**
 * Cold and warm, separately — because the first navigation against the DEV SERVER is not a
 * measurement of this app. Vite serves every module unbundled and transforms on demand, so a cold
 * load pays for hundreds of requests that production never makes. Reporting the two as one number
 * would blame the app for the developer's tooling, which §14 exists to prevent: before calling
 * something slow, say whose slowness it is.
 *
 * The production build is measurable too, and the difference is not small — measured 2026-09-30,
 * the warm run list is 209 ms against the preview bundle and 620 ms against the dev server:
 *
 *   docker exec finiex-viewer sh -lc 'cd /app && npm run build'
 *   docker exec finiex-viewer sh -lc 'cd /app && npm run preview'        (background)
 *   docker exec -e VIEWER_URL=http://localhost:4173 finiex-viewer sh -lc 'cd /app && npm run test:perf'
 */
test('the run list is usable quickly', async ({ page }) => {
  const cold = await timed('run list — cold (first transform / first fetch)', async () => {
    await page.goto('/runs')
    await page.locator('.run-list .record-row').first().waitFor({ state: 'visible' })
  })

  const warm = await timed('run list — warm (the app itself)', async () => {
    await page.goto('/runs?reload=1')
    await page.locator('.run-list .record-row').first().waitFor({ state: 'visible' })
  })

  // the alarm is on the WARM number; the cold one is recorded so the gap stays visible
  expect(warm).toBeLessThan(1500)
  expect(cold).toBeLessThan(6000)
})

test('a run opens its panels quickly', async ({ page }) => {
  await page.goto('/runs')
  await page.locator('.run-list .record-row').first().waitFor({ state: 'visible' })

  const ms = await timed('run chosen to panels drawn', async () => {
    // by the id cell's TITLE, not by the row's text: the cell shows only the timestamp part, so
    // the full id appears nowhere in what the row renders
    await page.locator('.run-list .record-row')
      .filter({ has: page.locator(`.run-id[title="${FIXTURE_RUN}"]`) })
      .click()
    await page.locator('.panel-trigger').first().waitFor({ state: 'visible' })
  })
  expect(ms).toBeLessThan(3000)
})

/**
 * The narrowing touches five panels at once and is the most expensive interaction the run view
 * has. It is also pure client work — no request leaves the page — so a slow one is entirely ours.
 */
test('narrowing to a scenario is immediate', async ({ page }) => {
  await page.goto(`/runs?run=${FIXTURE_RUN}`)
  await page.locator('.panel-trigger', { hasText: 'Scenarios' }).click()
  await page.locator('.scenario-roster .record-row').first().waitFor({ state: 'visible' })

  const ms = await timed('narrowing applied across panels', async () => {
    await page.locator('.scenario-roster .record-row').first().click()
    await page.locator('.narrowed-head').waitFor({ state: 'visible' })
  })
  expect(ms).toBeLessThan(1500)
})

/**
 * The trade list is the one place a real run can produce thousands of rows, and it is already a
 * known finding (101: `HoverCard` mounts a tooltip provider PER ROW, ~4.8 s for 500 rows in
 * jsdom). Whether that reproduces in a real browser is the open half of that finding — this
 * measures it rather than arguing about it.
 */
test('the trade list draws within its row cap', async ({ page }) => {
  await page.goto(`/runs?run=${FIXTURE_RUN}`)
  await page.locator('.panel-trigger', { hasText: 'Trade History' }).click()

  const ms = await timed('trade history drawn', async () => {
    await page.locator('.trade-history').waitFor({ state: 'visible' })
  })
  expect(ms).toBeLessThan(3000)
})
