import type { Page } from '@playwright/test'
import { test, expect } from './cdp_fixture'
import { mockApi, FIXTURE_DEPLOYMENT } from './api_mock'
import { expectHeadingsReadable } from './list_geometry'

/**
 * The LEDGER view, which had no browser coverage at all until 2026-10-01 — `api_mock.ts` served
 * only the run plane, so the deployments page, its picker and its timeline had never been opened by
 * a test. The three captures existed the whole time.
 *
 * What this holds is what jsdom cannot: a real reload of a real URL, and the geometry of a list.
 */

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

async function openLedger(page: Page): Promise<void> {
  await page.goto('/deployments')
  await expect(page.locator('.deployment-list .record-row').first()).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('the picker lists the ledger and choosing one opens its history', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 })
  await openLedger(page)

  // what the select box it replaced could not show: the figures are on the row, before the choice
  const first = page.locator('.deployment-list .record-row').first()
  await expect(first).toContainText('deploy_')
  await expect(first).toContainText('USD')

  await page.locator('.deployment-list .record-row', { hasText: FIXTURE_DEPLOYMENT }).click()

  // the list gets out of the way, and the history it led to is what fills the page
  await expect(page.locator('.picker-chosen')).toContainText(FIXTURE_DEPLOYMENT)
  await expect(page.locator('.sessions-list .record-row').first()).toBeVisible()
})

/**
 * Selection goes in the URL — that is what makes a shared link mean something, and a reload is the
 * one thing jsdom can only approximate.
 */
test('a chosen deployment survives a reload and stays a link', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 })
  await openLedger(page)
  await page.locator('.deployment-list .record-row', { hasText: FIXTURE_DEPLOYMENT }).click()
  await expect(page).toHaveURL(new RegExp(`deployment=${FIXTURE_DEPLOYMENT}`))

  await page.reload()
  await expect(page.locator('.picker-chosen')).toContainText(FIXTURE_DEPLOYMENT)
  await expect(page.locator('.sessions-list .record-row').first()).toBeVisible()
})

test('a link naming a deployment the ledger does not list says so', async ({ page }) => {
  await page.goto('/deployments?deployment=deploy_gone')
  await expect(page.locator('.state-overlay')).toContainText('does not list')
})

/**
 * The same geometry invariant `list_ranks.spec.ts` holds on the run view, applied here because this
 * is the half of the app it never reached: a figure cell stands under its own heading. The edges
 * compared are the INK's, through a Range, so padding does not enter into it.
 */
test('every figure cell stands under its own heading', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 })
  await openLedger(page)
  await page.locator('.deployment-list .record-row', { hasText: FIXTURE_DEPLOYMENT }).click()
  await expect(page.locator('.sessions-list .record-row').first()).toBeVisible()
  await page.locator('details').evaluateAll(
    list => list.forEach(element => element.setAttribute('open', ''))
  )

  for (const selector of ['.sessions-list', '.periods-list']) {
    await expectFiguresRightAligned(page, selector)
    await expectHeadingsReadable(page, selector)
  }
})

/**
 * The axis the operator photographed as `2026-020202801000…` — overlapping full timestamps. It
 * draws natural steps now, and the part every mark shares sits once beside the scale's name.
 */
test('the timeline marks round moments rather than overlapping stamps', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 })
  await openLedger(page)
  await page.locator('.deployment-list .record-row', { hasText: FIXTURE_DEPLOYMENT }).click()
  await expect(page.locator('.timeline').first()).toBeVisible()

  const marks = await page.locator('.timeline .tick').allTextContents()
  expect(marks.length).toBeGreaterThan(1)
  // no seconds anywhere, and nothing carrying a full ISO stamp
  for (const mark of marks) {
    expect(mark).not.toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(mark.length).toBeLessThan(12)
  }

  // and they do not overlap, which is the defect the format replaced
  const boxes = await page.locator('.timeline .tick').evaluateAll(
    list => list.map(element => element.getBoundingClientRect())
      .sort((a, b) => a.left - b.left)
      .map(box => [box.left, box.right] as const)
  )
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index]![0], `mark ${index} overlaps the one before it`)
      .toBeGreaterThanOrEqual(boxes[index - 1]![1] - 1)
  }
})
