import type { Page } from '@playwright/test'
import { test, expect } from './cdp_fixture'
import { mockApi, FIXTURE_RUN } from './api_mock'

/**
 * Opening and closing a scenario's trades in the trade list.
 *
 * Past a threshold the individual unit recedes: the group header states the name and the totals,
 * and the rows wait to be asked for. A forty-scenario run is otherwise a list nobody reads. Below
 * the threshold the groups start OPEN, because there is nothing to protect the reader from.
 *
 * Both regimes are exercised, and the threshold is set from the test rather than assumed: the
 * capture holds two groups and the default is six, so a spec that did not set it would only ever
 * measure the open case. That is exactly how the closed one went unchecked while the operator was
 * looking straight at it.
 */
async function withThreshold(page: Page, threshold: number): Promise<void> {
  await page.addInitScript(value => {
    window.localStorage.setItem('settings.v1', JSON.stringify({
      version: 1, theme: 'dark', laneOrder: 'time', scenarioThreshold: value, tradeRowCap: 500,
    }))
  }, threshold)
}

async function openTradeHistory(page: Page): Promise<void> {
  await page.goto(`/runs?run=${FIXTURE_RUN}`)
  await page.locator('.panel-trigger', { hasText: 'Trade History' }).click()
  await expect(page.locator('.trade-history tr.group').first()).toBeVisible()
}

/** Scoped to the panel: other panels on the page have tables of their own. */
function tradeRows(page: Page) {
  return page.locator('.trade-history tbody tr:not(.group)')
}

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('past the threshold the groups start closed and a click opens one', async ({ page }) => {
  // one, so the capture's two groups are over it
  await withThreshold(page, 1)
  await openTradeHistory(page)

  const group = page.locator('.trade-history tr.group').first()
  await expect(group.locator('.group-marker')).toHaveText('▸')
  expect(await tradeRows(page).count()).toBe(0)

  await group.click()

  await expect(group.locator('.group-marker')).toHaveText('▾')
  expect(await tradeRows(page).count()).toBeGreaterThan(0)
})

test('below the threshold they start open and a click closes one', async ({ page }) => {
  await withThreshold(page, 99)
  await openTradeHistory(page)

  const group = page.locator('.trade-history tr.group').first()
  await expect(group.locator('.group-marker')).toHaveText('▾')
  const before = await tradeRows(page).count()

  await group.click()

  await expect(group.locator('.group-marker')).toHaveText('▸')
  expect(await tradeRows(page).count()).toBeLessThan(before)
})

/**
 * The group row must not be wider than the table it is in. It was nine columns in an eight-column
 * table (`colspan 6 + 1 + 2`), which stretched the table past its own header and put the scenario
 * name under the wrong column.
 */
test('the group row spans exactly the table it is in', async ({ page }) => {
  await openTradeHistory(page)

  const headers = await page.locator('.trade-history thead th').count()
  const spans = await page.locator('.trade-history tr.group').first().locator('td').evaluateAll(
    cells => cells.reduce((sum, cell) => sum + ((cell as HTMLTableCellElement).colSpan || 1), 0)
  )
  expect(spans).toBe(headers)
})
