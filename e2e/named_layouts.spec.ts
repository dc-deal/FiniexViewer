import { test, expect } from './cdp_fixture'
import { FIXTURE_DEPLOYMENT, FIXTURE_RUN, mockApi } from './api_mock'
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
  // the menu chooses, the settings manage: saving under a name is one entry away, on the Layouts tab
  await page.locator('.layouts-trigger').click()
  await page.locator('.layouts-menu [data-action="manage-layouts"]').click()
  const settings = page.locator('.layouts-settings')
  await settings.locator('[data-action="new-layout"]').click()
  await settings.locator('.layout-name-input').fill('Morning review')
  await settings.locator('.layout-name-input').press('Enter')
  await expect(settings.locator('.layout-row[data-loaded="true"]')).toHaveText(/Morning review/)
  await page.keyboard.press('Escape')
  await expect(settings).toHaveCount(0)
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

/**
 * After a switch nothing may leave the dock scrolled: something scrolled it 156 px up in a zoomed
 * window, the tabs under the menu bar and no scrollbar to bring them back (2026-11-03). A panel
 * behind another tab keeps the size it had and can reach past the bottom, which made the box
 * scrollable at all; an element as tall stands in for it here. Whatever tries, the dock stays.
 */
test('the dock cannot be scrolled out of its place, whatever tries', async ({ page }) => {
  await loadLayout(page, 'deploys')
  await loadLayout(page, 'backtests')
  await expect(page.locator('[data-panel-kind="report-executive"]')).toBeVisible()
  const top = await page.locator('.panel-dock').evaluate(dock => {
    const spill = document.createElement('div')
    spill.style.height = '3000px'
    dock.appendChild(spill)
    dock.scrollTop = 200
    spill.scrollIntoView({ block: 'end' })
    const scrolled = dock.scrollTop
    spill.remove()
    return scrolled
  })
  expect(top).toBe(0)
})

/** A layout naming a panel this build does not know leaves that one out, never a blank workspace. */
/** A layout in a size, picked from the submenu its row opens on hover. */
async function loadSize(page: import('@playwright/test').Page, id: string, size: string): Promise<void> {
  await page.locator('.layouts-trigger').click()
  await page.locator(`.layouts-menu [data-layout="${id}"]`).hover()
  await page.locator(`[data-sizes-of="${id}"] [data-size="${size}"]`).click()
}

function kinds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator('[data-panel-kind]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-panel-kind')!).sort())
}

/**
 * Each size is a layout of its own (2026-11-04): Mobile lays the run bundle out where Full stands its
 * sections as panels, and a panel hidden in Mobile is still there in Full — and still hidden back in
 * Mobile, because that change went into Mobile alone.
 */
test('each size of a layout is a placement of its own, and a change goes into its size alone', async ({ page }) => {
  await loadLayout(page, 'backtests')
  await expect(page.locator('[data-panel-kind="report-executive"]')).toBeVisible()
  await expect(page.locator('.layouts-menu')).toHaveCount(0)
  const full = await kinds(page)

  await loadSize(page, 'backtests', 'mobile')
  await expect(page.locator('[data-panel-kind="run"]')).toHaveCount(1)
  await expect(page.locator('[data-panel-kind="report-executive"]')).toHaveCount(0)
  expect(await kinds(page)).toContain('run-chart')

  // the run chart hidden in Mobile, through the Panels menu, and written into Mobile once it rests
  await page.locator('.menu-bar-trigger', { hasText: 'Panels' }).click()
  await page.locator('.menu-sub-trigger[data-area="runs"]').hover()
  await page.locator('.menu-toggle[data-kind="run-chart"]').click()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-panel-kind="run-chart"]')).toHaveCount(0)
  await page.waitForTimeout(800)

  await loadSize(page, 'backtests', 'full')
  await expect(page.locator('[data-panel-kind="report-executive"]')).toBeVisible()
  expect(await kinds(page)).toEqual(full)

  await loadSize(page, 'backtests', 'mobile')
  await expect(page.locator('[data-panel-kind="run"]')).toHaveCount(1)
  await expect(page.locator('[data-panel-kind="run-chart"]')).toHaveCount(0)
})

/**
 * The layout by the run (2026-11-04), offered by default: the backtest a reload brings back is offered
 * its layout while *Deploys* is loaded, never switched to, and a click on the offer loads it.
 */
test('the layout a backtest maps to is offered beside the menu, and loaded at a click', async ({ page }) => {
  await loadLayout(page, 'deploys')
  const offer = page.locator('[data-action="layout-offer"]')
  await expect(offer).toHaveText('⇄ Backtests')
  await expect(page.locator('[data-panel-kind="report-executive"]')).toHaveCount(0)

  await offer.click()
  await expect(page.locator('[data-panel-kind="report-executive"]')).toBeVisible()
  await expect(offer).toHaveCount(0)
})

/** Where the reader chose to switch, a pick loads its layout — and a reload brings nothing back but the pick. */
test('a pick loads its layout where the reader chose to switch, and a reload switches nothing', async ({ page }) => {
  await page.locator('.layouts-trigger').click()
  await page.locator('.layouts-menu [data-action="manage-layouts"]').click()
  await page.locator('[data-setting="layout-by-run"]').selectOption('switch')
  await page.keyboard.press('Escape')
  await loadLayout(page, 'backtests')
  await expect(page.locator('[data-panel-kind="report-executive"]')).toBeVisible()

  await page.locator('.dv-tab', { hasText: 'Deployments' }).click()
  await page.locator('.deployment-list .record-row', { hasText: FIXTURE_DEPLOYMENT }).first().click()
  await expect(page.locator('[data-panel-kind="deployment-sessions"]')).toBeVisible()
  await expect(page.locator('[data-panel-kind="report-executive"]')).toHaveCount(0)
  await expect(page.locator('[data-action="layout-offer"]')).toHaveCount(0)

  // the stored backtest comes back with the reload; the layout stays the one the pick loaded
  await page.waitForTimeout(800)
  await page.reload()
  await page.locator('[data-panel-kind="deployment-sessions"]').waitFor()
  await expect(page.locator('[data-panel-kind="report-executive"]')).toHaveCount(0)
})

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
