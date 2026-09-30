import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AggregatedPortfolioPanel from '@/components/runs/AggregatedPortfolioPanel.vue'
import FigureBlock from '@/components/base/FigureBlock.vue'
import type {
  AggregatedCurrency,
  AggregatedPortfolioReport,
} from '@/types/api/report_types'
import aggregatedFixture from './fixtures/aggregated_portfolio.json'

/**
 * The fold of a run over its scenarios, and the panel's whole discipline is what it LEAVES OUT: the
 * response carries 42 fields per currency on top of a 21-field headline, and almost all of the
 * headline is `run-summary` again — which the Executive Summary already shows.
 */
const REPORT: AggregatedPortfolioReport = aggregatedFixture
const ROW: AggregatedCurrency = REPORT.currencies[0]!

function mountPanel(model: AggregatedPortfolioReport = REPORT) {
  return mount(AggregatedPortfolioPanel, { props: { model } })
}

/** Every figure the panel drew, across its blocks, as label -> value. */
function figures(wrapper: ReturnType<typeof mountPanel>): Record<string, string> {
  const pairs = wrapper.findAllComponents(FigureBlock)
    .flatMap(block => block.props('figures') ?? [])
  return Object.fromEntries(pairs.map(pair => [pair.label, pair.value]))
}

function withRow(changes: Partial<AggregatedCurrency>): AggregatedPortfolioReport {
  return { ...REPORT, currencies: [{ ...ROW, ...changes }] }
}

function withFold(changes: Partial<AggregatedCurrency['combined']>): AggregatedPortfolioReport {
  return withRow({ combined: { ...ROW.combined, ...changes } })
}

describe('AggregatedPortfolioPanel', () => {
  it('names the currency and how many scenarios were folded into it', () => {
    expect(mountPanel().find('.scope').text()).toContain('USD')
    expect(mountPanel().find('.scope').text()).toContain('8 scenarios')
  })

  /**
   * The run-wide cost split. The per-unit version is in the scenario roster's card; this total
   * exists nowhere else, and it is the half of the result a net figure hides.
   */
  describe('what the run paid', () => {
    it('shows the split rather than only the total', () => {
      const shown = figures(mountPanel())
      expect(shown['Spread']).toBe('0.00 USD')
      expect(shown['Commission']).toBe('0.00 USD')
      expect(shown['Swap']).toBe('0.00 USD')
    })

    /** Two zeroes on a forex run are noise; on a spot run they are the whole cost. */
    it('shows the maker and taker halves only where a fee of that kind was charged', () => {
      expect(figures(mountPanel())['Maker / taker']).toBe('0.00 USD / 16.22 USD')
      const none = figures(mountPanel(withFold({ maker_fee: 0, taker_fee: 0 })))
      expect(none['Maker / taker']).toBeUndefined()
    })

    /** A price-unit figure, and it says so rather than wearing a currency it does not have. */
    it('keeps the average spread out of the account currency', () => {
      const pairs = mountPanel().findAllComponents(FigureBlock)
        .flatMap(block => block.props('figures') ?? [])
      const spread = pairs.find(pair => pair.label === 'Avg spread')
      expect(spread?.value).not.toContain('USD')
      expect(spread?.title).toContain('price units')
    })
  })

  describe('the account, and the distinctions a reader gets wrong without it', () => {
    /**
     * `highest_equity` is the highest peak ANY account reached. `max_equity` in the summary belongs
     * to the account that fell DEEPEST, which is a different account — so the two are different
     * numbers about different things, and only this one names where it happened.
     */
    it('tells the highest peak from the deepest account own peak', () => {
      const pairs = mountPanel().findAllComponents(FigureBlock)
        .flatMap(block => block.props('figures') ?? [])
      const peak = pairs.find(pair => pair.label === 'Highest equity')
      expect(peak?.value).toBe('10,004.46 USD')
      expect(peak?.title).toContain('fell deepest')
      expect(figures(mountPanel())['Reached by']).toBe('ETHUSD_blocks_06')
    })

    /** Realised against valued: the two differ by exactly the unrealised movement. */
    it('puts the realised balance beside its own caveat', () => {
      const pairs = mountPanel().findAllComponents(FigureBlock)
        .flatMap(block => block.props('figures') ?? [])
      const balance = pairs.find(pair => pair.label === 'Final balance')
      expect(balance?.value).toBe('79,113.84 USD')
      expect(balance?.title).toContain('Realised only')
    })

    it('carries the balance change as a magnitude and a percentage together', () => {
      expect(figures(mountPanel())['Balance change']).toBe('-886.16 USD (-1.11%)')
    })

    it('shows the averages behind the profit factor, and the direction split', () => {
      const shown = figures(mountPanel())
      expect(shown['Avg win / loss']).toBe('2.16 USD / 0.88 USD')
      expect(shown['Long / short']).toBe('2 / 0')
    })

    /** Undefined rather than zero: a run with no decline has nothing to recover from. */
    it('states an undefined recovery factor as n/a', () => {
      expect(figures(mountPanel())['Recovery factor']).toBe('n/a')
      expect(figures(mountPanel(withFold({ recovery_factor: 2.5 })))['Recovery factor']).toBe('2.50')
    })
  })

  describe('spot holdings', () => {
    /**
     * A spot account is an INVENTORY, so its worth is an estimate: the quote balance plus the base
     * holding valued at a price. The backend says so by serving `last_price` beside it, and the
     * word stays on screen.
     */
    it('says the worth of a spot account is estimated', () => {
      const shown = figures(mountPanel())
      expect(shown['Estimated now']).toBe('79,981.37 USD')
      expect(shown['At the start']).toBe('80,000.00 USD')
      expect(shown['Base asset held']).toBe('yes')
    })

    it('draws no holdings block for a currency that is not spot', () => {
      const shown = figures(mountPanel(withRow({ is_spot: false })))
      expect(shown['Estimated now']).toBeUndefined()
      // and what is not about the account model is unaffected
      expect(shown['Highest equity']).toBe('10,004.46 USD')
    })
  })

  /**
   * A currency holding BOTH account models folds two different kinds of account into one set of
   * figures, and the backend says so itself. Silent otherwise, because one model is the ordinary
   * case and has nothing to caveat.
   */
  describe('a currency that mixes account models', () => {
    it('says the figures fold two models together', () => {
      const text = mountPanel(withRow({ is_mixed: true })).find('.notice').text()
      expect(text).toContain('margin and spot accounts together')
    })

    it('is silent where the currency holds one model', () => {
      expect(mountPanel().find('.notice').exists()).toBe(false)
    })
  })

  /**
   * What the panel deliberately does NOT print, because the Executive Summary already does or
   * another route owns it. Measured field by field on 2026-09-30; this is the guard against the
   * panel quietly growing back into a second copy of the summary.
   */
  describe('what it leaves out', () => {
    it('repeats no figure the executive summary already states', () => {
      const shown = figures(mountPanel())
      for (const label of ['Net P&L', 'Win Rate', 'Profit Factor', 'Max equity', 'Trades']) {
        expect(shown[label]).toBeUndefined()
      }
    })

    /** The pending block is the `pending-orders` route's subject and would pre-empt it. */
    it('shows no pending-order or latency figure', () => {
      const labels = Object.keys(figures(mountPanel())).join(' ').toLowerCase()
      expect(labels).not.toContain('latency')
      expect(labels).not.toContain('pending')
    })

    /** `spot_scenarios[]` is a list of eight rows, not a figure — and the roster names them. */
    it('draws no per-scenario inventory table', () => {
      expect(mountPanel().findAll('.record-row')).toHaveLength(0)
    })
  })

  it('draws a block per account currency', () => {
    const two = {
      ...REPORT,
      currencies: [ROW, { ...ROW, currency: 'JPY' }],
    }
    expect(mountPanel(two).findAll('.aggregate')).toHaveLength(2)
  })
})
