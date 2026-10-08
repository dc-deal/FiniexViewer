import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import BookingPeriodsPanel from '@/components/runs/BookingPeriodsPanel.vue'
import { provideTestSelection } from './scenario_selection_harness'
import BookingPeriodTable from '@/components/runs/BookingPeriodTable.vue'
import BookingPeriodTimeline from '@/components/runs/BookingPeriodTimeline.vue'
import type { BookingPeriodRow, BookingPeriodsReport } from '@/types/api/report_types'
import type { DeploymentSessionRow } from '@/types/api/deployment_types'

import fixture from './fixtures/run_booking_periods.json'

const BASE: BookingPeriodsReport = fixture

function report(overrides: Partial<BookingPeriodsReport> = {}): BookingPeriodsReport {
  return { ...BASE, ...overrides }
}

function period(overrides: Partial<BookingPeriodRow> = {}): BookingPeriodRow {
  return { ...(BASE.periods[0] as BookingPeriodRow), ...overrides }
}

function mountPanel(model: BookingPeriodsReport) {
  return mount(BookingPeriodsPanel, {
    props: { model },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

/** The panel narrowed to one scenario, the way RunsView narrows it. */
function mountNarrowed(model: BookingPeriodsReport, unit: string[]) {
  const Host = defineComponent({
    setup() {
      provideTestSelection(unit)
      return () => h(BookingPeriodsPanel, { model })
    },
  })
  return mount(Host, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('BookingPeriodsPanel — narrowed to one scenario', () => {
  const MIXED = report({
    periods: [
      period({ unit_name: 'unit_a', period_no: 1 }),
      period({ unit_name: 'unit_b', period_no: 1 }),
      period({ unit_name: 'unit_a', period_no: 2 }),
    ],
  })

  it('draws only the chosen scenario\'s lanes', () => {
    const wrapper = mountNarrowed(MIXED, ['unit_a'])
    const labels = wrapper.findAll('.lane-label').map(node => node.text())
    expect(labels).toEqual(['unit_a'])
  })

  it('draws every lane again once the narrowing is cleared', () => {
    const wrapper = mountNarrowed(MIXED, [])
    const labels = wrapper.findAll('.lane-label').map(node => node.text())
    expect(labels).toHaveLength(2)
  })

  /**
   * `reconciles` compares the whole run's booked records against the whole run's count — there is
   * no per-unit version of the check. Left unlabelled above one lane it claims to be about that
   * lane, which is exactly the misreading the narrowing exists to prevent.
   */
  // only where there IS a verdict: a check that passed renders nothing, so nothing can mislead
  it('keeps the verdict run-wide, and says so', () => {
    const wrapper = mountNarrowed({ ...MIXED, reconciles: false }, ['unit_a'])
    expect(wrapper.find('.verdict-scope').text()).toContain('whole run')
  })

  it('says nothing about scope where nothing is narrowed', () => {
    const wrapper = mountNarrowed(MIXED, [])
    expect(wrapper.find('.verdict-scope').exists()).toBe(false)
    expect(wrapper.find('.footnote .scope').exists()).toBe(false)
  })

  /**
   * The deepest drawdown is taken across EVERY period and the final equity is the account's, so
   * neither can be split per scenario. Left unlabelled under a narrowed chart they read as the
   * chosen scenario's.
   */
  it('marks the footnote figures as the run\'s', () => {
    const wrapper = mountNarrowed(MIXED, ['unit_a'])
    expect(wrapper.find('.footnote .scope').text()).toBe('whole run')
  })

  /**
   * A run that booked no period at all states no figure in its currency, and the backend serves
   * `total_final_equity` as null there. `Intl.NumberFormat` formats null as `0.00` without
   * complaining, so the footnote printed a closing equity nobody reported. Measured 2026-10-01 on
   * `20260924_165923_4d6c2f5f` — one run of 45, which is exactly how long such a figure survives.
   */
  it('leaves out a closing equity the run never reported, rather than printing it as zero', () => {
    const wrapper = mountPanel(report({ total_final_equity: null }))
    const footnote = wrapper.find('.footnote').text()
    expect(footnote).toContain('Deepest period drawdown')
    expect(footnote).not.toContain('Final equity')
  })

  it('draws the lanes of every chosen scenario, not just the first', () => {
    const wrapper = mountNarrowed(MIXED, ['unit_a', 'unit_b'])
    const labels = wrapper.findAll('.lane-label').map(node => node.text())
    expect(labels.sort()).toEqual(['unit_a', 'unit_b'])
  })

  // A scenario the run declared but that booked nothing — a statement about it, not a bad match.
  it('says the chosen scenarios booked nothing, rather than the run', () => {
    const wrapper = mountNarrowed(MIXED, ['unit_c'])
    expect(wrapper.find('.hint').text()).toContain('The chosen scenarios booked no periods')
  })
})

describe('BookingPeriodsPanel — the reconciliation', () => {
  /**
   * A CHECK THAT PASSED SAYS NOTHING. The reconciliation is ours, not the reader's: nobody opens a
   * panel of booking periods asking whether our own arithmetic adds up, and a box is a device for
   * forcing attention that a passing check has no claim on. Where it fails — or could not run —
   * that is the first thing they need.
   */
  it('says nothing at all when the periods account for the run', () => {
    const wrapper = mountPanel(report({ reconciles: true }))
    expect(wrapper.find('.verdict').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('accounted for')
  })

  it('still speaks where the check did not run', () => {
    const wrapper = mountPanel(report({ reconciles: null }))
    expect(wrapper.find('.verdict').classes()).toContain('unchecked')
  })

  it('calls a disagreement a finding and shows both figures', () => {
    const wrapper = mountPanel(report({ reconciles: false, run_net_pnl: -18000, run_total_trades: 4 }))
    expect(wrapper.find('.verdict').classes()).toContain('disagrees')
    expect(wrapper.text()).toContain('Records are missing')
  })

  /**
   * The case the backend found while fixing this: the run reports no figure in this currency, so
   * nothing was compared. A tick there would claim evidence that does not exist.
   */
  it('never shows a tick when the check did not run', () => {
    const wrapper = mountPanel(report({ reconciles: null, run_net_pnl: null, run_total_trades: null }))
    expect(wrapper.text()).toContain('Not checked')
    expect(wrapper.find('.verdict').classes()).not.toContain('agrees')
    expect(wrapper.find('.verdict-mark').text()).not.toBe('✓')
  })

  it('makes an unrun check as loud as a failed one', () => {
    const unchecked = mountPanel(report({ reconciles: null, run_net_pnl: null }))
    const failed = mountPanel(report({ reconciles: false }))
    // both carry the alarming tone; only the wording separates them
    expect(unchecked.find('.verdict-mark').classes()).toEqual(failed.find('.verdict-mark').classes())
  })

  /**
   * The two sides are printed only where they DISAGREE. Where the check passes they are equal by
   * definition and both figures already stand in the Executive Summary above, so repeating them
   * teaches a reader nothing and costs them a line — and the check's own caveat says it compares
   * completeness rather than arithmetic, so a green one carries no figure worth reading twice.
   */
  it('says what the run reported, or that it reported nothing — where they disagree', () => {
    expect(mountPanel(report({ reconciles: false, run_net_pnl: null })).text())
      .toContain('nothing reported')
    expect(mountPanel(report({ reconciles: false, run_net_pnl: -18373.66 })).text())
      .toContain('-18,373.66')
  })

  /**
   * The explanation is within REACH but not on the page: what the check proves is a caveat a
   * reader wants once, and three lines of prose on every run is three lines of noise.
   */
  it('keeps what the check proves on the verdict, not in the page', () => {
    const wrapper = mountPanel(report({ reconciles: false }))
    expect(wrapper.text()).not.toContain('completeness, not arithmetic')
    expect(wrapper.find('.verdict').attributes('title')).toContain('completeness, not arithmetic')
  })

  it('names the other account currencies without repeating the one on show', () => {
    const wrapper = mountPanel(report({ currency: 'JPY', currencies: ['JPY', 'USD'] }))
    const footnote = wrapper.find('.footnote').text()
    expect(footnote).toContain('USD')
    expect(footnote).not.toContain('JPY, ')
  })

  it('stays silent about other currencies when there are none', () => {
    const wrapper = mountPanel(report({ currencies: [] }))
    expect(wrapper.find('.footnote').text()).not.toContain('Other account currencies')
  })
})

describe('BookingPeriodTable', () => {
  function mountTable(periods: BookingPeriodRow[], showRun = false) {
    return mount(BookingPeriodTable, {
      props: { periods, keyFields: ['unit_name', 'period_no'], showRun },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
  }

  /**
   * The sign of a drawdown is not reliable across the archive: stored artifacts keep the negative
   * form the backend has since aligned to a magnitude, and nothing in the payload says which one
   * a row carries. A decline has only one direction, so it is always rendered as a magnitude.
   */
  it('renders a decline as a magnitude whichever sign arrived', () => {
    const negative = mountTable([period({ max_drawdown: -22000.12 })]).text()
    const positive = mountTable([period({ max_drawdown: 22000.12 })]).text()
    expect(negative).toContain('22,000.12')
    expect(negative).not.toContain('-22,000.12')
    expect(negative).toBe(positive)
  })

  /**
   * The balance the period OPENED with — stamped at the source since contract 17, because
   * `final_equity - net_pnl` is not it: `net_pnl` is realised while equity also values what is
   * still open. `null` on a period recorded before the field existed, which is an absence and not
   * an opening of zero; measured, 4 of 8 deployment periods have none.
   */
  it('states what the period opened with, and says so where nothing was recorded', () => {
    expect(mountTable([period({ opening_equity: 9_500 })]).text()).toContain('9,500.00')
    expect(mountTable([period({ opening_equity: null })]).text()).toContain('n/a')
  })

  /**
   * Three more columns on a table that already carries fourteen would cost more than they tell,
   * so the split rides in the title of the fee.
   *
   * The numbers are the SERVED arithmetic and not a convenient sum: `total_fees` is commission plus
   * swap, and the spread is a cost beside it rather than a third term. Measured 2026-10-08 over
   * 1,044 booking periods — the two-term identity held on all of them. This case carried
   * `total_fees: 14.04` for 9.04 + 1.00 + 4.00 until then, a shape the API never serves.
   */
  it('keeps the fee breakdown one hover from the fee', () => {
    const wrapper = mountTable([period({
      total_fees: 10.04, commission_cost: 9.04, swap_cost: 1.0, spread_cost: 4.0,
    })])
    // by POSITION, not by "the first cell with a title": four cells carry one now, because at this
    // width the unit name, both stamps and the equity band all truncate
    const labels = wrapper.findAll('.record-head > span').map(node => node.text())
    const fees = wrapper.find('.record-row').findAll(':scope > span')[labels.indexOf('Fees')]!
    expect(fees.text()).toContain('10.04')
    expect(fees.attributes('title'))
      .toBe('commission 9.04 · swap 1.00 — spread 4.00 besides, not part of this total')
  })

  it('shows the run column only where the rows span several runs', () => {
    expect(mountTable([period()], false).text()).not.toContain('Run')
    expect(mountTable([period()], true).text()).toContain('Run')
  })

  it('withholds a ratio nobody measured', () => {
    const untraded = mountTable([period({ trade_count: 0, win_rate: 0, profit_factor: 0 })])
    expect(untraded.text()).toContain('n/a')
  })

  /**
   * The table showed eleven of a period's fifteen fields while the hover card showed all of them,
   * so the list under the chart carried less than the thing it was supposed to make comparable.
   * The two serve different questions — one period in detail, versus one field across periods —
   * and the table only answers its own if it has the fields.
   */
  it('carries the equity band and the final equity the card already had', () => {
    const wrapper = mountTable([period({
      min_equity: 9_500, max_equity: 10_250, final_equity: 9_875.5,
    })])
    const headers = wrapper.findAll('.record-head > span').map(node => node.text())
    expect(headers).toContain('Equity band')
    expect(headers).toContain('Final equity')
    const cells = wrapper.find('.record-row').findAll(':scope > span').map(node => node.text())
    expect(cells).toContain('9,500.00 … 10,250.00')
    expect(cells).toContain('9,875.50')
  })

  it('groups the columns by the question they answer', () => {
    const groups = mountTable([period()]).findAll('.record-bands > span').map(n => n.text())
    expect(groups).toEqual(['', 'Period', 'Result', 'Account'])
  })

  /**
   * Four currency codes per row is what pushed this table past the width of its panel, and they
   * all say the same thing. Stated once above it, the cells carry figures only.
   */
  it('states one shared currency once, and drops it from every cell', () => {
    const wrapper = mountTable([
      period({ unit_name: 'a', net_pnl: -1.75 }),
      period({ unit_name: 'b', net_pnl: 4.2 }),
    ])
    expect(wrapper.find('.periods-summary').text()).toContain('figures in USD')
    const cells = wrapper.find('.record-row').findAll(':scope > span').map(node => node.text())
    expect(cells).toContain('-1.75')
    expect(cells.some(cell => cell.includes('USD'))).toBe(false)
  })

  // The single currency per response is the BACKEND's guarantee, not ours to assume.
  it('keeps the code in the cell where the rows do not agree on one', () => {
    const wrapper = mountTable([
      period({ unit_name: 'a', currency: 'USD', net_pnl: -1.75 }),
      period({ unit_name: 'b', currency: 'EUR', net_pnl: 4.2 }),
    ])
    expect(wrapper.find('.periods-summary').text()).not.toContain('figures in')
    // both rows, because the point is that TWO currencies stand side by side
    const cells = wrapper.findAll('.record-row > span').map(node => node.text())
    expect(cells).toContain('-1.75 USD')
    expect(cells).toContain('4.20 EUR')
  })
})

describe('BookingPeriodTimeline', () => {
  function mountTimeline(periods: BookingPeriodRow[], keyFields = ['unit_name', 'period_no']) {
    return mount(BookingPeriodTimeline, { props: { periods, keyFields, order: 'time' } })
  }

  it('gives each unit its own track', () => {
    const wrapper = mountTimeline([
      period({ unit_name: 'alpha' }),
      period({ unit_name: 'beta' }),
    ])
    expect(wrapper.findAll('.lane-row')).toHaveLength(2)
  })

  /**
   * The axis is a CLOCK, not a duration, and the glossary is explicit that `market clock` is not a
   * term: a decision reads the *canonical clock*, and *tick timespan* is the market time a unit
   * processed. Pinned here because the wrong one of those two reads perfectly plausibly.
   */
  it('names the axis with the clock the run actually read', () => {
    const wrapper = mountTimeline([period({ unit_name: 'alpha' })])
    expect(wrapper.text()).toContain('canonical clock')
  })

  it('colours by polarity and leaves a flat result neutral', () => {
    const wrapper = mountTimeline([
      period({ unit_name: 'up', net_pnl: 10 }),
      period({ unit_name: 'down', net_pnl: -10 }),
      period({ unit_name: 'flat', net_pnl: 0 }),
    ])
    const tones = wrapper.findAll('.span').map(bar => bar.classes().join(' '))
    expect(tones.some(tone => tone.includes('positive'))).toBe(true)
    expect(tones.some(tone => tone.includes('negative'))).toBe(true)
    expect(tones.some(tone => tone.includes('flat'))).toBe(true)
  })

  // Periods that share one instant have no extent to scale against; the naive formula divides by
  // zero and writes NaN into the style, which renders as an invisible chart rather than an error.
  it('survives a set of periods with no extent at all', () => {
    const instant = '2026-09-22T12:00:00+00:00'
    const wrapper = mountTimeline([period({ opened_at: instant, closed_at: instant })])
    expect(wrapper.html()).not.toContain('NaN')
    expect(wrapper.findAll('.span')).toHaveLength(1)
  })

  it('drops a period whose timestamps cannot be read rather than guessing one', () => {
    const wrapper = mountTimeline([period(), period({ opened_at: 'not a time' })])
    expect(wrapper.findAll('.span')).toHaveLength(1)
  })

  it('renders nothing at all when there is nothing to place', () => {
    expect(mountTimeline([]).find('.timeline').exists()).toBe(false)
  })
})

/**
 * The defect a screenshot found: across a deployment every session shares one `unit_name`, so
 * laning by the unit stacked four sessions' periods into a single row and only the last bar drawn
 * of each stack stayed visible — eight periods rendered as two.
 */
describe('BookingPeriodTimeline — what a lane is', () => {
  function mountTimeline(periods: BookingPeriodRow[], keyFields = ['unit_name', 'period_no']) {
    return mount(BookingPeriodTimeline, { props: { periods, keyFields, order: 'time' } })
  }

  const sameWindow = { opened_at: '2026-01-24T14:19:46+00:00', closed_at: '2026-01-25T00:00:00+00:00' }

  function sessions(): (BookingPeriodRow & { run_id: string })[] {
    return [
      { ...period({ unit_name: 'bot', period_no: 1, ...sameWindow }), run_id: 'run_a' },
      { ...period({ unit_name: 'bot', period_no: 2, ...sameWindow }), run_id: 'run_b' },
      { ...period({ unit_name: 'bot', period_no: 3, ...sameWindow }), run_id: 'run_c' },
    ]
  }

  /** Sessions that ran one after another on the wall clock, minutes apart. */
  function ledger() {
    return [
      { run_id: 'run_a', started: '2026-09-22T23:10:31Z', ended: '2026-09-22T23:10:57Z' },
      { run_id: 'run_b', started: '2026-09-22T23:11:04Z', ended: '2026-09-22T23:11:30Z' },
      { run_id: 'run_c', started: '2026-09-22T23:11:36Z', ended: '2026-09-22T23:12:02Z' },
    ] as DeploymentSessionRow[]
  }

  it('without sessions it lanes by the unit, which collapses a deployment into one row', () => {
    const wrapper = mount(BookingPeriodTimeline, {
      props: { periods: sessions(), keyFields: ['run_id', 'unit_name', 'period_no'], order: 'time' },
    })
    // the honest failure the screenshot showed: one lane, and the bars on top of each other
    expect(wrapper.findAll('.lane-row')).toHaveLength(1)
  })

  it('with sessions it lanes by the session and gives each its own row', () => {
    const wrapper = mount(BookingPeriodTimeline, {
      props: {
        periods: sessions(),
        keyFields: ['run_id', 'unit_name', 'period_no'],
        sessions: ledger(),
        order: 'time',
      },
    })
    // three session lanes plus the axis row
    expect(wrapper.findAll('.lane-row')).toHaveLength(3)
    expect(wrapper.findAll('.span')).toHaveLength(3)
    expect(wrapper.text()).toContain('run_b')
  })

  /**
   * The correction a screenshot forced. A replayed session compresses ~27 h of market time into
   * ~26 s of wall clock, so the two clocks differ by a factor of thousands. Squeezing the periods
   * into their session's wall-clock window drew a session that does not exist; the stamps are
   * therefore never rescaled, and sessions that replayed one window look ALIKE — which is the
   * finding, not a fault.
   */
  it('never rescales a period into its session, so identical windows draw identical lanes', () => {
    const wrapper = mount(BookingPeriodTimeline, {
      props: {
        periods: sessions(),
        keyFields: ['run_id', 'unit_name', 'period_no'],
        sessions: ledger(),
        order: 'time',
      },
    })
    const lefts = wrapper.findAll('.span').map(node => node.attributes('style'))
    expect(lefts).toHaveLength(3)
    // the three periods share one window, so they share one geometry
    expect(new Set(lefts).size).toBe(1)
  })

  it('takes the axis from the period stamps, not from when the sessions ran', () => {
    const wrapper = mount(BookingPeriodTimeline, {
      props: {
        periods: sessions(),
        keyFields: ['run_id', 'unit_name', 'period_no'],
        sessions: ledger(),
        order: 'time',
      },
    })
    // the ledger window is 2026-09-22; the periods are 2026-01-24/25 and the axis follows them
    const note = wrapper.find('.axis').attributes('title') ?? ''
    expect(note).toContain('2026-01-24')
    expect(note).not.toContain('23:1')
  })

  /**
   * A booking close is NOT a boundary the other lanes share. Units of a run book independently, so
   * a rule drawn across every lane asserted a relationship that does not exist — and on its OWN
   * lane it only repeated the span's edge. Removed 2026-09-27 after the operator spotted it.
   */
  it('draws no rule across the lanes at a booking close', () => {
    const wrapper = mount(BookingPeriodTimeline, {
      props: {
        periods: sessions(),
        keyFields: ['run_id', 'unit_name', 'period_no'],
        sessions: ledger(),
        order: 'time',
      },
    })
    expect(wrapper.findAll('.rule')).toHaveLength(0)
  })

  /**
   * The label of a kept piece drops what both of its ends repeat. Repeating the date is exactly
   * what made two timestamps too wide to sit side by side, so eliding it is not decoration — it is
   * the reason the label fits at all.
   */
  it('names a piece once and drops what both its ends repeat', () => {
    const periods = [
      { ...period({ unit_name: 'bot', period_no: 1 }), run_id: 'run_a',
        opened_at: '2026-02-01T18:00:00+00:00', closed_at: '2026-02-02T00:00:00+00:00' },
      { ...period({ unit_name: 'bot', period_no: 2 }), run_id: 'run_b',
        opened_at: '2026-02-08T18:00:00+00:00', closed_at: '2026-02-09T00:00:00+00:00' },
    ]
    const wrapper = mount(BookingPeriodTimeline, {
      props: {
        periods,
        keyFields: ['run_id', 'unit_name', 'period_no'],
        order: 'time',
        sessions: [
          { run_id: 'run_a', started: '2026-02-01T18:00:00Z', ended: '2026-02-02T00:00:00Z' },
          { run_id: 'run_b', started: '2026-02-08T18:00:00Z', ended: '2026-02-09T00:00:00Z' },
        ] as DeploymentSessionRow[],
      },
    })
    const ticks = wrapper.findAll('.tick').map(node => node.text())
    // a week apart, so the axis breaks and each piece carries its own range
    expect(ticks).toHaveLength(2)
    // the year is the same on both ends of a piece and says nothing, so it goes
    expect(ticks[0]).toBe('02-01 18:00:00Z → 02-02 00:00:00Z')
    expect(wrapper.find('.gap-label').text()).toContain('idle')
  })

  it('says which clock the axis carries, and it differs per scope', () => {
    const run = mountTimeline([period()])
    const deployment = mount(BookingPeriodTimeline, {
      props: {
        periods: sessions(),
        keyFields: ['run_id', 'unit_name', 'period_no'],
        sessions: ledger(),
        order: 'time',
      },
    })
    expect(run.find('.axis').attributes('title')).toContain('the canonical clock')
    // both scopes carry the canonical clock; only the deployment note explains the look-alike lanes
    expect(deployment.find('.axis').attributes('title')).toContain('replayed one window')
  })

  // '#' is the session number in the table beside the chart; one glyph for two counters reads as
  // one counter, which is what made the numbering look broken.
  it('spells out the period rather than borrowing the session glyph', () => {
    const wrapper = mountTimeline([period({ period_no: 4 })])
    expect(wrapper.find('.span-label').text()).toBe('period 4')
  })

})

/**
 * A scenario set is often a set of time SLICES. Measured on one: 13 scenarios, each exactly 60
 * minutes, scattered over 35 days — 13 hours drawn against 830 hours of nothing. The order the
 * backend returns them in (by name) then scatters the bars and the eye has nothing to follow.
 */
describe('BookingPeriodTimeline — many short slices', () => {
  const HOUR = 3600_000

  /** Three one-hour slices whose NAME order is the reverse of their TIME order. */
  function slices(): (BookingPeriodRow & { run_id: string })[] {
    return [
      {
        ...period({ unit_name: 'zeta', period_no: 1 }),
        run_id: 'r1',
        opened_at: new Date(0).toISOString(),
        closed_at: new Date(HOUR).toISOString(),
      },
      {
        ...period({ unit_name: 'mid', period_no: 1 }),
        run_id: 'r2',
        opened_at: new Date(200 * HOUR).toISOString(),
        closed_at: new Date(201 * HOUR).toISOString(),
      },
      {
        ...period({ unit_name: 'alpha', period_no: 1 }),
        run_id: 'r3',
        opened_at: new Date(400 * HOUR).toISOString(),
        closed_at: new Date(401 * HOUR).toISOString(),
      },
    ]
  }

  function mountSlices() {
    return mount(BookingPeriodTimeline, {
      props: { periods: slices(), keyFields: ['unit_name', 'period_no'], order: 'time' },
    })
  }

  it('orders the lanes by start time, so the bars form a diagonal', () => {
    const labels = mountSlices().findAll('.lane-label').map(node => node.text())
    expect(labels).toEqual(['zeta', 'mid', 'alpha'])
  })

  /**
   * Two units CAN open at the same instant — measured on a real walk-forward set, one pair equal
   * to the millisecond — and the order then came from whatever sequence the response carried. The
   * name settles it, so the same run draws the same chart twice. An exact tie only: a millisecond
   * apart is a real difference, and a tolerance would be a rule nobody stated.
   */
  it('settles an exact tie by name, so the same run draws the same chart twice', () => {
    const together = (unit: string) => ({
      ...period({ unit_name: unit, period_no: 1 }),
      opened_at: new Date(5 * HOUR).toISOString(),
      closed_at: new Date(6 * HOUR).toISOString(),
    })
    const wrapper = mount(BookingPeriodTimeline, {
      props: {
        periods: [together('GBPUSD'), together('EURUSD'), together('AUDUSD')],
        keyFields: ['unit_name', 'period_no'],
        order: 'time',
      },
    })
    expect(wrapper.findAll('.lane-label').map(node => node.text()))
      .toEqual(['AUDUSD', 'EURUSD', 'GBPUSD'])
  })

  it('leaves a millisecond of difference as a difference', () => {
    const at = (unit: string, ms: number) => ({
      ...period({ unit_name: unit, period_no: 1 }),
      opened_at: new Date(5 * HOUR + ms).toISOString(),
      closed_at: new Date(6 * HOUR).toISOString(),
    })
    const wrapper = mount(BookingPeriodTimeline, {
      props: {
        periods: [at('EURUSD', 1), at('GBPUSD', 0)],
        keyFields: ['unit_name', 'period_no'],
        order: 'time',
      },
    })
    expect(wrapper.findAll('.lane-label').map(node => node.text()))
      .toEqual(['GBPUSD', 'EURUSD'])
  })

  it('orders them by name when asked to', () => {
    const wrapper = mount(BookingPeriodTimeline, {
      props: { periods: slices(), keyFields: ['unit_name', 'period_no'], order: 'name' },
    })
    expect(wrapper.findAll('.lane-label').map(node => node.text()))
      .toEqual(['alpha', 'mid', 'zeta'])
  })

  /**
   * The control reports the choice instead of keeping it: the TABLE under the chart has to follow
   * the same order, and two orders one above the other means the reader finds every row twice.
   */
  it('reports a change of order rather than owning it', async () => {
    const wrapper = mountSlices()
    await wrapper.findAll('.order-control .app-button')[1]?.trigger('click')
    expect(wrapper.emitted('update:order')).toEqual([['name']])
  })

  it('offers no ordering where there is only one lane to order', () => {
    const wrapper = mount(BookingPeriodTimeline, {
      props: { periods: [period()], keyFields: ['unit_name', 'period_no'], order: 'time' },
    })
    expect(wrapper.find('.order-control').exists()).toBe(false)
  })

  /**
   * Above a handful of removals, a caption per gap plus a range per piece puts 25 labels in one
   * width. The geometry stays; the labels are summarised — and summarised is not dropped, so the
   * caption says how many and how much.
   */
  it('summarises the removals once there are too many to name', () => {
    const many = Array.from({ length: 6 }, (_, index) => ({
      ...period({ unit_name: `unit_${index}`, period_no: 1 }),
      run_id: `r${index}`,
      opened_at: new Date(index * 300 * HOUR).toISOString(),
      closed_at: new Date(index * 300 * HOUR + HOUR).toISOString(),
    }))
    const wrapper = mount(BookingPeriodTimeline, {
      props: { periods: many, keyFields: ['unit_name', 'period_no'], order: 'time' },
    })
    const summary = wrapper.find('.gap-label.summary')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('breaks')
    expect(summary.text()).toContain('idle removed')
    // and only the two ends of the scale remain as ticks
    expect(wrapper.findAll('.tick')).toHaveLength(2)
  })

  it('still names each removal where there are few enough to read', () => {
    const wrapper = mountSlices()
    expect(wrapper.find('.gap-label.summary').exists()).toBe(false)
    expect(wrapper.findAll('.gap-label').length).toBeGreaterThan(0)
  })
})
