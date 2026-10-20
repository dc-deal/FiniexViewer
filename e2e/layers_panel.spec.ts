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
  await expect(layers.locator('[data-layer]')).toHaveCount(3)

  // beside, not over: the chart it arranges stays on show, the panel to its right
  await expect(chart).toBeVisible()
  const chartBox = (await chartPanel.boundingBox())!
  const layersBox = (await layers.boundingBox())!
  expect(layersBox.x).toBeGreaterThanOrEqual(chartBox.x + chartBox.width - 2)

  // the trades switched off: the chart's host is not handed them at all
  await layers.locator('[data-layer="trades"] [data-action="show"]').click()
  await expect.poll(async () => await chart.getAttribute('data-drawings')).not.toMatch(/trades:/)

  await page.reload()
  await expect(page.locator('[data-panel-kind="layers"] [data-layer="trades"]')).toHaveAttribute('data-shown', 'false')
  await expect.poll(async () => await page.locator('[data-panel-kind="run-chart"] .candle-chart').getAttribute('data-drawings'))
    .toMatch(/levels:\d+ entry-exit:\d+$/)
})
