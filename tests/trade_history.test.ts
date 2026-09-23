import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TradeHistoryPanel from '@/components/runs/TradeHistoryPanel.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import type { TradeHistoryReport, TradeRow } from '@/types/api/report_types'

import fixture from './fixtures/trade_history.json'

const BASE: TradeHistoryReport = fixture

function report(overrides: Partial<TradeHistoryReport> = {}): TradeHistoryReport {
  return { ...BASE, ...overrides }
}

function trade(overrides: Partial<TradeRow> = {}): TradeRow {
  return { ...(BASE.trades[0] as TradeRow), ...overrides }
}

function mountPanel(model: TradeHistoryReport) {
  return mount(TradeHistoryPanel, { props: { model } })
}

/** The figures a card carries, as label -> value. */
function cardRows(wrapper: ReturnType<typeof mountPanel>, index = 0) {
  const details = wrapper.findAllComponents(HoverCard)[index]?.props('details') ?? []
  return Object.fromEntries(details.map(row => [row.label, row.value]))
}

describe('TradeHistoryPanel', () => {
  it('lists every closed position with the unit that produced it', () => {
    const wrapper = mountPanel(report())
    expect(wrapper.findAll('tbody tr')).toHaveLength(BASE.trades.length)
    expect(wrapper.text()).toContain(BASE.trades[0]?.scenario_name)
  })

  /**
   * MAE arrives signed on a trade and as a MAGNITUDE in the analytics block — measured, the same
   * number twice: mae_pnl −18,399.05 against largest_mae +18,399.05. The direction is in the name,
   * so the sign says nothing and the render drops it. Rendering both as they arrive would put one
   * quantity on screen twice with opposite signs.
   */
  it('renders an adverse excursion as a magnitude, whichever sign arrived', () => {
    const negative = mountPanel(report({ trades: [trade({ mae_pnl: -104.5 })] })).text()
    const positive = mountPanel(report({ trades: [trade({ mae_pnl: 104.5 })] })).text()
    expect(negative).toContain('104.50')
    expect(negative).not.toContain('-104.50')
    expect(negative).toBe(positive)
  })

  // expectancy is denominated in R; without a trade that carried a stop there is no R at all
  it('withholds an expectancy nobody could measure', () => {
    const withoutR = mountPanel(report({
      analytics: [{ ...BASE.analytics[0]!, expectancy: 0, r_trade_count: 0 }],
    }))
    expect(withoutR.text()).toContain('n/a')
  })

  it('states the expectancy where trades carried a stop', () => {
    const withR = mountPanel(report({
      analytics: [{ ...BASE.analytics[0]!, expectancy: 0.42, r_trade_count: 7 }],
    }))
    expect(withR.text()).toContain('0.42')
  })

  /**
   * A cap that is not announced reads as "that was all", which for a trade list is the single most
   * misleading thing it could say. So the cap names both numbers.
   */
  it('says how many trades it is not drawing, and out of how many', () => {
    const many = Array.from({ length: 640 }, (_, index) =>
      trade({ position_id: `pos_${index}` }))
    const wrapper = mountPanel(report({ trades: many, count: 640 }))
    expect(wrapper.findAll('tbody tr')).toHaveLength(500)
    const notice = wrapper.find('.notice')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('500')
    expect(notice.text()).toContain('640')
  })

  it('stays silent about a cap it did not reach', () => {
    expect(mountPanel(report()).find('.notice').exists()).toBe(false)
  })

  it('says so plainly where a run closed no position', () => {
    const wrapper = mountPanel(report({ trades: [], count: 0 }))
    expect(wrapper.text()).toContain('closed no positions')
    expect(wrapper.find('tbody').exists()).toBe(false)
  })

  describe('the card behind a row', () => {
    it('carries what the row has no width for', () => {
      const rows = cardRows(mountPanel(report()))
      expect(rows).toHaveProperty('Fees')
      expect(rows).toHaveProperty('Slippage')
      expect(rows).toHaveProperty('Ticks')
      expect(rows).toHaveProperty('Best in favour')
    })

    // the excursion is given three ways by the backend and the question decides which one answers
    it('gives an excursion as P&L, as a price and as a distance in its own unit', () => {
      const rows = cardRows(mountPanel(report({
        trades: [trade({ mae_pnl: -104.5, mae_price: 149.7, mae_distance: 10.4, price_unit: 'pip' })],
      })))
      expect(rows['Worst against']).toContain('104.50')
      expect(rows['Worst against']).toContain('149.7')
      expect(rows['Worst against']).toContain('10.40 pip')
    })

    // '' means the close was not attributed — an absence, never rendered as a state
    it('names the closing reason only where one was recorded', () => {
      expect(cardRows(mountPanel(report({ trades: [trade({ close_reason: '' })] }))))
        .not.toHaveProperty('Closed by')
      expect(cardRows(mountPanel(report({ trades: [trade({ close_reason: 'stop_loss' })] }))))
        .toHaveProperty('Closed by', 'stop_loss')
    })

    it('omits a stop that was never set rather than showing it as none', () => {
      expect(cardRows(mountPanel(report({ trades: [trade({ stop_loss: null })] }))))
        .not.toHaveProperty('Stop loss')
      expect(cardRows(mountPanel(report({ trades: [trade({ stop_loss: 149.5 })] }))))
        .toHaveProperty('Stop loss', '149.5')
    })

    it('withholds an R multiple where the trade carried no stop', () => {
      expect(cardRows(mountPanel(report({ trades: [trade({ r_multiple: null })] })))['R multiple'])
        .toBe('n/a')
    })
  })

  // with one unit the footer would repeat the single row above it
  it('totals per unit only where there is more than one', () => {
    expect(mountPanel(report()).find('tfoot').exists()).toBe(false)
    const twoUnits = mountPanel(report({
      scenario_totals: [
        { ...BASE.scenario_totals[0]!, scenario_name: 'a' },
        { ...BASE.scenario_totals[0]!, scenario_name: 'b' },
      ],
    }))
    expect(twoUnits.find('tfoot').exists()).toBe(true)
  })
})
