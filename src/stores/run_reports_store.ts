import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getBookingPeriods, getPortfolio, getRunConfig, getScenarioDetails, getTradeHistory,
  getWarningsErrors,
} from '@/api/api_client'
import { ArtifactUnreadableError } from '@/api/artifact_unreadable_error'
import { isAbsent } from '@/types/api/absence_types'
import type { SectionAbsence } from '@/types/api/absence_types'
import type {
  BookingPeriodsReport,
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
  const bookingPeriods = ref<BookingPeriodsReport | null>(null)
  const config = ref<RunConfigReport | null>(null)
  const tradeHistory = ref<TradeHistoryReport | null>(null)
  const scenarios = ref<ScenarioDetailsReport | null>(null)
  const loadingWarningsErrors = ref(false)
  const loadingPortfolio = ref(false)
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
  const error = ref<string | null>(null)
  // the artifact exists but predates the current schema — not an absence and not an outage
  const unreadable = ref<string | null>(null)

  /** Clears every section — the previous run's numbers must never survive a selection change. */
  function clear(): void {
    warningsErrors.value = null
    portfolio.value = null
    bookingPeriods.value = null
    config.value = null
    tradeHistory.value = null
    scenarios.value = null
    absences.value = {}
    error.value = null
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
        error.value = `${t('Could not load warnings and errors')}: ${detail}`
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
      error.value = `${t('Could not load the portfolio breakdown')}: ${detail}`
    } finally {
      loadingPortfolio.value = false
    }
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
        error.value = `${t('Could not load the booking periods')}: ${detail}`
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
      error.value = `${t('Could not load the configuration')}: ${detail}`
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
      error.value = `${t('Could not load the trade history')}: ${detail}`
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
      error.value = `${t('Could not load the scenario roster')}: ${detail}`
    } finally {
      loadingScenarios.value = false
    }
  }

  return {
    warningsErrors,
    scenarios,
    absences,
    portfolio,
    bookingPeriods,
    config,
    tradeHistory,
    loadingWarningsErrors,
    loadingPortfolio,
    loadingBookingPeriods,
    loadingConfig,
    loadingTradeHistory,
    loadingScenarios,
    error,
    unreadable,
    clear,
    loadWarningsErrors,
    loadPortfolio,
    loadBookingPeriods,
    loadConfig,
    loadTradeHistory,
    loadScenarios,
  }
})
