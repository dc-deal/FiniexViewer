import { test, expect } from './cdp_fixture'
import { fixture, mockApi } from './api_mock'

/**
 * The parameter searches in a real browser: the Sweeps panel opened from the Panels menu, a sweep
 * opened in its one list, its combinations beneath it in the order the route ranked them with the
 * first marked, and a combination chosen as the run list chooses a run — its report comes forward.
 */

interface CapturedDetail {
  sweep_id: string
  combinations: { run_id: string }[]
}

const detail = fixture('sweep_detail.json') as CapturedDetail

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1600, height: 900 })
})

test('a sweep opened in the Sweeps panel shows its combinations as ranked, and one is chosen as a run', async ({ page }) => {
  await page.goto('/')
  await page.locator('.menu-bar-trigger', { hasText: 'Panels' }).click()
  await page.locator('.menu-item[data-kind="sweeps"]').click()
  await page.keyboard.press('Escape')

  const panel = page.locator('[data-panel-kind="sweeps"]')
  await panel.locator(`.sweep-list .record-group:has([data-sweep="${detail.sweep_id}"])`).click()
  await expect(panel.locator('.sweep-list .run-id')).toHaveText(detail.combinations.map(row => row.run_id))
  await expect(panel.locator('.sweep-list .place').first()).toHaveText('1 ★')

  const second = detail.combinations[1]!.run_id
  await panel.locator('.sweep-list button.record-row').nth(1).click()
  // the run bundle comes to the front, its tab naming the run
  await expect(page.locator('.dv-tab', { hasText: second })).toBeVisible()
})

test('the card on a sweep heading says what it searched, under the pointer and for a keyboard', async ({ page }) => {
  await page.goto('/')
  await page.locator('.menu-bar-trigger', { hasText: 'Panels' }).click()
  await page.locator('.menu-item[data-kind="sweeps"]').click()
  await page.keyboard.press('Escape')

  const heading = page.locator(`[data-panel-kind="sweeps"] .sweep-list .record-group:has([data-sweep="${detail.sweep_id}"])`)
  const card = page.locator('.hover-card')
  await heading.hover()
  await expect(card).toContainText('Ranked by')
  await page.mouse.move(0, 0)
  await expect(card).toHaveCount(0)
  await heading.focus()
  await expect(card).toContainText('Ranked by')
})
