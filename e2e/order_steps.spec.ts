import { test, expect } from './cdp_fixture'
import { mockApi, fixture, FIXTURE_RUN } from './api_mock'

/**
 * The third level of the Orders panel: what the orders of one position went through.
 *
 * Three things only a browser can judge, and the unit suite already has the rest. The nested list
 * is a grid INSIDE a row of another grid, which is the arrangement that produced two of the
 * overflow defects this project has shipped — `panel_layout.spec.ts` explains them. And the
 * disclosure is a real click on a real control, which decides whether a reader can find it at all.
 *
 * The capture is NARROWED to one position, the way the route itself is, so the mock answers with
 * the steps for that one and an empty stream for any other. Both halves are exercised here: a
 * position with a stream, and a position without one.
 */
interface StreamCapture {
  events: { scenario_name: string, order_id: string }[]
  count: number
}

const CAPTURED = (fixture('order_events.json') as StreamCapture).events[0]!

/** One pixel of slack, the same allowance the panel layout spec makes for a grid's last track. */
const SLACK = 2

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

async function openOrders(page: import('@playwright/test').Page): Promise<void> {
  const trigger = page.locator('.panel-trigger', { hasText: 'Orders' })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}

/**
 * The list NARROWED to the captured scenario, which the app's own `unit` param does.
 *
 * It is not convenience. `pos_eurgbp_1` belongs to four scenarios in this capture — that is the
 * property the position link tests stand on — and the first row carrying it is in a different one.
 * The route is asked for `(scenario_name, order_id)` and the mock answers for that pair only, so
 * without the narrowing the test would click a position whose stream really is empty and the
 * failure would read as a broken display.
 */
function narrowedTo(scenario: string): string {
  return `/runs?run=${FIXTURE_RUN}&unit=${encodeURIComponent(scenario)}`
}

/** The row that starts the captured position, inside the one scenario the capture is about. */
function positionRow(page: import('@playwright/test').Page) {
  return page.locator('.order-list .record-row.starts-position', { hasText: CAPTURED.order_id })
    .first()
}

test('a position opens the steps its orders went through', async ({ page }) => {
  await page.goto(narrowedTo(CAPTURED.scenario_name))
  await openOrders(page)

  // every position that starts one carries the glyph, because the run wrote a stream
  const disclosures = page.locator('.order-list .record-marker')
  expect(await disclosures.count()).toBeGreaterThan(0)

  const row = positionRow(page)
  await expect(row).toBeVisible()
  // the ROW is the control now, which is what a reader tries first
  await row.click()

  // the steps of that position, grouped into the orders they belong to
  const steps = page.locator('.step-list')
  await expect(steps.first()).toBeVisible()
  expect(await steps.first().locator('.record-row').count())
    .toBe((fixture('order_events.json') as StreamCapture).count)
  // four orders under one position id: the capture's partial close is what makes that visible
  expect(await steps.first().locator('.step-group').count()).toBeGreaterThan(1)
})

/**
 * A grid inside a grid, at the width a reader actually arranges. The nested list has no rank ladder
 * of its own — it sits in a row that already gave up what it had to — so this is the assertion that
 * says the decision was right.
 */
test('the steps do not scroll sideways inside the row that holds them', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 })
  await page.goto(narrowedTo(CAPTURED.scenario_name))
  await openOrders(page)

  await positionRow(page).click()
  const steps = page.locator('.step-list').first()
  await expect(steps).toBeVisible()

  const overflow = await steps.evaluate(node => {
    const widest = Math.max(...[...node.querySelectorAll('.record-row')]
      .map(row => row.scrollWidth))
    return widest - node.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(SLACK)
})

/**
 * A position the stream holds nothing for says so, rather than opening an empty list. The mock
 * answers an empty stream for every position but the captured one, which is exactly the shape the
 * real route answers with when asked for a position whose orders left no step.
 */
test('a position with no steps says so instead of opening an empty list', async ({ page }) => {
  await page.goto(`/runs?run=${FIXTURE_RUN}`)
  await openOrders(page)

  const other = page.locator('.order-list .record-row.starts-position')
    .filter({ hasNotText: CAPTURED.order_id })
    .first()
  await other.click()

  await expect(page.locator('.step-state').first()).toBeVisible()
  await expect(page.locator('.step-state').first()).toContainText('no step')
})
