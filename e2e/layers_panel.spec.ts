import { test, expect } from './cdp_fixture'
import { mockApi, FIXTURE_RUN } from './api_mock'
import { openWith } from './arrangement_seed'

/**
 * The Layers panel, in a real browser: opened from the run chart's quick bar BESIDE the chart it
 * arranges, the chart still on show; its lever changing what the chart's own host is handed; and
 * what it set still in force after a reload.
 */

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('the Layers panel opens beside the chart from its quick bar, and a layer it hides stays hidden after a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN, units: ['EURGBP_refusals_01'] })
  const chartPanel = page.locator('[data-panel-kind="run-chart"]')
  const chart = chartPanel.locator('.candle-chart')
  await expect.poll(async () => await chart.getAttribute('data-drawings')).toMatch(/trades:[1-9]/)

  await page.locator('[data-quick-bar="run-chart"] [data-action="layers"]').click()
  const layers = page.locator('[data-panel-kind="layers"]')
  await expect(layers.locator('[data-layer]')).toHaveCount(5)

  // beside, not over: the chart it arranges stays on show, the panel to its right
  await expect(chart).toBeVisible()
  const chartBox = (await chartPanel.boundingBox())!
  const layersBox = (await layers.boundingBox())!
  expect(layersBox.x).toBeGreaterThanOrEqual(chartBox.x + chartBox.width - 2)

  // and inside its own group, once the layout has settled: narrowed under its quick bar, the group
  // scrolled to bring the focused ≡ Layers button into view, and the chart stood 171 px left of it,
  // over the report (2026-10-28). Read after ten frames, so a shift that comes late is not missed.
  await page.evaluate(() => new Promise<void>(done => {
    let frames = 0
    const tick = (): void => { if (++frames > 10) done(); else requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  }))
  const group = page.locator('.dv-groupview', { has: page.locator('.panel-tab[data-kind="run-chart"]') })
  const settled = (await chartPanel.boundingBox())!
  expect(Math.abs(settled.x - (await group.boundingBox())!.x)).toBeLessThanOrEqual(1)
  expect(await group.evaluate(element => element.scrollLeft)).toBe(0)

  // the trades switched off: the chart draws none of them — and rescales nothing, so the price axis
  // reads the same (operator, on screen 2026-10-27: without the marks the candles stretched)
  const box = (await chart.boundingBox())!
  const axis = { x: box.x + box.width - 50, y: box.y, width: 50, height: box.height - 40 }
  const painted = (): Promise<void> => page.evaluate(() => new Promise<void>(done =>
    requestAnimationFrame(() => requestAnimationFrame(() => done()))))
  await painted()
  const before = await page.screenshot({ clip: axis })
  await layers.locator('[data-layer="trades"] [data-action="show"]').click()
  await expect.poll(async () => await chart.getAttribute('data-drawings')).not.toMatch(/trades:/)
  await painted()
  expect((await page.screenshot({ clip: axis })).equals(before)).toBe(true)
  // the volume stands on a scale of its own: switching it off moves no candle either
  await layers.locator('[data-layer="volume"] [data-action="show"]').click()
  await expect(layers.locator('[data-layer="volume"]')).toHaveAttribute('data-shown', 'false')
  await painted()
  expect((await page.screenshot({ clip: axis })).equals(before)).toBe(true)

  await page.reload()
  await expect(page.locator('[data-panel-kind="layers"] [data-layer="trades"]')).toHaveAttribute('data-shown', 'false')
  await expect(page.locator('[data-panel-kind="layers"] [data-layer="volume"]')).toHaveAttribute('data-shown', 'false')
  await expect.poll(async () => await page.locator('[data-panel-kind="run-chart"] .candle-chart').getAttribute('data-drawings'))
    .toMatch(/levels:\d+ entry-exit:\d+$/)
})

/** Dragged by its grip (operator, 2026-10-28), and never behind the candles and the volume. */
test('a layer is dragged in front of another by its grip, and never past the fixed ones', async ({ page }) => {
  await page.setViewportSize({ width: 2400, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN, units: ['EURGBP_refusals_01'] })
  await page.locator('[data-quick-bar="run-chart"] [data-action="layers"]').click()
  const layers = page.locator('[data-panel-kind="layers"]')
  const order = (): Promise<string> => layers.locator('[data-layer]')
    .evaluateAll(rows => rows.map(row => row.getAttribute('data-layer')).join(','))
  await expect.poll(order).toBe('trades,entry-exit,levels,candles,volume')

  await layers.locator('[data-layer="levels"] .layer-grip')
    .dragTo(layers.locator('[data-layer="trades"] .layer-row'), { targetPosition: { x: 20, y: 2 } })
  await expect.poll(order).toBe('levels,trades,entry-exit,candles,volume')

  await layers.locator('[data-layer="trades"] .layer-grip')
    .dragTo(layers.locator('[data-layer="volume"] .layer-row'), { targetPosition: { x: 20, y: 20 } })
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
  expect(await order()).toBe('levels,trades,entry-exit,candles,volume')
})
