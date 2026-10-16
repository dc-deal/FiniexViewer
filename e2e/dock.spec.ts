import { test, expect } from './cdp_fixture'
import { mockApi, fixture, FIXTURE_RUN } from './api_mock'
import { openWith, showPanel, storedLink } from './arrangement_seed'

/**
 * The docked panels, which only a browser can judge: dockview measures, drags and lays out, and
 * jsdom does none of that. What is asserted is what a reader meets — the first arrangement, a tab
 * that costs nothing until it is picked, and an arrangement that survives a reload.
 */
test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

function tabTitles(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator('.dv-tab .panel-tab-title').allInnerTexts()
}

/** The free chart is not in the first arrangement: it opens from the Panels menu, beside the panel in front. */
async function openFreeChart(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('.menu-bar-trigger', { hasText: 'Panels' }).click()
  await page.locator('.menu-item[data-kind="chart"]').click()
  // the menu stays open after a toggle, so several panels can be switched in one visit
  await page.keyboard.press('Escape')
}

/**
 * At the suite's 1280 px the dock is too narrow to share, so the run chart is a tab right after the
 * report; from 1400 px it stands beside it as a split (`run_chart.spec.ts`).
 */
test('the first arrangement holds the suggested order, with Runs in front', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()

  expect(await tabTitles(page)).toEqual(['Deployments', 'Runs', 'Run', 'Run chart'])
  await expect(page.locator('.dv-tab.dv-active-tab')).toContainText('Runs')
})

/**
 * A tab behind another is not drawn until the reader picks it — the run list must not wait for the
 * chart's library. Counted in the document rather than inferred: the host is there from the start,
 * its content only once shown.
 */
test('a panel behind another is drawn the first time it is shown', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()

  await expect(page.locator('[data-panel-kind="run-chart"]')).toHaveCount(1)
  await expect(page.locator('.run-chart-view')).toHaveCount(0)

  await showPanel(page, 'Run chart')
  await expect(page.locator('.run-chart-view')).toBeVisible()
})

test('the arrangement survives a reload, and the suggested order comes back on request', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()

  await showPanel(page, 'Deployments')
  await page.locator('.dv-tab', { hasText: 'Run chart' }).locator('.panel-tab-close').click()
  await expect.poll(() => tabTitles(page)).toEqual(['Deployments', 'Runs', 'Run'])

  await page.reload()
  await expect.poll(() => tabTitles(page)).toEqual(['Deployments', 'Runs', 'Run'])
  await expect(page.locator('.dv-tab.dv-active-tab')).toContainText('Deployments')

  await page.locator('.menu-trigger').click()
  await page.locator('.menu-item', { hasText: 'Settings' }).click()
  await page.locator('.tab-trigger', { hasText: 'Layout' }).click()
  await page.locator('[data-action="reset-dock"]').click()
  await page.keyboard.press('Escape')
  await expect.poll(() => tabTitles(page)).toEqual(['Deployments', 'Runs', 'Run', 'Run chart'])
  await expect(page.locator('.dv-tab.dv-active-tab')).toContainText('Runs')
})

test('the free chart opens from the Panels menu, and comes back there once closed', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()

  await openFreeChart(page)
  await expect(page.locator('.dv-tab.dv-active-tab')).toContainText('Free chart')

  await page.locator('.dv-tab', { hasText: 'Free chart' }).locator('.panel-tab-close').click()
  await expect.poll(() => tabTitles(page)).toEqual(['Deployments', 'Runs', 'Run', 'Run chart'])

  await openFreeChart(page)
  await expect(page.locator('.dv-tab.dv-active-tab')).toContainText('Free chart')
})

/** About is read and closed, so it is a dialog over the dock — no tab is added for it. */
test('About opens as a dialog from the application menu, not as a tab', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()

  await page.locator('.menu-trigger').click()
  await page.locator('.menu-item[data-action="about"]').click()

  await expect(page.locator('.about-dialog')).toBeVisible()
  expect(await tabTitles(page)).toEqual(['Deployments', 'Runs', 'Run', 'Run chart'])
})

/** The quick bar speaks for the panel in FRONT: the chart's selection while it is, nothing otherwise. */
test('the quick bar holds the chart selection while the chart is in front', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()
  await expect(page.locator('[data-quick-bar="chart"]')).toHaveCount(0)

  await openFreeChart(page)
  const bar = page.locator('[data-quick-bar="chart"]')
  await expect(bar).toBeVisible()
  await expect(bar.locator('select[aria-label="Broker"]')).toBeVisible()

  await showPanel(page, 'Runs')
  await expect(page.locator('[data-quick-bar="chart"]')).toHaveCount(0)
})

/**
 * The backend's grade of the open run, where it is not a success, marks the tab of the run report — read from
 * the capture rather than transcribed, so a re-capture that grades the run anew cannot strand it.
 */
test('the tab of the run report carries the grade of the open run where it did not succeed', async ({ page }) => {
  const runs = (fixture('runs_list.json') as { runs: { run_id: string, run_outcome: string | null }[] }).runs
  const outcome = runs.find(row => row.run_id === FIXTURE_RUN)?.run_outcome ?? null
  test.skip(!outcome || outcome === 'success', 'the captured run succeeded, so its tab says nothing')

  await openWith(page, '/', { run: FIXTURE_RUN })
  const mark = page.locator('.dv-tab', { has: page.locator('.panel-tab[data-kind="run"]') }).locator('.panel-tab-status')
  await expect(mark).toHaveAttribute('aria-label', outcome!)
})

/**
 * THE PAGE NEVER SCROLLS: the dock is the whole window, and nothing of it spills past the edge.
 *
 * dockview draws every panel into an overlay of its own and sizes it from script — but only the
 * panels on show. A panel behind another tab kept the size it had, so a window made SMALLER left
 * it reaching past the new bottom, unseen, and the page grew a scrollbar over empty space (seen on
 * screen 2026-10-16; measured: the grid at 660 px, a hidden overlay still at 918). Shrinking the
 * window is what turns it red, and the first arrangement holds panels behind tabs already.
 */
test('the page does not scroll, also once the window is made smaller', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 990 })
  await openWith(page, '/', { run: FIXTURE_RUN })
  await expect(page.locator('[data-panel-kind="run"] .panel-column')).toBeVisible()

  await page.setViewportSize({ width: 1300, height: 700 })
  await expect(page.locator('.dv-grid-view')).toHaveCSS('height', /^6\d\dpx$/)

  const extent = await page.evaluate(() => ({
    tall: document.documentElement.scrollHeight, high: window.innerHeight,
    wide: document.documentElement.scrollWidth, broad: window.innerWidth,
  }))
  expect(extent.tall).toBeLessThanOrEqual(extent.high)
  expect(extent.wide).toBeLessThanOrEqual(extent.broad)

  // the clip hides only what is unseen: a panel brought forward is laid out to the new window
  await showPanel(page, 'Runs')
  const runs = page.locator('[data-panel-kind="runs"]')
  await expect(runs).toBeVisible()
  const box = (await runs.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(700)
})

/**
 * A panel dragged to the very edge of the dock docks along the WHOLE edge (operator, 2026-10-16):
 * a column over the full height, a row over the full width. The bottom shows the difference in
 * the first arrangement's two columns — a drop on a group splits one of them, the edge spans both.
 * dockview's own edge targets never saw a drag over a panel kept in the page, so the dock draws its
 * own; this is what proves them.
 */
test('a panel dropped at the edge of the dock spans the whole edge', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN })
  await expect(page.locator('[data-panel-kind="run"] .panel-column')).toBeVisible()
  const dock = (await page.locator('.panel-dock').boundingBox())!
  const tab = page.locator('.dv-tab', { has: page.locator('.panel-tab[data-kind="runs"]') })
  const from = (await tab.boundingBox())!

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(dock.x + dock.width / 2, dock.y + dock.height - 60, { steps: 6 })
  await page.mouse.move(dock.x + dock.width / 2, dock.y + dock.height - 4, { steps: 4 })
  await page.mouse.move(dock.x + dock.width / 2 + 1, dock.y + dock.height - 4)
  await expect(page.locator('.dock-edge-preview.bottom')).toBeVisible()
  await page.mouse.up()

  // the edges are gone with the drag, and the panel spans the dock's whole width along its bottom
  await expect(page.locator('.dock-edge')).toHaveCount(0)
  const runs = (await page.locator('[data-panel-kind="runs"]').boundingBox())!
  expect(runs.width).toBeGreaterThan(dock.width - 4)
  expect(runs.y + runs.height).toBeGreaterThan(dock.y + dock.height - 4)
  // and the report keeps the full width above it
  const report = (await page.locator('[data-panel-kind="run"]').boundingBox())!
  expect(report.y + report.height).toBeLessThanOrEqual(runs.y + 1)
})

/**
 * A pick is a SELECTION and never reopens a panel the reader closed (operator, 2026-10-16): with
 * every section out as a panel of its own, the run report was an empty frame, and a pick in the run
 * list brought it back each time. The run is chosen all the same — every panel shows it.
 */
test('a pick in the run list leaves a closed run report closed, and chooses the run', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN })
  await expect(page.locator('[data-panel-kind="run"] .panel-column')).toBeVisible()

  await page.locator('.dv-tab', { has: page.locator('.panel-tab[data-kind="run"]') }).locator('.panel-tab-close').click()
  await expect(page.locator('[data-panel-kind="run"]')).toHaveCount(0)
  await showPanel(page, 'Runs')
  const other = page.locator('.run-list .record-row >> visible=true').first()
  const otherId = await other.locator('.run-id').getAttribute('title')
  await other.click()

  await expect.poll(async () => (await storedLink(page))?.run.id).toBe(otherId)
  await expect(page.locator('[data-panel-kind="run"]')).toHaveCount(0)
  await expect(page.locator('[data-panel-kind="runs"]')).toBeVisible()
})
