import { test, expect } from './cdp_fixture'
import { mockApi, FIXTURE_RUN } from './api_mock'

/**
 * No panel scrolls sideways.
 *
 * `.panel-content` carries `overflow-x: auto`, which is the right safety valve and a poor everyday
 * state: the moment it engages, the panel's leftmost column slides out of view when the reader
 * scrolls, and nothing says it happened. Two defects of exactly that shape reached the screen in
 * one week, and both were found by a person rather than by the suite:
 *
 *   - a worker type 56 characters long pushed the configuration table past its column, hiding the
 *     parameters column entirely behind the scrollbar;
 *   - an axis label at 100 % kept half its LAYOUT box past the chart while a transform pulled it
 *     back visually, so a panel offered 67 px of scrollbar for nothing — and scrolling that
 *     phantom slid the timeline's lane labels away, turning `GBPUSD_blocks_01` into `locks_01`.
 *
 * jsdom cannot see either: both are geometry. This is the cheapest instrument that can.
 *
 * The narrow width is not decoration. A panel's width here is the reader's own arrangement — they
 * drag the seams — so a layout that only holds at a developer's screen width is not a layout.
 */
const WIDTHS = [1400, 900] as const

/** One pixel of slack: a 1 px stem placed at 100 % occupies the pixel the axis ends on. */
const SLACK = 2

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

for (const width of WIDTHS) {
  test(`no panel scrolls sideways at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`/runs?run=${FIXTURE_RUN}`)
    await expect(page.locator('.panel-trigger').first()).toBeVisible()

    const triggers = page.locator('.panel-trigger:not([disabled])')
    const count = await triggers.count()
    for (let index = 0; index < count; index++) {
      const trigger = triggers.nth(index)
      if (await trigger.getAttribute('aria-expanded') === 'false') await trigger.click()
    }
    await expect(page.locator('.panel-content').first()).toBeVisible()

    const overflowing = await page.locator('.panel-content').evaluateAll(
      (nodes, slack) => nodes
        .map(node => {
          const el = node as HTMLElement
          const widest = [...el.querySelectorAll('*')]
            .filter(child => child.scrollWidth > el.clientWidth)
            .map(child => (child as HTMLElement).className.toString().slice(0, 30))
          return {
            panel: el.closest('.panel')?.querySelector('.panel-trigger')?.textContent?.trim(),
            client: el.clientWidth,
            scroll: el.scrollWidth,
            widest: widest.slice(0, 3),
          }
        })
        .filter(entry => entry.scroll > entry.client + slack),
      SLACK
    )
    expect(overflowing, JSON.stringify(overflowing)).toEqual([])
  })
}
