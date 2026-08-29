import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RunSummaryPanel from '@/components/runs/RunSummaryPanel.vue'
import type { RunSummary, RunSummaryCurrency } from '@/types/api/report_types'

const MEASURED: RunSummaryCurrency = {
  currency: 'USD',
  net_pnl: -50.6,
  profit_factor: 0.567,
  win_rate: 0.5833,
  max_drawdown: 54.9,
  total_fees: 15.9,
  total_trades: 12,
  winning_trades: 7,
  losing_trades: 5,
  expectancy: 0.35,
  avg_win_r: 1.4,
  avg_loss_r: -0.9,
  r_trade_count: 12,
  r_win_count: 7,
  r_loss_count: 5,
}

// A run that only won: profit factor is undefined, and no R-denominated trade exists
const UNDEFINED_VALUES: RunSummaryCurrency = {
  ...MEASURED,
  profit_factor: null,
  avg_win_r: null,
  avg_loss_r: null,
  r_trade_count: 0,
  r_win_count: 0,
  r_loss_count: 0,
}

function summaryWith(row: RunSummaryCurrency): RunSummary {
  return {
    currencies: [row],
    orders_sent: 1,
    orders_executed: 1,
    orders_rejected: 0,
    sl_tp_triggered: 0,
    unit_count: 1,
    signal_fresh_ratio: null,
    disturbance_episode_count: 0,
    disturbance_stale_seconds: 0,
    disturbance_source_count: 0,
    disturbance_stress_injected: 0,
  }
}

function cells(row: RunSummaryCurrency): string[] {
  const wrapper = mount(RunSummaryPanel, { props: { summary: summaryWith(row) } })
  return wrapper.findAll('tbody td').map(cell => cell.text())
}

describe('RunSummaryPanel', () => {
  it('renders measured values with their units', () => {
    const [currency, netPnl, profitFactor, winRate, trades, expectancy, avgWin, avgLoss, maxDd] =
      cells(MEASURED)
    expect(currency).toBe('USD')
    expect(netPnl).toBe('-50.60 USD')
    expect(profitFactor).toBe('0.57')
    expect(winRate).toBe('58.3%')           // backend ratio 0..1, converted at the render edge
    expect(trades).toBe('12 (7W/5L)')
    expect(expectancy).toBe('+0.35R')
    expect(avgWin).toBe('+1.40R')
    expect(avgLoss).toBe('-0.90R')
    expect(maxDd).toBe('54.90 USD')         // positive magnitude by contract, no abs() applied
  })

  it('renders n/a instead of a number nobody measured', () => {
    const [, , profitFactor, , , expectancy, avgWin, avgLoss] = cells(UNDEFINED_VALUES)
    expect(profitFactor).toBe('n/a')
    expect(expectancy).toBe('n/a')
    expect(avgWin).toBe('n/a')
    expect(avgLoss).toBe('n/a')
  })

  it('gates each R value on its own subset count', () => {
    // R-defined trades exist, but none of them won — the win mean was never measured
    const noWinner: RunSummaryCurrency = {
      ...MEASURED,
      avg_win_r: null,
      r_trade_count: 1,
      r_win_count: 0,
      r_loss_count: 1,
    }
    const [, , , , , , avgWin, avgLoss] = cells(noWinner)
    expect(avgWin).toBe('n/a')
    expect(avgLoss).toBe('-0.90R')
  })

  it('distinguishes an absent SIGNAL worker from a perfect feed', () => {
    const wrapper = mount(RunSummaryPanel, { props: { summary: summaryWith(MEASURED) } })
    expect(wrapper.text()).toContain('no SIGNAL worker')

    const withFeed = mount(RunSummaryPanel, {
      props: { summary: { ...summaryWith(MEASURED), signal_fresh_ratio: 1.0 } },
    })
    expect(withFeed.text()).toContain('100.0%')
  })
})
