import { test, expect } from './cdp_fixture'
import { mockApi, fixture, FIXTURE_RUN } from './api_mock'
import { openWith, showPanel } from './arrangement_seed'

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

test('the first arrangement holds the suggested order, with Runs in front', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()

  expect(await tabTitles(page)).toEqual(['Deployments', 'Runs', 'Chart'])
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

  await expect(page.locator('[data-panel-kind="chart"]')).toHaveCount(1)
  await expect(page.locator('.chart-view')).toHaveCount(0)

  await showPanel(page, 'Chart')
  await expect(page.locator('.chart-view')).toBeVisible()
})

test('the arrangement survives a reload, and the suggested order comes back on request', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()

  await showPanel(page, 'Deployments')
  await page.locator('.dv-tab', { hasText: 'Chart' }).locator('.panel-tab-close').click()
  await expect.poll(() => tabTitles(page)).toEqual(['Deployments', 'Runs'])

  await page.reload()
  await expect.poll(() => tabTitles(page)).toEqual(['Deployments', 'Runs'])
  await expect(page.locator('.dv-tab.dv-active-tab')).toContainText('Deployments')

  await page.locator('.menu-trigger').click()
  await page.locator('.menu-item', { hasText: 'Settings' }).click()
  await page.locator('.tab-trigger', { hasText: 'Layout' }).click()
  await page.locator('[data-action="reset-dock"]').click()
  await page.keyboard.press('Escape')
  await expect.poll(() => tabTitles(page)).toEqual(['Deployments', 'Runs', 'Chart'])
  await expect(page.locator('.dv-tab.dv-active-tab')).toContainText('Runs')
})

test('a closed panel comes back from the Panels menu', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()
  await page.locator('.dv-tab', { hasText: 'Chart' }).locator('.panel-tab-close').click()
  await expect.poll(() => tabTitles(page)).toEqual(['Deployments', 'Runs'])

  await page.locator('.menu-bar-trigger', { hasText: 'Panels' }).click()
  await page.locator('.menu-item[data-kind="chart"]').click()

  await expect(page.locator('.dv-tab.dv-active-tab')).toContainText('Chart')
  expect(await tabTitles(page)).toContain('Chart')
})

/** About is read and closed, so it is a dialog over the dock — no tab is added for it. */
test('About opens as a dialog from the application menu, not as a tab', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()

  await page.locator('.menu-trigger').click()
  await page.locator('.menu-item[data-action="about"]').click()

  await expect(page.locator('.about-dialog')).toBeVisible()
  expect(await tabTitles(page)).toEqual(['Deployments', 'Runs', 'Chart'])
})

/** The quick bar speaks for the panel in FRONT: the chart's selection while it is, nothing otherwise. */
test('the quick bar holds the chart selection while the chart is in front', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()
  await expect(page.locator('[data-quick-bar]')).toHaveCount(0)

  await showPanel(page, 'Chart')
  const bar = page.locator('[data-quick-bar="chart"]')
  await expect(bar).toBeVisible()
  await expect(bar.locator('select[aria-label="Broker"]')).toBeVisible()

  await showPanel(page, 'Runs')
  await expect(page.locator('[data-quick-bar]')).toHaveCount(0)
})

/**
 * The backend's grade of the open run, where it is not a success, marks the Runs tab — read from
 * the capture rather than transcribed, so a re-capture that grades the run anew cannot strand it.
 */
test('the Runs tab carries the grade of the open run where it did not succeed', async ({ page }) => {
  const runs = (fixture('runs_list.json') as { runs: { run_id: string, run_outcome: string | null }[] }).runs
  const outcome = runs.find(row => row.run_id === FIXTURE_RUN)?.run_outcome ?? null
  test.skip(!outcome || outcome === 'success', 'the captured run succeeded, so its tab says nothing')

  await openWith(page, '/', { run: FIXTURE_RUN })
  const mark = page.locator('.dv-tab', { hasText: 'Runs' }).locator('.panel-tab-status')
  await expect(mark).toHaveAttribute('aria-label', outcome!)
})
