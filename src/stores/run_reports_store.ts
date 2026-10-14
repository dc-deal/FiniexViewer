import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Ref } from 'vue'
import {
  getAggregatedPortfolio, getBookingPeriods, getBroker, getOrderEvents, getOrderHistory,
  getRunHeader,
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
  RunHeader,
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
  const runHeader = ref<RunHeader | null>(null)
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
  const loadingRunHeader = ref(false)
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
  /**
   * Why a section's artifact could not be read, keyed by the slot it would have filled: it exists
   * but predates the current schema — not an absence and not an outage.
   *
   * ONE string until 2026-10-14, with the last-writer-wins shape `errors` had before it: two
   * unreadable sections showed one message, and a section shown as a panel of its own could not
   * say its own.
   */
  const unreadable = ref<Record<string, string>>({})

  /**
   * Which selection the requests in flight belong to. Every request takes the number it was made
   * under and writes NOTHING once `clear()` has moved it on — no section, no absence, no failure,
   * not even its own loading flag.
   *
   * Without it the last answer won, whichever run it was for: a slow section of the previous run
   * landed in the next one wherever that run did not ask for the same section — an AutoTrader
   * session asks for no roster — and the old request's `finally` switched off the loading flag of
   * the new one, so a section still coming briefly left the column.
   */
  let generation = 0

  /** Clears every section — the previous run's numbers must never survive a selection change. */
  function clear(): void {
    generation += 1
    runHeader.value = null
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
    // the flags as well: a section the next run does not ask for would otherwise wait for an
    // answer that may no longer land, and say it is loading for good
    loadingRunHeader.value = false
    loadingWarningsErrors.value = false
    loadingPortfolio.value = false
    loadingBroker.value = false
    loadingAggregated.value = false
    loadingPendingOrders.value = false
    loadingOrderHistory.value = false
    loadingBookingPeriods.value = false
    loadingConfig.value = false
    loadingTradeHistory.value = false
    loadingScenarios.value = false
    absences.value = {}
    errors.value = {}
    unreadable.value = {}
  }

  /**
   * One section into its slot: emptied on the way in, then the answer, the reason it is absent, or
   * the sentence saying why it failed — each only while the selection it was asked for is still
   * the current one.
   *
   * The sections load concurrently, so a loader must not reset the failures on the way in: that
   * would erase what a sibling section just wrote. clear() owns them.
   *
   * @param slot The key the section's absence, failure and unreadable state are kept under.
   * @param target The section's own ref.
   * @param loading The section's loading flag.
   * @param request The request, made at once.
   * @param failure What the reader is told when the request fails, ahead of the detail.
   * @param meetsOlderSchema Whether an artifact in an older schema is a STATE of the run here
   *   rather than a failure — true for the sections known to meet one.
   */
  async function loadSection<T>(
    slot: string,
    target: Ref<T | null>,
    loading: Ref<boolean>,
    request: () => Promise<T | SectionAbsence>,
    failure: string,
    meetsOlderSchema = false,
  ): Promise<void> {
    const ticket = generation
    loading.value = true
    target.value = null
    try {
      // an absence means the run carries no such artifact — the panel is then simply not shown
      const answer = await request()
      if (ticket !== generation) return
      if (isAbsent(answer)) absences.value[slot] = answer
      else target.value = answer
    } catch (e) {
      if (ticket !== generation) return
      // an artifact from an older schema is a state of the run, not a failure of the request
      if (meetsOlderSchema && e instanceof ArtifactUnreadableError) {
        unreadable.value[slot] = e.message
      } else {
        const detail = e instanceof Error ? e.message : String(e)
        errors.value[slot] = `${failure}: ${detail}`
      }
    } finally {
      if (ticket === generation) loading.value = false
    }
  }

  function loadWarningsErrors(runId: string): Promise<void> {
    return loadSection('warningsErrors', warningsErrors, loadingWarningsErrors,
      () => getWarningsErrors(runId), t('Could not load warnings and errors'), true)
  }

  function loadPortfolio(runId: string): Promise<void> {
    return loadSection('portfolio', portfolio, loadingPortfolio,
      () => getPortfolio(runId), t('Could not load the portfolio breakdown'))
  }

  /**
   * The brokers the run traded through. Absent on an AutoTrader session, which writes no such
   * section — so the absence is structure and the view says it once above the column.
   */
  function loadBroker(runId: string): Promise<void> {
    return loadSection('broker', broker, loadingBroker,
      () => getBroker(runId), t('Could not load the broker conditions'))
  }

  /**
   * The record the run wrote before it did anything else. **Ungated**, unlike the sections above:
   * `header` is not in a run's `artifacts`, and the route answers even where that list is empty
   * — measured 2026-10-10 on all three logs-only runs in the archive.
   */
  function loadRunHeader(runId: string): Promise<void> {
    return loadSection('runHeader', runHeader, loadingRunHeader,
      () => getRunHeader(runId), t('Could not load the run header'))
  }

  /**
   * What the run came to, folded over its scenarios. Its own request rather than a second read of
   * `run-summary`: the fold carries the run-wide cost split, the highest equity any account
   * reached and the realised balance beside the equity, none of which the summary states.
   */
  function loadAggregated(runId: string): Promise<void> {
    return loadSection('aggregated', aggregated, loadingAggregated,
      () => getAggregatedPortfolio(runId), t('Could not load the aggregated portfolio'))
  }

  /**
   * What became of the pending orders. Its own request rather than a reading of the aggregate: the
   * fold states the run-wide counts, this one states them PER SCENARIO and carries the orders that
   * are still open, which is what makes a rejection traceable to the unit that produced it.
   */
  function loadPendingOrders(runId: string): Promise<void> {
    return loadSection('pendingOrders', pendingOrders, loadingPendingOrders,
      () => getPendingOrders(runId), t('Could not load the pending orders'))
  }

  /**
   * Every order the run placed, as lifecycle records. The companion to the one above: that states
   * what BECAME of a scenario's orders, this states the orders themselves, and the Orders panel
   * joins them on the scenario name.
   */
  function loadOrderHistory(runId: string): Promise<void> {
    return loadSection('orderHistory', orderHistory, loadingOrderHistory,
      () => getOrderHistory(runId), t('Could not load the order history'))
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
    const ticket = generation
    loadingOrderEvents.value = new Set(loadingOrderEvents.value).add(key)
    try {
      const answer = await getOrderEvents(runId, scenario, orderId)
      if (ticket !== generation) return
      const events = isAbsent(answer) ? [] : answer.events
      orderEvents.value = new Map(orderEvents.value).set(key, events)
    } catch (e) {
      if (ticket !== generation) return
      const detail = e instanceof Error ? e.message : String(e)
      errors.value[`orderEvents:${key}`] = `${t('Could not load the order steps')}: ${detail}`
    } finally {
      // after a run change the set is the next run's, and the same key may be in flight there
      if (ticket === generation) {
        const next = new Set(loadingOrderEvents.value)
        next.delete(key)
        loadingOrderEvents.value = next
      }
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
  function loadBookingPeriods(runId: string): Promise<void> {
    return loadSection('bookingPeriods', bookingPeriods, loadingBookingPeriods,
      () => getBookingPeriods(runId), t('Could not load the booking periods'), true)
  }

  /**
   * The configuration a run was commissioned with. A run that predates the config store answers
   * with an absence and the panel is simply not shown — but a run the backend does not know at all
   * is a DISAGREEMENT between its index and ours, and that must reach the reader rather than look
   * like a missing section.
   */
  function loadConfig(runId: string): Promise<void> {
    return loadSection('config', config, loadingConfig,
      () => getRunConfig(runId), t('Could not load the configuration'))
  }

  /** Every closed position of the run. Null where it closed none — the panel is then not shown. */
  function loadTradeHistory(runId: string): Promise<void> {
    return loadSection('tradeHistory', tradeHistory, loadingTradeHistory,
      () => getTradeHistory(runId), t('Could not load the trade history'))
  }

  /**
   * The run's ROSTER — every scenario it declared, including those that produced nothing. Null for
   * an AutoTrader session, which has no scenario grid at all: the section is then not shown.
   */
  function loadScenarios(runId: string): Promise<void> {
    return loadSection('scenarios', scenarios, loadingScenarios,
      () => getScenarioDetails(runId), t('Could not load the scenario roster'))
  }

  return {
    runHeader,
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
    loadingRunHeader,
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
    loadRunHeader,
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
