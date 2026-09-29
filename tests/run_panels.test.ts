import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { provideTestSelection } from './scenario_selection_harness'
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

// Captured shapes as the BASE, chosen numbers on top. Hand-writing a full row makes the test a
// second mirror of the contract, and a field the backend renames then stays green here while the
// page renders NaN — which is exactly what happened to the drawdown columns in contract 2.
import runSummaryFixture from './fixtures/run_summary.json'
import portfolioFixture from './fixtures/portfolio.json'

const MEASURED: RunSummaryCurrency = {
  ...(runSummaryFixture.currencies[0] as RunSummaryCurrency),
  currency: 'USD',
  net_pnl: -50.6,
  profit_factor: 0.567,
  win_rate: 0.5833,
  account_max_drawdown: 54.9,
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
    // null on an artifact written before contract 6 — not a zero
    units_declared: null,
    units_disabled: null,
    units_absent: [],
    signal_fresh_ratio: null,
    disturbance_episode_count: 0,
    disturbance_stale_seconds: 0,
    disturbance_source_count: 0,
    disturbance_stress_injected: 0,
  }
}

/**
 * The panel's figures as label -> value.
 *
 * Read by NAME rather than by position, which the ten-column table forced. A positional assertion
 * survives a column being inserted beside it and quietly checks the wrong thing — the same trap
 * that made a settings test click the wrong button once a second one appeared.
 */
function figures(row: RunSummaryCurrency): Record<string, string> {
  const wrapper = mount(ExecutivePanel, { props: { model: summaryWith(row) } })
  return Object.fromEntries(wrapper.findAll('.figure').map(pair => [
    pair.find('dt').text(),
    pair.find('dd').text(),
  ]))
}

describe('ExecutivePanel', () => {
  /**
   * These are the RUN's figures, one row per currency, with no per-scenario version to show. This
   * panel sits at the TOP, so a reader who has just narrowed meets them first and reads them as
   * the chosen scenario's — which is why the label matters more here than anywhere else.
   */
  it('says whose figures these are while something is narrowed', () => {
    const Host = defineComponent({
      setup() {
        provideTestSelection(['ETHUSD_blocks_03'])
        return () => h(ExecutivePanel, { model: summaryWith(MEASURED) })
      },
    })
    const wrapper = mount(Host)
    expect(wrapper.find('.scope').text()).toBe('whole run')
    expect(wrapper.find('.scope-line').text()).toContain('every scenario')
  })

  it('stays quiet about scope where nothing is narrowed', () => {
    expect(mount(ExecutivePanel, { props: { model: summaryWith(MEASURED) } }).find('.scope').exists()).toBe(false)
  })

  it('renders measured values with their units', () => {
    const f = figures(MEASURED)
    expect(f['Net P&L']).toBe('-50.60 USD')
    expect(f['Profit factor']).toBe('0.57')
    expect(f['Win rate']).toBe('58.3%')      // backend ratio 0..1, converted at the render edge
    expect(f['Trades']).toBe('12 (7W/5L)')
    expect(f['Expectancy']).toBe('+0.35R')
    expect(f['Avg win R']).toBe('+1.40R')
    expect(f['Avg loss R']).toBe('-0.90R')
    // positive magnitude by contract, no abs() applied; the percentage is already multiplied
    expect(f['Max drawdown']).toContain('54.90 USD')
  })

  // The currency heads its own group of blocks rather than being one figure among them.
  it('heads each account with its currency', () => {
    const wrapper = mount(ExecutivePanel, { props: { model: summaryWith(MEASURED) } })
    expect(wrapper.find('.currency-title').text()).toBe('USD')
  })

  /**
   * Thirty fields arrive per currency and the table showed ten. These three were carried and never
   * shown — and on a run that ended with positions open they are the ones that explain why the
   * booked figure and the account disagree.
   */
  it('shows the account figures the table had no room for', () => {
    const open: RunSummaryCurrency = {
      ...MEASURED, final_equity: 9_949.4, open_position_count: 2, unrealized_pnl: -12.5,
    }
    const f = figures(open)
    expect(f['Final equity']).toBe('9,949.40 USD')
    expect(f['Still open']).toBe('2')
    expect(f['Unrealised']).toBe('-12.50 USD')
  })

  // An unrealised 0.00 beside "0 open" reads as a figure somebody measured. Neither line appears.
  it('leaves out what is open where nothing is', () => {
    const f = figures({ ...MEASURED, open_position_count: 0, unrealized_pnl: 0 })
    expect(f['Still open']).toBeUndefined()
    expect(f['Unrealised']).toBeUndefined()
  })

  it('renders n/a instead of a number nobody measured', () => {
    const f = figures(UNDEFINED_VALUES)
    expect(f['Profit factor']).toBe('n/a')
    expect(f['Expectancy']).toBe('n/a')
    expect(f['Avg win R']).toBe('n/a')
    expect(f['Avg loss R']).toBe('n/a')
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
    const f = figures(noWinner)
    expect(f['Avg win R']).toBe('n/a')
    expect(f['Avg loss R']).toBe('-0.90R')
  })

  it('never renders a ratio nobody measured — an untraded run has no win rate', () => {
    // the backend sends 0.0 rather than null for both, so the gate is the trade count
    const untraded: RunSummaryCurrency = {
      ...MEASURED, total_trades: 0, winning_trades: 0, losing_trades: 0,
      win_rate: 0, profit_factor: 0,
    }
    const f = figures(untraded)
    expect(f['Profit factor']).toBe('n/a')
    expect(f['Win rate']).toBe('n/a')
  })

  it('keeps a measured zero — one losing trade really is a win rate of zero', () => {
    const onlyLosses: RunSummaryCurrency = {
      ...MEASURED, total_trades: 1, winning_trades: 0, losing_trades: 1,
      win_rate: 0, profit_factor: 0,
    }
    const f = figures(onlyLosses)
    expect(f['Profit factor']).toBe('0.00')
    expect(f['Win rate']).toBe('0.0%')
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
    keys: { errors: ['name'], warnings: [] },
    outcome: {
      run_outcome: 'success',
      failed_count: 0,
      total_units: 3,
      failed_unit_names: [],
      error_count: null,
      warning_count: null,
      log_warning_count: null,
      first_failure_name: '',
      first_failure_error: '',
      emergency_reason: '',
      shutdown_mode: 'normal',
      operator_interrupted: false,
    },
    ...overrides,
  }
}

describe('WarningsErrorsPanel — narrowed to a scenario', () => {
  function unitError(name: string) {
    return {
      name,
      symbol: 'ETHUSD',
      error_type: 'ValidationError',
      error_message: `${name} failed validation`,
      validation_errors: [],
      logged_errors: [],
      traceback: '',
    }
  }

  const MIXED = report({
    errors: [unitError('unit_a'), unitError('unit_b')],
    warnings: [
      { tier: 'major', scope: 'run', message: 'STRESS TEST ACTIVE' },
      { tier: 'major', scope: 'unit_a', message: 'warmup thin on unit_a' },
      { tier: 'major', scope: 'unit_b', message: 'warmup thin on unit_b' },
    ],
  })

  function mountNarrowed(units: string[]) {
    const Host = defineComponent({
      setup() {
        provideTestSelection(units)
        return () => h(WarningsErrorsPanel, { model: MIXED })
      },
    })
    return mount(Host)
  }

  // An error row IS a unit — the response declares `keys.errors: ["name"]`.
  it('shows only the chosen unit\'s errors', () => {
    const text = mountNarrowed(['unit_a']).text()
    expect(text).toContain('unit_a failed validation')
    expect(text).not.toContain('unit_b failed validation')
  })

  /**
   * A run-scoped warning stays: it is still true of what is on show, and dropping it would hide a
   * stress-test notice that changes how every figure below it reads.
   */
  it('keeps a run-wide warning and drops only another unit\'s', () => {
    const text = mountNarrowed(['unit_a']).text()
    expect(text).toContain('STRESS TEST ACTIVE')
    expect(text).toContain('warmup thin on unit_a')
    expect(text).not.toContain('warmup thin on unit_b')
  })

  // The outcome counts every unit the run attempted and has no per-scenario version.
  it('marks the outcome counts as the run\'s', () => {
    expect(mountNarrowed(['unit_a']).find('.scope').text()).toBe('whole run')
    expect(mountNarrowed([]).find('.scope').exists()).toBe(false)
  })

  it('shows everything again once the narrowing is cleared', () => {
    const text = mountNarrowed([]).text()
    expect(text).toContain('unit_a failed validation')
    expect(text).toContain('unit_b failed validation')
  })
})

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
    ...(portfolioFixture.units[0] as PortfolioUnitRow),
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
    account_max_drawdown: 19.57,
    account_max_dd_pct: 0.19,
    total_fees: 2.16,
    data_broker_type: 'mt5',
    data_sentiment_type: '',
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
    ...(portfolioFixture.aggregates[0] as PortfolioAggregateRow),
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
    account_max_drawdown: 19.57,
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

/** The panel under a host that carries a narrowing, the way RunsView does. */
function mountPortfolioNarrowed(model: PortfolioReport, unit: string[]) {
  const Host = defineComponent({
    setup() {
      provideTestSelection(unit)
      return () => h(PortfolioPanel, { model })
    },
  })
  return mount(Host, { global: { stubs: { RouterLink: RouterLinkStub } } })
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

  /**
   * The deliberate exception to the narrowing. The footer here is an aggregate over the whole run
   * with no per-unit version, and a single unit row under an "All units" total is precisely the
   * misreading the narrowing removes everywhere else. Marking also answers the question narrowing
   * raises on this panel — how the chosen scenario compares with the others.
   */
  it('marks the narrowed unit but keeps every row and the run-wide total', () => {
    const model: PortfolioReport = {
      run_id: '20260615_130000',
      units: [unit(), unit({ name: 'USDJPY_blocks_02', net_profit: 4.2 })],
      aggregates: [aggregate({ unit_count: 2 })],
    }
    const wrapper = mountPortfolioNarrowed(model, ['USDJPY_blocks_02'])
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    const picked = wrapper.findAll('tbody tr.picked')
    expect(picked).toHaveLength(1)
    expect(picked[0]?.text()).toContain('USDJPY_blocks_02')
    expect(wrapper.findAll('tfoot td')[0]?.text()).toBe('All units (2) · USD')
  })

  it('marks nothing where no narrowing is in force', () => {
    const model: PortfolioReport = {
      run_id: '20260615_130000',
      units: [unit()],
      aggregates: [],
    }
    expect(mountPortfolioNarrowed(model, []).findAll('tbody tr.picked')).toHaveLength(0)
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
    // an autotrader session leaves data_broker_type empty — a link would land nowhere
    const wrapper = mountPortfolio({
      run_id: '20260615_130000',
      units: [unit({ data_broker_type: '', broker_name: 'Kraken', spot_mode: true })],
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
    // contract 15 — what the run DID. null is the ledger holding nothing, distinct from []
    results: null,
    run_outcome: null,
    error_count: null,
    warning_count: null,
    log_warning_count: null,

    has_reports: true,
    start_time: '2026-08-30T14:58:19.182635+00:00',
    parent_id: null,
    parent_kind: null,
    config_id: '',
    reporting: 'expected',
    size_bytes: 0,
    app_version: '1.4.0',
    git_commit: '56b2677',
    // null on every run recorded before contract 12 — unknown, never guessed
    ticks_from: null,
    orders_to: null,
    data_windows: null,
    config_snapshot: 'autotrader_config.json',
    ...overrides,
  }
}

describe('RunHeaderPanel', () => {
  it('renders identity, start time and provenance from the index row', () => {
    const wrapper = mount(RunHeaderPanel, {
      props: { model: runInfo() },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    const text = wrapper.text()
    expect(text).toContain('20260830_145819_af372b28')
    // UTC, never the viewer's zone — the run's own clock is what this timestamp means
    expect(text).toContain('2026-08-30 14:58:19Z')
    expect(text).toContain('1.4.0')
    expect(text).toContain('56b2677')
  })

  it('says nothing about a family when the run stands alone', () => {
    const wrapper = mount(RunHeaderPanel, {
      props: { model: runInfo() },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.text()).not.toContain('sweep')
    expect(wrapper.text()).not.toContain('Fragment')
  })

  it('names a sweep combination for what it is — an alternative among alternatives', () => {
    const wrapper = mount(RunHeaderPanel, {
      props: { model: runInfo({
        group: 'simulation',
        name: 'btcusd_mini_set__sweep_20260830_154907_c001',
        parent_id: 'sweep_20260830_154907',
        parent_kind: 'sweep',
      }) },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.text()).toContain('Combination in sweep')
    expect(wrapper.text()).toContain('sweep_20260830_154907')
  })

  it('names a live session for what it is — one slice of a deployment, not an alternative', () => {
    // same field, different meaning: ranking sessions would be meaningless, they are a sequence.
    // parent_kind now SAYS which, so nothing is inferred from `group` any more.
    const wrapper = mount(RunHeaderPanel, {
      props: { model: runInfo({
        group: 'live',
        name: 'deployment_continuity_test',
        parent_id: 'deploy_20260922_121648',
        parent_kind: 'deployment',
      }) },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.text()).toContain('Session of deployment')
    expect(wrapper.text()).not.toContain('Combination in sweep')
  })

  it('turns a deployment parent into a way in, because the id addresses a route', () => {
    const wrapper = mount(RunHeaderPanel, {
      props: { model: runInfo({
        group: 'live',
        parent_id: 'deploy_20260922_121648',
        parent_kind: 'deployment',
      }) },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    const link = wrapper.findComponent(RouterLinkStub)
    expect(link.props('to')).toEqual({
      name: 'deployments',
      query: { deployment: 'deploy_20260922_121648' },
    })
  })

  it('shows a membership of an unknown kind without claiming what it means', () => {
    const wrapper = mount(RunHeaderPanel, {
      props: { model: runInfo({ parent_id: 'something_new', parent_kind: 'cohort' }) },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.text()).toContain('something_new')
    expect(wrapper.text()).not.toContain('Combination in sweep')
    expect(wrapper.text()).not.toContain('Session of deployment')
  })
})
