import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getWarningsErrors } from '@/api/api_client'
import type { WarningsErrorsReport } from '@/types/api/report_types'
import { t } from '@/translate'

/**
 * What a run says, section by section. Deliberately separate from `runs_store`, which answers
 * WHICH run is selected — this one answers what that run reports. Every section is addressed by
 * the same key, `run_id`, and they all clear together when the selection changes.
 */
export const useRunReportsStore = defineStore('run_reports', () => {
  const warningsErrors = ref<WarningsErrorsReport | null>(null)
  const loadingWarningsErrors = ref(false)
  const error = ref<string | null>(null)

  /** Clears every section — the previous run's numbers must never survive a selection change. */
  function clear(): void {
    warningsErrors.value = null
    error.value = null
  }

  async function loadWarningsErrors(runId: string): Promise<void> {
    loadingWarningsErrors.value = true
    error.value = null
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

  return {
    warningsErrors,
    loadingWarningsErrors,
    error,
    clear,
    loadWarningsErrors,
  }
})
