import { test, expect } from './cdp_fixture'
import { fixture, mockApi } from './api_mock'

/**
 * What runs on the machine, in a real browser: the menu bar's card says it in one line, and the
 * Activities panel lists every activity — asked while it is on show, and not while another tab of
 * its group stands in front of it, which only a real dock can show: a panel kept in the page stays
 * mounted behind its tab.
 */

interface Captured {
  server_activity_id: string
  activities: { activity_id: string, activity_label: string }[]
}

const captured = fixture('activities.json') as Captured
const server = captured.activities.find(row => row.activity_id === captured.server_activity_id)!

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('the menu bar\'s card says what runs, the server left out', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await page.locator('.machine-status').hover()
  const card = page.locator('.hover-card')
  // the capture holds the server alone, so nothing else runs
  await expect(card).toContainText('only this server')
  await expect(card).toContainText('Panels ▸ Activities')
})

test('the Activities panel lists what runs, and asks nothing while another tab stands in front of it', async ({ page }) => {
  let asked = 0
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/v1/activities') asked += 1
  })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await page.locator('.menu-bar-trigger', { hasText: 'Panels' }).click()
  await page.locator('.menu-item[data-kind="activities"]').click()
  await page.keyboard.press('Escape')

  const panel = page.locator('[data-panel-kind="activities"]')
  await expect(panel.locator('.activity-label').first()).toContainText(server.activity_label)
  await expect(panel.locator('.activity-label').first()).toContainText('this server')
  expect(asked).toBeGreaterThan(0)

  // another tab of the group in front: the panel stays in the page, and the list is asked no more
  await page.locator('.dv-tab', { hasText: 'Runs' }).first().click()
  await expect(panel).toBeHidden()
  const before = asked
  await page.waitForTimeout(6000)
  expect(asked).toBe(before)
})
