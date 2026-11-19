import { test, expect } from './cdp_fixture'
import { mockApi, FIXTURE_RUN } from './api_mock'
import { openWith } from './arrangement_seed'

/**
 * Explanations in their three forms (viewer#24): a help card while the pointer rests on an ⓘ, the
 * whole text at a click, and nothing in the layout to put away. What only a browser shows: the card
 * after a real rest of the pointer, and the popover closing on Escape.
 */
test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1600, height: 900 })
})

test('the ⓘ beside the tabs shows a help card at rest and the whole text at a click', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  const mark = page.locator('[data-quick-bar="run"] [data-help]')
  await expect(mark).toBeVisible()

  await mark.hover()
  const card = page.locator('[data-help-card]')
  await expect(card).toBeVisible()
  await expect(card.locator('.help-name')).toHaveText('Sections of a bundle')

  await mark.click()
  const popover = page.locator('[data-help-popover]')
  await expect(popover.locator('[data-help-entry]')).toHaveCount(5)
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
})

test('a section of the bundle carries its ⓘ in its header, and no line stands in the layout to put away', async ({ page }) => {
  await openWith(page, '/', { run: FIXTURE_RUN })
  const header = page.locator('[data-panel="scenario-roster"] .panel-header')
  await expect(header.locator('[data-help]')).toBeVisible()
  await expect(header.locator('[data-help]')).toHaveAttribute('data-help-ids', 'scenario-pick')
  await expect(page.locator('.hint-line')).toHaveCount(0)
})
