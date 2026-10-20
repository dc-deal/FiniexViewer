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
  const row = page.locator('.run-list .record-row:not(.record-unseen)')
    .filter({ has: page.locator(`.run-id[title="${FIXTURE_RUN}"]`) })
  await expect(row).toBeVisible()
  await row.click()

  // at the suite's 1280 px the bundle is a tab beside the list, and a pick never covers the list
  // it was made in
  await page.locator('.dv-tab', { has: page.locator('.panel-tab[data-kind="run"]') }).click()
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
 * A SELECTION NEVER MOVES THE LAYOUT. Choosing a scenario frames the column and names the choice
 * beside the tab; it used to indent every panel by the frame's border and padding and push the
 * column down a line, so everything the reader was looking at slid away under the click.
 *
 * The executive figures are the run's and do not narrow, so their panel is the clean witness: any
 * change to its box is a mark that took room. Panels below it narrow their CONTENT, which is the
 * point of the click, so the row under the pointer is held by its own top instead.
 */
for (const hint of ['shown', 'dismissed'] as const) {
  test(`choosing a scenario moves nothing in the column, the hint ${hint}`, async ({ page }) => {
    // dismissed is the reader's usual state, and it is where the old state line moved the list by a
    // whole line: it appeared where nothing stood
    if (hint === 'dismissed') {
      await page.addInitScript(() => {
        window.localStorage.setItem('hints.v1', JSON.stringify({ version: 1, banned: ['scenario-pick'] }))
      })
    }
    await openWith(page, '/', { run: FIXTURE_RUN })
    await page.locator('.panel-trigger', { hasText: 'Scenarios' }).click()
    const scenario = page.locator('.scenario-roster .record-row').first()
    await expect(scenario).toBeVisible()

    const executive = page.locator('[data-panel="executive"]')
    const frame = async () => {
      const box = (await executive.boundingBox())!
      return { x: box.x, width: box.width, height: box.height }
    }
    const rowTop = async () => (await scenario.boundingBox())!.y
    const before = { frame: await frame(), row: await rowTop() }
    await scenario.click()
    await expect(page.locator('.narrowed-head')).toBeVisible()
    await expect(executive.locator('.scope-line')).toBeVisible()

    expect(await frame()).toEqual(before.frame)
    expect(await rowTop()).toBe(before.row)
  })
}

/**
 * A section on its way for the run on screen keeps its panel in place and says so. A run change
 * used to empty the column behind one spinner, then let every panel come back on its own.
 */
test('a section still on its way keeps its panel standing, saying it loads', async ({ page }) => {
  await page.route('**/api/v1/reports/runs/*/run-summary', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500))
    await route.fallback()
  })
  await openWith(page, '/', { run: FIXTURE_RUN })

  const executive = page.locator('[data-panel="executive"]')
  await expect(executive.locator('.panel-loading')).toBeVisible()
  await expect(page.locator('.panel-column')).toBeVisible()

  await expect(executive.locator('.panel-loading')).toHaveCount(0)
  await expect(executive).toContainText('Net P&L')
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
  await expect(page.locator('.run-list .record-row:not(.record-unseen)').first()).toBeVisible()

  const before = await page.locator('.run-list .record-row:not(.record-unseen)').count()
  // a term that narrows without emptying: the picker searches the run id and the SET name, and
  // the capture holds several `demo_btcusd_bot` runs. The search stands folded into its button.
  await page.locator('.facet-search-toggle').first().click()
  await page.locator('input.facet-search').first().fill('demo_btcusd')
  await expect.poll(async () => (await storedBar(page, 'run-picker'))?.search).toBe('demo_btcusd')
  const narrowed = await page.locator('.run-list .record-row:not(.record-unseen)').count()
  expect(narrowed).toBeGreaterThan(0)
  expect(narrowed).toBeLessThan(before)

  await page.reload()

  await expect(page.locator('.run-list .record-row:not(.record-unseen)').first()).toBeVisible()
  expect(await page.locator('.run-list .record-row:not(.record-unseen)').count()).toBe(narrowed)
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
  await expect(page.locator('.run-list .record-row:not(.record-unseen)').first()).toBeVisible()

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

/**
 * EACH BROWSER TAB KEEPS ITS OWN ARRANGEMENT (viewer#31, 2026-10-14) — which is what makes a second
 * window the way to compare two runs. A new tab starts from the last one saved; from then on, what
 * another tab saves never reaches it.
 *
 * While two tabs shared one `localStorage`, the column's layout came back from the other tab on every
 * reload — it is written only when changed, and this tab had changed nothing. The run came back from
 * the other tab only sometimes: a tab writes its arrangement again as it is left, and lost only when
 * the other tab's delayed save landed between that write and the reload's read (measured both ways).
 * So the column is asserted first: it fails for the old storage every time.
 */
test('each browser tab keeps its own run and column across a reload, a new one starts from the last saved', async ({ page, context }) => {
  const tradesOf = (tab: typeof page) => tab.locator('.panel-trigger', { hasText: 'Trade history' })
  await openWith(page, '/', { run: FIXTURE_RUN })
  await expect(page.locator('[data-panel-kind="run"] .chosen-id')).toHaveText(FIXTURE_RUN)
  await expect(tradesOf(page)).toHaveAttribute('aria-expanded', 'false')

  // a second tab starts from the last arrangement saved: the first tab's run
  const second = await context.newPage()
  await mockApi(second)
  await second.goto('/')
  await expect(second.locator('[data-panel-kind="run"] .chosen-id')).toHaveText(FIXTURE_RUN)

  // it opens a section of the column, and picks another run — the fixture run is hidden in the list
  // by default, so any visible row will do
  await tradesOf(second).click()
  await expect(tradesOf(second)).toHaveAttribute('aria-expanded', 'true')
  await second.locator('.dv-tab', { has: second.locator('.panel-tab[data-kind="runs"]') }).click()
  const other = second.locator('.run-list .record-row >> visible=true').first()
  const otherId = await other.locator('.run-id').getAttribute('title')
  expect(otherId).not.toBe(FIXTURE_RUN)
  await other.click()
  // at 1280 px the pick leaves the bundle behind its list; the reader brings it forward
  await second.locator('.dv-tab', { has: second.locator('.panel-tab[data-kind="run"]') }).click()
  await expect(second.locator('[data-panel-kind="run"] .chosen-id')).toHaveText(otherId!)

  // the first tab, reloaded, still has its own column and its own run; the second its own run
  await page.reload()
  await expect(tradesOf(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('[data-panel-kind="run"] .chosen-id')).toHaveText(FIXTURE_RUN)
  await second.reload()
  await expect(second.locator('[data-panel-kind="run"] .chosen-id')).toHaveText(otherId!)
  await second.close()
})
