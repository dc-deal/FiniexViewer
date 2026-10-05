import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRunReportsStore } from '@/stores/run_reports_store'
import type {
  PortfolioAggregateRow,
  PortfolioReport,
  WarningsErrorsReport,
} from '@/types/api/report_types'
import bookingPeriodsFixture from './fixtures/run_booking_periods.json'
import portfolioFixture from './fixtures/portfolio.json'
import brokerFixture from './fixtures/broker.json'
import aggregatedFixture from './fixtures/aggregated_portfolio.json'
import pendingFixture from './fixtures/pending_orders.json'
import historyFixture from './fixtures/order_history.json'
import runConfigFixture from './fixtures/run_config_live.json'
import tradeHistoryFixture from './fixtures/trade_history.json'
import * as apiClient from '@/api/api_client'
import { ArtifactUnreadableError } from '@/api/artifact_unreadable_error'
import { RunNotFoundError } from '@/api/run_not_found_error'
import type { SectionAbsence } from '@/types/api/absence_types'

vi.mock('@/api/api_client', () => ({
  getWarningsErrors: vi.fn(),
  getPortfolio: vi.fn(),
  getBroker: vi.fn(),
  getAggregatedPortfolio: vi.fn(),
  getOrderHistory: vi.fn(),
  getPendingOrders: vi.fn(),
  getBookingPeriods: vi.fn(),
  getRunConfig: vi.fn(),
  getTradeHistory: vi.fn(),
}))

const REPORT: WarningsErrorsReport = {
  run_id: '20260615_130000',
  warnings: [{ tier: 'major', scope: 'run', message: 'STRESS TEST ACTIVE' }],
  errors: [],
  keys: { errors: ['name'], warnings: [] },
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
  error_count: null,
  warning_count: null,
  log_warning_count: null,
  },
}

const PORTFOLIO: PortfolioReport = {
  run_id: '20260615_130000',
  units: [],
  aggregates: [{
    ...(portfolioFixture.aggregates[0] as PortfolioAggregateRow),
    currency: 'USD',
    unit_count: 2,
    total_trades: 4,
    winning_trades: 2,
    losing_trades: 2,
    win_rate: 0.5,
    profit_factor: 1.2,
    total_profit: 12,
    total_loss: 10,
    net_profit: 2,
    account_max_drawdown: 5,
    total_fees: 1,
  }],
}


/**
 * What the client now answers where a section is not there: the cause and the backend's own
 * sentence, instead of the bare `null` that made four different situations look identical.
 */
const ABSENT: SectionAbsence = {
  absent: true,
  cause: 'artifact_not_produced',
  detail: 'This run does not write that section',
}

describe('useRunReportsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(apiClient.getWarningsErrors).mockReset()
    vi.mocked(apiClient.getPortfolio).mockReset()
  })

  it('loads the section for a run', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockResolvedValue(REPORT)
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    expect(apiClient.getWarningsErrors).toHaveBeenCalledWith('20260615_130000')
    expect(store.warningsErrors).toEqual(REPORT)
    expect(store.errors['warningsErrors']).toBeUndefined()
    expect(store.loadingWarningsErrors).toBe(false)
  })

  it('keeps the section null when the run carries no such artifact', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockResolvedValue(ABSENT)
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    expect(store.warningsErrors).toBeNull()
    expect(store.errors['warningsErrors']).toBeUndefined()
  })

  it('surfaces a failure as a readable message', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockRejectedValue(new Error('boom'))
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    expect(store.errors['warningsErrors']).toBe('Could not load warnings and errors: boom')
    expect(store.loadingWarningsErrors).toBe(false)
  })

  it('treats an unreadable artifact as a state of the run, not as a failed request', async () => {
    vi.mocked(apiClient.getWarningsErrors)
      .mockRejectedValue(new ArtifactUnreadableError('Re-run to regenerate it.'))
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    expect(store.unreadable).toBe('Re-run to regenerate it.')
    expect(store.errors['warningsErrors']).toBeUndefined()
    expect(store.warningsErrors).toBeNull()
  })

  it('clears the unreadable state with the rest of the run', async () => {
    vi.mocked(apiClient.getWarningsErrors)
      .mockRejectedValue(new ArtifactUnreadableError('old schema'))
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    store.clear()
    expect(store.unreadable).toBeNull()
  })

  it('clear drops the previous run — its numbers must never survive a selection change', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockResolvedValue(REPORT)
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    store.clear()
    expect(store.warningsErrors).toBeNull()
    expect(store.errors).toEqual({})
  })

  it('drops the previous section before the next one arrives', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockResolvedValue(REPORT)
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')

    vi.mocked(apiClient.getWarningsErrors).mockRejectedValue(new Error('gone'))
    await store.loadWarningsErrors('20260615_120000')
    expect(store.warningsErrors).toBeNull()
  })
})

/**
 * The absence is a VALUE now, not a blank.
 *
 * Every missing section used to arrive as `null`, so a run still going, a run started with
 * reporting off and a run whose pipeline never writes that section all reached the view as the
 * same nothing. The reason is kept beside the empty slot so the view can say it once.
 */
describe('useRunReportsStore — what is not here, and why', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(apiClient.getPortfolio).mockReset()
    vi.mocked(apiClient.getWarningsErrors).mockReset()
  })

  it('keeps the slot empty and records the cause beside it', async () => {
    vi.mocked(apiClient.getPortfolio).mockResolvedValue({
      absent: true, cause: 'run_not_completed', detail: 'still running, or it ended early',
    })
    const store = useRunReportsStore()
    await store.loadPortfolio('20260615_130000')
    expect(store.portfolio).toBeNull()
    expect(store.absences['portfolio']).toEqual({
      absent: true, cause: 'run_not_completed', detail: 'still running, or it ended early',
    })
  })

  // an absence is not a failure: the error slot is what a broken REQUEST writes to
  it('does not report an absence as an error', async () => {
    vi.mocked(apiClient.getPortfolio).mockResolvedValue(ABSENT)
    const store = useRunReportsStore()
    await store.loadPortfolio('20260615_130000')
    expect(store.errors['portfolio']).toBeUndefined()
  })

  it('keeps two sections apart when both are missing for different reasons', async () => {
    vi.mocked(apiClient.getPortfolio).mockResolvedValue({
      absent: true, cause: 'artifact_not_produced', detail: 'a',
    })
    vi.mocked(apiClient.getWarningsErrors).mockResolvedValue({
      absent: true, cause: 'reports_not_commissioned', detail: 'b',
    })
    const store = useRunReportsStore()
    await store.loadPortfolio('20260615_130000')
    await store.loadWarningsErrors('20260615_130000')
    expect(store.absences['portfolio']?.cause).toBe('artifact_not_produced')
    expect(store.absences['warningsErrors']?.cause).toBe('reports_not_commissioned')
  })

  // the previous run's reasons must never survive a selection change, like every other slot
  it('forgets every reason when the selection changes', async () => {
    vi.mocked(apiClient.getPortfolio).mockResolvedValue(ABSENT)
    const store = useRunReportsStore()
    await store.loadPortfolio('20260615_130000')
    expect(Object.keys(store.absences)).toHaveLength(1)
    store.clear()
    expect(store.absences).toEqual({})
  })
})

describe('useRunReportsStore — portfolio section', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(apiClient.getWarningsErrors).mockReset()
    vi.mocked(apiClient.getPortfolio).mockReset()
  })

  it('loads the section for a run', async () => {
    vi.mocked(apiClient.getPortfolio).mockResolvedValue(PORTFOLIO)
    const store = useRunReportsStore()
    await store.loadPortfolio('20260615_130000')
    expect(apiClient.getPortfolio).toHaveBeenCalledWith('20260615_130000')
    expect(store.portfolio).toEqual(PORTFOLIO)
    expect(store.loadingPortfolio).toBe(false)
  })

  it('keeps the section null when the run carries no such artifact', async () => {
    vi.mocked(apiClient.getPortfolio).mockResolvedValue(ABSENT)
    const store = useRunReportsStore()
    await store.loadPortfolio('20260615_130000')
    expect(store.portfolio).toBeNull()
    expect(store.errors['portfolio']).toBeUndefined()
  })

  it('surfaces a failure as a readable message', async () => {
    vi.mocked(apiClient.getPortfolio).mockRejectedValue(new Error('boom'))
    const store = useRunReportsStore()
    await store.loadPortfolio('20260615_130000')
    expect(store.errors['portfolio']).toBe('Could not load the portfolio breakdown: boom')
  })

  it('clear drops every section together', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockResolvedValue(REPORT)
    vi.mocked(apiClient.getPortfolio).mockResolvedValue(PORTFOLIO)
    const store = useRunReportsStore()
    await Promise.all([
      store.loadWarningsErrors('20260615_130000'),
      store.loadPortfolio('20260615_130000'),
    ])
    store.clear()
    expect(store.warningsErrors).toBeNull()
    expect(store.portfolio).toBeNull()
  })

  /**
   * Each section keeps its OWN message. One ref served all seven until 2026-10-01 and they load
   * concurrently, so the last writer won and a reader was told about whichever section happened to
   * finish last — the other failures were simply gone.
   */
  it('keeps every failure, one per section', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockRejectedValue(new Error('gone'))
    vi.mocked(apiClient.getPortfolio).mockRejectedValue(new Error('also gone'))
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    await store.loadPortfolio('20260615_130000')
    expect(store.errors['warningsErrors']).toBe('Could not load warnings and errors: gone')
    expect(store.errors['portfolio']).toBe('Could not load the portfolio breakdown: also gone')
  })

  it('leaves a section that succeeded without a message of its own', async () => {
    vi.mocked(apiClient.getWarningsErrors).mockRejectedValue(new Error('gone'))
    vi.mocked(apiClient.getPortfolio).mockResolvedValue(PORTFOLIO)
    const store = useRunReportsStore()
    await store.loadWarningsErrors('20260615_130000')
    await store.loadPortfolio('20260615_130000')
    expect(store.errors['warningsErrors']).toBe('Could not load warnings and errors: gone')
    expect(store.errors['portfolio']).toBeUndefined()
    expect(store.portfolio).toEqual(PORTFOLIO)
  })

  /**
   * The broker section. Absent on an AutoTrader session, which writes no such artifact — the same
   * ordinary structure every other section has, and the reason the panel is gated on `artifacts`
   * rather than asked for unconditionally.
   */
  describe('broker conditions', () => {
    // a BLOCK body, deliberately: `mockReset()` returns the mock, which is a function, and vitest
    // takes a function returned from beforeEach as a teardown hook. It then CALLS the mock at
    // teardown, and with a rejection queued that is an unhandled one nobody awaits.
    beforeEach(() => { vi.mocked(apiClient.getBroker).mockReset() })

    it('loads the section for a run', async () => {
      vi.mocked(apiClient.getBroker).mockResolvedValue(brokerFixture)
      const store = useRunReportsStore()
      await store.loadBroker('20260615_130000')
      expect(apiClient.getBroker).toHaveBeenCalledWith('20260615_130000')
      expect(store.broker).toEqual(brokerFixture)
      expect(store.loadingBroker).toBe(false)
    })

    it('keeps the section null and records WHY where the run writes none', async () => {
      vi.mocked(apiClient.getBroker).mockResolvedValue(ABSENT)
      const store = useRunReportsStore()
      await store.loadBroker('20260615_130000')
      expect(store.broker).toBeNull()
      expect(store.absences['broker']).toEqual(ABSENT)
      expect(store.errors['broker']).toBeUndefined()
    })

    it('surfaces a failure as a readable message', async () => {
      vi.mocked(apiClient.getBroker).mockRejectedValue(new Error('boom'))
      const store = useRunReportsStore()
      await store.loadBroker('20260615_130000')
      expect(store.errors['broker']).toBe('Could not load the broker conditions: boom')
    })

    it('is dropped with every other section when the run changes', async () => {
      vi.mocked(apiClient.getBroker).mockResolvedValue(brokerFixture)
      const store = useRunReportsStore()
      await store.loadBroker('20260615_130000')
      store.clear()
      expect(store.broker).toBeNull()
    })
  })

  /** The fold of the run over its scenarios — its own request, and its own ordinary absence. */
  describe('the aggregated fold', () => {
    beforeEach(() => { vi.mocked(apiClient.getAggregatedPortfolio).mockReset() })

    it('loads the section for a run', async () => {
      vi.mocked(apiClient.getAggregatedPortfolio).mockResolvedValue(aggregatedFixture)
      const store = useRunReportsStore()
      await store.loadAggregated('20260615_130000')
      expect(apiClient.getAggregatedPortfolio).toHaveBeenCalledWith('20260615_130000')
      expect(store.aggregated).toEqual(aggregatedFixture)
      expect(store.loadingAggregated).toBe(false)
    })

    it('keeps the section null and records WHY where the run writes none', async () => {
      vi.mocked(apiClient.getAggregatedPortfolio).mockResolvedValue(ABSENT)
      const store = useRunReportsStore()
      await store.loadAggregated('20260615_130000')
      expect(store.aggregated).toBeNull()
      expect(store.absences['aggregated']).toEqual(ABSENT)
      expect(store.errors['aggregated']).toBeUndefined()
    })

    it('surfaces a failure as a readable message', async () => {
      vi.mocked(apiClient.getAggregatedPortfolio).mockRejectedValue(new Error('boom'))
      const store = useRunReportsStore()
      await store.loadAggregated('20260615_130000')
      expect(store.errors['aggregated']).toBe('Could not load the aggregated portfolio: boom')
    })

    it('is dropped with every other section when the run changes', async () => {
      vi.mocked(apiClient.getAggregatedPortfolio).mockResolvedValue(aggregatedFixture)
      const store = useRunReportsStore()
      await store.loadAggregated('20260615_130000')
      store.clear()
      expect(store.aggregated).toBeNull()
    })
  })

  /** The orders themselves — the companion request the Orders panel joins to the funnel. */
  describe('the order history', () => {
    beforeEach(() => { vi.mocked(apiClient.getOrderHistory).mockReset() })

    it('loads the section for a run', async () => {
      vi.mocked(apiClient.getOrderHistory).mockResolvedValue(historyFixture)
      const store = useRunReportsStore()
      await store.loadOrderHistory('20260615_130000')
      expect(apiClient.getOrderHistory).toHaveBeenCalledWith('20260615_130000')
      expect(store.orderHistory).toEqual(historyFixture)
      expect(store.loadingOrderHistory).toBe(false)
    })

    it('keeps the section null and records WHY where the run writes none', async () => {
      vi.mocked(apiClient.getOrderHistory).mockResolvedValue(ABSENT)
      const store = useRunReportsStore()
      await store.loadOrderHistory('20260615_130000')
      expect(store.orderHistory).toBeNull()
      expect(store.absences['orderHistory']).toEqual(ABSENT)
      expect(store.errors['orderHistory']).toBeUndefined()
    })

    it('surfaces a failure as a readable message of its own', async () => {
      vi.mocked(apiClient.getOrderHistory).mockRejectedValue(new Error('boom'))
      const store = useRunReportsStore()
      await store.loadOrderHistory('20260615_130000')
      expect(store.errors['orderHistory']).toBe('Could not load the order history: boom')
    })
  })

  /** What became of the pending orders — its own request, and its own ordinary absence. */
  describe('the pending orders', () => {
    beforeEach(() => { vi.mocked(apiClient.getPendingOrders).mockReset() })

    it('loads the section for a run', async () => {
      vi.mocked(apiClient.getPendingOrders).mockResolvedValue(pendingFixture)
      const store = useRunReportsStore()
      await store.loadPendingOrders('20260615_130000')
      expect(apiClient.getPendingOrders).toHaveBeenCalledWith('20260615_130000')
      expect(store.pendingOrders).toEqual(pendingFixture)
      expect(store.loadingPendingOrders).toBe(false)
    })

    it('keeps the section null and records WHY where the run writes none', async () => {
      vi.mocked(apiClient.getPendingOrders).mockResolvedValue(ABSENT)
      const store = useRunReportsStore()
      await store.loadPendingOrders('20260615_130000')
      expect(store.pendingOrders).toBeNull()
      expect(store.absences['pendingOrders']).toEqual(ABSENT)
      expect(store.errors['pendingOrders']).toBeUndefined()
    })

    it('surfaces a failure as a readable message of its own', async () => {
      vi.mocked(apiClient.getPendingOrders).mockRejectedValue(new Error('boom'))
      const store = useRunReportsStore()
      await store.loadPendingOrders('20260615_130000')
      expect(store.errors['pendingOrders']).toBe('Could not load the pending orders: boom')
    })

    it('is dropped with every other section when the run changes', async () => {
      vi.mocked(apiClient.getPendingOrders).mockResolvedValue(pendingFixture)
      const store = useRunReportsStore()
      await store.loadPendingOrders('20260615_130000')
      store.clear()
      expect(store.pendingOrders).toBeNull()
    })
  })

  describe('booking periods', () => {
    it('loads the section and holds it under its own slot', async () => {
      vi.mocked(apiClient.getBookingPeriods).mockResolvedValue(bookingPeriodsFixture)
      const store = useRunReportsStore()
      await store.loadBookingPeriods(bookingPeriodsFixture.run_id)
      expect(store.bookingPeriods?.periods.length).toBeGreaterThan(0)
    })

    it('keeps null when the run carries no journal — the panel is then not shown', async () => {
      vi.mocked(apiClient.getBookingPeriods).mockResolvedValue(ABSENT)
      const store = useRunReportsStore()
      await store.loadBookingPeriods('20260615_130000')
      expect(store.bookingPeriods).toBeNull()
    })

    it('reports a stale artifact as unreadable rather than as a failed request', async () => {
      vi.mocked(apiClient.getBookingPeriods)
        .mockRejectedValue(new ArtifactUnreadableError('Written by an older schema.'))
      const store = useRunReportsStore()
      await store.loadBookingPeriods('20260615_130000')
      expect(store.unreadable).toContain('older schema')
      expect(store.errors['bookingPeriods']).toBeUndefined()
    })

    it('is cleared with every other section when the selection changes', async () => {
      vi.mocked(apiClient.getBookingPeriods).mockResolvedValue(bookingPeriodsFixture)
      const store = useRunReportsStore()
      await store.loadBookingPeriods(bookingPeriodsFixture.run_id)
      store.clear()
      expect(store.bookingPeriods).toBeNull()
    })
  })

  describe('configuration', () => {
    it('holds the configuration under its own slot', async () => {
      vi.mocked(apiClient.getRunConfig).mockResolvedValue(runConfigFixture)
      const store = useRunReportsStore()
      await store.loadConfig(runConfigFixture.run_id)
      expect(store.config?.config_snapshot).toBe(runConfigFixture.config_snapshot)
    })

    it('keeps null for a run older than the store — the panel is then not shown', async () => {
      vi.mocked(apiClient.getRunConfig).mockResolvedValue(ABSENT)
      const store = useRunReportsStore()
      await store.loadConfig('20260101_000000_aaaaaaaa')
      expect(store.config).toBeNull()
      expect(store.errors['config']).toBeUndefined()
    })

    // a disagreement between the two indexes must reach the reader rather than look like a
    // section the run happens not to have
    it('surfaces a run the backend does not know as an error', async () => {
      vi.mocked(apiClient.getRunConfig).mockRejectedValue(new RunNotFoundError('20260101_000000_x'))
      const store = useRunReportsStore()
      await store.loadConfig('20260101_000000_x')
      expect(store.errors['config']).toContain('does not know run')
      expect(store.config).toBeNull()
    })

    it('is cleared with every other section when the selection changes', async () => {
      vi.mocked(apiClient.getRunConfig).mockResolvedValue(runConfigFixture)
      const store = useRunReportsStore()
      await store.loadConfig(runConfigFixture.run_id)
      store.clear()
      expect(store.config).toBeNull()
    })
  })

  describe('trade history', () => {
    it('holds the trades under their own slot', async () => {
      vi.mocked(apiClient.getTradeHistory).mockResolvedValue(tradeHistoryFixture)
      const store = useRunReportsStore()
      await store.loadTradeHistory(tradeHistoryFixture.run_id)
      expect(store.tradeHistory?.trades.length).toBeGreaterThan(0)
    })

    it('keeps null where the run closed no position — the panel is then not shown', async () => {
      vi.mocked(apiClient.getTradeHistory).mockResolvedValue(ABSENT)
      const store = useRunReportsStore()
      await store.loadTradeHistory('20260615_130000')
      expect(store.tradeHistory).toBeNull()
      expect(store.errors['tradeHistory']).toBeUndefined()
    })

    it('is cleared with every other section when the selection changes', async () => {
      vi.mocked(apiClient.getTradeHistory).mockResolvedValue(tradeHistoryFixture)
      const store = useRunReportsStore()
      await store.loadTradeHistory(tradeHistoryFixture.run_id)
      store.clear()
      expect(store.tradeHistory).toBeNull()
    })
  })
})
