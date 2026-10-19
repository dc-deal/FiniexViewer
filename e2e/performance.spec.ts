import { test, expect } from './cdp_fixture'
import { mockApi, revealFixtureRun, FIXTURE_RUN } from './api_mock'
import { openWith, FIXTURES_SHOWN } from './arrangement_seed'

/**
 * How long the views take to become USABLE.
 *
 * The API is mocked, deliberately: this measures OUR rendering and nothing else. A slow answer
 * from the backend is a different finding with a different owner, and mixing the two produces a
 * number nobody can act on: whose slowness it is has to be named before it is reported.
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
 * would blame the app for the developer's tooling — and before calling something slow, the first
 * thing to say is whose slowness it is.
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
    await page.goto('/')
    await page.locator('.run-list .record-row:not(.record-unseen)').first().waitFor({ state: 'visible' })
  })

  // The cold figure also carries the test browser's own stall before it asks for the page at all
  // (measured 2026-10-13: 877 ms between fetchStart and requestStart, before any code of ours
  // exists). Read on the page's own clock, from the document's arrival to the first row, it is the
  // app alone.
  const appOnly = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    return Math.round(performance.now() - navigation.responseStart)
  })
  timings.push({ label: 'run list — cold, app only (page clock)', ms: appOnly })

  const warm = await timed('run list — warm (the app itself)', async () => {
    await page.goto('/?reload=1')
    await page.locator('.run-list .record-row:not(.record-unseen)').first().waitFor({ state: 'visible' })
  })

  // the alarm is on the WARM number; the cold one is recorded so the gap stays visible
  expect(warm).toBeLessThan(1500)
  expect(cold).toBeLessThan(6000)
})

test('a run opens its panels quickly', async ({ page }) => {
  // The run every capture was taken from is a FIXTURE, which the list hides by default, and it sits
  // folded inside its family — so the list is opened on the fixtures and the family unfolded BEFORE
  // the clock starts, the way `run_selection.spec.ts` reaches it. Without both, the click found no
  // row: this spec runs only on a perf pass, so it went unnoticed from the day the default filter
  // and the folding arrived until 2026-10-12.
  await openWith(page, '/', FIXTURES_SHOWN)
  await page.locator('.run-list .record-row:not(.record-unseen)').first().waitFor({ state: 'visible' })
  await revealFixtureRun(page)

  const ms = await timed('run chosen to panels drawn', async () => {
    // by the id cell's TITLE, not by the row's text: the cell shows only the timestamp part, so
    // the full id appears nowhere in what the row renders
    await page.locator('.run-list .record-row:not(.record-unseen)')
      .filter({ has: page.locator(`.run-id[title="${FIXTURE_RUN}"]`) })
      .click()
    await page.locator('.panel-trigger').first().waitFor({ state: 'visible' })
    // a panel keeps its place while its section loads, so a drawn frame is not yet a usable
    // panel: the figure ends when the last loading line is gone. Since the run report is a panel
    // of its own (2026-10-14) the click also brings it to the front and draws it the first time —
    // part of the figure from then on
    await expect(page.locator('.panel-loading')).toHaveCount(0)
  })
  expect(ms).toBeLessThan(3000)
})

/**
 * The narrowing touches five panels at once and is the most expensive interaction the run view
 * has. It is also pure client work — no request leaves the page — so a slow one is entirely ours.
 */
test('narrowing to a scenario is immediate', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
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
  await openWith(page, '/', { run: FIXTURE_RUN })
  await page.locator('.panel-trigger', { hasText: 'Trade history' }).click()

  const ms = await timed('trade history drawn', async () => {
    await page.locator('.trade-history').waitFor({ state: 'visible' })
  })
  expect(ms).toBeLessThan(3000)
})
