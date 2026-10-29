import { test, expect } from './cdp_fixture'
import { fixture, mockApi, revealFixtureRun, FIXTURE_DEPLOYMENT, FIXTURE_RUN, STATE_FRAME_RUNS } from './api_mock'
import { openWith, showPanel, FIXTURES_SHOWN } from './arrangement_seed'

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
  // the report beside the list, as the first arrangement stands it on a screen this wide
  // (2026-10-20): the pick alone is timed. Until then the pick also brought the report forward and
  // drew it the first time; at 1280 px it now stays behind the list, and a second click would time
  // the test's own round trip
  await page.setViewportSize({ width: 1400, height: 900 })
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
    // panel: the figure ends when the last loading line is gone
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

/**
 * The run chart since it draws for itself (viewer#41): its own drawing host places and paints every
 * layer on each move of the view, where the library's markers did that inside the library. Two
 * figures, on the fixture's busiest unit — 21 events over 1,075 bars: a unit chosen until its marks
 * stand on the candles, and a zoom step until the frame after it has painted, the mean of ten.
 */
test('the run chart draws a unit, and a zoom step, quickly', async ({ page }) => {
  // the chart beside the report, the first arrangement's third column (operator, 2026-10-20)
  await page.setViewportSize({ width: 1800, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN })
  const unitSelect = page.locator('[data-quick-bar="run-chart"] select').first()
  await expect(unitSelect).toBeEnabled()
  const chart = page.locator('[data-panel-kind="run-chart"] .candle-chart')
  await expect.poll(async () => Number(await chart.getAttribute('data-marks'))).toBeGreaterThan(0)

  const drawn = await timed('run chart — a unit drawn', async () => {
    await unitSelect.selectOption('ETHUSD_spot_two_balances')
    // on the page's own frames, not at a test poll's intervals
    await page.waitForFunction(
      () => document.querySelector('[data-panel-kind="run-chart"] .candle-chart')?.getAttribute('data-events') === '21',
      undefined,
      { polling: 'raf' },
    )
  })

  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const steps = 10
  const started = Date.now()
  for (let step = 0; step < steps; step++) {
    await page.mouse.wheel(0, step < steps / 2 ? 400 : -400)
    // the frame after the wheel paints every layer again; the one after that has painted them
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
  const perStep = Math.round((Date.now() - started) / steps)
  timings.push({ label: 'run chart — a zoom step drawn (mean)', ms: perStep })

  expect(drawn).toBeLessThan(3000)
  expect(perStep).toBeLessThan(500)
})

/**
 * Bars loaded as the view moves (viewer#9): a unit's window widened over both stretches of the
 * captured EURGBP bars, three weeks apart, read in M1. Timed from the timeframe chosen until both
 * stretches are drawn: the first batch, the pieces across the gap, and the earlier bars merged in
 * front with the view kept where it was.
 */
test('earlier bars are merged across a gap quickly', async ({ page }) => {
  await mockApi(page, { firstTick: { unit: 'EURGBP_refusals_01', at: '2025-10-10T06:00:00+00:00' } })
  await page.setViewportSize({ width: 1800, height: 900 })
  await openWith(page, '/', {
    run: FIXTURE_RUN, units: ['EURGBP_refusals_01'], position: { scenario: 'EURGBP_refusals_01', position: 'pos_eurgbp_1' },
  })
  const timeframe = page.locator('[data-quick-bar="run-chart"] select').nth(1)
  await expect(timeframe).toBeEnabled()

  const merged = await timed('run chart — a gap crossed, bars merged', async () => {
    await timeframe.selectOption('M1')
    await page.waitForFunction(
      () => document.querySelector('[data-panel-kind="run-chart"] .candle-chart')?.getAttribute('data-bars') === '120',
      undefined,
      { polling: 'raf' },
    )
  })

  expect(merged).toBeLessThan(3000)
})

/**
 * A sweep's ranking at the size a real search reaches (viewer#32): 500 combinations built from the
 * captured sweep. The ranking draws every row, and this says whether it needs a cap — timed from
 * the sweep opened until the last row stands, on the page's own frames.
 */
test('a sweep of 500 combinations is ranked on screen quickly', async ({ page }) => {
  const detail = fixture('sweep_detail.json') as { sweep_id: string, combinations: { run_id: string }[] }
  const combinations = Array.from({ length: 500 }, (_, index) => ({
    ...detail.combinations[index % detail.combinations.length]!,
    run_id: `20261019_000000_${String(index).padStart(8, '0')}`,
  }))
  await page.route(`**/api/v1/sweeps/${detail.sweep_id}`, route => route.fulfill({ json: { ...detail, combinations, count: 500 } }))
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await page.locator('.menu-bar-trigger', { hasText: 'Panels' }).click()
  await page.locator('.menu-item[data-kind="sweeps"]').click()
  await page.keyboard.press('Escape')
  const sweep = page.locator(`[data-panel-kind="sweeps"] .sweep-list .record-group:has([data-sweep="${detail.sweep_id}"])`)
  await sweep.waitFor()

  const ms = await timed('sweep — 500 combinations ranked', async () => {
    await sweep.click()
    await page.waitForFunction(
      () => document.querySelectorAll('[data-panel-kind="sweeps"] .sweep-list .run-id').length === 500,
      undefined,
      { polling: 'raf' },
    )
  })
  expect(ms).toBeLessThan(3000)
})

/** A deployment picked in its list until its bundle draws the sessions (viewer#43). */
test('a deployment opens its bundle quickly', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openWith(page, '/')
  await showPanel(page, 'Deployments')
  const row = page.locator('.deployment-list .record-row', { hasText: FIXTURE_DEPLOYMENT })
  await row.waitFor()

  const ms = await timed('deployment chosen to its bundle drawn', async () => {
    await row.click()
    await page.locator('[data-panel-kind="deployment"] .sessions-list .record-row').first().waitFor({ state: 'visible' })
  })
  expect(ms).toBeLessThan(3000)
})

/**
 * A session's frames stepped through (viewer#51): 500 frames built from the captured ones, one a
 * minute, the window served as the route serves it — from, to and a limit. One step is the click
 * until the player names the next frame, on the page's own frames; the mean of twenty.
 */
test('a session steps through its frames quickly', async ({ page }) => {
  const window = fixture('recorded_window.json') as { state_frames: { frame_time: string, record_no: number }[] }
  const timeline = fixture('recorded_streams.json') as { streams: Record<string, unknown>[] }
  const start = Date.parse(window.state_frames[0]!.frame_time)
  const frames = Array.from({ length: 500 }, (_, index) => ({
    ...window.state_frames[index % window.state_frames.length]!,
    frame_time: new Date(start + index * 60_000).toISOString(),
    record_no: index + 1,
  }))
  const unit = `**/api/v1/reports/runs/${STATE_FRAME_RUNS.ended}/units/*/recorded-streams`
  await page.route(unit, route => route.fulfill({
    json: {
      ...timeline,
      streams: timeline.streams.map(stream => ({
        ...stream, record_count: 500, first_record_time: frames[0]!.frame_time, last_record_time: frames.at(-1)!.frame_time,
      })),
    },
  }))
  await page.route(`${unit}/window*`, route => {
    const asked = new URL(route.request().url()).searchParams
    const from = asked.get('from') ? Date.parse(asked.get('from')!) : -Infinity
    const to = asked.get('to') ? Date.parse(asked.get('to')!) : Infinity
    const inWindow = frames.filter(frame => Date.parse(frame.frame_time) >= from && Date.parse(frame.frame_time) < to)
    const returned = inWindow.slice(0, Number(asked.get('limit') ?? 2000))
    const cut = returned.length < inWindow.length
    return route.fulfill({
      json: {
        ...window, matched: inWindow.length, returned: returned.length, truncated: cut,
        next_from: cut ? inWindow[returned.length]!.frame_time : null, state_frames: returned,
      },
    })
  })
  await page.setViewportSize({ width: 1600, height: 900 })
  await openWith(page, '/', { run: STATE_FRAME_RUNS.ended })
  const section = page.locator('[data-panel-kind="run"] [data-panel="latest-state"]')
  await section.locator('details summary').click()
  const where = section.locator('.player .where')
  await expect(where).toContainText('frame 500 of 500')
  await section.locator('[data-action="first"]').click()
  await expect(where).toContainText('frame 1 of 500')

  const steps = 20
  const started = Date.now()
  for (let step = 1; step <= steps; step++) {
    await section.locator('[data-action="on"]').click()
    await page.waitForFunction(
      next => document.querySelector('[data-panel-kind="run"] [data-panel="latest-state"] .player .where')
        ?.textContent?.includes(next),
      `frame ${step + 1} of 500`,
      { polling: 'raf' },
    )
  }
  const perStep = Math.round((Date.now() - started) / steps)
  timings.push({ label: 'frames — a step drawn (mean of 20)', ms: perStep })
  expect(perStep).toBeLessThan(500)
})
