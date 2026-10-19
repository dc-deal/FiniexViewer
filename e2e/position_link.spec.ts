import { test, expect } from './cdp_fixture'
import { mockApi, fixture, FIXTURE_RUN } from './api_mock'
import { openWith, storedLink } from './arrangement_seed'

/**
 * The jump between an order and its trade, which only a browser can prove.
 *
 * Everything the unit suite can reach is already covered — the affordance, its three absences, the
 * mark, what the panels ask for. What it cannot reach is the half that lives in the VIEW: the mark
 * stored with the run, a panel that was CLOSED being opened, a panel that was HIDDEN coming back, the
 * scroll that brings the mark on screen, and the mark surviving a real reload. Each of those has
 * been a defect class here before.
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
 * The position the seeded tests mark: the one that makes the trap hardest. Its own scenario
 * produced exactly ONE trade, while its id is shared as widely as the capture allows — so a mark
 * that leaked across scenarios would show several rows where one is right.
 *
 * Today that resolves to `pos_eurgbp_1`: three scenarios carry it, five trades in all, and one of
 * those scenarios closed it in three parts.
 */
const TARGET = [...TRADES]
  .filter(row => tradesOf(row.scenario_name, row.position_id) === 1)
  .sort((a, b) => tradesAnywhere(b.position_id) - tradesAnywhere(a.position_id))[0]!

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

async function openPanel(page: import('@playwright/test').Page, name: string): Promise<void> {
  const trigger = page.locator('.panel-trigger', { hasText: name })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}

test('the link is drawn only where the position produced a trade', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
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

test('a jump opens the closed target, marks the position and stores the mark', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  await openPanel(page, 'Orders')

  // the target starts CLOSED — that is what the jump has to deal with
  const trades = page.locator('.panel-trigger', { hasText: 'Trade history' })
  await expect(trades).toHaveAttribute('aria-expanded', 'false')

  await page.locator('.order-list .to-trades').first().click()

  await expect.poll(async () => (await storedLink(page))?.run.position ?? null).not.toBeNull()
  await expect(trades).toHaveAttribute('aria-expanded', 'true')

  // Whichever position the first link belongs to, the mark is ITS scenario's trades and no others.
  // Read back from what was stored rather than pinned, because which link comes first is the
  // list's order to decide, not this test's.
  const jumped = (await storedLink(page))!.run.position!
  const marked = page.locator('.trade-list .record-row.marked')
  await expect(marked).toHaveCount(tradesOf(jumped.scenario, jumped.position))
  await expect(marked.first()).toBeVisible()

  // a marked row is still a control: the pointer lifts it like any other row. Its raised surface came
  // after the hover and the press and outranked both, so it gave no feedback at all until 2026-10-18
  const surface = () => marked.first().evaluate(node => getComputedStyle(node).backgroundColor)
  await page.mouse.move(0, 0)
  const atRest = await surface()
  await marked.first().hover()
  await expect.poll(surface).not.toBe(atRest)
})

/**
 * Drawn is not SEEN: the jump also scrolls to the mark, and only a jump from far down the orders
 * needs that. Trade History stands ABOVE Orders in the column, so the trades of the first link are
 * on screen anyway — an assertion on them stayed green with the scroll removed, measured
 * 2026-10-12. The scroll searches the run view's own root, so a broken root lands nowhere.
 */
test('a jump from far down the orders scrolls its trades into view', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  await openPanel(page, 'Orders')

  const link = page.locator('.order-list .to-trades').last()
  await link.scrollIntoViewIfNeeded()
  // the case itself: a reader scrolled away from the top, where the trades are about to open
  const scrolled = await page.locator('.run-report-body').evaluate(element => element.scrollTop)
  expect(scrolled).toBeGreaterThan(0)

  await link.click()
  await expect(page.locator('.trade-list .record-row.marked').first()).toBeInViewport()
})

test('a hidden target comes back rather than the jump landing nowhere', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  await openPanel(page, 'Orders')

  // switch Trade History off entirely — it leaves the column, not just the open state
  await page.locator('.panel-header', { hasText: 'Trade history' })
    .locator('.panel-control[title="Hide panel"]').click()
  await expect(page.locator('.panel-trigger', { hasText: 'Trade history' })).toHaveCount(0)

  await page.locator('.order-list .to-trades').first().click()

  await expect(page.locator('.panel-trigger', { hasText: 'Trade history' }))
    .toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.trade-list .record-row.marked')).toHaveCount(1)
})

test('the mark survives a reload, and the page does not jump on its own', async ({ page }) => {
  await openWith(page, '/', {
    run: FIXTURE_RUN,
    position: { scenario: TARGET.scenario_name, position: TARGET.position_id },
  })
  await openPanel(page, 'Orders')
  await openPanel(page, 'Trade history')

  // restored in BOTH lists — the whole lifecycle of the position on the order side
  await expect(page.locator('.trade-list .record-row.marked')).toHaveCount(1)
  await expect(page.locator('.order-list .record-row.marked').first()).toBeVisible()

  // THE POINT: a real reload, and the mark is still there
  await page.reload()
  await openPanel(page, 'Trade history')
  await expect(page.locator('.trade-list .record-row.marked')).toHaveCount(1)

  // One row above is only an achievement because the id is NOT unique: the capture hands it to
  // several scenarios, and marking them all is the defect this guards. Where this fails, the
  // capture stopped carrying the case and the test stopped testing it — which is worth knowing.
  expect(tradesAnywhere(TARGET.position_id)).toBeGreaterThan(1)
})

test('the way back from a trade reaches the orders of its position', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  await openPanel(page, 'Trade history')

  const orders = page.locator('.panel-trigger', { hasText: 'Orders' })
  await expect(orders).toHaveAttribute('aria-expanded', 'false')

  await page.locator('.trade-list .to-orders').first().click()

  await expect.poll(async () => (await storedLink(page))?.run.position ?? null).not.toBeNull()
  await expect(orders).toHaveAttribute('aria-expanded', 'true')
  // every row of that position's lifecycle, in its own scenario only
  const marked = page.locator('.order-list .record-row.marked')
  expect(await marked.count()).toBeGreaterThan(0)
  await expect(page.locator('.order-list .record-row.marked').first()).toBeVisible()
})
