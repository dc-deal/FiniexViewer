import { test, expect } from './cdp_fixture'
import type { Locator, Page } from '@playwright/test'
import { mockApi, FIXTURE_RUN } from './api_mock'
import { openWith } from './arrangement_seed'
import { axisInk, lowestShare, paneHeights, paneRows, paneSeam } from './pane_rows'

/**
 * The run chart's panes (viewer#57), in a real browser: the volume in a pane of its own below the
 * candles, as TradingView and Kraken Pro draw it, the seam between them dragged — and what a reader
 * does around that: a window of another height, a layer hidden, its option switched, another unit
 * or timeframe, a reload. None of it may move what the reader did not touch.
 */

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

/** The run chart on the fixture run, its panes laid out. */
async function openChart(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: 1800, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN, units: ['EURGBP_refusals_01'] })
  const chart = page.locator('[data-panel-kind="run-chart"] .candle-chart')
  await expect.poll(async () => Number(await chart.getAttribute('data-bars'))).toBeGreaterThan(0)
  await expect(chart).toHaveAttribute('data-panes', '2')
  return chart
}

/** Two frames: what the library lays out on a change is drawn by then. */
function painted(page: Page): Promise<void> {
  return page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
}

/** The seam dragged by `dy` pixels, the way a reader does: pressed, moved in steps, let go. */
async function dragSeam(page: Page, chart: Locator, dy: number): Promise<void> {
  const seam = (await paneSeam(chart).boundingBox())!
  const x = seam.x + seam.width / 2
  const y = seam.y + seam.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + dy, { steps: 8 })
  await page.mouse.up()
}

/** The pane weights the arrangement keeps for the run chart. */
function storedPanes(page: Page): Promise<Record<string, number> | undefined> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('arrangement.v1') ?? '{}').panelViews?.['run-chart']?.panes)
}

test('the volume stands in a pane of its own below the candles, and the time lane stays with the candles', async ({ page }) => {
  const chart = await openChart(page)
  await painted(page)
  // a fifth of the height, where Kraken Pro stands it
  expect(await lowestShare(chart)).toBeCloseTo(0.2, 1)
  // the lane at the bottom of the pane of the candles, not under the volume: a booking period's card
  // is found just above that pane's lower edge
  await expect.poll(async () => await chart.getAttribute('data-drawings')).toMatch(/periods:1/)
  const price = (await paneRows(chart).first().boundingBox())!
  const card = page.locator('.chart-card')
  for (let lift = 4; lift <= 40 && !(await card.count()); lift += 2) {
    await page.mouse.move(price.x + price.width / 2, price.y + price.height - lift)
    await page.waitForTimeout(60)
  }
  await expect(card).toContainText('booking period 1')
  // over the volume's pane nothing of the lane is found
  const volume = (await paneRows(chart).last().boundingBox())!
  await page.mouse.move(volume.x + volume.width / 2, volume.y + volume.height - 10)
  await page.waitForTimeout(120)
  await expect(card).toHaveCount(0)
})

test('each pane says its figures at its top left: the bar under the pointer, the last one off the bars', async ({ page }) => {
  const chart = await openChart(page)
  await painted(page)
  const priceLegend = chart.locator('[data-legend="price"]')
  const volumeLegend = chart.locator('[data-legend="volume"]')
  await expect(priceLegend).toContainText('C')
  await expect(volumeLegend).toBeVisible()
  // at the top of its own pane, and following it when the seam moves it
  const atTop = async (legend: typeof priceLegend, pane: number): Promise<number> =>
    Math.abs((await legend.boundingBox())!.y - (await paneRows(chart).nth(pane).boundingBox())!.y)
  expect(await atTop(priceLegend, 0)).toBeLessThanOrEqual(4)
  expect(await atTop(volumeLegend, 1)).toBeLessThanOrEqual(4)
  // one line, in the chart beside the report: at 60 % of it the close went to a line of its own
  expect((await priceLegend.boundingBox())!.height).toBeLessThan(24)
  await dragSeam(page, chart, -80)
  await painted(page)
  expect(await atTop(volumeLegend, 1)).toBeLessThanOrEqual(4)

  // the last bar while the pointer is off the chart, another one under it, the last again once it leaves
  await page.mouse.move(1, 1)
  const last = await priceLegend.textContent()
  const price = (await paneRows(chart).first().boundingBox())!
  await page.mouse.move(price.x + 40, price.y + price.height / 2)
  await expect(priceLegend).not.toHaveText(last!)
  await page.mouse.move(1, 1)
  await expect(priceLegend).toHaveText(last!)
})

test('a seam dragged is kept — through a window of another height, another unit and timeframe, and a reload', async ({ page }) => {
  const chart = await openChart(page)
  await painted(page)
  await dragSeam(page, chart, -120)
  await painted(page)
  const dragged = await lowestShare(chart)
  expect(dragged).toBeGreaterThan(0.3)
  await expect.poll(() => storedPanes(page)).toMatchObject({ price: expect.any(Number), volume: expect.any(Number) })

  // another height: the panes keep their proportion, never their pixels
  await page.setViewportSize({ width: 1800, height: 700 })
  await painted(page)
  expect(await lowestShare(chart)).toBeCloseTo(dragged, 1)
  await page.setViewportSize({ width: 1800, height: 900 })

  // another unit: the chart is the same, its panes too
  await page.locator('[data-quick-bar="run-chart"] select').first().selectOption('ETHUSD_spot_two_balances')
  await expect(chart).toHaveAttribute('data-panes', '2')
  await painted(page)
  expect(await lowestShare(chart)).toBeCloseTo(dragged, 1)

  // another timeframe: the capture holds M1 alone, so M5 takes the chart away — and back at M1 it
  // is built anew, its panes at the heights kept
  const timeframe = page.locator('[data-quick-bar="run-chart"] select').nth(1)
  await timeframe.selectOption('M5')
  await expect(chart).toHaveCount(0)
  await timeframe.selectOption('M1')
  await expect(chart).toHaveAttribute('data-panes', '2')
  await painted(page)
  expect(await lowestShare(chart)).toBeCloseTo(dragged, 1)

  await page.reload()
  await expect(chart).toHaveAttribute('data-panes', '2')
  await painted(page)
  expect(await lowestShare(chart)).toBeCloseTo(dragged, 1)
})

test('the volume hidden gives its pane up and comes back at the height dragged; in the pane of the candles it moves no candle', async ({ page }) => {
  const chart = await openChart(page)
  await page.locator('[data-quick-bar="run-chart"] [data-action="layers"]').click()
  const layers = page.locator('[data-panel-kind="layers"]')
  const volume = layers.locator('[data-layer="volume"]')
  await expect(volume).toBeVisible()
  // a height of the reader's own, so a layer change that dropped it would show
  await painted(page)
  await dragSeam(page, chart, -100)
  await expect.poll(() => storedPanes(page)).toBeDefined()
  const kept = await storedPanes(page)
  await painted(page)
  const before = await paneHeights(chart)
  expect(before[1]! / (before[0]! + before[1]!)).toBeGreaterThan(0.28)
  expect(await axisInk(chart, 1)).toBeGreaterThan(0)

  // hidden, it takes no room: its pane goes and the candles take the whole height (operator, on
  // screen 2026-11-12: an empty pane was room taken for nothing)
  await volume.locator('[data-action="show"]').click()
  await expect(volume).toHaveAttribute('data-shown', 'false')
  await expect(chart).toHaveAttribute('data-panes', '1')
  await painted(page)
  expect((await paneHeights(chart))[0]!).toBeGreaterThan(before[0]! + before[1]! - 4)
  expect(await storedPanes(page)).toEqual(kept)
  // shown again, its pane comes back at the height dragged, its scale with it
  await volume.locator('[data-action="show"]').click()
  await expect(chart).toHaveAttribute('data-panes', '2')
  await painted(page)
  expect(Math.abs((await paneHeights(chart))[1]! - before[1]!)).toBeLessThanOrEqual(2)
  expect(await axisInk(chart, 1)).toBeGreaterThan(0)

  // in the pane of the candles: one pane, the whole height
  await volume.locator('[data-action="open"]').click()
  await volume.locator('[data-action="option"]').click()
  await expect(chart).toHaveAttribute('data-panes', '1')
  await painted(page)
  const whole = await paneHeights(chart)
  expect(whole).toHaveLength(1)
  expect(whole[0]!).toBeGreaterThan(before[0]! + before[1]! - 4)

  // there, on a scale nothing shows, switching it off moves no candle: the price axis the same,
  // pixel for pixel
  const price = (await paneRows(chart).first().boundingBox())!
  const axis = { x: price.x + price.width - 50, y: price.y, width: 50, height: price.height }
  const shown = await page.screenshot({ clip: axis })
  await volume.locator('[data-action="show"]').click()
  await expect(volume).toHaveAttribute('data-shown', 'false')
  await painted(page)
  expect((await page.screenshot({ clip: axis })).equals(shown)).toBe(true)
  await volume.locator('[data-action="show"]').click()

  // back in its own pane, at the height dragged, which no layer change touched
  await volume.locator('[data-action="option"]').click()
  await expect(chart).toHaveAttribute('data-panes', '2')
  await painted(page)
  const again = await paneHeights(chart)
  expect(Math.abs(again[1]! - before[1]!)).toBeLessThanOrEqual(2)
  expect(await storedPanes(page)).toEqual(kept)
})

/** The controls stand at the right edge of the plot, where no figure of the legend moves them. */
test('the controls at the top right of a pane hide what it draws and give it the whole height, kept across a reload', async ({ page }) => {
  const chart = await openChart(page)
  await painted(page)
  const box = (await paneRows(chart).last().boundingBox())!
  const controls = chart.locator('.pane-controls[data-pane="volume"]')
  await expect(controls).toHaveCSS('opacity', '0')
  await page.mouse.move(box.x + 60, box.y + box.height / 2)
  // two steps (operator, 2026-11-14): over the pane, faint and behind its figures
  await expect(controls).toHaveCSS('opacity', '0.6')
  const legendLayer = Number(await chart.locator('[data-legend="volume"]').evaluate(node => getComputedStyle(node).zIndex))
  expect(Number(await controls.evaluate(node => getComputedStyle(node).zIndex))).toBeLessThan(legendLayer)
  // at the right edge, far from the figures at the left — whatever their width
  expect((await controls.boundingBox())!.x).toBeGreaterThan(box.x + box.width / 2)
  // over the controls themselves, whole and in front of the figures
  await controls.hover()
  await expect(controls).toHaveCSS('opacity', '1')
  expect(Number(await controls.evaluate(node => getComputedStyle(node).zIndex))).toBeGreaterThan(legendLayer)

  // the arrows: the volume the whole height, the candles folded to their line of figures
  await controls.locator('[data-action="pane-whole"]').click()
  await expect(chart).toHaveAttribute('data-maximized', 'volume')
  await painted(page)
  expect((await paneHeights(chart))[0]!).toBeLessThan(30)
  await expect(chart.locator('[data-legend="price"]')).toBeVisible()
  // kept, as the heights are
  await page.reload()
  await expect(chart).toHaveAttribute('data-maximized', 'volume')
  await painted(page)
  expect((await paneHeights(chart))[0]!).toBeLessThan(30)
  // and the heights back
  const tall = (await paneRows(chart).last().boundingBox())!
  await page.mouse.move(tall.x + 60, tall.y + tall.height / 2)
  await controls.locator('[data-action="pane-whole"]').click()
  await expect(chart).not.toHaveAttribute('data-maximized')
  await painted(page)
  expect(await lowestShare(chart)).toBeCloseTo(0.2, 1)

  // the ✕: a pane of its own closed, its pane's group hidden above the volume's own switch, its pane gone
  const again = (await paneRows(chart).last().boundingBox())!
  await page.mouse.move(again.x + 60, again.y + again.height / 2)
  await expect(controls.locator('[data-action="pane-shown"]')).toHaveCount(0)
  await controls.locator('[data-action="pane-close"]').click()
  await expect(chart).toHaveAttribute('data-panes', '1')
  const layers = await page.evaluate(() => JSON.parse(localStorage.getItem('arrangement.v1') ?? '{}').panelViews?.['run-chart']?.layers)
  expect(layers?.groupsHidden).toEqual(['pane:volume'])
  expect(layers?.hidden).toBeUndefined()
})

/** As VS Code's sashes do: a double click on the seam brings the first heights back. */
test('a double click on the seam brings the first heights back', async ({ page }) => {
  const chart = await openChart(page)
  await painted(page)
  await dragSeam(page, chart, -100)
  await expect.poll(() => storedPanes(page)).toBeDefined()
  const seam = (await paneSeam(chart).boundingBox())!
  await page.mouse.dblclick(seam.x + seam.width / 2, seam.y + seam.height / 2)
  await expect.poll(() => storedPanes(page)).toBeUndefined()
  await painted(page)
  expect(await lowestShare(chart)).toBeCloseTo(0.2, 1)
})
