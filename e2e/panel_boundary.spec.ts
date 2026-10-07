import { test, expect } from './cdp_fixture'
import { mockApi, FIXTURE_RUN } from './api_mock'

/**
 * A section that cannot be drawn takes only itself off the screen.
 *
 * The unit suite proves the boundary's mechanics on one mounted panel — it marks, it keeps the
 * stack out of the page, it resets, it settles. What no unit test can reach is the claim the
 * boundary was BUILT for, because that claim is about the workspace: on 2026-10-01 one field
 * served as null threw inside a computed and the reader lost ELEVEN panels, since Vue unwinds a
 * render error to the nearest component that handles it and nothing did. A count of what survives
 * is only observable where all of them exist at once.
 *
 * Two shapes, failing at different moments, and the panel for each is chosen for that reason:
 * `warnings-errors` is open by default and reads `errors.filter(...)`, so a wrong shape throws at
 * FIRST PAINT — the original defect, before the reader has touched anything. Orders is folded, so
 * it throws when the reader opens it, and the mark has to survive folding it again.
 *
 * The healthy count is measured in the same test rather than written down: which sections a run
 * carries is a property of the capture, and a number typed here would be wrong the next time the
 * fixtures are taken.
 */

/** Playwright consults route handlers most-recent-first, so a second `mockApi` supersedes the first. */
const AT_FIRST_PAINT = { section: 'warnings-errors', field: 'errors' }
const ON_OPENING = { section: 'order-history', field: 'orders' }

test('a section that throws at first paint leaves every other panel standing', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/runs?run=${FIXTURE_RUN}`)
  await expect(page.locator('.panel').first()).toBeVisible()

  const healthy = await page.locator('.panel').count()
  expect(healthy).toBeGreaterThan(1)
  await expect(page.locator('.panel-failed-mark')).toHaveCount(0)

  await mockApi(page, { corrupt: AT_FIRST_PAINT })
  await page.reload()

  const failed = page.locator('.panel', { has: page.locator('.panel-failed-mark') })
  await expect(failed).toHaveCount(1)
  await expect(failed.locator('.panel-trigger')).toContainText('Warnings')
  await expect(failed.locator('.panel-failed')).toContainText('could not be drawn')

  // the whole point: the column is as long as it was, and the reader can still read the rest
  await expect(page.locator('.panel')).toHaveCount(healthy)
  await expect(page.locator('.panel-trigger', { hasText: 'Trade History' })).toBeVisible()
})

test('a folded section that throws on opening marks its own header and no other', async ({ page }) => {
  await mockApi(page, { corrupt: ON_OPENING })
  await page.goto(`/runs?run=${FIXTURE_RUN}`)
  await expect(page.locator('.panel').first()).toBeVisible()

  const standing = await page.locator('.panel').count()
  const orders = page.locator('.panel', { has: page.locator('.panel-trigger', { hasText: 'Orders' }) })

  // folded, its content has never rendered, so nothing has thrown yet
  await expect(page.locator('.panel-failed-mark')).toHaveCount(0)

  await orders.locator('.panel-trigger').click()

  await expect(orders.locator('.panel-failed-mark')).toBeVisible()
  await expect(orders.locator('.panel-failed')).toContainText('could not be drawn')
  await expect(page.locator('.panel-failed-mark')).toHaveCount(1)
  await expect(page.locator('.panel')).toHaveCount(standing)

  // folded again the sentence is out of sight, so the header has to keep saying it
  await orders.locator('.panel-trigger').click()
  await expect(orders.locator('.panel-trigger')).toHaveAttribute('aria-expanded', 'false')
  await expect(orders.locator('.panel-failed-mark')).toBeVisible()
})
