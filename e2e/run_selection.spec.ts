import { test, expect } from './cdp_fixture'
import { mockApi, FIXTURE_RUN, revealFixtureRun } from './api_mock'
import { openWith, storedBar, FIXTURES_SHOWN } from './arrangement_seed'

/**
 * The stored selection round-trip, which is the thing jsdom can only approximate.
 *
 * The unit suite already proves that the stores write the arrangement and restore from it. What it
 * cannot prove is that a REAL reload in a REAL browser puts the reader back where they were — the
 * part that involves real storage and the app booting from scratch. Every defect this instrument
 * exists for reached the screen with the unit suite green.
 */
test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('a chosen run and scenario survive a reload', async ({ page }) => {
  // The list opens WITHOUT the fixture runs, and the run every capture was taken from is itself a
  // fixture — so this spec asks for them, the way a reader would by picking the value. It is not
  // a workaround: it is the default behaving, and `run_picker.test.ts` asserts the default itself.
  await openWith(page, '/', FIXTURES_SHOWN)

  // The list groups runs by family and a family of several opens closed, so the run is behind one
  // heading — opened here the way a reader opens it.
  await revealFixtureRun(page)

  // Found by the id cell's TITLE, not by the row's text: the cell shows only the timestamp part,
  // since the eight hex characters after it separate two runs of the same second and nothing else.
  const row = page.locator('.run-list .record-row')
    .filter({ has: page.locator(`.run-id[title="${FIXTURE_RUN}"]`) })
  await expect(row).toBeVisible()
  await row.click()

  await expect(page.locator('.picker-chosen')).toContainText(FIXTURE_RUN)

  // the Scenarios panel starts COLLAPSED (`defaultOpen: false` in the registry), so its rows are
  // not in the document until it is opened — the panel shell renders nothing behind a closed one
  await page.locator('.panel-trigger', { hasText: 'Scenarios' }).click()

  // narrow to one scenario from the roster
  const scenario = page.locator('.scenario-roster .record-row').first()
  const chosen = (await scenario.locator('.roster-name').innerText()).trim()
  await scenario.click()

  await expect(page.locator('.narrowed-head')).toContainText(chosen)

  // THE POINT: a real reload
  await page.reload()

  await expect(page.locator('.narrowed-head')).toContainText(chosen)
  await expect(page.locator('.scenario-roster .record-row.picked')).toHaveCount(1)
})

/**
 * A stored run the index no longer lists. The store refuses it rather than firing one 404 per
 * section, and the view says which id is gone — a blank page would leave the reader guessing
 * whether the app or their last visit was the broken part.
 */
test('a stored run that is gone says so', async ({ page }) => {
  await openWith(page, '/', { run: '20260101_000000_deadbeef' })

  await expect(page.locator('.state-overlay')).toContainText('no longer in the index')
  await expect(page.locator('.state-overlay')).toContainText('20260101_000000_deadbeef')
})

test('a narrowed run list survives a reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()

  const before = await page.locator('.run-list .record-row').count()
  // a term that narrows without emptying: the picker searches the run id and the SET name, and
  // the capture holds several `demo_btcusd_bot` runs
  await page.locator('input.facet-search').first().fill('demo_btcusd')
  await expect.poll(async () => (await storedBar(page, 'run-picker'))?.search).toBe('demo_btcusd')
  const narrowed = await page.locator('.run-list .record-row').count()
  expect(narrowed).toBeGreaterThan(0)
  expect(narrowed).toBeLessThan(before)

  await page.reload()

  await expect(page.locator('.run-list .record-row').first()).toBeVisible()
  expect(await page.locator('.run-list .record-row').count()).toBe(narrowed)
})

/**
 * THE BAR DOES NOT MOVE WHEN IT IS USED. This is the one dimension jsdom cannot judge, and it is
 * where both reports of this defect came from: a chip changed width or appeared mid-bar, and the
 * chips to its right slid out from under the pointer mid-click.
 *
 * Two causes, both now closed — a facet that could no longer narrow used to be dropped, and the
 * count badge used to be drawn only once something was picked. The assertion is deliberately the
 * SYMPTOM rather than either cause: every chip's left edge, before and after a pick.
 */
test('picking a value leaves every chip exactly where it was', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()

  const chips = page.locator('.facet-trigger')
  const edges = () => chips.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().x))
  const before = await edges()
  expect(before.length).toBeGreaterThan(1)

  // the panel is portalled out of the bar, so opening it cannot be what moves anything
  await chips.first().click()
  await page.locator('.facet-option').first().click()
  // the pick has landed once the bar stored it — an untouched bar stores nothing
  await expect.poll(async () => (await storedBar(page, 'run-picker'))?.selection).toBeTruthy()

  expect(await edges()).toEqual(before)
})
