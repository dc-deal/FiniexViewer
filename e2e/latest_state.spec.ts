import { test, expect } from './cdp_fixture'
import { FIXTURE_RUN, STATE_FRAME_RUNS, fixture, mockApi } from './api_mock'
import { openWith } from './arrangement_seed'

/**
 * The check-in on a session, in a real browser: the run bundle draws the latest state frame FIRST
 * for a session that records them, says why the rest of its report is not there, and draws nothing
 * of the kind for a backtest. The two captures are a session stopped without an end and one that
 * ended and wrote its outcome.
 */

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1600, height: 900 })
})

test('a stopped session stands first in its bundle, its report said as never written', async ({ page }) => {
  await openWith(page, '/', { run: STATE_FRAME_RUNS.stopped })
  const bundle = page.locator('[data-panel-kind="run"]')
  const section = bundle.locator('[data-panel="latest-state"]')
  await expect(section.locator('.status')).toContainText('recording stopped')
  await expect(bundle.locator('[data-panel]').first()).toHaveAttribute('data-panel', 'latest-state')
  await expect(bundle.locator('.notice').first()).toContainText('stopped recording without an end')
  // the frame stays open: the session wrote no report that would describe it
  await expect(section.locator('details')).toHaveCount(0)
})

test('an ended session folds its last frame behind its outcome', async ({ page }) => {
  await openWith(page, '/', { run: STATE_FRAME_RUNS.ended })
  const section = page.locator('[data-panel-kind="run"] [data-panel="latest-state"]')
  await expect(section.locator('.status')).toContainText('ended · success')
  await expect(section.locator('details summary')).toContainText('the state its report sections describe')
})

/**
 * Its frames over time, played: the player opens on the newest, steps back and to the first, and
 * plays on to the end. A session whose frames over time are not recorded shows its latest alone.
 */
test('an ended session plays its frames over time', async ({ page }) => {
  await openWith(page, '/', { run: STATE_FRAME_RUNS.ended })
  const section = page.locator('[data-panel-kind="run"] [data-panel="latest-state"]')
  await section.locator('details summary').click()
  const where = section.locator('.player .where')
  await expect(where).toContainText('frame 3 of 3')
  await section.locator('[data-action="back"]').click()
  await expect(where).toContainText('frame 2 of 3')
  await section.locator('[data-action="first"]').click()
  await expect(where).toContainText('frame 1 of 3')
  await section.locator('[data-action="play"]').click()
  await expect(where).toContainText('frame 3 of 3')
  await expect(section.locator('[data-action="play"]')).toHaveText('▶')
})

test('a session whose frames over time are not recorded shows its latest alone', async ({ page }) => {
  await openWith(page, '/', { run: STATE_FRAME_RUNS.stopped })
  const stopped = page.locator('[data-panel-kind="run"] [data-panel="latest-state"]')
  await expect(stopped.locator('.status')).toContainText('recording stopped')
  await expect(stopped.locator('.player')).toHaveCount(0)
  await expect(stopped).toContainText('Account')
})

test('a backtest has no such section', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  const bundle = page.locator('[data-panel-kind="run"]')
  await expect(bundle.locator('[data-panel="executive"]')).toBeVisible()
  await expect(bundle.locator('[data-panel="latest-state"]')).toHaveCount(0)
})

/**
 * The frame on show stands on the run chart beside it, as a dashed line drawn on a real canvas, and
 * moves with each step (viewer#51). The captures of this session do not fit together for a chart: its
 * index row names another unit than its frames, no configuration names its market and no bars are held.
 * So the row of the session that wrote the frames, a live configuration and a bar a minute are served.
 */
test('the frame on show stands on the run chart and moves with each step', async ({ page }) => {
  const opened = Date.parse('2026-01-25T02:19:00Z') / 1000
  const bars = Array.from({ length: 60 }, (_, index) =>
    ({ t: opened + index * 60, o: 1, h: 1.1, l: 0.9, c: 1, v: 1, tc: 1 }))
  await page.route(/\/reports\/runs$/, route => {
    const list = fixture('runs_list.json') as { runs: { run_id: string }[] }
    return route.fulfill({
      json: {
        ...list,
        runs: list.runs.map(run => run.run_id !== STATE_FRAME_RUNS.ended ? run : {
          ...run, data_windows: [{ unit_name: 'state_frames_test', start_date: '2026-01-25T02:19:46+00:00', end_date: '2026-01-25T08:00:00+00:00' }],
        }),
      },
    })
  })
  await page.route(/\/reports\/runs\/[^/]+\/config/, route => route.fulfill({
    json: { ...(fixture('run_config_live.json') as object), run_id: STATE_FRAME_RUNS.ended },
  }))
  await page.route(/\/symbols\/[^/]+\/coverage/, route => route.fulfill({
    json: { start: '2026-01-25T02:00:00+00:00', end: '2026-01-25T08:00:00+00:00', timeframes: ['M1'] },
  }))
  await page.route(/\/symbols\/[^/]+\/bars/, route => route.fulfill({ json: bars }))
  await page.setViewportSize({ width: 1800, height: 900 })
  await openWith(page, '/', { run: STATE_FRAME_RUNS.ended })
  const section = page.locator('[data-panel-kind="run"] [data-panel="latest-state"]')
  await section.locator('details summary').click()
  const where = section.locator('.player .where')
  await expect(where).toContainText('frame 3 of 3')
  const chart = page.locator('[data-panel-kind="run-chart"] .candle-chart')
  await expect(chart).toHaveAttribute('data-drawings', /state-frame:1/)
  // frames 3, 2 and 1 fall in the bars of 02:21, 02:20 and 02:19
  await expect(chart).toHaveAttribute('data-time-at', String(opened + 120))
  await section.locator('[data-action="back"]').click()
  await expect(chart).toHaveAttribute('data-time-at', String(opened + 60))
  await section.locator('[data-action="first"]').click()
  await expect(chart).toHaveAttribute('data-time-at', String(opened))
})
