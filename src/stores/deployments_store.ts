import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getDeployment,
  getDeploymentBookingPeriods,
  getDeployments,
} from '@/api/api_client'
import { SurfaceForbiddenError } from '@/api/surface_forbidden_error'
import type {
  DeploymentBookingPeriodsReport,
  DeploymentDetail,
  DeploymentRow,
} from '@/types/api/deployment_types'
import { t } from '@/translate'

/**
 * A live bot's life across its restarts. A deployment is not a run: it has no directory and no
 * artifacts, only an identity that a series of runs name — so everything here comes from the
 * ledger, and the way into the report routes is a session's `run_id`.
 */
export const useDeploymentsStore = defineStore('deployments', () => {
  const deployments = ref<DeploymentRow[]>([])
  const selectedDeploymentId = ref<string | null>(null)
  const detail = ref<DeploymentDetail | null>(null)
  const periods = ref<DeploymentBookingPeriodsReport | null>(null)
  const loadingList = ref(false)
  const loadingDetail = ref(false)
  const error = ref<string | null>(null)
  // the token carries nothing on the `deployments` surface — neither an absence nor an outage,
  // and the one failure a component must phrase differently from "could not load"
  const forbiddenSurface = ref<string | null>(null)
  // an id the ledger does not contain — a stale link or a bookmark
  const unknownDeploymentId = ref<string | null>(null)

  /**
   * The list rows of the selected deployment — PLURAL on purpose. The list is keyed by
   * (deployment_id, currency), so a bot that booked in two account currencies has two rows and
   * picking one of them would drop a whole currency's figures.
   */
  const selectedRows = computed(() =>
    deployments.value.filter(row => row.deployment_id === selectedDeploymentId.value)
  )

  function describeFailure(e: unknown, action: string): string {
    const detailText = e instanceof Error ? e.message : String(e)
    return `${action}: ${detailText}`
  }

  function clearSelection(): void {
    selectedDeploymentId.value = null
    detail.value = null
    periods.value = null
    unknownDeploymentId.value = null
  }

  async function loadDeployments(): Promise<void> {
    loadingList.value = true
    error.value = null
    forbiddenSurface.value = null
    try {
      const response = await getDeployments()
      // the order is a decision of the backend's — newest first, so the row you came for is on top
      deployments.value = response.deployments
    } catch (e) {
      if (e instanceof SurfaceForbiddenError) {
        forbiddenSurface.value = e.surface
      } else {
        error.value = describeFailure(e, t('Could not load the deployments'))
      }
    } finally {
      loadingList.value = false
    }
  }

  /**
   * Selects a deployment the ledger actually lists. Same rule as the run selection: the index is
   * the authority, so a link naming a deployment that is gone says so instead of producing a
   * request whose 404 the view cannot explain.
   */
  async function selectDeployment(deploymentId: string): Promise<void> {
    clearSelection()
    if (!deployments.value.some(row => row.deployment_id === deploymentId)) {
      unknownDeploymentId.value = deploymentId
      return
    }
    selectedDeploymentId.value = deploymentId

    loadingDetail.value = true
    error.value = null
    try {
      // both sides of the deployment are loaded together — the sessions and the periods they
      // booked are one picture, and nothing here is derived from the other
      const [sessions, booked] = await Promise.all([
        getDeployment(deploymentId),
        getDeploymentBookingPeriods(deploymentId),
      ])
      detail.value = sessions
      periods.value = booked
    } catch (e) {
      if (e instanceof SurfaceForbiddenError) {
        forbiddenSurface.value = e.surface
      } else {
        error.value = describeFailure(e, t('Could not load the deployment'))
      }
    } finally {
      loadingDetail.value = false
    }
  }

  return {
    deployments,
    selectedDeploymentId,
    selectedRows,
    detail,
    periods,
    loadingList,
    loadingDetail,
    error,
    forbiddenSurface,
    unknownDeploymentId,
    loadDeployments,
    selectDeployment,
    clearSelection,
  }
})
