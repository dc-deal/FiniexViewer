import { test, expect } from './cdp_fixture'
import { FIXTURE_DEPLOYMENT, FIXTURE_RUN, LIVE_RUN, STATE_FRAME_RUNS, mockApi } from './api_mock'
import { FIXTURES_SHOWN, openWith } from './arrangement_seed'
import type { Page } from '@playwright/test'

/**
 * One text size everywhere a panel, a dialog or the menu bar draws (2026-11-04): a heading is told
 * by its form — an uppercase label, a rule through the middle — never by a larger size. Measured
 * before: 23 texts of a backtest's bundle at 16 px among 2401 at 13.6 px — the currencies of the
 * executive summary, the run header's list, the latest state's status, the venue account's table
 * — and nobody had chosen any of them: a component that sets no size inherited the body's, and the
 * body's was the larger one.
 *
 * Every text is measured where it is drawn, so a component written tomorrow is held to it too.
 */

interface Sizes {
  body: string
  texts: number
  others: string[]
}

/** Every text the scope draws, beside the body's size; the ones at another size by name. */
async function textSizes(page: Page, scope: string): Promise<Sizes> {
  return page.evaluate(selector => {
    const body = getComputedStyle(document.body).fontSize
    const result = { body, texts: 0, others: [] as string[] }
    for (const root of document.querySelectorAll(selector)) {
      for (const element of root.querySelectorAll('*')) {
        const own = [...element.childNodes]
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent!.trim())
          .join(' ')
          .trim()
        if (!own || !element.getClientRects().length) continue
        result.texts++
        const size = getComputedStyle(element).fontSize
        if (size !== body) {
          result.others.push(`${size} ${element.tagName.toLowerCase()}.${[...element.classList].join('.')} “${own.slice(0, 28)}”`)
        }
      }
    }
    return result
  }, scope)
}

/** Opens every section of the bundles on show, as far as the run carries them. */
async function expandAll(page: Page): Promise<void> {
  for (let round = 0; round < 6; round++) {
    const closed = page.locator('.panel-trigger[data-state="closed"]')
    const count = await closed.count()
    if (!count) return
    for (let index = count - 1; index >= 0; index--) await closed.nth(index).click()
    await page.waitForTimeout(300)
  }
}

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1800, height: 1000 })
})

for (const [label, seed] of [
  ['a backtest', { ...FIXTURES_SHOWN, run: FIXTURE_RUN }],
  ['a live session', { ...FIXTURES_SHOWN, run: LIVE_RUN }],
  ['an ended session', { ...FIXTURES_SHOWN, run: STATE_FRAME_RUNS.ended }],
  ['a deployment', { ...FIXTURES_SHOWN, deployment: FIXTURE_DEPLOYMENT }],
] as const) {
  test(`every text of ${label} stands at one size, every section open`, async ({ page }) => {
    await openWith(page, '/', seed)
    await page.locator('.panel-trigger').first().waitFor()
    await page.waitForTimeout(1500)
    await expandAll(page)
    await page.waitForTimeout(1000)

    const sizes = await textSizes(page, '.panel-dock, .menu-bar')
    expect(sizes.texts).toBeGreaterThan(0)
    expect(sizes.others, `texts not at the body's ${sizes.body}`).toEqual([])
  })
}

test('every text of the settings dialog stands at one size, on every tab', async ({ page }) => {
  await page.goto('/')
  await page.locator('.menu-trigger').click()
  await page.locator('.menu-item', { hasText: 'Settings' }).click()
  const dialog = page.locator('[role="dialog"]')
  await dialog.waitFor()

  const tabs = dialog.locator('[role="tab"]')
  expect(await tabs.count()).toBeGreaterThan(0)
  for (let index = 0; index < await tabs.count(); index++) {
    await tabs.nth(index).click()
    const sizes = await textSizes(page, '[role="dialog"]')
    expect(sizes.texts).toBeGreaterThan(0)
    expect(sizes.others, `texts not at the body's ${sizes.body}`).toEqual([])
  }
})
