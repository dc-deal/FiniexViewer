import { test, expect } from './cdp_fixture'
import type { Locator, Page } from '@playwright/test'
import { mockApi, FIXTURE_RUN } from './api_mock'
import { openWith } from './arrangement_seed'

/**
 * The frame's two bars (operator, 2026-11-10): the menu bar above the dock chooses, the status bar
 * below it states what the window works against. Short of room each gives it by RANK, measured on
 * the bar itself — the lowest rank takes its short form first, and nothing leaves the window.
 */
test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

/** The scenario of the fixture run with the longest name: the narrowing's name has to shorten. */
const FOCUS = 'EURGBP_refusals_01'

/** The ranks of a bar's entries, and which of them stand short. */
async function ranks(bar: Locator): Promise<{ all: number[], short: number[] }> {
  return bar.evaluate(node => {
    const entries = [...node.querySelectorAll<HTMLElement>('[data-rank]')]
    const rankOf = (entry: HTMLElement): number => Number(entry.dataset['rank'])
    return {
      all: entries.map(rankOf).sort((a, b) => a - b),
      short: entries.filter(entry => entry.hasAttribute('data-short')).map(rankOf).sort((a, b) => a - b),
    }
  })
}

/** Short ones are the lowest ranks, never one above a rank still long. */
function lowestFirst(bar: { all: number[], short: number[] }): void {
  expect(bar.short).toEqual(bar.all.filter(rank => rank <= Math.max(0, ...bar.short)))
}

async function keepsToItself(page: Page, bar: Locator): Promise<void> {
  expect(await bar.evaluate(node => node.scrollWidth <= node.clientWidth + 0.5)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test('the menu bar chooses and the status bar states, every word on show in a wide window', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 900 })
  await openWith(page, '/', { run: FIXTURE_RUN })
  const menu = page.locator('.menu-bar')
  const status = page.locator('.status-bar')
  await expect(menu.locator('.menu-bar-trigger', { hasText: 'Panels' })).toBeVisible()
  await expect(status.locator('.server-name')).toBeVisible()
  await expect(status.locator('.machine-status')).toContainText('CPU')
  await expect(menu.locator('.server-switch, .machine-status, .account-status')).toHaveCount(0)
  // the status bar stands at the bottom of the window, below the dock
  const box = (await status.boundingBox())!
  expect(box.y + box.height).toBeCloseTo(900, 0)
  expect((await ranks(menu)).short).toEqual([])
  expect((await ranks(status)).short).toEqual([])
})

test('a narrow window shortens the entries lowest rank first, and keeps both bars inside it', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 800 })
  await openWith(page, '/', { run: FIXTURE_RUN, units: [FOCUS] })
  const menu = page.locator('.menu-bar')
  const status = page.locator('.status-bar')
  await expect(menu.locator('.narrowed-text')).toHaveText(`Only ${FOCUS}`)
  // since the status bar took the server, the account and the machine, 760 px has room for every word
  await page.waitForTimeout(300)
  lowestFirst(await ranks(menu))
  lowestFirst(await ranks(status))
  await keepsToItself(page, menu)
  await keepsToItself(page, status)

  await page.setViewportSize({ width: 420, height: 800 })
  await expect.poll(async () => (await ranks(menu)).short).toEqual((await ranks(menu)).all)
  lowestFirst(await ranks(status))
  await keepsToItself(page, menu)
  await keepsToItself(page, status)
  // what a short form keeps: the way back from the narrowing, the application menu, the server's name
  await expect(menu.locator('.narrowed-head button', { hasText: 'Show all' })).toBeVisible()
  await expect(menu.locator('.menu-trigger')).toBeVisible()
  expect(await status.locator('.server-name').evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThan(30)

  // at a phone's width the status bar gives up its words too, lowest rank first
  await page.setViewportSize({ width: 340, height: 800 })
  await expect.poll(async () => (await ranks(status)).short.length).toBeGreaterThan(0)
  lowestFirst(await ranks(status))
  await keepsToItself(page, status)

  // and wide again, every word comes back
  await page.setViewportSize({ width: 1800, height: 800 })
  await expect.poll(async () => (await ranks(menu)).short).toEqual([])
  expect((await ranks(status)).short).toEqual([])
})

/** At the bottom of the window there is no room below: a menu or a card of the status bar opens above it. */
test('a menu and a card of the status bar open above it, inside the window', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 })
  await openWith(page, '/', { run: FIXTURE_RUN })
  const trigger = page.locator('.status-bar .server-trigger')
  const triggerBox = (await trigger.boundingBox())!

  await trigger.click()
  const menu = page.locator('.menu-content').filter({ has: page.locator('[data-server]') })
  await expect(menu).toBeVisible()
  const menuBox = (await menu.boundingBox())!
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(triggerBox.y + 0.5)
  expect(menuBox.y).toBeGreaterThanOrEqual(0)
  await page.keyboard.press('Escape')

  const machine = page.locator('.status-bar .machine-status')
  const machineBox = (await machine.boundingBox())!
  await machine.hover()
  const card = page.locator('.hover-card')
  await expect(card).toBeVisible()
  const cardBox = (await card.boundingBox())!
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(machineBox.y + 0.5)
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(1400)
})
