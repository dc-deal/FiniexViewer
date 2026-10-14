import { test, expect } from './cdp_fixture'
import type { Page } from '@playwright/test'
import { mockApi, FIXTURE_RUN } from './api_mock'
import { openWith } from './arrangement_seed'

/**
 * A section of the run report opened as a panel of its own (viewer#31, 2026-10-14). What only a
 * browser shows: the panel docked BESIDE the column rather than over it, the column without the
 * section, the way back by the tab's close, the arrangement surviving a reload, and a jump from the
 * column landing in the opened panel.
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

test('a section opens as a panel of its own beside the column, and its tab puts it back', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  await expect(page.locator('.panel-column [data-panel="trade-history"]')).toBeVisible()

  await openAsPanel(page, 'Trade History')

  await expect(page.locator(`${ownPanel('trade-history')} [data-panel="trade-history"]`)).toBeVisible()
  await expect(page.locator('.panel-column [data-panel="trade-history"]')).toHaveCount(0)
  // beside the Runs panel, not over it: both stand on screen at once
  await expect(page.locator('[data-panel-kind="runs"] .panel-column')).toBeVisible()

  await page.locator('.dv-tab', { hasText: 'Trade History' }).locator('.panel-tab-close').click()
  await expect(page.locator(ownPanel('trade-history'))).toHaveCount(0)
  await expect(page.locator('.panel-column [data-panel="trade-history"]')).toBeVisible()
})

test('a section opened as a panel is still one after a reload', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  await openAsPanel(page, 'Trade History')
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
  await openAsPanel(page, 'Trade History')

  const orders = page.locator('.panel-column .panel-trigger', { hasText: 'Orders' })
  if ((await orders.getAttribute('aria-expanded')) !== 'true') await orders.click()
  await page.locator('.order-list .to-trades').first().click()

  await expect(page.locator(`${ownPanel('trade-history')} .trade-list .record-row.marked`).first()).toBeInViewport()
})
