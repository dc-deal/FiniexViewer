import { test, expect } from './cdp_fixture'
import type { Locator, Page } from '@playwright/test'
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

/** Shows the controls of a pane by resting the pointer over its legend, and clicks one of them. */
async function paneControl(page: Page, chart: Locator, pane: string, action: 'pane-shown' | 'pane-whole'): Promise<void> {
  const box = (await chart.locator(`[data-legend="${pane}"]`).boundingBox())!
  await page.mouse.move(box.x + 40, box.y + 30)
  await chart.locator(`.pane-controls[data-pane="${pane}"] [data-action="${action}"]`).click()
}

/** The legends' panes, top to bottom — the order the panes stand in. */
function legendOrder(chart: Locator): Promise<(string | null)[]> {
  return chart.locator('[data-legend]').evaluateAll(nodes => nodes
    .map(node => ({ pane: node.getAttribute('data-legend'), top: node.getBoundingClientRect().top }))
    .sort((a, b) => a.top - b.top).map(entry => entry.pane))
}

test('the Layers panel lists each worker’s layer in its pane, and its switch hides it on the chart', async ({ page }) => {
  const chart = await openSession(page)
  await page.locator('[data-quick-bar="run-chart"] [data-action="layers"]').click()
  const layers = page.locator('[data-panel-kind="layers"]')
  await expect(layers.locator('[data-layer="worker:rsi_fast"]')).toBeVisible()
  const groups = await layers.locator('[data-pane-group]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-pane-group')))
  expect(groups).toEqual(['price', 'volume', ...OWN_PANES])
  // the candles' pane holds the framework's layers and two workers': the two sources named, a worker
  // drawing one layer there standing as its row alone
  await expect(layers.locator('[data-pane-group="price"] .source-heading')).toHaveCount(2)
  // whose eye hides every worker of the candles' pane at once, and shows them again
  const onCandles = SERIES.filter(entry => entry.pane === 'price').length
  await layers.locator('[data-pane-group="price"] [data-action="show-workers"]').click()
  await expect(chart).toHaveAttribute('data-indicators', String(SERIES.length - onCandles))
  await layers.locator('[data-pane-group="price"] [data-action="show-workers"]').click()
  await expect(chart).toHaveAttribute('data-indicators', String(SERIES.length))
  await layers.locator('[data-layer="worker:rsi_fast"] [data-action="show"]').click()
  await expect(chart).toHaveAttribute('data-indicators', String(SERIES.length - 1))
  await expect(chart).toHaveAttribute('data-panes', String(1 + OWN_PANES.length))
  await layers.locator('[data-layer="worker:rsi_fast"] [data-action="show"]').click()
  await expect(chart).toHaveAttribute('data-panes', String(2 + OWN_PANES.length))
})

/**
 * A pane at the whole height that goes — a worker's on a timeframe that cannot draw it, the volume
 * hidden — leaves no pane folded beside nothing: every pane keeps its controls, and the whole height
 * holds again once the pane is back.
 */
test('a pane at the whole height that goes leaves every pane its controls, and holds again once back', async ({ page }) => {
  const chart = await openSession(page)
  await paneControl(page, chart, 'rsi_fast', 'pane-whole')
  await expect(chart).toHaveAttribute('data-maximized', 'rsi_fast')
  const timeframe = page.locator('[data-quick-bar="run-chart"] select').nth(1)
  await timeframe.selectOption('M30')
  await expect(chart).not.toHaveAttribute('data-maximized', /.+/)
  // the candles' pane stands with its controls, nothing folded
  await paneControl(page, chart, 'price', 'pane-whole')
  await expect(chart).toHaveAttribute('data-maximized', 'price')
  await paneControl(page, chart, 'price', 'pane-whole')
  await expect(chart).not.toHaveAttribute('data-maximized', /.+/)
  // back on a timeframe that draws it, the whole height is the reader's next choice, never a stale one
  await timeframe.selectOption('M1')
  await expect(chart).toHaveAttribute('data-indicators', String(SERIES.length))
  await expect(chart).not.toHaveAttribute('data-maximized', /.+/)

  // the volume at the whole height, then hidden at its own lever: the candles keep their controls
  await paneControl(page, chart, 'volume', 'pane-whole')
  await expect(chart).toHaveAttribute('data-maximized', 'volume')
  await chart.locator('.pane-controls[data-pane="volume"] [data-action="pane-shown"]').click()
  await expect(chart).not.toHaveAttribute('data-maximized', /.+/)
  await paneControl(page, chart, 'price', 'pane-whole')
  await expect(chart).toHaveAttribute('data-maximized', 'price')
})

/** The volume moved into the candles' pane and back: the workers' panes stay below it, in the order served. */
test('the volume moved into the candles’ pane and back keeps the workers’ panes below it, in order', async ({ page }) => {
  const chart = await openSession(page)
  await page.locator('[data-quick-bar="run-chart"] [data-action="layers"]').click()
  const volume = page.locator('[data-panel-kind="layers"] [data-layer="volume"]')
  await volume.locator('[data-action="open"]').click()
  await volume.locator('[data-action="option"]').click()
  await expect(chart).toHaveAttribute('data-panes', String(1 + OWN_PANES.length))
  await expect.poll(() => legendOrder(chart)).toEqual(['price', ...OWN_PANES])
  await volume.locator('[data-action="option"]').click()
  await expect(chart).toHaveAttribute('data-panes', String(2 + OWN_PANES.length))
  await expect.poll(() => legendOrder(chart)).toEqual(['price', 'volume', ...OWN_PANES])
  await expect(chart).toHaveAttribute('data-indicators', String(SERIES.length))
})

/** Dragged small and big, hidden and shown again: a worker's pane comes back at the height dragged. */
test('a worker’s pane dragged small and big, hidden and shown, comes back at the height dragged', async ({ page }) => {
  const chart = await openSession(page)
  const seams = chart.locator('.candle-canvas table tr:has(> td[colspan="3"])')
  async function drag(index: number, dy: number): Promise<void> {
    const seam = (await seams.nth(index).boundingBox())!
    const x = seam.x + seam.width / 2
    const y = seam.y + seam.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + dy, { steps: 10 })
    await page.mouse.up()
  }
  const pane = OWN_PANES[0]!
  // the Layers panel open first: it takes room beside the chart, and the heights are read after that
  await page.locator('[data-quick-bar="run-chart"] [data-action="layers"]').click()
  const layer = SERIES.find(entry => entry.pane === pane)!.layer
  const lever = page.locator(`[data-panel-kind="layers"] [data-layer="${layer}"] [data-action="show"]`)
  await expect(lever).toBeVisible()
  const frame = (await chart.boundingBox())!
  const before = (await paneHeights(chart))[2]!
  // the seam above the first worker's pane, down as far as it goes: the pane at its least. A seam
  // shares the height of the two panes beside it, so up as far as it goes takes the volume's too
  await drag(1, 600)
  const small = (await paneHeights(chart))[2]!
  expect(small).toBeLessThan(before)
  await drag(1, -600)
  const large = (await paneHeights(chart))[2]!
  expect(large).toBeGreaterThan(before)
  await expect.poll(() => page.evaluate(name =>
    JSON.parse(localStorage.getItem('arrangement.v1') ?? '{}').panelViews?.['run-chart']?.panes?.[name], pane)).toBeDefined()
  // hidden at its lever on the chart and shown again from the Layers panel: back at the height dragged
  await paneControl(page, chart, pane, 'pane-shown')
  await expect(chart).toHaveAttribute('data-panes', String(1 + OWN_PANES.length))
  await lever.click()
  await expect(chart).toHaveAttribute('data-panes', String(2 + OWN_PANES.length))
  expect((await chart.boundingBox())!.height).toBeCloseTo(frame.height, 0)
  await expect.poll(async () => Math.abs((await paneHeights(chart))[2]! - large)).toBeLessThanOrEqual(3)
})

/**
 * A pane set apart (operator, 2026-11-13: the switches in the options of the pane's first row): the
 * candles' pane from the candles' row, the volume's from its own, a worker's from its first series —
 * kept by the pane's name, across a reload.
 */
test('a pane is set apart by a frame and a background from its first row, kept across a reload', async ({ page }) => {
  const chart = await openSession(page)
  await page.locator('[data-quick-bar="run-chart"] [data-action="layers"]').click()
  const layers = page.locator('[data-panel-kind="layers"]')
  async function look(layer: string, part: 'pane-frame' | 'pane-background'): Promise<void> {
    const row = layers.locator(`[data-layer="${layer}"]`)
    if (!(await row.locator(`[data-action="${part}"]`).isVisible())) await row.locator('[data-action="open"]').click()
    await row.locator(`[data-action="${part}"]`).click()
  }
  const pane = OWN_PANES[0]!
  const first = SERIES.find(entry => entry.pane === pane)!.layer
  await look('candles', 'pane-frame')
  await look('volume', 'pane-background')
  await look(first, 'pane-frame')
  await look(first, 'pane-background')
  const stored = (): Promise<unknown> => page.evaluate(() =>
    JSON.parse(localStorage.getItem('arrangement.v1') ?? '{}').panelViews?.['run-chart']?.looks)
  await expect.poll(stored).toEqual({ price: { frame: true }, volume: { background: true }, [pane]: { frame: true, background: true } })
  // a later series of the same pane sets nothing: the pane's first row does
  const second = SERIES.filter(entry => entry.pane === 'price')
  expect(second.length).toBeGreaterThan(0)
  await layers.locator(`[data-layer="${second[0]!.layer}"] [data-action="open"]`).click()
  await expect(layers.locator(`[data-layer="${second[0]!.layer}"] [data-action="pane-frame"]`)).toHaveCount(0)

  await page.reload()
  await expect(chart).toHaveAttribute('data-indicators', String(SERIES.length))
  await expect.poll(stored).toEqual({ price: { frame: true }, volume: { background: true }, [pane]: { frame: true, background: true } })
  // taken off again from the same switch, nothing is kept
  await look('candles', 'pane-frame')
  await look('volume', 'pane-background')
  await look(first, 'pane-frame')
  await look(first, 'pane-background')
  await expect.poll(stored).toBeUndefined()
})
