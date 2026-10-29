import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { getRunConfig } from '@/api/api_client'
import { describeFailure } from '@/stores/describe_failure'
import { isAbsent } from '@/types/api/absence_types'
import type { RunConfigReport } from '@/types/api/report_types'
import { t } from '@/translate'

/** Which side of a deployment's change mark the OTHER configuration stands on. */
export type CompareSide = 'before' | 'after'

/**
 * A configuration shown beside another: the session a change mark's link opened, and the session on
 * the other side of that mark. The run on show holds the first configuration already; this holds
 * the second, asked for when the link is followed.
 */
export const useConfigCompareStore = defineStore('config_compare', () => {
  /** The run whose configuration is on show, compared with `other`. */
  const shown = ref<string | null>(null)
  const other = ref<string | null>(null)
  const side = ref<CompareSide | null>(null)
  const otherConfig = shallowRef<RunConfigReport | null>(null)
  const loading = ref(false)
  /** Why the other configuration is not here: the backend's sentence, or the failure of the request. */
  const missing = ref<string | null>(null)
  let ticket = 0

  async function compare(shownRunId: string, otherRunId: string, otherSide: CompareSide): Promise<void> {
    const mine = ++ticket
    shown.value = shownRunId
    other.value = otherRunId
    side.value = otherSide
    otherConfig.value = null
    missing.value = null
    loading.value = true
    try {
      const answer = await getRunConfig(otherRunId)
      if (mine !== ticket) return
      if (isAbsent(answer)) missing.value = answer.detail || t('The other session has no configuration on record')
      else otherConfig.value = answer
    } catch (error) {
      if (mine !== ticket) return
      missing.value = describeFailure(error, t('Could not load the other configuration'))
    } finally {
      if (mine === ticket) loading.value = false
    }
  }

  function stop(): void {
    ticket += 1
    shown.value = null
    other.value = null
    side.value = null
    otherConfig.value = null
    missing.value = null
    loading.value = false
  }

  return { shown, other, side, otherConfig, loading, missing, compare, stop }
})
