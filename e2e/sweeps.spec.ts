import { test, expect } from './cdp_fixture'
import { fixture, mockApi } from './api_mock'

/**
 * The parameter searches in a real browser: the Sweeps panel opened from the Panels menu, a sweep
 * picked from its list, its combinations in the order the route ranked them with the first marked,
 * and a combination bringing its run to the front in the run bundle.
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

test('a sweep picked in the Sweeps panel shows its combinations as ranked, and one opens its run', async ({ page }) => {
  await page.goto('/')
  await page.locator('.menu-bar-trigger', { hasText: 'Panels' }).click()
  await page.locator('.menu-item[data-kind="sweeps"]').click()
  await page.keyboard.press('Escape')

  const panel = page.locator('[data-panel-kind="sweeps"]')
  await panel.locator('.sweep-list .record-row', { hasText: detail.sweep_id }).click()
  await expect(panel.locator('.picker-chosen')).toContainText(detail.sweep_id)
  await expect(panel.locator('.ranking-list .run-id')).toHaveText(detail.combinations.map(row => row.run_id))
  await expect(panel.locator('.ranking-list .place').first()).toHaveText('1 ★')

  const second = detail.combinations[1]!.run_id
  await panel.locator('.ranking-list .record-row').nth(1).click()
  // the run bundle comes to the front, its tab naming the run
  await expect(page.locator('.dv-tab', { hasText: second })).toBeVisible()
})
