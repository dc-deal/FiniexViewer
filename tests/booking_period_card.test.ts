import { describe, it, expect } from 'vitest'
import { feeSplit, periodCard, unitTotalCard } from '@/components/runs/booking_period_card'
import type { BookingPeriodRow, BookingPeriodUnitTotal, BookingPeriodsReport } from '@/types/api/report_types'
import type { Figure } from '@/types/figure_types'

import fixture from './fixtures/run_booking_periods.json'

const REPORT: BookingPeriodsReport = fixture
const PERIOD = REPORT.periods[0] as BookingPeriodRow
const TOTAL = REPORT.unit_totals[0] as BookingPeriodUnitTotal

function pair(figures: Figure[], label: string): Figure | undefined {
  return figures.find(figure => figure.label === label)
}

/**
 * The booking periods are FiniexTestingIDE's ledger. A period's card says what the period did; a
 * unit total's card adds what the account carried across the periods — the two declines side by
 * side, which is where a fall across a period boundary shows.
 */
describe('booking_period_card', () => {
  describe('a period', () => {
    it('names its unit and its number, and carries its own figures', () => {
      const card = periodCard(PERIOD)
      expect(card.title).toBe(`${PERIOD.unit_name} · booking period ${PERIOD.period_no}`)
      for (const label of ['Opened', 'Closed', 'Net P&L', 'Max DD', 'Equity band', 'Final equity']) {
        expect(pair(card.details, label), label).toBeDefined()
      }
    })

    /** Stamped at the source since contract 17 — never `final_equity - net_pnl`. */
    it('says an opening it never recorded as n/a', () => {
      expect(pair(periodCard({ ...PERIOD, opening_equity: null }).details, 'Opening')?.value).toBe('n/a')
    })

    /** Across a deployment the run is what tells two periods apart, so it leads. */
    it('names its run first where the rows span several runs', () => {
      expect(periodCard({ ...PERIOD, run_id: 'run_b' }).details[0]).toEqual({ label: 'Run', value: 'run_b' })
      expect(pair(periodCard(PERIOD).details, 'Run')).toBeUndefined()
    })

    it('puts the cost split on its fees', () => {
      expect(pair(periodCard(PERIOD).details, 'Fees')?.title).toContain('besides, not part of this total')
    })
  })

  describe('a unit total', () => {
    /** On 20261007_144351_e167cfa3 one unit's deepest period fell 34.10 while its account fell 66.50. */
    const across: BookingPeriodUnitTotal = {
      ...TOTAL, period_count: 4, deepest_period_drawdown: 34.1, account_max_drawdown: 66.5, account_max_dd_pct: 0.66,
    }

    it('names the unit and how many periods it folds', () => {
      expect(unitTotalCard(across).title).toBe(`${TOTAL.unit_name} · 4 booking periods`)
    })

    it('puts the deepest single period beside the account own decline, each saying which it is', () => {
      const details = unitTotalCard(across).details
      const period = pair(details, 'Deepest period drawdown')!
      const account = pair(details, 'Max drawdown')!
      expect(period.value).toContain('34.10')
      expect(period.title).toContain('within a single period')
      expect(account.value).toContain('66.50')
      expect(account.value).toContain('%')
      expect(account.title).toContain('across a period boundary')
    })

    it('carries the gross halves and says its rates are rebuilt, never averaged', () => {
      const details = unitTotalCard(across).details
      expect(pair(details, 'Gross profit')).toBeDefined()
      expect(pair(details, 'Gross loss')).toBeDefined()
      expect(pair(details, 'Win rate')?.title).toContain('never an average')
    })
  })

  /** One sentence for the table's cell and the card's figure, so the two never word it apart. */
  it('words the cost split with the amounts the caller formats', () => {
    const split = feeSplit({ commission_cost: 1, swap_cost: 2, spread_cost: 3, modelled_spread_cost: null }, value => `<${value}>`)
    expect(split).toBe('commission <1> · swap <2> — spread <3> besides, not part of this total')
    expect(feeSplit({ commission_cost: 1, swap_cost: 2, spread_cost: 3, modelled_spread_cost: 4 }, String))
      .toContain('modelled spread 4')
  })
})
