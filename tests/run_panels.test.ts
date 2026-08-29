import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ExecutivePanel from '@/components/runs/ExecutivePanel.vue'
import FeedHealthPanel from '@/components/runs/FeedHealthPanel.vue'
import WarningsErrorsPanel from '@/components/runs/WarningsErrorsPanel.vue'
import type {
  RunSummary,
  RunSummaryCurrency,
  WarningsErrorsReport,
} from '@/types/api/report_types'

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
  const wrapper = mount(ExecutivePanel, { props: { model: summaryWith(row) } })
  return wrapper.findAll('tbody td').map(cell => cell.text())
}

describe('ExecutivePanel', () => {
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

  it('says so when a run carries no currency rows', () => {
    const empty = { ...summaryWith(MEASURED), currencies: [] }
    const wrapper = mount(ExecutivePanel, { props: { model: empty } })
    expect(wrapper.text()).toContain('No currency KPIs in this run')
  })
})

function report(overrides: Partial<WarningsErrorsReport> = {}): WarningsErrorsReport {
  return {
    warnings: [],
    errors: [],
    outcome: {
      run_outcome: 'success',
      failed_count: 0,
      total_units: 3,
      failed_unit_names: [],
      first_failure_name: '',
      first_failure_error: '',
      emergency_reason: '',
      shutdown_mode: 'normal',
    },
    ...overrides,
  }
}

describe('WarningsErrorsPanel', () => {
  it('says a clean run is clean', () => {
    const wrapper = mount(WarningsErrorsPanel, { props: { model: report() } })
    expect(wrapper.text()).toContain('No warnings or errors')
    expect(wrapper.text()).toContain('0 / 3')
  })

  it('never renders a missing verdict as a state', () => {
    // artifacts written before the grading existed carry an empty run_outcome
    const model = report()
    model.outcome.run_outcome = ''
    const wrapper = mount(WarningsErrorsPanel, { props: { model } })
    expect(wrapper.text()).toContain('no outcome recorded')
    expect(wrapper.find('.outcome-verdict').exists()).toBe(false)
  })

  it('shows errors with their unit and names the first failure', () => {
    const model = report({
      errors: [{
        name: 'mock_session_test',
        symbol: 'BTCUSD',
        error_type: '',
        error_message: 'Signal transport is enabled but no SIGNAL worker consumes a source',
        validation_errors: [],
        logged_errors: [],
        traceback: '',
      }],
    })
    model.outcome.run_outcome = 'failed'
    model.outcome.failed_count = 1
    model.outcome.total_units = 1
    model.outcome.first_failure_name = 'mock_session_test'

    const wrapper = mount(WarningsErrorsPanel, { props: { model } })
    expect(wrapper.text()).toContain('Errors (1)')
    expect(wrapper.text()).toContain('mock_session_test')
    expect(wrapper.text()).toContain('BTCUSD')
    expect(wrapper.text()).toContain('first failure:')
    // nothing behind it, so no details toggle is offered
    expect(wrapper.find('.entry-detail').exists()).toBe(false)
  })

  it('offers details only when there is something behind them', () => {
    const model = report({
      errors: [{
        name: 'unit', symbol: '', error_type: 'ValueError', error_message: 'boom',
        validation_errors: ['bad config'], logged_errors: [], traceback: 'Traceback …',
      }],
    })
    const wrapper = mount(WarningsErrorsPanel, { props: { model } })
    expect(wrapper.find('.entry-detail').exists()).toBe(true)
    expect(wrapper.text()).toContain('bad config')
  })

  it('lists tier-1 warnings but only summarises the log pot', () => {
    const model = report({
      warnings: [
        { tier: 'major', scope: 'run', message: 'STRESS TEST ACTIVE' },
        { tier: 'minor', scope: 'unit_a', message: 'something in the log' },
        { tier: 'minor', scope: 'unit_a', message: 'another log line' },
      ],
    })
    const wrapper = mount(WarningsErrorsPanel, { props: { model } })
    expect(wrapper.text()).toContain('Major warnings (1)')
    expect(wrapper.text()).toContain('STRESS TEST ACTIVE')
    expect(wrapper.text()).toContain('2 minor warnings in the log')
    expect(wrapper.find('.minor').element.tagName).toBe('DETAILS')
  })
})

describe('FeedHealthPanel', () => {
  it('distinguishes an absent SIGNAL worker from a perfect feed', () => {
    const absent = mount(FeedHealthPanel, { props: { model: summaryWith(MEASURED) } })
    expect(absent.text()).toContain('no SIGNAL worker')

    const perfect = mount(FeedHealthPanel, {
      props: { model: { ...summaryWith(MEASURED), signal_fresh_ratio: 1.0 } },
    })
    expect(perfect.text()).toContain('100.0%')
  })
})
