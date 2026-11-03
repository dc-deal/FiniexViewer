import { test, expect } from './cdp_fixture'
import { FIXTURE_RUN, mockApi } from './api_mock'
import { FIXTURES_SHOWN, openWith, storedLink } from './arrangement_seed'

/**
 * Named layouts in a real browser (viewer#37): what jsdom cannot hold — the dock laid out for real, a
 * reload, and storage shared by the windows. A layout moves the panels and never what they show.
 */

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1600, height: 900 })
  await openWith(page, '/', { ...FIXTURES_SHOWN, run: FIXTURE_RUN })
  await page.locator('[data-panel-kind="run"] [data-panel]').first().waitFor()
})

async function loadLayout(page: import('@playwright/test').Page, id: string): Promise<void> {
  await page.locator('.layouts-trigger').click()
  await page.locator(`.layouts-menu [data-layout="${id}"]`).click()
}

test('a shipped layout moves the panels and leaves the run as it was', async ({ page }) => {
  await loadLayout(page, 'backtests')
  await expect(page.locator('[data-panel-kind="report-executive"]')).toBeVisible()
  await expect(page.locator('[data-panel-kind="report-trade-history"]')).toBeVisible()
  // the run bundle is no part of it: its sections stand as panels of their own
  await expect(page.locator('[data-panel-kind="run"]')).toHaveCount(0)
  expect((await storedLink(page))?.run.id).toBe(FIXTURE_RUN)

  await loadLayout(page, 'deploys')
  await expect(page.locator('[data-panel-kind="deployment-sessions"]')).toBeVisible()
  await expect(page.locator('[data-panel-kind="report-executive"]')).toHaveCount(0)
  expect((await storedLink(page))?.run.id).toBe(FIXTURE_RUN)

  await page.locator('.layouts-trigger').click()
  await expect(page.locator('.layouts-menu [data-layout="deploys"]')).toHaveAttribute('data-loaded', 'true')
})

test('a layout saved under a name comes back after a reload, loaded and as it was', async ({ page }) => {
  await loadLayout(page, 'backtests')
  await expect(page.locator('[data-panel-kind="report-executive"]')).toBeVisible()
  await page.locator('.layouts-trigger').click()
  await page.locator('.layouts-menu [data-action="save-as"]').click()
  await page.locator('.layout-name-input').fill('Morning review')
  await page.locator('.layout-name-input').press('Enter')
  await expect(page.locator('.layout-name-input')).toHaveCount(0)
  const before = await page.locator('[data-panel-kind]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-panel-kind')).sort())

  await page.reload()
  await page.locator('[data-panel-kind="report-executive"]').waitFor()
  const after = await page.locator('[data-panel-kind]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-panel-kind')).sort())
  expect(after).toEqual(before)
  await page.locator('.layouts-trigger').click()
  const own = page.locator('.layouts-menu [data-layout^="own-"]')
  await expect(own).toHaveText(/Morning review/)
  await expect(own).toHaveAttribute('data-loaded', 'true')
})

/** A layout naming a panel this build does not know leaves that one out, never a blank workspace. */
test('a layout with a panel this build does not know lays out the rest', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.evaluate(() => {
    const panel = (id: string) => ({ id, contentComponent: 'host', params: { kind: id }, title: id, renderer: 'always' })
    const dock = {
      grid: {
        root: { type: 'branch', data: [{ type: 'leaf', data: { views: ['runs', 'retired-kind'], activeView: 'runs', id: '1' }, size: 1600 }], size: 860 },
        width: 1600, height: 860, orientation: 'HORIZONTAL',
      },
      panels: { 'runs': panel('runs'), 'retired-kind': panel('retired-kind') },
      activeGroup: '1',
    }
    const layout = { id: 'own-old', name: 'Old', shipped: null, placement: { dock, places: {}, views: {}, bundles: {} } }
    localStorage.setItem('layouts.v1', JSON.stringify({ version: 1, layouts: [layout] }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'layouts.v1' }))
  })
  await loadLayout(page, 'own-old')
  // the run list stands; the run bundle the layout never held joins it in front, as on a start
  await expect(page.locator('[data-panel-kind="runs"]')).toHaveCount(1)
  await expect(page.locator('[data-panel-kind="run"]')).toBeVisible()
  await expect(page.locator('[data-panel-kind="retired-kind"]')).toHaveCount(0)
  expect(errors).toEqual([])
})
