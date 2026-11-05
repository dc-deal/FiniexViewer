import { test, expect } from './cdp_fixture'
import type { Page } from '@playwright/test'
import { mockApi, FIXTURE_RUN } from './api_mock'
import { openSectionMenu, openWith } from './arrangement_seed'

/**
 * A section of the run report opened as a panel of its own (viewer#31, 2026-10-14). What only a
 * browser shows: the panel docked BESIDE the column rather than over it, the column without the
 * section, the way back by ⇲ on its tab, its ✕ hiding it and the Panels menu bringing it back where
 * it stood — across a reload too — and a jump from the column landing in the opened panel.
 */

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1600, height: 900 })
})

/** The open button sits among the header's controls, which show on hover. */
async function openAsPanel(page: Page, title: string): Promise<void> {
  const header = page.locator('.panel-column .panel-header', { hasText: title })
  await header.hover()
  await header.locator('[data-action="open-as-panel"]').click()
}

/** Where a section stands once it is open as a panel of its own. */
function ownPanel(section: string): string {
  return `[data-panel-kind="report-${section}"]`
}

test('a section opens as a panel of its own beside the column, and ⇲ on its tab puts it back', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  await expect(page.locator('.panel-column [data-panel="trade-history"]')).toBeVisible()

  await openAsPanel(page, 'Trade history')

  await expect(page.locator(`${ownPanel('trade-history')} [data-panel="trade-history"]`)).toBeVisible()
  await expect(page.locator('.panel-column [data-panel="trade-history"]')).toHaveCount(0)
  // beside the Runs panel, not over it: both stand on screen at once
  await expect(page.locator('[data-panel-kind="run"] .panel-column')).toBeVisible()

  await page.locator('.dv-tab', { hasText: 'Trade history' }).locator('.panel-tab-back').click()
  await expect(page.locator(ownPanel('trade-history'))).toHaveCount(0)
  await expect(page.locator('.panel-column [data-panel="trade-history"]')).toBeVisible()
})

/** ✕ hides, alike for every panel; the menu shows it again beside what it stood beside. */
test('closing a section panel hides it, and the Panels menu shows it again where it stood', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  await openAsPanel(page, 'Trade history')
  const runs = (await page.locator('[data-panel-kind="run"]').boundingBox())!
  const before = (await page.locator(ownPanel('trade-history')).boundingBox())!

  await page.locator('.dv-tab', { hasText: 'Trade history' }).locator('.panel-tab-close').click()
  await expect(page.locator(ownPanel('trade-history'))).toHaveCount(0)
  await expect(page.locator('.panel-column [data-panel="trade-history"]')).toHaveCount(0)

  await openSectionMenu(page)
  const entry = page.locator('.menu-toggle[data-section="trade-history"]')
  await expect(entry).toHaveAttribute('data-place', 'hidden')
  await entry.click()
  await page.keyboard.press('Escape')

  // back as a split to the right of the Runs panel, at the width it had
  const after = (await page.locator(ownPanel('trade-history')).boundingBox())!
  expect(after.x).toBeGreaterThan(runs.x + runs.width / 2)
  expect(Math.abs(after.width - before.width)).toBeLessThan(4)
  await expect(page.locator('.panel-column [data-panel="trade-history"]')).toHaveCount(0)
})

/** A rebuild of the dock is not the reader closing anything: the sections come back, not hidden. */
test('the suggested order gives a section open as a panel back to the column, shown', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  await openAsPanel(page, 'Trade history')
  await expect(page.locator(ownPanel('trade-history'))).toHaveCount(1)

  await page.locator('.menu-trigger').click()
  await page.locator('.menu-item', { hasText: 'Settings' }).click()
  await page.locator('.tab-trigger', { hasText: 'Layout' }).click()
  await page.locator('[data-action="reset-dock"]').click()
  await page.keyboard.press('Escape')

  await expect(page.locator(ownPanel('trade-history'))).toHaveCount(0)
  await expect(page.locator('.panel-column [data-panel="trade-history"]')).toBeVisible()
})

test('a hidden section still knows where it stood after a reload', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  await openAsPanel(page, 'Trade history')
  await page.locator('.dv-tab', { hasText: 'Trade history' }).locator('.panel-tab-close').click()
  await expect.poll(() => page.evaluate(() =>
    Boolean(JSON.parse(localStorage.getItem('arrangement.v1') ?? '{}').places?.['report-trade-history'])))
    .toBe(true)

  await page.reload()
  await expect(page.locator('.panel-column')).toBeVisible()
  await expect(page.locator('.panel-column [data-panel="trade-history"]')).toHaveCount(0)

  await openSectionMenu(page)
  await page.locator('.menu-toggle[data-section="trade-history"]').click()
  await page.keyboard.press('Escape')
  await expect(page.locator(`${ownPanel('trade-history')} [data-panel="trade-history"]`)).toBeVisible()
})

test('a section opened as a panel is still one after a reload', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  await openAsPanel(page, 'Trade history')
  // the arrangement is written once the layout holds still
  await expect.poll(() => page.evaluate(() =>
    Boolean(JSON.parse(localStorage.getItem('arrangement.v1') ?? '{}').dock?.panels?.['report-trade-history'])))
    .toBe(true)

  await page.reload()

  await expect(page.locator(`${ownPanel('trade-history')} [data-panel="trade-history"]`)).toBeVisible()
  await expect(page.locator('.panel-column [data-panel="trade-history"]')).toHaveCount(0)
})

/** The jump looks where the section IS: in its own panel, once it has one. */
test('a jump from the orders lands in the trade history opened as a panel', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  await openAsPanel(page, 'Trade history')

  const orders = page.locator('.panel-column .panel-trigger', { hasText: 'Orders' })
  if ((await orders.getAttribute('aria-expanded')) !== 'true') await orders.click()
  await page.locator('.order-list .to-trades').first().click()

  await expect(page.locator(`${ownPanel('trade-history')} .trade-list .record-row.marked`).first()).toBeInViewport()
})

/** Closes the run bundle by the ✕ on its tab, the way a reader does. */
async function closeRunBundle(page: Page): Promise<void> {
  await page.locator('.dv-tab', { has: page.locator('.panel-tab[data-kind="run"]') }).locator('.panel-tab-close').click()
  await expect(page.locator('[data-panel-kind="run"]')).toHaveCount(0)
}

/**
 * The bundle closed, its sections read apart (operator, 2026-10-28): a jump to a section still in
 * the column opens it as a panel beside them, and the bundle stays closed.
 */
test('a jump to a section of a closed bundle opens it beside the sections standing apart', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  const orders = page.locator('.panel-column .panel-trigger', { hasText: 'Orders' })
  if ((await orders.getAttribute('aria-expanded')) !== 'true') await orders.click()
  await openAsPanel(page, 'Orders')
  await closeRunBundle(page)

  await page.locator(`${ownPanel('orders')} .order-list .to-trades`).first().click()

  await expect(page.locator(`${ownPanel('trade-history')} .trade-list .record-row.marked`).first()).toBeInViewport()
  await expect(page.locator('[data-panel-kind="run"]')).toHaveCount(0)
})

/**
 * The bundle closed, one section standing apart: the rest are on show nowhere, and the Panels menu says
 * so where a tick said otherwise (operator, on screen 2026-10-30). A click opens one beside the other.
 */
test('a section in a closed bundle has no tick, says so, and opens as a panel at a click', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  await openAsPanel(page, 'Trade history')
  await page.locator('.dv-tab', { hasText: 'Run bundle' }).locator('.panel-tab-close').click()
  await expect(page.locator('.panel-column')).toHaveCount(0)

  await openSectionMenu(page)
  const entry = page.locator('.menu-toggle[data-section="executive"]')
  await expect(entry).toHaveAttribute('data-place', 'closed')
  await expect(entry).toHaveAttribute('data-state', 'unchecked')
  await expect(entry).toContainText('in closed bundle')
  await expect(page.locator('.menu-toggle[data-section="trade-history"]')).toContainText('panel')
  await entry.click()
  await page.keyboard.press('Escape')
  await expect(page.locator(`${ownPanel('executive')} [data-panel="executive"]`)).toBeVisible()
  await expect(page.locator('.panel-column')).toHaveCount(0)
})
