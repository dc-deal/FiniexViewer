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

/**
 * The stem's own breakpoints, in the order the container query applies them.
 *
 * FIVE rungs, and the top one is not a narrow width: measured 2026-09-30, the booking periods
 * drew all fourteen columns at 69 rem in tracks of 22 px and overflowed by 18 px, while the run
 * list gave the set name 112 px for 157 px of text. Both are an ordinary maximised window here.
 */
function tierOf(shellRem: number): number {
  if (shellRem <= 34) return 1
  if (shellRem <= 48) return 2
  if (shellRem <= 62) return 3
  if (shellRem <= 80) return 4
  return 5
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

  expect(state.declared.every(rank => rank >= 1 && rank <= 5), `${where}: a rank out of range`)
    .toBe(true)
  expect(state.tracks, `${where}: tracks`).toBe(survive)
  expect(state.shownHeads, `${where}: visible headings`).toBe(survive)
  expect(state.shownCells, `${where}: visible cells`).toBe(survive)
  return state
}

/**
 * A FIGURE CELL is right-aligned, so it stands under its own right-aligned heading.
 *
 * `figure: true` aligns the HEADING, which the stem owns; the cells come from the caller's slot, so
 * the caller aligns those. Measured 2026-09-30 across every ranked list: three of the four had
 * figure cells sitting up to 172 px left of the heading they belong to — every declaration correct
 * and the geometry not, which is why no unit test saw it.
 *
 * This asserts the DECLARATION rather than the pixels, and that is a correction rather than a
 * shortcut. Three attempts to measure the geometry each disagreed with the screen: `scrollWidth`
 * counts padding differently once a box clips, a Range over right-aligned text reports the line box
 * rather than the ink, and a Range over CLIPPED text reports the text that is not drawn — which
 * made a perfectly placed cell read as 27 px out. A check that cannot be trusted is worse than
 * none, and the property it was chasing is one line of computed style.
 *
 * Either mechanism counts: `text-align: right` on the cell, or a flex row ending at the right,
 * which is how the run list stacks two figures in one cell.
 */
async function expectFiguresRightAligned(page: Page, selector: string): Promise<void> {
  const wrong = await page.locator(selector).first().evaluate(shell => {
    const list = shell.querySelector('.record-list')!
    const heads = [...list.querySelectorAll('.record-head > span')]
    const cells = [...list.querySelector('.record-row')!.children]
    const out: string[] = []
    heads.forEach((head, index) => {
      if (!head.classList.contains('head-figure')) return
      const cell = cells[index] as HTMLElement | undefined
      if (!cell || getComputedStyle(cell).display === 'none') return
      const style = getComputedStyle(cell)
      // three mechanisms, because all three are in use: plain text alignment, a flex ROW ending at
      // the right, and a flex COLUMN whose items are pushed to the right edge — the run list stacks
      // one figure per account currency that way
      const flex = style.display.includes('flex')
      const column = style.flexDirection.startsWith('column')
      const right = style.textAlign === 'right'
        || (flex && !column && style.justifyContent === 'flex-end')
        || (flex && column && style.alignItems === 'flex-end')
      if (!right) {
        out.push(`${head.textContent?.trim()} (text-align: ${style.textAlign})`)
      }
    })
    return out
  })
  expect(wrong, `${selector}: a figure cell is not right-aligned under its heading`).toEqual([])
}

/**
 * A HEADING never overprints its neighbour, and its word is always reachable.
 *
 * `.record-head > span` is `white-space: nowrap`; without an overflow rule a heading wider than its
 * column spilled over the one beside it and the two words overprinted. Measured 2026-10-01:
 * `Win Rate` took 68 px of a 66 px track at 1920 px on the deployment view. The stem clips them now
 * and carries the whole label in a title, which is what this asserts — the clip makes overprinting
 * impossible, the title makes the clip survivable.
 *
 * Whether a heading truncates at all is deliberately NOT asserted here. Every way of measuring that
 * from script disagreed with the screen: `scrollWidth` counts padding differently once a box clips,
 * and a Range over right-aligned text reports the line box rather than the ink. Two of four
 * "truncated" headings were complete on screen. A column that must stay legible says so with a
 * FLOOR in its own track instead — five of the booking periods carry one for exactly this.
 */
async function expectHeadingsReadable(page: Page, selector: string): Promise<void> {
  const heads = await page.locator(selector).first().evaluate(shell => {
    const list = shell.querySelector('.record-list')!
    return ([...list.querySelectorAll('.record-head > span')] as HTMLElement[])
      .filter(head => getComputedStyle(head).display !== 'none')
      .map(head => ({
        label: head.textContent?.trim() ?? '',
        title: head.getAttribute('title') ?? '',
        clipped: getComputedStyle(head).overflow !== 'visible',
      }))
  })

  expect(heads.length, `${selector} draws no heading at all`).toBeGreaterThan(0)
  for (const head of heads) {
    expect(head.title, `${selector}: the heading "${head.label}" carries no title`)
      .toBe(head.label)
    expect(head.clipped, `${selector}: the heading "${head.label}" can overprint its neighbour`)
      .toBe(true)
  }
}

// every list a run view draws, and each one declares its own ranks
const RUN_LISTS = ['.run-list', '.roster-list', '.trade-list', '.periods-list']

/** The panels those lists live in. Closed by default, so each has to be asked for. */
const PANELS = ['Scenarios', 'Trade History', 'Booking Periods']

// 1800 is above the 80rem rung and 1300 is below it — without a width on each side the fifth
// tier is never exercised, and a rung nothing measures is a rung nobody knows is broken
const WIDTHS = [1800, 1300, 1100, 820, 620]

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
  /*
   * By NAME, and each one waited for. Sweeping the bar by index looked equivalent and was not:
   * measured 2026-09-30, three panels read `aria-expanded=false` AFTER the sweep had clicked them,
   * because the clicks landed before the stored layout finished reconciling and it closed them
   * again. The spec then measured two lists of four and reported nothing about the other two.
   */
  for (const name of PANELS) {
    const trigger = page.locator('.panel-trigger', { hasText: name })
    if (await trigger.getAttribute('aria-expanded') === 'false') await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
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

    const measured: string[] = []
    for (const selector of RUN_LISTS) {
      if (!await isDrawn(page, selector)) continue
      await expectRanksHold(page, selector)
      await expectHeadingsReadable(page, selector)
      measured.push(selector)
    }
    // A skipped list reads as a covered one, and that is how two of these four went unmeasured for
    // a while. At a width this wide every one of them is on screen, so a missing one is a finding.
    expect(measured, 'a ranked list was not on screen and so went unmeasured').toEqual(RUN_LISTS)
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

/**
 * A FIGURE CELL stands under its own heading, and only a browser can say whether it does.
 *
 * `figure: true` on a column right-aligns the HEADING; the cells come from the caller's slot, so
 * the second half is the caller's. Measured 2026-09-30, and it was wrong nearly everywhere: three
 * of the four ranked lists had figure cells sitting left of the heading they belong to — by 11 to
 * 172 px, ten columns of ten in the booking periods. A column of figures that does not line up
 * with its own label is not a column, and no unit test can see it: the declaration was right in
 * every case, the geometry was not.
 *
 * The edges compared are the INK's, through a Range over the contents, so a cell's padding does not
 * enter into it. The tolerance is the padding difference between a heading and a cell.
 */
test('every figure cell stands under its own heading', async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1200 })
  await openEverything(page)

  for (const selector of RUN_LISTS) {
    await expectFiguresRightAligned(page, selector)
  }
})
