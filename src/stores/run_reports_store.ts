import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getBookingPeriods, getPortfolio, getRunConfig, getTradeHistory, getWarningsErrors,
} from '@/api/api_client'
import { ArtifactUnreadableError } from '@/api/artifact_unreadable_error'
import type {
  BookingPeriodsReport,
  RunConfigReport,
  TradeHistoryReport,
  PortfolioReport,
  WarningsErrorsReport,
} from '@/types/api/report_types'
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
  const loadingWarningsErrors = ref(false)
  const loadingPortfolio = ref(false)
  const loadingBookingPeriods = ref(false)
  const loadingConfig = ref(false)
  const loadingTradeHistory = ref(false)
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
      warningsErrors.value = await getWarningsErrors(runId)
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
      portfolio.value = await getPortfolio(runId)
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
      bookingPeriods.value = await getBookingPeriods(runId)
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
      config.value = await getRunConfig(runId)
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
      tradeHistory.value = await getTradeHistory(runId)
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      error.value = `${t('Could not load the trade history')}: ${detail}`
    } finally {
      loadingTradeHistory.value = false
    }
  }

  return {
    warningsErrors,
    portfolio,
    bookingPeriods,
    config,
    tradeHistory,
    loadingWarningsErrors,
    loadingPortfolio,
    loadingBookingPeriods,
    loadingConfig,
    loadingTradeHistory,
    error,
    unreadable,
    clear,
    loadWarningsErrors,
    loadPortfolio,
    loadBookingPeriods,
    loadConfig,
    loadTradeHistory,
  }
})
