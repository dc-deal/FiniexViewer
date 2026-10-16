import { test, expect } from './cdp_fixture'
import { mockApi } from './api_mock'

/**
 * A list caps its height against the VIEW it sits in, never against the browser window.
 *
 * The run and deployment views are CSS size containers and their lists measure `max-height` in
 * `cqh`. jsdom evaluates no CSS at all, so this is the only tier that can see whether a list still
 * ends inside its view — the defect being the one reported on screen 2026-10-10, where the last
 * rows sat under the view's hidden overflow and could not be reached. Once views become docked
 * panels that share the screen, a short view is the ordinary case rather than a small window.
 */

/**
 * The case that matters is a view SMALLER than the window — a panel sharing the screen — so the
 * view is given half the height here. A full-height view cannot tell the two measures apart: the
 * budget around the list holds more slack than the 41 px between window and view, so a list sized
 * against the window still ended inside it. Measured 2026-10-12 — the first version of this test
 * stayed green with the size container removed, and only the half-height view turns it red.
 */
test('the run list ends inside a view half the height of the window', async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 800 })
  await mockApi(page)
  await page.goto('/')
  await page.addStyleTag({ content: '.runs-view { height: 50% !important; }' })
  const list = page.locator('.run-list')
  await list.waitFor()

  // the list is long enough to hit its cap, or this would compare a short list with nothing
  const overflows = await list.evaluate(element => element.scrollHeight > element.clientHeight)
  expect(overflows).toBe(true)

  const listBox = await list.boundingBox()
  const viewBox = await page.locator('.runs-view').boundingBox()
  expect(listBox).not.toBeNull()
  expect(viewBox).not.toBeNull()
  expect(listBox!.y + listBox!.height).toBeLessThanOrEqual(viewBox!.y + viewBox!.height + 1)
})

/**
 * The list takes the view minus what stands around it — and in a very short view that subtraction
 * alone leaves less than one row. It keeps at least a third of the view.
 */
test('the run list keeps at least a row in a very short window', async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 240 })
  await mockApi(page)
  await page.goto('/')
  const list = page.locator('.run-list')
  await list.waitFor()

  const height = await list.evaluate(element => element.clientHeight)
  const row = await page.locator('.run-list .record-row, .run-list .record-group').first()
    .evaluate(element => element.getBoundingClientRect().height)
  expect(height).toBeGreaterThanOrEqual(row)
})

/**
 * The run list takes the REST of its panel, whatever stands above it. Its cap was the view minus a
 * fixed 11.5 rem for the hint line and the facet bar, so with the hint dismissed or the bar on one
 * line that reserve stood empty below the last row — seen on screen 2026-10-16, about 140 px of it.
 */
test('the run list reaches the bottom of its panel once the hint is dismissed', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('hints.v1', JSON.stringify({ version: 1, banned: ['facet-bar'] }))
  })
  await page.setViewportSize({ width: 1300, height: 800 })
  await mockApi(page)
  await page.goto('/')
  const list = page.locator('.run-list')
  await list.waitFor()

  // long enough to scroll, or a short list would end early for the right reason
  expect(await list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  const view = page.locator('.runs-view')
  const padding = await view.evaluate(element => parseFloat(getComputedStyle(element).paddingBottom))
  const listBox = (await list.boundingBox())!
  const viewBox = (await view.boundingBox())!
  expect(viewBox.y + viewBox.height - padding - (listBox.y + listBox.height)).toBeLessThanOrEqual(1)
})
