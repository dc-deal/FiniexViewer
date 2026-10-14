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
  for (const tab of ['Display', 'Layout']) {
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

/**
 * Who the viewer works as is a fact to see, not a setting to open: it stands in the menu bar, as a
 * mark and a word, and the settings no longer have a tab for it. The mock serves a server that
 * verifies no token.
 */
/** A long value wraps inside the card: a token note once stretched it across the whole screen. */
test('the account card stays narrow however long the token note is', async ({ page }) => {
  await page.route('**/api/v1/caller', route => route.fulfill({
    json: {
      enforced: true, client: 'viewer', account: 'viewer-op', account_kind: 'person', display_name: 'Viewer-Operator',
      grants: ['brokers:*', 'bars:*', 'deployments:*', 'directory:*', 'docs:*', 'reports:*', 'sweeps:*'],
      note: 'FiniexViewer — dev proxy holds it, browser never receives it. reports:* is conditional on the API being reachable on loopback only; re-decide before the viewer is served from anywhere else.',
    },
  }))
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await page.locator('.account-status').hover()
  const card = page.locator('.hover-card')
  await expect(card).toContainText('re-decide before the viewer')
  expect((await card.boundingBox())!.width).toBeLessThanOrEqual(28 * 16 + 1)
})

test('the account stands in the menu bar, and the settings carry no tab for it', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.menu-bar .account-status')).toContainText('no sign-in')

  await page.locator('.menu-trigger').click()
  await expect(page.locator('.menu-item', { hasText: 'Account' })).toHaveCount(0)
  await page.locator('.menu-item', { hasText: 'Settings' }).click()
  await expect(page.locator('.settings-dialog')).toBeVisible()
  await expect(page.locator('.tab-trigger', { hasText: 'Account' })).toHaveCount(0)
})
