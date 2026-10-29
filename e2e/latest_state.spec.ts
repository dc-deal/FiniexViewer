import { test, expect } from './cdp_fixture'
import { FIXTURE_RUN, STATE_FRAME_RUNS, mockApi } from './api_mock'
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
