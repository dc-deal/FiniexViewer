import { test, expect } from './cdp_fixture'
import { mockApi, FIXTURE_RUN } from './api_mock'

/**
 * The URL round-trip, which is the thing jsdom can only approximate.
 *
 * The unit suite already proves that the composable writes the params and that the store restores
 * from them. What it cannot prove is that a REAL reload of a REAL URL in a REAL browser puts the
 * reader back where they were — the part that involves the address bar, the history entry and the
 * app booting from scratch. Every defect this instrument exists for reached the screen with the
 * unit suite green.
 */
test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('a chosen run and scenario survive a reload', async ({ page }) => {
  await page.goto('/runs')

  // Found by the id cell's TITLE, not by the row's text: the cell shows only the timestamp part,
  // since the eight hex characters after it separate two runs of the same second and nothing else.
  const row = page.locator('.run-list .record-row')
    .filter({ has: page.locator(`.run-id[title="${FIXTURE_RUN}"]`) })
  await expect(row).toBeVisible()
  await row.click()

  await expect(page).toHaveURL(new RegExp(`run=${FIXTURE_RUN}`))

  // the Scenarios panel starts COLLAPSED (`defaultOpen: false` in the registry), so its rows are
  // not in the document until it is opened — the panel shell renders nothing behind a closed one
  await page.locator('.panel-trigger', { hasText: 'Scenarios' }).click()

  // narrow to one scenario from the roster
  const scenario = page.locator('.scenario-roster .record-row').first()
  const chosen = (await scenario.locator('.roster-name').innerText()).trim()
  await scenario.click()

  await expect(page).toHaveURL(new RegExp(`unit=${chosen}`))
  await expect(page.locator('.narrowed-head')).toContainText(chosen)

  // THE POINT: a real reload of the real URL
  await page.reload()

  await expect(page.locator('.narrowed-head')).toContainText(chosen)
  await expect(page.locator('.scenario-roster .record-row.picked')).toHaveCount(1)
})

/**
 * The self-healing link. `group` and `name` were cascade params that no longer exist; a link
 * saved while they did must still open the right run AND stop carrying them. Only a browser can
 * show the second half, because it is about what the address bar ends up saying.
 */
test('a link saved under the old cascade opens, and cleans its dead params away', async ({ page }) => {
  await page.goto(`/runs?group=sweeps&name=stale_set&run=${FIXTURE_RUN}`)

  await expect(page.locator('.picker-chosen')).toContainText(FIXTURE_RUN)
  await expect(page).not.toHaveURL(/group=/)
  await expect(page).not.toHaveURL(/name=/)
})

/**
 * A link naming a run the index no longer lists. The store refuses it rather than firing one 404
 * per section, and the view says which id is gone — a blank page would leave the reader guessing
 * whether the app or the link was broken.
 */
test('a link naming a run that is gone says so', async ({ page }) => {
  await page.goto('/runs?run=20260101_000000_deadbeef')

  await expect(page.locator('.state-overlay')).toContainText('20260101_000000_deadbeef')
})

/**
 * A narrowed list is a link somebody can send (viewer#116). The unit suite proves the encoding and
 * the merge; only a browser proves that the address bar ends up carrying it and that a boot from
 * that address reproduces what the sender saw.
 */
test('a narrowed run list survives a reload and stays a shareable link', async ({ page }) => {
  await page.goto('/runs')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()

  const before = await page.locator('.run-list .record-row').count()
  // a term that narrows without emptying: the picker searches the run id and the SET name, and
  // the capture holds six `demo_btcusd_bot` runs among 39
  await page.locator('input.facet-search').first().fill('demo_btcusd')
  await expect(page).toHaveURL(/runq=demo_btcusd/)
  const narrowed = await page.locator('.run-list .record-row').count()
  expect(narrowed).toBeGreaterThan(0)
  expect(narrowed).toBeLessThan(before)

  await page.reload()

  await expect(page.locator('.run-list .record-row').first()).toBeVisible()
  expect(await page.locator('.run-list .record-row').count()).toBe(narrowed)
})

/**
 * Two bars and the run in ONE url. The run picker's params and the roster's must coexist with
 * `run` and `unit`, and no writer may drop another's key — the failure a single-tick race produces
 * is exactly one missing param, which looks like nothing at all until the link is opened.
 */
test('the run, the scenario and both bars ride in one url', async ({ page }) => {
  await page.goto(`/runs?run=${FIXTURE_RUN}&runsort=oldest&unitsort=ticks`)

  await expect(page.locator('.picker-chosen')).toContainText(FIXTURE_RUN)
  await expect(page).toHaveURL(new RegExp(`run=${FIXTURE_RUN}`))
  await expect(page).toHaveURL(/runsort=oldest/)
  await expect(page).toHaveURL(/unitsort=ticks/)
})
