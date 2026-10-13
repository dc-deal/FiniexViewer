import { test, expect } from './cdp_fixture'
import { mockApi } from './api_mock'

/**
 * The settings dialog keeps ONE size whatever the tab. It used to grow and shrink with each tab's
 * content, which moved the very buttons the reader was about to press — reported from a real
 * screen, and only a browser lays a dialog out.
 */
test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('the settings dialog keeps its size as the tabs are switched', async ({ page }) => {
  await page.goto('/')
  await page.locator('.menu-trigger').click()
  await page.locator('.menu-item', { hasText: 'Settings' }).click()
  const dialog = page.locator('.settings-dialog')
  await expect(dialog).toBeVisible()

  const sizes: string[] = []
  for (const tab of ['Display', 'Layout', 'Account']) {
    await page.locator('.tab-trigger', { hasText: tab }).click()
    await expect(page.locator('.tab-trigger[data-state="active"]')).toContainText(tab)
    const box = await dialog.boundingBox()
    sizes.push(`${Math.round(box!.width)}×${Math.round(box!.height)}`)
  }
  expect(new Set(sizes).size, `sizes per tab: ${sizes.join(', ')}`).toBe(1)
})

/** Where the window is too small for it, the dialog stays inside it and its content scrolls. */
test('a dialog taller than the window scrolls inside, the close button in reach', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 420 })
  await page.goto('/')
  await page.locator('.menu-trigger').click()
  await page.locator('.menu-item', { hasText: 'Settings' }).click()

  const dialog = await page.locator('.settings-dialog').boundingBox()
  expect(dialog!.height).toBeLessThanOrEqual(420 * 0.8 + 1)
  await expect(page.locator('.settings-dialog .app-dialog-actions .app-button')).toBeInViewport()
  const scrolls = await page.locator('.tab-panel[data-state="active"]')
    .evaluate(element => element.scrollHeight > element.clientHeight)
  expect(scrolls).toBe(true)
})
