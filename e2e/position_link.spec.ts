import { test, expect } from './cdp_fixture'
import { mockApi, fixture, FIXTURE_RUN } from './api_mock'

/**
 * The jump between an order and its trade, which only a browser can prove.
 *
 * Everything the unit suite can reach is already covered — the affordance, its three absences, the
 * mark, what the panels ask for. What it cannot reach is the half that lives in the VIEW: a param
 * in the address bar, a panel that was CLOSED being opened, a panel that was HIDDEN coming back, and
 * the mark surviving a real reload. Each of those has been a defect class here before.
 *
 * The capture makes the trap concrete, and NOTHING here transcribes it. Every scenario counts its
 * positions from `pos_<symbol>_1`, so one id belongs to several positions and a mark that keys on
 * the id alone lights up all of them. The numbers that express that move with each capture — they
 * are read from the fixture, the rule `FIXTURE_RUN` already follows. Transcribed numbers stranded
 * this file once, on 2026-10-08, when the capture went from 12 orders to 102.
 */

/** Two fields of the forty-odd a captured trade carries: the pair the join is DECLARED on. */
interface CapturedTrade {
  scenario_name: string
  position_id: string
}

const TRADES = (fixture('trade_history.json') as { trades: CapturedTrade[] }).trades

/** What ONE scenario's position produced — a partial close makes this more than one. */
function tradesOf(scenario: string, position: string): number {
  return TRADES.filter(row => row.scenario_name === scenario && row.position_id === position).length
}

/** What that position id produced ANYWHERE, across every scenario that reuses it. */
function tradesAnywhere(position: string): number {
  return TRADES.filter(row => row.position_id === position).length
}

/**
 * The position the url-driven tests mark: the one that makes the trap hardest. Its own scenario
 * produced exactly ONE trade, while its id is shared as widely as the capture allows — so a mark
 * that leaked across scenarios would show several rows where one is right.
 *
 * Today that resolves to `pos_eurgbp_1`: three scenarios carry it, five trades in all, and one of
 * those scenarios closed it in three parts.
 */
const TARGET = [...TRADES]
  .filter(row => tradesOf(row.scenario_name, row.position_id) === 1)
  .sort((a, b) => tradesAnywhere(b.position_id) - tradesAnywhere(a.position_id))[0]!

const MARKED = `${TARGET.scenario_name}~${TARGET.position_id}`

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

  // Some of the positions, never all of them — the counts belong to the capture and move with it,
  // the RELATION is the subject.
  const starts = await page.locator('.order-list .record-row.starts-position').count()
  const links = await page.locator('.order-list .to-trades').count()
  expect(links).toBeGreaterThan(0)
  expect(links).toBeLessThan(starts)

  // And the TRADE side decides which ones, which is the declared join read from the other end: one
  // link per position that produced a trade. If this ever reads higher than the distinct pairs, the
  // capture has a scenario whose records interleave two positions, so one position starts twice.
  const traded = new Set(TRADES.map(row => `${row.scenario_name}~${row.position_id}`))
  expect(links).toBe(traded.size)
})

test('a jump opens the closed target, marks the position and rides in the url', async ({ page }) => {
  await page.goto(`/runs?run=${FIXTURE_RUN}`)
  await openPanel(page, 'Orders')

  // the target starts CLOSED — that is what the jump has to deal with
  const trades = page.locator('.panel-trigger', { hasText: 'Trade History' })
  await expect(trades).toHaveAttribute('aria-expanded', 'false')

  await page.locator('.order-list .to-trades').first().click()

  await expect(page).toHaveURL(/position=/)
  await expect(trades).toHaveAttribute('aria-expanded', 'true')

  // Whichever position the first link belongs to, the mark is ITS scenario's trades and no others.
  // Read back from the url rather than pinned, because which link comes first is the list's order
  // to decide, not this test's.
  const jumped = (new URL(page.url()).searchParams.get('position') ?? '').split('~')
  const marked = page.locator('.trade-list .record-row.marked')
  await expect(marked).toHaveCount(tradesOf(jumped[0]!, jumped[1]!))
  await expect(marked.first()).toBeVisible()
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

  // One row above is only an achievement because the id is NOT unique: the capture hands it to
  // several scenarios, and marking them all is the defect this guards. Where this fails, the
  // capture stopped carrying the case and the test stopped testing it — which is worth knowing.
  expect(tradesAnywhere(TARGET.position_id)).toBeGreaterThan(1)
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
