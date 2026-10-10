import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getAggregatedPortfolio, getBookingPeriods, getBroker, getOrderEvents, getOrderHistory,
  getPendingOrders,
  getPortfolio,
  getRunConfig, getScenarioDetails, getTradeHistory, getWarningsErrors,
} from '@/api/api_client'
import { ArtifactUnreadableError } from '@/api/artifact_unreadable_error'
import { isAbsent } from '@/types/api/absence_types'
import type { SectionAbsence } from '@/types/api/absence_types'
import type {
  AggregatedPortfolioReport,
  BookingPeriodsReport,
  BrokerReport,
  OrderEvent,
  OrderHistoryReport,
  PendingOrdersReport,
  RunConfigReport,
  TradeHistoryReport,
  PortfolioReport,
  WarningsErrorsReport,
} from '@/types/api/report_types'
import type { ScenarioDetailsReport } from '@/types/api/scenario_types'
import { t } from '@/translate'

/**
 * What a run says, section by section. Deliberately separate from `runs_store`, which answers
 * WHICH run is selected — this one answers what that run reports. Every section is addressed by
 * the same key, `run_id`, and they all clear together when the selection changes.
 */
export const useRunReportsStore = defineStore('run_reports', () => {
  const warningsErrors = ref<WarningsErrorsReport | null>(null)
  const portfolio = ref<PortfolioReport | null>(null)
  const broker = ref<BrokerReport | null>(null)
  const aggregated = ref<AggregatedPortfolioReport | null>(null)
  const pendingOrders = ref<PendingOrdersReport | null>(null)
  const orderHistory = ref<OrderHistoryReport | null>(null)
  const bookingPeriods = ref<BookingPeriodsReport | null>(null)
  const config = ref<RunConfigReport | null>(null)
  const tradeHistory = ref<TradeHistoryReport | null>(null)
  const scenarios = ref<ScenarioDetailsReport | null>(null)
  /**
   * The STEPS of one order, keyed `scenario~position`, and per position rather than per run.
   *
   * Every other section is one request for the whole run; this one is not, because the stream is
   * the largest thing the API serves here - 1,025 events on one stored run against 4 for the
   * position a reader opened. The route narrows on `(scenario_name, order_id)`, so the request a
   * reader causes is the one they asked for, and the answer is kept so reopening costs nothing.
   */
  const orderEvents = ref(new Map<string, OrderEvent[]>())
  /** Which positions are in flight, by the same key - several may load at once. */
  const loadingOrderEvents = ref(new Set<string>())
  const loadingWarningsErrors = ref(false)
  const loadingPortfolio = ref(false)
  const loadingBroker = ref(false)
  const loadingAggregated = ref(false)
  const loadingPendingOrders = ref(false)
  const loadingOrderHistory = ref(false)
  const loadingBookingPeriods = ref(false)
  const loadingConfig = ref(false)
  const loadingTradeHistory = ref(false)
  const loadingScenarios = ref(false)
  /**
   * Why a section is not here, keyed by the slot it would have filled.
   *
   * A 404 used to become `null` and the panel simply did not appear — four different situations
   * rendered as one blank space. The cause and the backend's own sentence are kept so the view can
   * say it once, above the column, rather than eight panels each saying nothing.
   */
  const absences = ref<Record<string, SectionAbsence>>({})
  /**
   * Why a section could not be loaded, keyed by the slot it would have filled.
   *
   * ONE ref served all seven sections until 2026-10-01 and they load concurrently, so the last
   * writer won: a section that failed could have its message overwritten by a later one, and the
   * reader was told about whichever happened to finish last. Keyed, every failure survives — the
   * same shape `absences` above already has, and for the same reason.
   */
  const errors = ref<Record<string, string>>({})
  // the artifact exists but predates the current schema — not an absence and not an outage
  const unreadable = ref<string | null>(null)

  /** Clears every section — the previous run's numbers must never survive a selection change. */
  function clear(): void {
    warningsErrors.value = null
    portfolio.value = null
    broker.value = null
    aggregated.value = null
    pendingOrders.value = null
    orderHistory.value = null
    bookingPeriods.value = null
    config.value = null
    tradeHistory.value = null
    scenarios.value = null
    orderEvents.value = new Map()
    loadingOrderEvents.value = new Set()
    absences.value = {}
    errors.value = {}
    unreadable.value = null
  }

  // The sections load concurrently and share one error slot, so a loader must not reset it on
  // the way in: that would erase the message a sibling section just wrote. clear() owns it.
  async function loadWarningsErrors(runId: string): Promise<void> {
    loadingWarningsErrors.value = true
    warningsErrors.value = null
    try {
      // null means the run carries no such artifact — the panel is then simply not shown
      const answer = await getWarningsErrors(runId)
      if (isAbsent(answer)) absences.value['warningsErrors'] = answer
      else warningsErrors.value = answer
    } catch (e) {
      // an artifact from an older schema is a state of the run, not a failure of the request
      if (e instanceof ArtifactUnreadableError) {
        unreadable.value = e.message
      } else {
        const detail = e instanceof Error ? e.message : String(e)
        errors.value['warningsErrors'] = `${t('Could not load warnings and errors')}: ${detail}`
      }
    } finally {
      loadingWarningsErrors.value = false
    }
  }

  async function loadPortfolio(runId: string): Promise<void> {
    loadingPortfolio.value = true
    portfolio.value = null
    try {
      const answer = await getPortfolio(runId)
      if (isAbsent(answer)) absences.value['portfolio'] = answer
      else portfolio.value = answer
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      errors.value['portfolio'] = `${t('Could not load the portfolio breakdown')}: ${detail}`
    } finally {
      loadingPortfolio.value = false
    }
  }

  /**
   * The brokers the run traded through. Absent on an AutoTrader session, which writes no such
   * section — so the absence is structure and the view says it once above the column.
   */
  async function loadBroker(runId: string): Promise<void> {
    loadingBroker.value = true
    broker.value = null
    try {
      const answer = await getBroker(runId)
      if (isAbsent(answer)) absences.value['broker'] = answer
      else broker.value = answer
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      errors.value['broker'] = `${t('Could not load the broker conditions')}: ${detail}`
    } finally {
      loadingBroker.value = false
    }
  }

  /**
   * What the run came to, folded over its scenarios. Its own request rather than a second read of
   * `run-summary`: the fold carries the run-wide cost split, the highest equity any account
   * reached and the realised balance beside the equity, none of which the summary states.
   */
  async function loadAggregated(runId: string): Promise<void> {
    loadingAggregated.value = true
    aggregated.value = null
    try {
      const answer = await getAggregatedPortfolio(runId)
      if (isAbsent(answer)) absences.value['aggregated'] = answer
      else aggregated.value = answer
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      errors.value['aggregated'] = `${t('Could not load the aggregated portfolio')}: ${detail}`
    } finally {
      loadingAggregated.value = false
    }
  }

  /**
   * What became of the pending orders. Its own request rather than a reading of the aggregate: the
   * fold states the run-wide counts, this one states them PER SCENARIO and carries the orders that
   * are still open, which is what makes a rejection traceable to the unit that produced it.
   */
  async function loadPendingOrders(runId: string): Promise<void> {
    loadingPendingOrders.value = true
    pendingOrders.value = null
    try {
      const answer = await getPendingOrders(runId)
      if (isAbsent(answer)) absences.value['pendingOrders'] = answer
      else pendingOrders.value = answer
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      errors.value['pendingOrders'] = `${t('Could not load the pending orders')}: ${detail}`
    } finally {
      loadingPendingOrders.value = false
    }
  }

  /**
   * Every order the run placed, as lifecycle records. The companion to the one above: that states
   * what BECAME of a scenario's orders, this states the orders themselves, and the Orders panel
   * joins them on the scenario name.
   */
  async function loadOrderHistory(runId: string): Promise<void> {
    loadingOrderHistory.value = true
    orderHistory.value = null
    try {
      const answer = await getOrderHistory(runId)
      if (isAbsent(answer)) absences.value['orderHistory'] = answer
      else orderHistory.value = answer
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      errors.value['orderHistory'] = `${t('Could not load the order history')}: ${detail}`
    } finally {
      loadingOrderHistory.value = false
    }
  }

  /**
   * The steps of ONE position's orders. Keyed per position, so a reader opening a second one does
   * not disturb the first, and already-held events are not fetched twice.
   *
   * An absence is kept here as an EMPTY list rather than in `absences`: that map is keyed by the
   * slot a panel would have filled, and this is a row inside a panel, not a section of its own.
   * A run with no stream at all is a different statement and the run list already carries it, in
   * `stream_files`.
   */
  async function loadOrderEvents(runId: string, scenario: string, orderId: string): Promise<void> {
    const key = `${scenario}~${orderId}`
    if (orderEvents.value.has(key) || loadingOrderEvents.value.has(key)) return
    loadingOrderEvents.value = new Set(loadingOrderEvents.value).add(key)
    try {
      const answer = await getOrderEvents(runId, scenario, orderId)
      const events = isAbsent(answer) ? [] : answer.events
      orderEvents.value = new Map(orderEvents.value).set(key, events)
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      errors.value[`orderEvents:${key}`] = `${t('Could not load the order steps')}: ${detail}`
    } finally {
      const next = new Set(loadingOrderEvents.value)
      next.delete(key)
      loadingOrderEvents.value = next
    }
  }

  /**
   * What is held for one position, and whether its request is in flight — read through functions so
   * the key form never leaves this store. A second place building `scenario~order` is a second
   * place to get it wrong.
   */
  function stepsFor(scenario: string, orderId: string): OrderEvent[] | null {
    return orderEvents.value.get(`${scenario}~${orderId}`) ?? null
  }

  function stepsLoading(scenario: string, orderId: string): boolean {
    return loadingOrderEvents.value.has(`${scenario}~${orderId}`)
  }

  /** Booking periods carry the same 409 case as any other stored artifact. */
  async function loadBookingPeriods(runId: string): Promise<void> {
    loadingBookingPeriods.value = true
    bookingPeriods.value = null
    try {
      const answer = await getBookingPeriods(runId)
      if (isAbsent(answer)) absences.value['bookingPeriods'] = answer
      else bookingPeriods.value = answer
    } catch (e) {
      if (e instanceof ArtifactUnreadableError) {
        unreadable.value = e.message
      } else {
        const detail = e instanceof Error ? e.message : String(e)
        errors.value['bookingPeriods'] = `${t('Could not load the booking periods')}: ${detail}`
      }
    } finally {
      loadingBookingPeriods.value = false
    }
  }

  /**
   * The configuration a run was commissioned with. A run that predates the config store answers
   * with an absence and the panel is simply not shown — but a run the backend does not know at all
   * is a DISAGREEMENT between its index and ours, and that must reach the reader rather than look
   * like a missing section.
   */
  async function loadConfig(runId: string): Promise<void> {
    loadingConfig.value = true
    config.value = null
    try {
      const answer = await getRunConfig(runId)
      if (isAbsent(answer)) absences.value['config'] = answer
      else config.value = answer
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      errors.value['config'] = `${t('Could not load the configuration')}: ${detail}`
    } finally {
      loadingConfig.value = false
    }
  }

  /** Every closed position of the run. Null where it closed none — the panel is then not shown. */
  async function loadTradeHistory(runId: string): Promise<void> {
    loadingTradeHistory.value = true
    tradeHistory.value = null
    try {
      const answer = await getTradeHistory(runId)
      if (isAbsent(answer)) absences.value['tradeHistory'] = answer
      else tradeHistory.value = answer
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      errors.value['tradeHistory'] = `${t('Could not load the trade history')}: ${detail}`
    } finally {
      loadingTradeHistory.value = false
    }
  }

  /**
   * The run's ROSTER — every scenario it declared, including those that produced nothing. Null for
   * an AutoTrader session, which has no scenario grid at all: the section is then not shown.
   */
  async function loadScenarios(runId: string): Promise<void> {
    loadingScenarios.value = true
    scenarios.value = null
    try {
      const answer = await getScenarioDetails(runId)
      if (isAbsent(answer)) absences.value['scenarios'] = answer
      else scenarios.value = answer
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      errors.value['scenarios'] = `${t('Could not load the scenario roster')}: ${detail}`
    } finally {
      loadingScenarios.value = false
    }
  }

  return {
    warningsErrors,
    scenarios,
    absences,
    portfolio,
    broker,
    aggregated,
    pendingOrders,
    orderHistory,
    orderEvents,
    loadingOrderEvents,
    bookingPeriods,
    config,
    tradeHistory,
    loadingWarningsErrors,
    loadingPortfolio,
    loadingBroker,
    loadingAggregated,
    loadingPendingOrders,
    loadingOrderHistory,
    loadingBookingPeriods,
    loadingConfig,
    loadingTradeHistory,
    loadingScenarios,
    errors,
    unreadable,
    clear,
    loadWarningsErrors,
    loadPortfolio,
    loadBroker,
    loadAggregated,
    loadPendingOrders,
    loadOrderHistory,
    loadOrderEvents,
    stepsFor,
    stepsLoading,
    loadBookingPeriods,
    loadConfig,
    loadTradeHistory,
    loadScenarios,
  }
})
