import { describe, it, expect } from 'vitest'
import { feeSplit, periodCard, unitTotalCard } from '@/components/runs/booking_period_card'
import type { BookingPeriodRow, BookingPeriodUnitTotal, BookingPeriodsReport } from '@/types/api/report_types'
import type { Figure } from '@/types/figure_types'

import fixture from './fixtures/run_booking_periods.json'
import deploymentFixture from './fixtures/deployment_booking_periods.json'

const REPORT: BookingPeriodsReport = fixture
const PERIOD = REPORT.periods[0] as BookingPeriodRow
// recorded since contract 35, so its periods carry the account's state at each seal
const CARRYING = deploymentFixture.periods as BookingPeriodRow[]
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

    /**
     * Contract 40: a period that could value the account at no point has no band, no final equity
     * and no drawdown — said as absent, never as zero. And every trading day has its row, so a day
     * the run heard nothing from says so in its tick count.
     */
    it('says a band nobody could measure as a dash, and how many ticks the period applied', () => {
      const unvalued = periodCard({ ...PERIOD, min_equity: null, max_equity: null, final_equity: null, max_drawdown: null })
      expect(pair(unvalued.details, 'Equity band')?.value).toBe('—')
      expect(pair(unvalued.details, 'Final equity')?.value).toBe('—')
      expect(pair(unvalued.details, 'Max DD')?.value).toBe('—')
      expect(pair(periodCard({ ...PERIOD, tick_count: 0 }).details, 'Ticks')?.value).toBe('0')
      expect(pair(periodCard({ ...PERIOD, tick_count: null }).details, 'Ticks')?.value).toBe('—')
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

    /**
     * What the period CARRIES beside what it did (contract 35): the account's decline up to its seal,
     * and what was still open then — read from the deployment capture, whose periods hold them.
     */
    it('says what it carries at its seal: the account decline so far, and what was still open', () => {
      const open = CARRYING.find(period => (period.open_position_count ?? 0) > 0)!
      const details = periodCard(open).details
      expect(pair(details, 'Deepest drawdown')?.value).toContain('%')
      expect(pair(details, 'Deepest drawdown')?.title).toContain('up to the period')
      expect(pair(details, 'Still open')?.value).toBe(String(open.open_position_count))
      expect(pair(details, 'Unrealized')?.value).toContain(open.currency)
    })

    /** Nothing open is nothing said; the decline it carries stands all the same. */
    it('says nothing of open positions where none was open at the seal', () => {
      const flat = CARRYING.find(period => period.open_position_count === 0)!
      const details = periodCard(flat).details
      expect(pair(details, 'Deepest drawdown')).toBeDefined()
      expect(pair(details, 'Still open')).toBeUndefined()
      expect(pair(details, 'Unrealized')).toBeUndefined()
    })

    /** A run recorded before contract 35 serves the four null on its own route: nothing is said. */
    it('says nothing it carries where the record does not hold it', () => {
      const labels = periodCard(PERIOD).details.map(figure => figure.label)
      expect(PERIOD.account_max_drawdown).toBeNull()
      expect(labels).not.toContain('Deepest drawdown')
      expect(labels).not.toContain('Still open')
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
      const account = pair(details, 'Deepest drawdown')!
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
