import { test, expect } from './cdp_fixture'
import { mockApi } from './api_mock'
import { showPanel } from './arrangement_seed'

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

  await page.locator('.menu-bar-trigger', { hasText: 'Layout' }).click()
  await page.locator('.menu-item[data-action="reset"]').click()
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

/** About is about the application, so its way in is the application menu — and it opens as a panel. */
test('About opens as a panel from the application menu', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()

  await page.locator('.menu-trigger').click()
  await page.locator('.menu-item[data-action="about"]').click()

  await expect(page.locator('.dv-tab.dv-active-tab')).toContainText('About')
})
