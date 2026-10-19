import { test, expect } from './cdp_fixture'
import type { Page } from '@playwright/test'
import { mockApi, fixture, FIXTURE_RUN } from './api_mock'
import { openWith } from './arrangement_seed'

/**
 * The booking periods read as FiniexTestingIDE's ledger (#46): every period row carries the card its
 * bar on the timeline has, and each unit closes with the total the route serves. What only a browser
 * shows: the card at the pointer and on a keyboard focus, from a row that is no control.
 */

interface Captured {
  periods: { unit_name: string, period_no: number, opened_at: string, closed_at: string }[]
  unit_totals: { unit_name: string, period_count: number }[]
}

/**
 * The capture with its first unit booked over TWO periods. Every unit of the fixture run books one,
 * and a unit of one period draws no total — it would repeat its row. The second period is the first
 * one again a day later, and the total says it folds two; the rest of the body stays the capture,
 * the way the mock's fault injection overwrites one field and keeps everything else coherent.
 */
function twoPeriods(): Captured {
  const captured = fixture('run_booking_periods.json') as Captured
  const first = captured.periods[0]!
  const later = (iso: string) => new Date(Date.parse(iso) + 86_400_000).toISOString()
  const second = { ...first, period_no: first.period_no + 1, opened_at: later(first.opened_at), closed_at: later(first.closed_at) }
  return {
    ...captured,
    periods: [first, second, ...captured.periods.slice(1)],
    unit_totals: captured.unit_totals.map(total =>
      total.unit_name === first.unit_name ? { ...total, period_count: 2 } : total),
  }
}

/**
 * The capture with its first unit booked day after day, edge to edge — the shape of a bot tested a
 * year at a time, where the ledger closes a period every day.
 */
function dailyPeriods(days: number): Captured {
  const captured = fixture('run_booking_periods.json') as Captured
  const first = captured.periods[0]!
  const day = (count: number) => new Date(Date.parse(first.opened_at) + count * 86_400_000).toISOString()
  const daily = Array.from({ length: days }, (_, index) => ({
    ...first, period_no: first.period_no + index, opened_at: day(index), closed_at: day(index + 1),
  }))
  return {
    ...captured,
    periods: [...daily, ...captured.periods.slice(1)],
    unit_totals: captured.unit_totals.map(total =>
      total.unit_name === first.unit_name ? { ...total, period_count: days } : total),
  }
}

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  // registered after the mock, so it answers first: Playwright tries the newest route first
  await page.route('**/api/v1/reports/runs/*/booking-periods', route => route.fulfill({ json: twoPeriods() }))
  await page.setViewportSize({ width: 1600, height: 900 })
})

/** The section open in the bundle, and its period list unfolded. */
async function openPeriods(page: Page): Promise<void> {
  await openWith(page, '/', { run: FIXTURE_RUN })
  const trigger = page.locator('.panel-trigger', { hasText: 'Booking periods' })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await page.locator('[data-panel="booking-periods"] .periods-summary').click()
}

test('each unit closes with its total line, and a total says the account own decline on hover', async ({ page }) => {
  await openPeriods(page)
  const list = page.locator('[data-panel="booking-periods"] .periods-list')
  const totals = list.locator('.record-row.unit-total')
  await expect(totals.first()).toBeVisible()
  await expect(totals.first()).toContainText('Σ')
  // only the unit of two periods: a unit of one would repeat its row
  await expect(totals).toHaveCount(1)

  await totals.first().hover()
  const card = page.locator('.hover-card')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Deepest period drawdown')
  await expect(card).toContainText('Deepest drawdown')
})

/**
 * Drawn with their rings, two hundred daily bars lay each under the next one's ring, all but the
 * last, and the lane read as empty. The ring is what only a browser paints: the lane draws edge to
 * edge instead, says so once, and the axis marks the calendar rather than its two bare ends.
 */
test('a lane too dense for its rings draws its periods edge to edge, on an axis of the calendar', async ({ page }) => {
  await page.route('**/api/v1/reports/runs/*/booking-periods', route => route.fulfill({ json: dailyPeriods(200) }))
  await openWith(page, '/', { run: FIXTURE_RUN })
  const trigger = page.locator('.panel-trigger', { hasText: 'Booking periods' })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  const timeline = page.locator('[data-panel="booking-periods"] .booking-timeline')
  await expect(timeline.locator('.lane.dense')).toHaveCount(1)
  await expect(timeline.locator('.dense-note')).toBeVisible()
  const ring = await timeline.locator('.lane.dense .span').first().evaluate(node => getComputedStyle(node).outlineStyle)
  expect(ring).toBe('none')
  await expect(timeline.locator('.tick', { hasText: 'Apr' })).toHaveCount(1)
})

/**
 * Whether the period list is open is the panel's own view, kept in the arrangement: a reload finds
 * it open, and so does the section opened as a panel of its own — one id in both places.
 */
test('the period list stays open across a reload and as a panel of its own', async ({ page }) => {
  await openPeriods(page)
  const list = page.locator('[data-panel="booking-periods"] details.periods')
  await expect(list).toHaveAttribute('open', '')

  await page.reload()
  await expect(list).toHaveAttribute('open', '')

  const header = page.locator('.panel-column .panel-header', { hasText: 'Booking periods' })
  await header.hover()
  await header.locator('[data-action="open-as-panel"]').click()
  await expect(page.locator('[data-panel-kind="report-booking-periods"] details.periods')).toHaveAttribute('open', '')
})

/** A read-only row reachable by the keyboard: the card opens on focus, and a click does nothing. */
test('a period row opens its card on a keyboard focus, and is no control', async ({ page }) => {
  await openPeriods(page)
  const row = page.locator('[data-panel="booking-periods"] .periods-list .record-row.readable:not(.unit-total)').first()
  await expect(row).toBeVisible()
  expect(await row.evaluate(node => node.tagName)).not.toBe('BUTTON')

  await row.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(page.locator('.hover-card')).toContainText('booking period')
})
