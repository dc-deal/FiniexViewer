import { test, expect } from './cdp_fixture'
import type { Page } from '@playwright/test'
import { SERIES_RUN, fixture, mockApi } from './api_mock'
import { openWith } from './arrangement_seed'
import { paneHeights, paneRows } from './pane_rows'

/**
 * A worker's series on the run chart (contract 55): the session FiniexTestingIDE produced to draw
 * every kind of pane — series on the candles, in panes of their own, one worker on two timeframes —
 * read from its captured window. What is drawn is counted on the chart's element and read from its
 * legends: a canvas cannot be read back.
 */
const UNIT = 'indicator_series_session'
const SERIES = (fixture('recorded_window_series.json') as {
  indicator_series: { layer: string, pane: string, title: string, timeframe: string }[]
}).indicator_series
const OWN_PANES = [...new Set(SERIES.map(entry => entry.pane).filter(pane => pane !== 'price'))]

function served(page: Page): Promise<{ hidden?: string[] } | undefined> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('arrangement.v1') ?? '{}').panelViews?.['run-chart']?.layers?.served)
}

async function openSession(page: Page) {
  await mockApi(page)
  await page.setViewportSize({ width: 1800, height: 1000 })
  await openWith(page, '/', { run: SERIES_RUN, units: [UNIT] })
  const chart = page.locator('[data-panel-kind="run-chart"] .candle-chart')
  await expect.poll(async () => Number(await chart.getAttribute('data-bars')), { timeout: 30_000 }).toBeGreaterThan(0)
  await expect(chart).toHaveAttribute('data-indicators', String(SERIES.length))
  return chart
}

test('each worker’s series stands in the pane it names, with its line in that pane’s legend', async ({ page }) => {
  const chart = await openSession(page)
  // the candles, the volume's own pane, and one pane per name the series give, in the order served
  await expect(chart).toHaveAttribute('data-panes', String(2 + OWN_PANES.length))
  await expect(paneRows(chart)).toHaveCount(2 + OWN_PANES.length)
  const legends = await chart.locator('[data-legend]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-legend')))
  expect(legends).toEqual(['price', 'volume', ...OWN_PANES])
  for (const entry of SERIES) {
    const line = chart.locator(`[data-legend="${entry.pane}"] [data-series="${entry.layer}"]`)
    await expect(line).toContainText(`${entry.title} `)
    await expect(line).toContainText(`· ${entry.timeframe}`)
  }
  // every pane has room to draw in
  expect((await paneHeights(chart)).every(height => height > 20)).toBe(true)
})

test('a worker’s pane hidden at its lever gives its room up, and is kept hidden', async ({ page }) => {
  const chart = await openSession(page)
  const pane = OWN_PANES[0]!
  const box = (await chart.locator(`[data-legend="${pane}"]`).boundingBox())!
  await page.mouse.move(box.x + 40, box.y + 30)
  await chart.locator(`.pane-controls[data-pane="${pane}"] [data-action="pane-shown"]`).click()
  await expect(chart).toHaveAttribute('data-panes', String(1 + OWN_PANES.length))
  await expect(chart.locator(`[data-legend="${pane}"]`)).toHaveCount(0)
  const hidden = SERIES.filter(entry => entry.pane === pane).map(entry => entry.layer)
  expect((await served(page))?.hidden).toEqual(hidden)
  await page.reload()
  await expect.poll(async () => Number(await chart.getAttribute('data-bars')), { timeout: 30_000 }).toBeGreaterThan(0)
  await expect(chart).toHaveAttribute('data-indicators', String(SERIES.length - hidden.length))
})

/** On a coarser chart a finer series would set times between the candles: only its own timeframe's stand. */
test('a coarser timeframe draws only the series of its own timeframe', async ({ page }) => {
  const chart = await openSession(page)
  await page.locator('[data-quick-bar="run-chart"] select').nth(1).selectOption('M30')
  const coarse = SERIES.filter(entry => entry.timeframe === 'M30')
  await expect(chart).toHaveAttribute('data-indicators', String(coarse.length))
  const panes = [...new Set(coarse.map(entry => entry.pane).filter(pane => pane !== 'price'))]
  await expect(chart).toHaveAttribute('data-panes', String(2 + panes.length))
})

/** A worker's pane is dragged and kept like the volume's, by the name the backend gave it. */
test('the seam above a worker’s pane dragged is kept by the pane’s name', async ({ page }) => {
  const chart = await openSession(page)
  const pane = OWN_PANES[0]!
  const before = await paneHeights(chart)
  // the seams between the panes, top to bottom: the second stands above the first worker's pane
  const seam = (await chart.locator('.candle-canvas table tr:has(> td[colspan="3"])').nth(1).boundingBox())!
  const x = seam.x + seam.width / 2
  const y = seam.y + seam.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 40, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('arrangement.v1') ?? '{}').panelViews?.['run-chart']?.panes)).toHaveProperty(pane)
  const after = await paneHeights(chart)
  expect(after[2]!).toBeGreaterThan(before[2]! + 20)
  await page.reload()
  await expect(chart).toHaveAttribute('data-indicators', String(SERIES.length))
  await expect.poll(async () => (await paneHeights(chart))[2]!).toBeGreaterThan(before[2]! + 20)
})

/**
 * A worker's pane at the whole height folds the others to their legends' lines in it — the candles'
 * legend with a line per series on them — and no two legends stand on each other.
 */
test('a worker’s pane given the whole height stacks the folded legends line by line', async ({ page }) => {
  const chart = await openSession(page)
  const pane = OWN_PANES.at(-1)!
  const box = (await chart.locator(`[data-legend="${pane}"]`).boundingBox())!
  await page.mouse.move(box.x + 40, box.y + 30)
  await chart.locator(`.pane-controls[data-pane="${pane}"] [data-action="pane-whole"]`).click()
  await expect(chart).toHaveAttribute('data-maximized', pane)
  const boxes = (await chart.locator('[data-legend]').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom }
  }))).sort((a, b) => a.top - b.top)
  expect(boxes).toHaveLength(2 + OWN_PANES.length)
  for (let index = 1; index < boxes.length; index++) expect(boxes[index]!.top).toBeGreaterThanOrEqual(boxes[index - 1]!.bottom - 1)
})
