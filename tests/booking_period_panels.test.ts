import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import BookingPeriodsPanel from '@/components/runs/BookingPeriodsPanel.vue'
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

describe('BookingPeriodsPanel — the reconciliation', () => {
  it('confirms completeness when the periods account for the run', () => {
    const wrapper = mountPanel(report({ reconciles: true }))
    expect(wrapper.find('.verdict').classes()).toContain('agrees')
    expect(wrapper.text()).toContain('accounted for')
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

  it('says what the run reported, or that it reported nothing', () => {
    expect(mountPanel(report({ run_net_pnl: null })).text()).toContain('nothing reported')
    expect(mountPanel(report({ run_net_pnl: -18373.66 })).text()).toContain('-18,373.66')
  })

  // The obvious reading of the check is the wrong one, so the panel states the right one: both
  // figures descend from a single value, which makes this a completeness test, not an audit.
  it('does not let the reader take the check for proof of the arithmetic', () => {
    expect(mountPanel(report({ reconciles: true })).text()).toContain('completeness, not arithmetic')
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
      props: { periods, keyFields: ['unit_name', 'segment_no'], showRun },
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

  it('shows the run column only where the rows span several runs', () => {
    expect(mountTable([period()], false).text()).not.toContain('Run')
    expect(mountTable([period()], true).text()).toContain('Run')
  })

  it('withholds a ratio nobody measured', () => {
    const untraded = mountTable([period({ trade_count: 0, win_rate: 0, profit_factor: 0 })])
    expect(untraded.text()).toContain('n/a')
  })
})

describe('BookingPeriodTimeline', () => {
  function mountTimeline(periods: BookingPeriodRow[], keyFields = ['unit_name', 'segment_no']) {
    return mount(BookingPeriodTimeline, { props: { periods, keyFields } })
  }

  it('gives each unit its own track', () => {
    const wrapper = mountTimeline([
      period({ unit_name: 'alpha' }),
      period({ unit_name: 'beta' }),
    ])
    expect(wrapper.findAll('.lane-row')).toHaveLength(2)
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
  function mountTimeline(periods: BookingPeriodRow[], keyFields = ['unit_name', 'segment_no']) {
    return mount(BookingPeriodTimeline, { props: { periods, keyFields } })
  }

  const sameWindow = { opened_at: '2026-01-24T14:19:46+00:00', closed_at: '2026-01-25T00:00:00+00:00' }

  function sessions(): (BookingPeriodRow & { run_id: string })[] {
    return [
      { ...period({ unit_name: 'bot', segment_no: 1, ...sameWindow }), run_id: 'run_a' },
      { ...period({ unit_name: 'bot', segment_no: 2, ...sameWindow }), run_id: 'run_b' },
      { ...period({ unit_name: 'bot', segment_no: 3, ...sameWindow }), run_id: 'run_c' },
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
      props: { periods: sessions(), keyFields: ['run_id', 'unit_name', 'segment_no'] },
    })
    // the honest failure the screenshot showed: one lane, and the bars on top of each other
    expect(wrapper.findAll('.lane-row')).toHaveLength(1)
  })

  it('with sessions it lanes by the session and gives each its own row', () => {
    const wrapper = mount(BookingPeriodTimeline, {
      props: {
        periods: sessions(),
        keyFields: ['run_id', 'unit_name', 'segment_no'],
        sessions: ledger(),
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
        keyFields: ['run_id', 'unit_name', 'segment_no'],
        sessions: ledger(),
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
        keyFields: ['run_id', 'unit_name', 'segment_no'],
        sessions: ledger(),
      },
    })
    // the ledger window is 2026-09-22; the periods are 2026-01-24/25 and the axis follows them
    const note = wrapper.find('.axis').attributes('title') ?? ''
    expect(note).toContain('2026-01-24')
    expect(note).not.toContain('23:1')
  })

  // A booking close is a boundary every lane shares — the trading-day anchor. Distinct instants
  // only, so four sessions closing at one anchor draw one line rather than four.
  it('rules a line at each distinct booking close, once per instant', () => {
    const wrapper = mount(BookingPeriodTimeline, {
      props: {
        periods: sessions(),
        keyFields: ['run_id', 'unit_name', 'segment_no'],
        sessions: ledger(),
      },
    })
    // three periods, one shared closing instant -> one rule per lane
    const perLane = wrapper.findAll('.lane-row')[0]?.findAll('.rule') ?? []
    expect(perLane).toHaveLength(1)
  })

  /**
   * The label of a kept piece drops what both of its ends repeat. Repeating the date is exactly
   * what made two timestamps too wide to sit side by side, so eliding it is not decoration — it is
   * the reason the label fits at all.
   */
  it('names a piece once and drops what both its ends repeat', () => {
    const periods = [
      { ...period({ unit_name: 'bot', segment_no: 1 }), run_id: 'run_a',
        opened_at: '2026-02-01T18:00:00+00:00', closed_at: '2026-02-02T00:00:00+00:00' },
      { ...period({ unit_name: 'bot', segment_no: 2 }), run_id: 'run_b',
        opened_at: '2026-02-08T18:00:00+00:00', closed_at: '2026-02-09T00:00:00+00:00' },
    ]
    const wrapper = mount(BookingPeriodTimeline, {
      props: {
        periods,
        keyFields: ['run_id', 'unit_name', 'segment_no'],
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
        keyFields: ['run_id', 'unit_name', 'segment_no'],
        sessions: ledger(),
      },
    })
    expect(run.find('.axis').attributes('title')).toContain("the run's own clock")
    // both scopes now carry the run's clock; only the deployment note explains the look-alike lanes
    expect(deployment.find('.axis').attributes('title')).toContain('replayed one window')
  })

  // '#' is the session number in the table beside the chart; one glyph for two counters reads as
  // one counter, which is what made the numbering look broken.
  it('spells out the segment rather than borrowing the session glyph', () => {
    const wrapper = mountTimeline([period({ segment_no: 4 })])
    expect(wrapper.find('.span-label').text()).toBe('seg 4')
  })

})
