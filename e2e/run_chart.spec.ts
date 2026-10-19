import { test, expect } from './cdp_fixture'
import type { Page } from '@playwright/test'
import { mockApi, FIXTURE_RUN } from './api_mock'
import { openWith, storedLink } from './arrangement_seed'

/**
 * The run-bound chart, in a real browser: the dock places it, the library draws it on a canvas, and
 * the way there is a click on a trade — none of which jsdom can do.
 */

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

async function openSection(page: Page, name: string): Promise<void> {
  const trigger = page.locator('.panel-trigger', { hasText: name })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}

/**
 * From a trade to its candles in one click (viewer#31, the item #21 left open): the run chart opens
 * BESIDE the run report rather than behind it, on the trade's own unit, with the trades drawn on the
 * candles — and the position marked, so the list and the chart agree on what is looked at.
 */
test('the chart mark on a trade opens the run chart beside the report, on the trade\'s unit', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN })
  await openSection(page, 'Trade history')

  await page.locator('[data-panel="trade-history"] .to-chart').first().click()

  const chartPanel = page.locator('[data-panel-kind="run-chart"]')
  const chart = chartPanel.locator('.candle-chart')
  await expect(chart).toBeVisible()
  await expect(chart.locator('canvas').first()).toBeVisible()
  await expect.poll(async () => Number(await chart.getAttribute('data-marks'))).toBeGreaterThan(0)

  // beside, not behind: the report and the chart are both on screen, the chart to the right
  const report = (await page.locator('[data-panel-kind="run"]').boundingBox())!
  const beside = (await chartPanel.boundingBox())!
  expect(beside.x).toBeGreaterThanOrEqual(report.x + report.width - 2)

  // on the unit of the trade clicked, which is marked for every panel
  const marked = (await storedLink(page))?.run.position
  expect(marked).not.toBeNull()
  await expect(page.locator('[data-quick-bar="run-chart"] select').first()).toHaveValue(marked!.scenario)
  await expect(page.locator('[data-panel="trade-history"] .record-row.marked').first()).toBeVisible()
})

/**
 * Part of the first arrangement (operator, 2026-10-15): on a screen wide enough to share, the run
 * chart stands beside the report from the start, on the first unit with trades — and below that
 * width it is a tab after the report, so the report keeps the room its lists need.
 */
test('the first arrangement puts the run chart beside the report where the screen is wide enough', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN })
  await expect(page.locator('[data-panel-kind="run"] .chosen-id')).toHaveText(FIXTURE_RUN)

  const chart = page.locator('[data-panel-kind="run-chart"] .candle-chart')
  await expect(chart).toBeVisible()
  await expect.poll(async () => Number(await chart.getAttribute('data-marks'))).toBeGreaterThan(0)
  await expect(page.locator('[data-panel-kind="run-chart"] .error-msg')).toHaveCount(0)
  const report = (await page.locator('[data-panel-kind="run"]').boundingBox())!
  const beside = (await page.locator('[data-panel-kind="run-chart"]').boundingBox())!
  expect(beside.x).toBeGreaterThanOrEqual(report.x + report.width - 2)
  // the report keeps the larger part
  expect(report.width).toBeGreaterThan(beside.width)
})

test('below that width the run chart is a tab after the report', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN })
  const tabs = page.locator('.dv-tab .panel-tab')
  await expect(tabs.last()).toHaveAttribute('data-kind', 'run-chart')
  expect(await tabs.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-kind'))))
    .toEqual(['deployments', 'runs', 'run', 'run-chart'])
})

/**
 * ONE focus for the lists and the chart (operator, 2026-10-16): the scenario chosen in the list is
 * the one the run chart draws, and a unit chosen in the chart narrows every list to it.
 */
test('the scenario in focus is the one on the run chart, whichever side chose it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN })
  await openSection(page, 'Scenarios')
  const unitSelect = page.locator('[data-quick-bar="run-chart"] select').first()
  await expect(unitSelect).toBeEnabled()

  const drawable = await unitSelect.locator('option:not([disabled])')
    .evaluateAll(nodes => nodes.map(node => (node as HTMLOptionElement).value))
  expect(drawable.length).toBeGreaterThan(1)
  const shown = await unitSelect.inputValue()
  const picked = drawable.find(name => name !== shown)!

  // from the list: the chart follows
  await page.locator('.scenario-roster .record-row')
    .filter({ has: page.locator('.roster-name', { hasText: new RegExp(`^${picked}$`) }) })
    .click()
  await expect(unitSelect).toHaveValue(picked)

  // from the chart: the lists follow
  const other = drawable.find(name => name !== picked)!
  await unitSelect.selectOption(other)
  await expect(page.locator('.narrowed-head').first()).toContainText(other)
  await expect(page.locator('.scenario-roster .record-row.picked .roster-name')).toHaveText(other)
})

/**
 * A position the run ended with still open has no trade row, and until the openings came from the
 * order history it had no mark at all. The fixture run's `EURGBP_left_open` opened one position and
 * closed none: its one mark is that opening.
 */
test('the run chart marks the opening of a position that never closed', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN })
  const unitSelect = page.locator('[data-quick-bar="run-chart"] select').first()
  await expect(unitSelect).toBeEnabled()
  await unitSelect.selectOption('EURGBP_left_open')

  const chart = page.locator('[data-panel-kind="run-chart"] .candle-chart')
  await expect.poll(async () => Number(await chart.getAttribute('data-marks'))).toBe(1)
  await expect(page.locator('[data-panel-kind="run-chart"] .error-msg')).toHaveCount(0)
})

/**
 * What overlaps on screen is drawn as one mark with a count, and splits again as the reader zooms
 * in. The fixture's `ETHUSD_spot_two_balances` opened eleven positions and closed ten trades over
 * eighteen hours — 1,075 bars of a minute; zoomed out, a mark covers hours of them.
 */
test('marks that would cover each other are drawn as one, and split as the reader zooms in', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN })
  const unitSelect = page.locator('[data-quick-bar="run-chart"] select').first()
  await expect(unitSelect).toBeEnabled()
  await unitSelect.selectOption('ETHUSD_spot_two_balances')

  const chart = page.locator('[data-panel-kind="run-chart"] .candle-chart')
  await expect.poll(async () => Number(await chart.getAttribute('data-events'))).toBe(21)
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

  // out: the marks of hours stand within one mark's width, and gather
  for (let step = 0; step < 8; step++) await page.mouse.wheel(0, 400)
  await expect.poll(async () => Number(await chart.getAttribute('data-marks'))).toBeLessThan(21)
  const gathered = Number(await chart.getAttribute('data-marks'))

  // in again: they split, and nothing was lost on the way
  for (let step = 0; step < 16; step++) await page.mouse.wheel(0, -400)
  await expect.poll(async () => Number(await chart.getAttribute('data-marks'))).toBeGreaterThan(gathered)
  expect(Number(await chart.getAttribute('data-events'))).toBe(21)
})

/** A line above the chart — the hint on its shapes — takes room from it, never its time axis. */
test('the hint above the run chart leaves the whole chart inside its panel', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN })
  const panel = page.locator('[data-panel-kind="run-chart"]')
  await expect(panel.getByText('a position opened')).toBeVisible()
  const chart = panel.locator('.candle-chart')
  await expect.poll(async () => Number(await chart.getAttribute('data-marks'))).toBeGreaterThan(0)
  const outer = (await panel.boundingBox())!
  const inner = (await chart.boundingBox())!
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1)
})
