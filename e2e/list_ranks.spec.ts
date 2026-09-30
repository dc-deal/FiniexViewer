import type { Page } from '@playwright/test'
import { test, expect } from './cdp_fixture'
import { mockApi, FIXTURE_RUN } from './api_mock'

/**
 * The columns a ranked list gives up as it narrows — measured in a browser, because nothing else
 * can measure it.
 *
 * A rank works in two halves and neither alone does: the TRACK has to go, or its width stays and
 * spreads the survivors, and the CELL has to go, or a removed track shifts every later cell into
 * the wrong column. Both halves are switched by a CONTAINER query over the list's own shell, since
 * a panel's width is the reader's arrangement rather than the window's.
 *
 * jsdom evaluates no container queries at all, so the unit suites can only assert that each list
 * declares the same rank twice — on the column and on the cell. Whether the browser then ACTS on
 * it is this spec, and it is the only instrument for it.
 */

/** The stem's own breakpoints, in the order the container query applies them. */
function tierOf(shellRem: number): number {
  if (shellRem <= 34) return 1
  if (shellRem <= 48) return 2
  if (shellRem <= 62) return 3
  return 4
}

interface ListState {
  shellRem: number
  tracks: number
  trackList: string
  shownHeads: number
  shownCells: number
  declared: number[]
}

/**
 * What the browser resolved. Read from the shell, because the shell is the box the query measures
 * and the grid is the `<ul>` inside it.
 */
async function measure(page: Page, selector: string): Promise<ListState> {
  return page.locator(selector).first().evaluate(shell => {
    const list = shell.querySelector('.record-list')!
    const heads = [...list.querySelectorAll('.record-head > span')]
    const row = list.querySelector('.record-row')!
    const cells = [...row.children]
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
    const shown = (element: Element) => getComputedStyle(element).display !== 'none'
    return {
      shellRem: shell.getBoundingClientRect().width / rem,
      tracks: getComputedStyle(list).gridTemplateColumns.split(' ').length,
      trackList: getComputedStyle(list).gridTemplateColumns,
      shownHeads: heads.filter(shown).length,
      shownCells: cells.filter(shown).length,
      declared: heads.map(head => Number(head.getAttribute('data-rank'))),
    }
  })
}

/**
 * The invariant, at whatever width the panel happened to resolve to: the number of TRACKS, the
 * number of visible HEADINGS and the number of visible CELLS are all the count of columns whose
 * rank survives this tier. Asserted as a relationship rather than against fixed pixel numbers, so
 * it stays true when the shell chrome around the list changes.
 */
async function expectRanksHold(page: Page, selector: string): Promise<ListState> {
  const state = await measure(page, selector)
  const tier = tierOf(state.shellRem)
  const survive = state.declared.filter(rank => rank <= tier).length
  // the whole measurement in the message: which list, how wide, which ranks it declares. A bare
  // "expected 4, received 5" over four lists says nothing about which one moved.
  const where = `${selector} at ${state.shellRem.toFixed(1)}rem (tier ${tier}), `
    + `ranks [${state.declared.join(',')}] over tracks [${state.trackList}]`

  expect(state.declared.every(rank => rank >= 1 && rank <= 4), `${where}: a rank out of range`)
    .toBe(true)
  expect(state.tracks, `${where}: tracks`).toBe(survive)
  expect(state.shownHeads, `${where}: visible headings`).toBe(survive)
  expect(state.shownCells, `${where}: visible cells`).toBe(survive)
  return state
}

// every list a run view draws, and each one declares its own ranks
const RUN_LISTS = ['.run-list', '.roster-list', '.trade-list', '.periods-list']

const WIDTHS = [1800, 1100, 820, 620]

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

/**
 * Opens every panel so all four lists are on screen at once, which is also the arrangement that
 * makes each panel column narrow enough for the lower tiers to engage.
 *
 * The picker needs asking back: it COLLAPSES to one line once a run is chosen, so a url carrying
 * `?run=` draws no run list at all. That is the picker working, and `Change run` is how a reader
 * gets it back.
 */
async function openEverything(page: Page): Promise<void> {
  await page.goto(`/runs?run=${FIXTURE_RUN}`)
  await expect(page.locator('.panel-trigger').first()).toBeVisible()
  const triggers = page.locator('.panel-trigger:not([disabled])')
  const count = await triggers.count()
  for (let index = 0; index < count; index++) {
    const trigger = triggers.nth(index)
    if (await trigger.getAttribute('aria-expanded') === 'false') await trigger.click()
  }
  await page.locator('.picker-chosen .app-button').click()
  // and every disclosure inside them: the booking-period table lives in a closed `<details>`, and
  // a closed one is not laid out at all — its grid resolves to numbers that mean nothing, which is
  // how the first version of this spec came to report a track count no declaration could produce.
  // Set rather than clicked: `details:not([open])` shifts under the index as each one opens, and
  // whether a disclosure RESPONDS to a click is another spec's subject, not this one's.
  await page.locator('details').evaluateAll(
    list => list.forEach(element => element.setAttribute('open', ''))
  )
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()
}

/** Whether this list is on screen at all. A list nobody laid out has no layout to assert. */
async function isDrawn(page: Page, selector: string): Promise<boolean> {
  return page.locator(`${selector} .record-row`).first().isVisible()
}

for (const width of WIDTHS) {
  test(`tracks and cells agree at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1200 })
    await openEverything(page)

    for (const selector of RUN_LISTS) {
      if (!await isDrawn(page, selector)) continue
      await expectRanksHold(page, selector)
    }
  })
}

/**
 * The point of the whole mechanism: a narrow list is SHORTER than a wide one. Four lists at two
 * widths, and every one of them must actually give something up — a rank nothing uses is a
 * breakpoint that changes nothing, which is worse than no breakpoint because it is believed.
 */
test('every ranked list gives columns up as it narrows', async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1200 })
  await openEverything(page)
  const wide: Record<string, number> = {}
  for (const selector of RUN_LISTS) {
    if (!await isDrawn(page, selector)) continue
    wide[selector] = (await measure(page, selector)).tracks
  }

  await page.setViewportSize({ width: 620, height: 1200 })
  await expect(page.locator('.run-list .record-row').first()).toBeVisible()

  for (const [selector, tracksWide] of Object.entries(wide)) {
    const narrow = await measure(page, selector)
    expect(narrow.tracks, `${selector} keeps every column when narrow`).toBeLessThan(tracksWide)
  }
})

/**
 * And the reason a rank is defensible at all: the figure a column gave up is still on the row, in
 * its card. A column hidden with nowhere else to read it would be a loss rather than a priority.
 */
test('the run list keeps its card at the narrowest tier', async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 1200 })
  await openEverything(page)

  const row = page.locator('.run-list .record-row').first()
  await row.hover()

  const card = page.locator('.hover-card').first()
  await expect(card).toBeVisible()
  // the fields no column carries at any width, let alone this one
  await expect(card).toContainText('Configuration')
  await expect(card).toContainText('Size')
})

/**
 * A panel that scrolls sideways is the defect the ranks exist to remove — the operator photographed
 * exactly that on the run list before it had any. `panel_layout.spec.ts` asserts it for every panel
 * at three widths; this names the two lists that were unranked when it was written.
 */
test('neither the run list nor the trade list scrolls sideways when narrow', async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 1200 })
  await openEverything(page)

  for (const selector of ['.run-list', '.trade-list']) {
    const overflow = await page.locator(selector).first().evaluate(
      element => element.scrollWidth - element.clientWidth
    )
    // two pixels of slack: a sub-pixel track width rounds up, which is not a scrollbar
    expect(overflow, `${selector} overflows by ${overflow} px`).toBeLessThanOrEqual(2)
  }
})
