import { test, expect } from './cdp_fixture'
import { FIXTURE_RUN, fixture, mockApi } from './api_mock'

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
  // the capture holds whatever ran when it was taken, so the server alone is served here — a
  // route registered later answers first
  await page.route('**/api/v1/activities', route => route.fulfill({
    json: { ...(fixture('activities.json') as object), activities: [server] },
  }))
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await page.locator('.machine-status').hover()
  const card = page.locator('.hover-card')
  await expect(card).toContainText('only this server')
  await expect(card).toContainText('Panels ▸ Activities')
})

test('the Activities panel lists what runs, and asks nothing while another tab stands in front of it', async ({ page }) => {
  // the server alone, so it is the first row: the capture holds whatever ran when it was taken
  await page.route('**/api/v1/activities', route => route.fulfill({
    json: { ...(fixture('activities.json') as object), activities: [server] },
  }))
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

/**
 * A date in the reader's own zone and language can be longer than the English one: in a German
 * locale `19. Okt., 23:43` broke after its comma and `in its parent` onto a second line, so every
 * row stood two lines tall (operator, on screen, 2026-10-19). One line each, in any locale.
 */
test('every activity row is one line tall, also in a German locale', async ({ context }) => {
  // a context of its own: the locale is the context's, and the suite's is English
  const german = await context.browser()!.newContext({ locale: 'de-DE' })
  const page = await german.newPage()
  await mockApi(page)
  // a narrow panel, as the operator's was: below the first arrangement's columns it spans the
  // window, which at 700 px still shows when an activity started — in a share too small for the date
  await page.setViewportSize({ width: 700, height: 900 })
  await page.goto('/')
  await page.locator('.menu-bar-trigger', { hasText: 'Panels' }).click()
  await page.locator('.menu-item[data-kind="activities"]').click()
  await page.keyboard.press('Escape')

  const rows = page.locator('[data-panel-kind="activities"] .record-row')
  await expect(rows.first()).toBeVisible()
  // the locale took: the month is German
  await expect(rows.first().locator('[data-rank="2"]')).toContainText('.')
  // the lines each cell's TEXT stands on, counted by their tops: a capture of one row cannot be
  // compared with another row. The text nodes alone — a range over the whole cell also returns the
  // box of a link's button, which stands 2 px above its own text and read as a second line
  const wrapped = await rows.evaluateAll(list => list.flatMap(row => [...row.children].filter(cell => {
    const tops = new Set<number>()
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const box of range.getClientRects()) tops.add(Math.round(box.top))
    }
    return tops.size > 1
  }).map(cell => cell.textContent?.trim())))
  expect(wrapped).toEqual([])
  await german.close()
})

/**
 * An activity leads to what it runs (viewer#32): a backtest's label opens its run in the run bundle,
 * as a session's run does in the Deployments — a running one too, which the run index lists already
 * (measured 2026-10-19 on a sweep the operator started).
 */
test('an activity opens its run from its label', async ({ page }) => {
  const raw = fixture('activities.json') as { server_activity_id: string, activities: Record<string, unknown>[] }
  const serverRow = raw.activities.find(row => row['activity_id'] === raw.server_activity_id)!
  await mockApi(page, {
    activities: [{
      ...serverRow, activity_id: 'act_backtest', activity_kind: 'backtest', activity_label: 'fixture backtest',
      run_id: FIXTURE_RUN, pid: 4242,
    }],
  })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await page.locator('.menu-bar-trigger', { hasText: 'Panels' }).click()
  await page.locator('.menu-item[data-kind="activities"]').click()
  await page.keyboard.press('Escape')

  await page.locator('[data-panel-kind="activities"] .jump-link', { hasText: 'fixture backtest' }).click()
  await expect(page.locator('[data-panel-kind="run"] .chosen-id')).toHaveText(FIXTURE_RUN)
})
