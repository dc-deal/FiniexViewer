import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BrokerPanel from '@/components/runs/BrokerPanel.vue'
import FigureBlock from '@/components/base/FigureBlock.vue'
import type { BrokerReport, BrokerUnit } from '@/types/api/report_types'
import brokerFixture from './fixtures/broker.json'

/**
 * The panel that replaced Portfolio. What each account EARNED is the scenario roster's row and its
 * card; what rules it traded UNDER had no home at all, and that question has a wrong answer by
 * default — every other panel puts scenarios from two brokers in one column and sorts them against
 * each other.
 *
 * The fixture is the captured single-broker case, which is also the `margin_mode: 'none'` case. The
 * multi-broker case is built by hand here: no fixture run has two, and the sentence it produces is
 * the whole point of the panel, so it cannot go untested.
 */
const SPOT: BrokerUnit = brokerFixture.units[0] as BrokerUnit

const MARGIN: BrokerUnit = {
  broker_type: 'mt5',
  market_type: 'forex',
  company: 'Vantage International Group Limited',
  server: 'VantageInternational-Demo',
  trade_mode: 'demo',
  leverage: 500,
  margin_mode: 'retail_hedging',
  margin_call_level: 50,
  stopout_level: 20,
  hedging_allowed: true,
  config_hash: 'd42aab69',
  scenarios: ['GBPUSD_window_01', 'USDJPY_window_04'],
  symbols: [{
    symbol: 'GBPUSD',
    volume_min: 0.01,
    volume_max: 100,
    volume_step: 0.01,
    contract_size: 100000,
    tick_size: 0.00001,
    base_currency: 'GBP',
    quote_currency: 'USD',
    swap_long: -1.12,
    swap_short: -0.79,
  }],
}

function report(units: BrokerUnit[]): BrokerReport {
  return { run_id: '20260615_130000', units, key: ['broker_type'] }
}

function mountPanel(model: BrokerReport) {
  return mount(BrokerPanel, { props: { model } })
}

/** The figures of one broker's block, as label -> value. */
function block(wrapper: ReturnType<typeof mountPanel>, index = 0): Record<string, string> {
  const figures = wrapper.findAllComponents(FigureBlock)[index]?.props('figures') ?? []
  return Object.fromEntries(figures.map(figure => [figure.label, figure.value]))
}

describe('BrokerPanel', () => {
  it('draws one block per broker, titled by the key the response declares', () => {
    const wrapper = mountPanel(report([MARGIN, SPOT]))
    const blocks = wrapper.findAllComponents(FigureBlock)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.props('title')).toBe('mt5')
    expect(blocks[1]?.props('title')).toBe('kraken_spot')
  })

  it('states the conditions a scenario traded under', () => {
    const figures = block(mountPanel(report([MARGIN])))
    expect(figures['Market']).toBe('forex')
    expect(figures['Leverage']).toBe('1:500')
    expect(figures['Margin call']).toBe('50.00%')
    expect(figures['Stop out']).toBe('20.00%')
    expect(figures['Hedging']).toBe('allowed')
    expect(figures['Account']).toBe('demo')
  })

  /**
   * A broker at leverage 1 is not REQUIRED to state any of the three margin fields — that is the
   * backend's own condition (`ide_docs/broker_config_guide.md`: "If leverage > 1"), so what arrives
   * there is a default rather than a measurement. The captured spot broker reads `margin_mode:
   * 'none'` with both levels at `0.0`, and "margin call at 0.00%" would say the OPPOSITE of what is
   * true: that the account is called immediately, rather than that it can never be called.
   *
   * Gating on the MODE would have worked on this data and been the wrong rule.
   */
  it('prints nothing about margin where the backend does not require it', () => {
    const figures = block(mountPanel(report([SPOT])))
    expect(figures['Margin mode']).toBeUndefined()
    expect(figures['Margin call']).toBeUndefined()
    expect(figures['Stop out']).toBeUndefined()
    // and the leverage is still stated, because 1:1 is a fact rather than an absence
    expect(figures['Leverage']).toBe('1:1')
  })

  /** And a defaulted `none` at leverage 1 never reaches the difference sentence either. */
  it('prints all three together where leverage makes them required', () => {
    const figures = block(mountPanel(report([MARGIN])))
    expect(figures['Margin mode']).toBe('retail_hedging')
    expect(figures['Margin call']).toBe('50.00%')
    expect(figures['Stop out']).toBe('20.00%')
  })

  it('names how many scenarios used a broker, and which, one hover away', () => {
    const figures = mountPanel(report([MARGIN])).findAllComponents(FigureBlock)[0]
      ?.props('figures') ?? []
    const scenarios = figures.find(figure => figure.label === 'Scenarios')
    expect(scenarios?.value).toBe('2')
    expect(scenarios?.title).toContain('USDJPY_window_04')
  })

  describe('the sentence that is the point of the panel', () => {
    /**
     * Two stored runs put forex at 1:500 with hedging beside crypto at 1:1 with none. A drawdown
     * reached under margin calls and a drawdown reached on a spot account are not the same kind of
     * number — one could have been liquidated and the other could not — and every other panel in
     * this view sorts them against each other.
     */
    it('says the scenarios did not trade on comparable terms', () => {
      const text = mountPanel(report([MARGIN, SPOT])).find('.notice').text()
      expect(text).toContain('2 brokers')
      expect(text).toContain('did not trade on comparable terms')
    })

    /** Built from the fields that DIFFER, so it never claims a difference the brokers do not have. */
    it('names what actually differs between them', () => {
      const text = mountPanel(report([MARGIN, SPOT])).find('.notice').text()
      expect(text).toContain('1:500')
      expect(text).toContain('1:1')
      expect(text).toContain('hedging on some and not on others')
      expect(text).toContain('forex / crypto')
      // in WORDS, never by comparing the mode strings: the spot broker's `none` is a default at
      // leverage 1, and "retail_hedging / none" would read as two configured modes
      expect(text).toContain('margin calls on some and not on others')
      expect(text).not.toContain('retail_hedging')
    })

    it('claims no difference where the two brokers agree', () => {
      const twin: BrokerUnit = { ...MARGIN, broker_type: 'mt5_second', config_hash: 'other' }
      const text = mountPanel(report([MARGIN, twin])).find('.notice').text()
      expect(text).toContain('2 brokers')
      expect(text).not.toContain('leverage')
      expect(text).not.toContain('hedging on some')
    })

    /** One broker is the ordinary case and has nothing to warn about, so nothing is printed. */
    it('is silent on a run that used one broker', () => {
      expect(mountPanel(report([SPOT])).find('.notice').exists()).toBe(false)
    })
  })

  describe('the symbols a broker defines', () => {
    it('lists the trading rules per symbol', () => {
      const wrapper = mountPanel(report([MARGIN]))
      const rows = wrapper.findAll('.symbol-list .record-row')
      expect(rows).toHaveLength(1)
      const text = rows[0]!.text()
      expect(text).toContain('GBPUSD')
      expect(text).toContain('GBP/USD')
      // grouped, the same treatment the roster gives its tick counts
      expect(text).toContain('100,000')
    })

    /**
     * A volume is printed as the backend stated it. The minimum order is 0.01 lots at one broker
     * and 0.00005 BTC at another, so any fixed precision makes one of the two wrong — 0.00 for the
     * second, or four trailing zeroes for the first.
     */
    it('keeps a volume at the precision the backend stated', () => {
      const forex = mountPanel(report([MARGIN])).find('.symbol-list .record-row').text()
      expect(forex).toContain('0.01')
      // the captured spot symbol steps in units of 1e-8, which is where a bare String() flips to
      // exponential notation and puts `1e-8` in a column of decimals
      const spot = mountPanel(report([SPOT])).find('.symbol-list .record-row').text()
      expect(spot).toContain('0.00000001')
      expect(spot).not.toContain('e-')
    })

    it('shows both swap directions as one fact', () => {
      const text = mountPanel(report([MARGIN])).find('.symbol-list .record-row').text()
      expect(text).toContain('-1.12 / -0.79')
    })

    /**
     * The rank lives twice — on the column and on the cell — because the list owns the tracks while
     * this panel owns the cells. A track given up under a cell that stayed would shift every later
     * cell into the wrong column.
     */
    it('gives every cell the rank its own column declares', () => {
      const wrapper = mountPanel(report([MARGIN]))
      const heads = wrapper.findAll('.record-head > span').map(n => n.attributes('data-rank'))
      const cells = wrapper.find('.record-row').findAll(':scope > span')
        .map(n => n.attributes('data-rank'))
      expect(heads).toHaveLength(8)
      expect(cells).toEqual(heads)
    })

    /** An empty table and an absent one are different things, so the empty case says which. */
    it('says so where the section carries no symbols for a broker', () => {
      const bare: BrokerUnit = { ...MARGIN, symbols: [] }
      const wrapper = mountPanel(report([bare]))
      expect(wrapper.find('.symbol-list').exists()).toBe(false)
      expect(wrapper.text()).toContain('no symbol definitions')
    })

    /** Read-only: these are definitions, with nothing to choose and nothing to sort by. */
    it('offers nothing to click', () => {
      expect(mountPanel(report([MARGIN])).findAll('button')).toHaveLength(0)
    })
  })
})
