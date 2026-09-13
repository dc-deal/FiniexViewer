import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import ExecutivePanel from '@/components/runs/ExecutivePanel.vue'
import FeedHealthPanel from '@/components/runs/FeedHealthPanel.vue'
import PortfolioPanel from '@/components/runs/PortfolioPanel.vue'
import RunHeaderPanel from '@/components/runs/RunHeaderPanel.vue'
import WarningsErrorsPanel from '@/components/runs/WarningsErrorsPanel.vue'
import type {
  PortfolioAggregateRow,
  RunInfo,
  PortfolioReport,
  PortfolioUnitRow,
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
    run_id: '20260615_130000',
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

  it('never renders a ratio nobody measured — an untraded run has no win rate', () => {
    // the backend sends 0.0 rather than null for both, so the gate is the trade count
    const untraded: RunSummaryCurrency = {
      ...MEASURED, total_trades: 0, winning_trades: 0, losing_trades: 0,
      win_rate: 0, profit_factor: 0,
    }
    const [, , profitFactor, winRate] = cells(untraded)
    expect(profitFactor).toBe('n/a')
    expect(winRate).toBe('n/a')
  })

  it('keeps a measured zero — one losing trade really is a win rate of zero', () => {
    const onlyLosses: RunSummaryCurrency = {
      ...MEASURED, total_trades: 1, winning_trades: 0, losing_trades: 1,
      win_rate: 0, profit_factor: 0,
    }
    const [, , profitFactor, winRate] = cells(onlyLosses)
    expect(profitFactor).toBe('0.00')
    expect(winRate).toBe('0.0%')
  })

  it('says so when a run carries no currency rows', () => {
    const empty = { ...summaryWith(MEASURED), currencies: [] }
    const wrapper = mount(ExecutivePanel, { props: { model: empty } })
    expect(wrapper.text()).toContain('No currency KPIs in this run')
  })
})

function report(overrides: Partial<WarningsErrorsReport> = {}): WarningsErrorsReport {
  return {
    run_id: '20260615_130000',
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
      operator_interrupted: false,
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

  it('renders the logged-error pot behind the disclosure', () => {
    // The one fixture that populates logged_errors. Without it the field's shape could change
    // under a green suite — testingide#479 turns these strings into objects, and this test is
    // what makes that land as a failure instead of as '[object Object]' in the panel.
    const model = report({
      errors: [{
        name: 'unit', symbol: 'BTCUSD', error_type: '', error_message: 'boom',
        validation_errors: [],
        logged_errors: [
          {
            level: 'ERROR',
            observed_at: '2026-08-30T11:36:23.412000Z',
            scope: 'BTCUSD_blocks_03',
            message: 'Broker rejected order',
            event_time: '2026-01-26T16:12:41.263000Z',
          },
          // a startup entry: it predates the run's own clock, so event_time stays null
          {
            level: 'ERROR',
            observed_at: '2026-08-30T11:36:24.000000Z',
            scope: '',
            message: 'Retry limit reached',
            event_time: null,
          },
        ],
        traceback: '',
      }],
    })
    const wrapper = mount(WarningsErrorsPanel, { props: { model } })
    expect(wrapper.find('.entry-detail').exists()).toBe(true)
    const lines = wrapper.findAll('.detail-line')
    expect(lines).toHaveLength(2)

    expect(lines[0].find('.log-level').text()).toBe('ERROR')
    expect(lines[0].find('.log-scope').text()).toBe('BTCUSD_blocks_03')
    expect(lines[0].find('.log-message').text()).toBe('Broker rejected order')
    // the run's own clock, rendered as UTC — never the viewer's zone, it is simulated time
    expect(lines[0].find('.log-time').text()).toBe('2026-01-26 16:12:41Z')

    // a startup entry predates that clock: no time is shown rather than wall-clock substituted
    expect(lines[1].find('.log-time').exists()).toBe(false)
    expect(lines[1].find('.log-scope').exists()).toBe(false)
    expect(lines[1].find('.log-message').text()).toBe('Retry limit reached')
  })

  it('shows the shutdown mode as detail, and only alarms where the run failed', () => {
    // an operator stopping a healthy live session with Ctrl+C produces the same 'emergency'
    const stopped = report()
    stopped.outcome.run_outcome = 'success'
    stopped.outcome.shutdown_mode = 'emergency'
    const calm = mount(WarningsErrorsPanel, { props: { model: stopped } })
    expect(calm.find('.outcome-shutdown').text()).toContain('emergency')
    expect(calm.find('.outcome-shutdown').classes()).not.toContain('alarming')

    const crashed = report()
    crashed.outcome.run_outcome = 'failed'
    crashed.outcome.shutdown_mode = 'emergency'
    const loud = mount(WarningsErrorsPanel, { props: { model: crashed } })
    expect(loud.find('.outcome-shutdown').classes()).toContain('alarming')
  })

  it('says nothing about a shutdown mode a simulation run does not have', () => {
    // '' means NOT APPLICABLE on a sim run, not unknown — absent rather than rendered
    const sim = report()
    sim.outcome.shutdown_mode = ''
    const wrapper = mount(WarningsErrorsPanel, { props: { model: sim } })
    expect(wrapper.find('.outcome-shutdown').exists()).toBe(false)
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

function unit(overrides: Partial<PortfolioUnitRow> = {}): PortfolioUnitRow {
  return {
    name: 'USDJPY_blocks_01',
    symbol: 'USDJPY',
    currency: 'USD',
    total_trades: 2,
    winning_trades: 1,
    losing_trades: 1,
    win_rate: 0.5,
    profit_factor: 0.3524,
    total_profit: 6.9,
    total_loss: 19.57,
    net_profit: -12.68,
    max_drawdown: 19.57,
    max_dd_pct: 0.19,
    total_fees: 2.16,
    data_source: 'mt5',
    sentiment_source: '',
    broker_name: 'Vantage International Group Limited',
    spot_mode: false,
    has_error: false,
    total_long_trades: 1,
    total_short_trades: 1,
    max_equity: 10006.9,
    current_balance: 9987.32,
    initial_balance: 10000,
    conversion_rate: 147.63,
    base_currency: '',
    quote_currency: '',
    balances: { USD: 9987.32 },
    initial_balances: { USD: 10000 },
    last_price: 147.63,
    spot_est_current: 0,
    spot_est_initial: 0,
    spot_est_pnl: 0,
    spot_est_pnl_pct: 0,
    total_spread_cost: 2.16,
    total_commission: 0,
    total_swap: 0,
    maker_fee: 0,
    taker_fee: 0,
    ...overrides,
  }
}

function aggregate(overrides: Partial<PortfolioAggregateRow> = {}): PortfolioAggregateRow {
  return {
    currency: 'USD',
    unit_count: 1,
    total_trades: 2,
    winning_trades: 1,
    losing_trades: 1,
    win_rate: 0.5,
    profit_factor: 0.3524,
    total_profit: 6.9,
    total_loss: 19.57,
    net_profit: -12.68,
    max_drawdown: 19.57,
    total_fees: 2.16,
    ...overrides,
  }
}

function mountPortfolio(model: PortfolioReport) {
  return mount(PortfolioPanel, {
    props: { model },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('PortfolioPanel', () => {
  it('renders one row per unit with a totals row behind it', () => {
    const wrapper = mountPortfolio({
      run_id: '20260615_130000',
      units: [unit(), unit({ name: 'USDJPY_blocks_02', net_profit: 4.2 })],
      aggregates: [aggregate({ unit_count: 2 })],
    })
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    const totals = wrapper.findAll('tfoot td').map(cell => cell.text())
    expect(totals[0]).toBe('All units (2) · USD')
    expect(totals[1]).toBe('-12.68 USD')
  })

  it('links a unit into the chart via its data source', () => {
    const wrapper = mountPortfolio({ run_id: '20260615_130000', units: [unit()], aggregates: [] })
    const link = wrapper.findComponent(RouterLinkStub)
    expect(link.props('to')).toEqual({
      name: 'viewer',
      query: { broker: 'mt5', symbol: 'USDJPY' },
    })
    expect(link.text()).toContain('USDJPY')
  })

  it('offers no link when the unit names no data source', () => {
    // live runs leave data_source empty — a link would land nowhere
    const wrapper = mountPortfolio({
      run_id: '20260615_130000',
      units: [unit({ data_source: '', broker_name: 'Kraken', spot_mode: true })],
      aggregates: [],
    })
    expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false)
    expect(wrapper.text()).toContain('USDJPY')
    expect(wrapper.text()).toContain('spot')
  })

  it('never renders a ratio nobody measured as a number', () => {
    // an untraded unit arrives with 0.0 rather than null — 0.00 / 0.0% would claim a measurement
    const wrapper = mountPortfolio({
      run_id: '20260615_130000',
      units: [unit({ total_trades: 0, winning_trades: 0, losing_trades: 0, win_rate: 0, profit_factor: 0 })],
      aggregates: [],
    })
    const cells = wrapper.findAll('tbody td').map(cell => cell.text())
    expect(cells[3]).toBe('n/a')   // profit factor
    expect(cells[4]).toBe('n/a')   // win rate
  })

  it('keeps a measured zero as a number', () => {
    // one losing trade and no winner: the profit factor really is 0, and n/a would hide that
    const wrapper = mountPortfolio({
      run_id: '20260615_130000',
      units: [unit({ total_trades: 1, winning_trades: 0, losing_trades: 1, win_rate: 0, profit_factor: 0 })],
      aggregates: [],
    })
    const cells = wrapper.findAll('tbody td').map(cell => cell.text())
    expect(cells[3]).toBe('0.00')
    expect(cells[4]).toBe('0.0%')
  })

  it('marks a unit that reported an error', () => {
    const wrapper = mountPortfolio({ run_id: '20260615_130000', units: [unit({ has_error: true })], aggregates: [] })
    expect(wrapper.find('.unit-error').exists()).toBe(true)
  })

  it('says so when a run carries no units', () => {
    const wrapper = mountPortfolio({ run_id: '20260615_130000', units: [], aggregates: [] })
    expect(wrapper.text()).toContain('No units in this run')
  })
})

function runInfo(overrides: Partial<RunInfo> = {}): RunInfo {
  return {
    run_id: '20260830_145819_af372b28',
    group: 'simulation',
    artifacts: ['run_summary.json', 'portfolio.json'],
    name: 'multi_position_test',
    has_reports: true,
    start_time: '2026-08-30T14:58:19.182635+00:00',
    parent_id: null,
    app_version: '1.4.0',
    git_commit: '56b2677',
    config_snapshot: 'autotrader_config.json',
    ...overrides,
  }
}

describe('RunHeaderPanel', () => {
  it('renders identity, start time and provenance from the index row', () => {
    const wrapper = mount(RunHeaderPanel, { props: { model: runInfo() } })
    const text = wrapper.text()
    expect(text).toContain('20260830_145819_af372b28')
    // UTC, never the viewer's zone — the run's own clock is what this timestamp means
    expect(text).toContain('2026-08-30 14:58:19Z')
    expect(text).toContain('1.4.0')
    expect(text).toContain('56b2677')
  })

  it('says nothing about a family when the run stands alone', () => {
    const wrapper = mount(RunHeaderPanel, { props: { model: runInfo() } })
    expect(wrapper.text()).not.toContain('sweep')
    expect(wrapper.text()).not.toContain('Fragment')
  })

  it('names a sweep combination for what it is — an alternative among alternatives', () => {
    const wrapper = mount(RunHeaderPanel, {
      props: { model: runInfo({
        group: 'simulation',
        name: 'btcusd_mini_set__sweep_20260830_154907_c001',
        parent_id: 'sweep_20260830_154907',
      }) },
    })
    expect(wrapper.text()).toContain('Combination in sweep')
    expect(wrapper.text()).toContain('sweep_20260830_154907')
  })

  it('names a live fragment for what it is — a slice of one continuous session', () => {
    // same field, different meaning: ranking fragments would be meaningless, they are a sequence
    const wrapper = mount(RunHeaderPanel, {
      props: { model: runInfo({
        group: 'live',
        name: 'mock_session_test',
        parent_id: '20260830_145414_82da9d0d',
      }) },
    })
    expect(wrapper.text()).toContain('Fragment of session')
    expect(wrapper.text()).not.toContain('Combination in sweep')
  })
})
