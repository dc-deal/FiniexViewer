import type { Page } from '@playwright/test'
import { test, expect } from './cdp_fixture'
import { mockApi, FIXTURE_RUN } from './api_mock'
import { openWith, showPanel, FIXTURES_SHOWN } from './arrangement_seed'

/**
 * *Show in list* (viewer#42): the run bundle leads back to the chosen run's row in the run list —
 * the list to the front, the row centred and marked for a moment — and is not offered where the
 * list already shows that row. Only a browser scrolls, lays out a panel a frame late and measures
 * what stands in a view.
 */
test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

const chosenRow = (page: Page) => page.locator('.run-list .record-row.picked:not(.record-unseen)')

async function scrollListAway(page: Page): Promise<void> {
  await page.locator('.run-list').evaluate(list => { list.scrollTop = list.scrollHeight })
}

test('Show in list brings the run list forward with the chosen row in view, marked a moment', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN, ...FIXTURES_SHOWN })
  await expect(page.locator('[data-panel-kind="run"] .panel-column')).toBeVisible()

  await page.locator('.show-in-list').click()
  await expect(page.locator('[data-panel-kind="runs"]')).toBeVisible()
  await expect(chosenRow(page)).toBeInViewport()
  await expect(chosenRow(page)).toHaveClass(/flash/)
  await expect(chosenRow(page)).not.toHaveClass(/flash/, { timeout: 3000 })

  // away from it, and back: the row is found again, and only the list scrolled, never its view
  await scrollListAway(page)
  await expect(chosenRow(page)).not.toBeInViewport()
  await showPanel(page, 'Run bundle')
  await page.locator('.show-in-list').click()
  await expect(chosenRow(page)).toBeInViewport()
  expect(await page.locator('.runs-view').evaluate(view => view.scrollTop)).toBe(0)
})

test('Show in list is not offered while the run list beside shows the chosen row', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN, ...FIXTURES_SHOWN })
  await expect(page.locator('[data-panel-kind="run"] .panel-column')).toBeVisible()

  // the run list docked along the bottom of the dock, so the bundle and the list stand together
  const dock = (await page.locator('.panel-dock').boundingBox())!
  const tab = page.locator('.dv-tab', { has: page.locator('.panel-tab[data-kind="runs"]') })
  const from = (await tab.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(dock.x + dock.width / 2, dock.y + dock.height - 60, { steps: 6 })
  await page.mouse.move(dock.x + dock.width / 2, dock.y + dock.height - 4, { steps: 4 })
  await page.mouse.move(dock.x + dock.width / 2 + 1, dock.y + dock.height - 4)
  await page.mouse.up()
  await expect(page.locator('[data-panel-kind="runs"]')).toBeVisible()
  await expect(page.locator('[data-panel-kind="run"]')).toBeVisible()

  // with the row out of the list's view the way to it is offered, and once there it is not
  await scrollListAway(page)
  await expect(page.locator('.show-in-list')).not.toHaveClass(/needless/)
  await page.locator('.show-in-list').click()
  await expect(chosenRow(page)).toBeInViewport()
  await expect(page.locator('.show-in-list')).toHaveClass(/needless/)
})
