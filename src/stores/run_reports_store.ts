import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPortfolio, getWarningsErrors } from '@/api/api_client'
import type { PortfolioReport, WarningsErrorsReport } from '@/types/api/report_types'
import { t } from '@/translate'

/**
 * What a run says, section by section. Deliberately separate from `runs_store`, which answers
 * WHICH run is selected — this one answers what that run reports. Every section is addressed by
 * the same key, `run_id`, and they all clear together when the selection changes.
 */
export const useRunReportsStore = defineStore('run_reports', () => {
  const warningsErrors = ref<WarningsErrorsReport | null>(null)
  const portfolio = ref<PortfolioReport | null>(null)
  const loadingWarningsErrors = ref(false)
  const loadingPortfolio = ref(false)
  const error = ref<string | null>(null)

  /** Clears every section — the previous run's numbers must never survive a selection change. */
  function clear(): void {
    warningsErrors.value = null
    portfolio.value = null
    error.value = null
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
      const detail = e instanceof Error ? e.message : String(e)
      error.value = `${t('Could not load warnings and errors')}: ${detail}`
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

  return {
    warningsErrors,
    portfolio,
    loadingWarningsErrors,
    loadingPortfolio,
    error,
    clear,
    loadWarningsErrors,
    loadPortfolio,
  }
})
