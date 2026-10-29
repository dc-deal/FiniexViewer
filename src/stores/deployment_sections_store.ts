import { defineStore, storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useDeploymentsStore } from '@/stores/deployments_store'
import type { DeploymentPeriodsModel, DeploymentSessionsModel } from '@/types/deployment_bundle_types'

/**
 * What the deployment bundle's members draw (viewer#43): their models, keyed by the `source` each
 * declares, read off the deployments store — the bundle fetches nothing of its own, the way the run
 * report's sections read `run_sections_store`.
 */
export const useDeploymentSectionsStore = defineStore('deployment_sections', () => {
  const deployments = useDeploymentsStore()
  const { detail, periods, selectedRows, loadingDetail } = storeToRefs(deployments)

  const sources = computed<Record<string, DeploymentSessionsModel | DeploymentPeriodsModel | null>>(() => ({
    sessions: detail.value ? { detail: detail.value, rows: selectedRows.value } : null,
    // a deployment whose sessions sealed no day yet has no period to draw
    periods: periods.value?.periods.length
      ? { periods: periods.value, sessions: detail.value?.sessions ?? [] }
      : null,
  }))

  /** Members on their way for the deployment on screen, keyed the same way. */
  const pending = computed<Record<string, boolean>>(() => ({
    sessions: loadingDetail.value,
    periods: loadingDetail.value,
  }))

  /**
   * The chosen deployment carries no such member — loaded, and nothing to draw. One still on its
   * way is not absent, and with no deployment chosen nothing is.
   */
  function lacks(source: string): boolean {
    if (loadingDetail.value || !detail.value) return false
    return sources.value[source] === null
  }

  return { sources, pending, lacks }
})
