import { test, expect } from './cdp_fixture'
import { FIXTURE_RUN, LIVE_RUN, mockApi } from './api_mock'
import { FIXTURES_SHOWN, openWith } from './arrangement_seed'

/**
 * The venue account in a real browser (viewer#54): a live session that read its venue shows what the
 * venue held at its start and end in its bundle, and every read on a fold below; a backtest,
 * whose venue is its own book, shows no such section. The capture's balances are neutralised by the
 * capture itself, so no real account stands in it.
 */

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1600, height: 900 })
})

test('a live session shows what the venue held in its bundle, every read one click away', async ({ page }) => {
  await openWith(page, '/', { ...FIXTURES_SHOWN, run: LIVE_RUN })
  const bundle = page.locator('[data-panel-kind="run"]')
  const section = bundle.locator('[data-panel="venue-account"]')
  await expect(section.locator('.venue-table')).toContainText('Open orders at the venue')
  await expect(section.locator('.venue-table')).toContainText('XETH')
  await expect(section.locator('.venue-table')).toContainText('ZUSD')

  const reads = section.locator('details.reads')
  await expect(reads.locator('summary')).toContainText('Every read of the venue (2)')
  await reads.locator('summary').click()
  await expect(reads.locator('.read-list')).toContainText('session start')
  await expect(reads.locator('.read-list')).toContainText('session end')
})

test('a backtest has no venue account', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  const bundle = page.locator('[data-panel-kind="run"]')
  await expect(bundle.locator('[data-panel]').first()).toBeVisible()
  await expect(bundle.locator('[data-panel="venue-account"]')).toHaveCount(0)
})
