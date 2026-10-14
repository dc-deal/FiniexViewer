import { test, expect } from './cdp_fixture'
import { fixture, mockApi } from './api_mock'

interface Reading {
  cpu: { used_pct: number | null }
  memory: { used_pct: number, limit_source: string }
}

const captured = fixture('machine_resources.json') as Reading

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

/**
 * How full the machine is, in the menu bar: both shares from the captured reading, and its card
 * saying where the limit was read. Only a browser shows whether the bar keeps it to one line.
 */
test('the machine state stands in the menu bar, its card saying where the limit was read', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  const status = page.locator('.machine-status')
  await expect(status).toContainText('CPU')
  await expect(status.locator('.machine-value').nth(1))
    .toHaveText(String(Math.round(captured.memory.used_pct)))
  const bar = page.locator('.menu-bar')
  expect((await status.boundingBox())!.height).toBeLessThanOrEqual((await bar.boundingBox())!.height)
  await status.hover()
  await expect(page.locator('.hover-card')).toContainText(captured.memory.limit_source)
})

/**
 * A new figure moves nothing beside it: the shares sit in slots of one width, so the account to
 * their right keeps its place from one reading to the next.
 */
test('a new reading moves nothing beside it', async ({ page }) => {
  let share = 9
  await page.route('**/api/v1/machine-resources', route => {
    share = share === 9 ? 100 : 9
    const body = fixture('machine_resources.json') as Record<string, unknown> & { memory: Record<string, unknown> }
    return route.fulfill({ json: { ...body, memory: { ...body.memory, used_pct: share } } })
  })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  const account = page.locator('.account-status')
  const value = page.locator('.machine-status .machine-value').nth(1)
  await expect(value).toHaveText('100')
  const before = (await account.boundingBox())!.x
  await expect(value).toHaveText('9', { timeout: 8000 })
  expect((await account.boundingBox())!.x).toBe(before)
})
