import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import type { SectionAbsence } from '@/types/api/absence_types'

/**
 * What the run report's sections render, composed ONCE for every place a section is drawn — the
 * Runs panel's column, and a section opened as a panel of its own beside it. Composed in the run
 * view until 2026-10-14; a second place drawing sections would have composed its own, and two
 * composed models of one section drift apart in silence.
 *
 * It holds nothing of its own: which run, and its summary, are `runs_store`'s; what that run
 * reports is `run_reports_store`'s.
 */
export const useRunSectionsStore = defineStore('run_sections', () => {
  const runs = useRunsStore()
  const reports = useRunReportsStore()

  /*
   * The three COMPOSED models, each its own computed. Built inside the one `sources` literal below,
   * every one of them was a new object whenever ANY section arrived, and a panel that watched its
   * model handed a reader's choices back: the roster cleared its narrowing as the trade history or
   * the configuration landed, neither of which it even reads. Apart, a composed model changes only
   * when one of its OWN parts does — and since those still arrive one by one, a panel that resets on
   * a new run watches the run's id, never the model (OrdersPanel, ScenarioRosterPanel,
   * TradeHistoryPanel).
   */

  /**
   * TWO models in one, and both halves are needed. The index ROW is always there and answers for
   * a run with no artifacts at all; the served HEADER carries the two things the row cannot —
   * which code ran, and whether uncommitted code was explicitly allowed to place real orders. The
   * row is never absent, so the panel always draws; the header may be, and then it draws less.
   */
  const headerModel = computed(() => runs.selectedRun
    ? { info: runs.selectedRun, served: reports.runHeader }
    : null)

  // composed rather than served: `pending-orders` says what BECAME of a scenario's orders and
  // `order-history` carries the orders themselves. Joined on the scenario name, which both sides
  // write from the same run unit. The history is what the panel needs — a run with a funnel and no
  // orders has nothing to show — so the pending half may be null and the panel says so.
  const ordersModel = computed(() => reports.orderHistory
    ? {
        pending: reports.pendingOrders,
        history: reports.orderHistory,
        // the TRADES too, and only so a link can be absent where it would lead nowhere: 55 of the
        // measured positions opened and never closed, so they produced no trade at all
        trades: reports.tradeHistory,
      }
    : null)

  // composed rather than served: the roster says what was DECLARED, the portfolio what it EARNED
  // and warnings-errors what WENT WRONG — three responses, one question a reader scans forty rows
  // with. Joined on the unit name, which is one identity across all three.
  const rosterModel = computed(() => reports.scenarios
    ? {
        scenarios: reports.scenarios,
        portfolio: reports.portfolio,
        warningsErrors: reports.warningsErrors,
      }
    : null)

  // the models the panels render, keyed by the source each descriptor declares
  const sources = computed<Record<string, unknown>>(() => ({
    header: headerModel.value,
    runSummary: runs.summary,
    feedHealth: runs.feedHealth,
    warningsErrors: reports.warningsErrors,
    portfolio: reports.portfolio,
    broker: reports.broker,
    aggregated: reports.aggregated,
    orders: ordersModel.value,
    bookingPeriods: reports.bookingPeriods,
    config: reports.config,
    scenarioRoster: rosterModel.value,
    tradeHistory: reports.tradeHistory,
  }))

  /**
   * Which sections are on their way for the run on screen, keyed like `sources`. A panel whose
   * section is coming keeps its place and says so; it leaves the column only once the run is KNOWN
   * not to carry it. Until 2026-10-13 a run change emptied every section at once and each panel left
   * and came back on its own — the column collapsed and rebuilt itself piece by piece, and nothing
   * said it was loading (a selection never moves the layout).
   */
  const pending = computed<Record<string, boolean>>(() => ({
    runSummary: runs.loadingSummary,
    feedHealth: runs.loadingSummary,
    warningsErrors: reports.loadingWarningsErrors,
    portfolio: reports.loadingPortfolio,
    broker: reports.loadingBroker,
    aggregated: reports.loadingAggregated,
    orders: reports.loadingOrderHistory,
    bookingPeriods: reports.loadingBookingPeriods,
    config: reports.loadingConfig,
    scenarioRoster: reports.loadingScenarios,
    tradeHistory: reports.loadingTradeHistory,
  }))

  /**
   * Why a section is not here, the summary's included, keyed by the slot it would have filled. The
   * run view says it once above the column; the backend's sentence travels with each.
   */
  const absences = computed<Record<string, SectionAbsence>>(() => ({
    ...reports.absences,
    ...(runs.summaryAbsence ? { runSummary: runs.summaryAbsence } : {}),
  }))

  return { sources, pending, absences }
})
