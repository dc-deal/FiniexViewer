import { test, expect } from './cdp_fixture'
import { mockApi, FIXTURE_RUN } from './api_mock'

/**
 * The jump between an order and its trade, which only a browser can prove.
 *
 * Everything the unit suite can reach is already covered — the affordance, its three absences, the
 * mark, what the panels ask for. What it cannot reach is the half that lives in the VIEW: a param
 * in the address bar, a panel that was CLOSED being opened, a panel that was HIDDEN coming back, and
 * the mark surviving a real reload. Each of those has been a defect class here before.
 *
 * The captured fixtures make the trap concrete: `pos_ethusd_1` appears in FIVE scenarios of the
 * order history and only TWO of them produced a trade. So the link renders twice, not five times,
 * and the mark must land in one scenario rather than in every row carrying that id.
 */
const MARKED = 'ETHUSD_blocks_06~pos_ethusd_1'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

async function openPanel(page: import('@playwright/test').Page, name: string): Promise<void> {
  const trigger = page.locator('.panel-trigger', { hasText: name })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}

test('the link is drawn only where the position produced a trade', async ({ page }) => {
  await page.goto(`/runs?run=${FIXTURE_RUN}`)
  await openPanel(page, 'Orders')

  // five positions carry the same id, two of them have trades
  await expect(page.locator('.order-list .record-row.starts-position')).toHaveCount(5)
  await expect(page.locator('.order-list .to-trades')).toHaveCount(2)
})

test('a jump opens the closed target, marks the position and rides in the url', async ({ page }) => {
  await page.goto(`/runs?run=${FIXTURE_RUN}`)
  await openPanel(page, 'Orders')

  // the target starts CLOSED — that is what the jump has to deal with
  const trades = page.locator('.panel-trigger', { hasText: 'Trade History' })
  await expect(trades).toHaveAttribute('aria-expanded', 'false')

  await page.locator('.order-list .to-trades').first().click()

  await expect(page).toHaveURL(new RegExp(`position=${encodeURIComponent(MARKED)}`))
  await expect(trades).toHaveAttribute('aria-expanded', 'true')

  // ONE scenario's trade, not every row carrying that position id
  await expect(page.locator('.trade-list .record-row.marked')).toHaveCount(1)
  await expect(page.locator('.trade-list .record-row.marked')).toBeVisible()
})

test('a hidden target comes back rather than the jump landing nowhere', async ({ page }) => {
  await page.goto(`/runs?run=${FIXTURE_RUN}`)
  await openPanel(page, 'Orders')

  // switch Trade History off entirely — it leaves the column, not just the open state
  await page.locator('.panel-header', { hasText: 'Trade History' })
    .locator('.panel-control[title="Hide panel"]').click()
  await expect(page.locator('.panel-trigger', { hasText: 'Trade History' })).toHaveCount(0)

  await page.locator('.order-list .to-trades').first().click()

  await expect(page.locator('.panel-trigger', { hasText: 'Trade History' }))
    .toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.trade-list .record-row.marked')).toHaveCount(1)
})

test('the mark survives a reload, and the page does not jump on its own', async ({ page }) => {
  await page.goto(`/runs?run=${FIXTURE_RUN}&position=${MARKED}`)
  await openPanel(page, 'Orders')
  await openPanel(page, 'Trade History')

  // restored from the url in BOTH lists — the whole lifecycle of the position on the order side
  await expect(page.locator('.trade-list .record-row.marked')).toHaveCount(1)
  await expect(page.locator('.order-list .record-row.marked').first()).toBeVisible()
  await expect(page).toHaveURL(new RegExp('position='))
})

test('the way back from a trade reaches the orders of its position', async ({ page }) => {
  await page.goto(`/runs?run=${FIXTURE_RUN}`)
  await openPanel(page, 'Trade History')

  const orders = page.locator('.panel-trigger', { hasText: 'Orders' })
  await expect(orders).toHaveAttribute('aria-expanded', 'false')

  await page.locator('.trade-list .to-orders').first().click()

  await expect(page).toHaveURL(new RegExp('position='))
  await expect(orders).toHaveAttribute('aria-expanded', 'true')
  // every row of that position's lifecycle, in its own scenario only
  const marked = page.locator('.order-list .record-row.marked')
  expect(await marked.count()).toBeGreaterThan(0)
  await expect(page.locator('.order-list .record-row.marked').first()).toBeVisible()
})
