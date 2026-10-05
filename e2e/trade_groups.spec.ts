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
  await expect(page.locator('.trade-history .record-group').first()).toBeVisible()
}

/**
 * Scoped to the panel, and that scope is now load-bearing rather than tidy: `.record-row` is the
 * shared list stem's class, so the run picker's rows carry it too.
 */
function tradeRows(page: Page) {
  return page.locator('.trade-history .record-row')
}

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('past the threshold the groups start closed and a click opens one', async ({ page }) => {
  // one, so the capture's two groups are over it
  await withThreshold(page, 1)
  await openTradeHistory(page)

  const group = page.locator('.trade-history .record-group').first()
  await expect(group.locator('.group-marker')).toHaveText('▸')
  expect(await tradeRows(page).count()).toBe(0)

  await group.click()

  await expect(group.locator('.group-marker')).toHaveText('▾')
  expect(await tradeRows(page).count()).toBeGreaterThan(0)
})

test('below the threshold they start open and a click closes one', async ({ page }) => {
  await withThreshold(page, 99)
  await openTradeHistory(page)

  const group = page.locator('.trade-history .record-group').first()
  await expect(group.locator('.group-marker')).toHaveText('▾')
  const before = await tradeRows(page).count()

  await group.click()

  await expect(group.locator('.group-marker')).toHaveText('▸')
  expect(await tradeRows(page).count()).toBeLessThan(before)
})

/**
 * The group heading must span exactly the columns the list declares — no more, no less.
 *
 * It was nine columns in an eight-column table once (`colspan 6 + 1 + 2`), which stretched the
 * table past its own header and put the scenario name under the wrong column. The stem removes the
 * arithmetic — the heading adopts the list's own tracks through `subgrid` — so what is worth
 * asserting now is that the heading and a row resolve to the SAME grid, measured from the browser
 * rather than counted from markup.
 */
test('the group heading stands on the same columns as the rows beneath it', async ({ page }) => {
  await openTradeHistory(page)

  const columnsOf = (selector: string) => page.locator(selector).first().evaluate(
    element => getComputedStyle(element).gridTemplateColumns
  )

  // The LIST owns the tracks; measured here as used pixel widths, which also catches one that
  // collapsed to nothing. Not the `.record-head`: that is an `<li>` with `display: contents`, so it
  // is no grid at all and resolves to `none` — its cells are items of the list, like every row's.
  // `.trade-list` is the caller's class and now lands on the list's SHELL — the box the container
  // queries measure, since an element cannot query its own width. The grid is the `<ul>` inside it.
  const tracks = (await columnsOf('.trade-history .trade-list .record-list')).split(' ')
  expect(tracks).toHaveLength(9)
  expect(tracks.every(track => parseFloat(track) > 0)).toBe(true)

  // and the heading stands on those same tracks rather than on eight of its own
  const headingColumns = await columnsOf('.trade-history .record-group')
  const rowColumns = await columnsOf('.trade-history .record-row')
  expect(headingColumns).toBe(rowColumns)
  expect(headingColumns.startsWith('subgrid')).toBe(true)
})

/**
 * The third level: a trade's fills. Clicking a trade row opens the executions that opened and
 * closed it — and the sub-list is read-only, because the in-then-out order is the content.
 */
test('a trade opens its fills, and they offer nothing to click', async ({ page }) => {
  await withThreshold(page, 99)
  await openTradeHistory(page)

  await expect(page.locator('.trade-history .fill-list')).toHaveCount(0)

  await tradeRows(page).first().click()

  const fills = page.locator('.trade-history .fill-list').first()
  await expect(fills).toBeVisible()
  await expect(fills.locator('.record-row')).toHaveCount(2)
  await expect(fills.locator('button')).toHaveCount(0)
})
