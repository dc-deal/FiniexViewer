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

test('a layer explains itself on its name, its row keeps the width, and the whole text stands in its opened row', async ({ page }) => {
  // wide enough for the run chart to stand beside the bundle rather than behind it
  await page.setViewportSize({ width: 1800, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN, units: ['EURGBP_refusals_01'] })
  // the run chart's ⓘ beside its options gives way in a short header, so the unit's name keeps the
  // room: 457 px beside an 1800 px window, about 217 px once the Layers panel stands beside it
  const chartHelp = page.locator('[data-quick-bar="run-chart"] [data-help]')
  await expect(chartHelp).toBeVisible()
  await page.locator('[data-quick-bar="run-chart"] [data-action="layers"]').click()
  const levels = page.locator('[data-panel-kind="layers"] [data-layer="levels"]')
  await expect(levels).toBeVisible()
  await expect(chartHelp).toBeHidden()
  // a mark in every row cut the names to four letters in a narrow panel (2026-11-19)
  await expect(levels.locator('.layer-row [data-help]')).toHaveCount(0)

  await levels.locator('[data-action="open"]').hover()
  const card = page.locator('[data-help-tip="layer-levels"]')
  await expect(card).toBeVisible()
  await expect(card.locator('.help-name')).toHaveText('Levels')

  // opened: the ⓘ in the room the options are indented by, under the row's lever and on the line of
  // the first option — no column of its own to narrow them, no line of its own to cost height
  await levels.locator('[data-action="open"]').click()
  const mark = levels.locator('.layer-options [data-help]')
  await expect(mark).toBeVisible()
  const markBox = (await mark.boundingBox())!
  const leverBox = (await levels.locator('.layer-row [data-action="show"]').boundingBox())!
  const optionBox = (await levels.locator('[data-action="option"]').boundingBox())!
  expect(Math.abs(markBox.x - leverBox.x)).toBeLessThanOrEqual(4)
  expect(markBox.x + markBox.width).toBeLessThanOrEqual(optionBox.x)
  expect(Math.abs((markBox.y + markBox.height / 2) - (optionBox.y + optionBox.height / 2))).toBeLessThanOrEqual(4)
})
