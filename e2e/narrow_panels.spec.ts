import { test, expect } from './cdp_fixture'
import type { Page } from '@playwright/test'
import { mockApi, FIXTURE_RUN } from './api_mock'
import { openWith } from './arrangement_seed'

/**
 * What a narrow panel does to the things beside it — measured, because only real geometry shows
 * it. A panel's width here is the reader's own arrangement, so every width is a width some reader
 * has.
 */

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

/** The two scenarios of the fixture run every narrowing here is made of. */
const TWO = ['EURGBP_refusals_01', 'EURGBP_refusals_02']

/** Whether any tab of the dock went into dockview's overflow menu. */
async function tabsOverflow(page: Page): Promise<boolean> {
  return page.locator('.dv-tabs-overflow-dropdown-default').evaluateAll(nodes =>
    nodes.some(node => (node as HTMLElement).offsetParent !== null))
}

/**
 * The quick bar gives way first. Before, the narrowing's whole text was the least it would take, so
 * at this width the tabs beside it went into the overflow menu while the text stood in full. The
 * width is chosen so the four tabs fit beside the bar's mark and button, and not beside its whole
 * text — much narrower, the tabs alone are too wide, and no arrangement keeps them all.
 */
test('the quick bar shortens its text before a tab goes into the overflow menu', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 })
  await openWith(page, '/', { run: FIXTURE_RUN, units: TWO })

  const text = page.locator('[data-quick-bar] .narrowed-text')
  await expect(text).toHaveText('Only 2 scenarios')

  expect(await tabsOverflow(page)).toBe(false)
  // shortened, not gone: the text gave up room, and what it cannot lose is still whole
  expect(await text.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true)
  const header = await page.locator('.dv-tabs-and-actions-container').first().boundingBox()
  const button = await page.locator('[data-quick-bar] button', { hasText: 'Show all' }).boundingBox()
  expect(button!.x + button!.width).toBeLessThanOrEqual(header!.x + header!.width + 0.5)
})

/**
 * The run list's facet bar is ONE line wherever it fits: in a narrow panel it took three and four
 * lines before a single run showed. The facets that do not fit wait behind `+N`; at the narrowest the
 * right-hand group — clear, the count, the sort — takes a second line, and never more.
 */
for (const [width, lines] of [[1400, 1], [700, 1], [420, 2]] as const) {
  test(`the run list's facet bar takes at most ${lines} line${lines > 1 ? 's' : ''} at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await page.goto('/')
    await expect(page.locator('.run-list .record-row').first()).toBeVisible()

    const bar = page.locator('.run-picker .facet-bar')
    const line = (await bar.locator('.facet-trigger').first().boundingBox())!.height
    expect((await bar.boundingBox())!.height).toBeLessThan(line * (lines + 0.5))
  })
}

/**
 * `10,000.00 / USD` on two lines misreads a number. At ~990 px the executive's pairs stood two
 * abreast in columns too narrow for them and the values broke; a value is never cut short either.
 */
for (const width of [1010, 640]) {
  test(`no figure of the executive summary breaks or is cut at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openWith(page, '/', { run: FIXTURE_RUN })

    const figures = page.locator('[data-panel="executive"] .figure')
    await expect(figures.first()).toBeVisible()
    const broken = await figures.evaluateAll(nodes => nodes
      .map(node => {
        const label = node.querySelector('dt')!
        const value = node.querySelector('dd')!
        const oneLine = value.getBoundingClientRect().height <= label.getBoundingClientRect().height + 1
        const whole = value.scrollWidth <= value.clientWidth
        return oneLine && whole ? null : `${label.textContent} ${value.textContent}`
      })
      .filter(entry => entry !== null))
    expect(broken).toEqual([])
  })
}
