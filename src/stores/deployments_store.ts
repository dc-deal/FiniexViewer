import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getDeployment,
  getDeploymentBookingPeriods,
  getDeployments,
} from '@/api/api_client'
import { SurfaceForbiddenError } from '@/api/surface_forbidden_error'
import { useContextStore } from '@/stores/context_store'
import type {
  DeploymentBookingPeriodsReport,
  DeploymentDetail,
  DeploymentRow,
} from '@/types/api/deployment_types'
import { t } from '@/translate'

/**
 * A bot's life across its restarts. A deployment is not a run: it has no directory and no
 * artifacts, only an identity that a series of runs name — so everything here comes from the
 * ledger, and the way into the report routes is a session's `run_id`.
 */
export const useDeploymentsStore = defineStore('deployments', () => {
  const context = useContextStore()

  const deployments = ref<DeploymentRow[]>([])
  /**
   * What makes one ledger row unique, as the response DECLARES it — (deployment_id, currency).
   * Kept rather than dropped because the list that draws these rows needs it for the same reason
   * every other list does: a bot that booked in two account currencies has two rows, and keying on
   * the deployment alone folds them into one, silently and in the direction that loses data.
   */
  const deploymentsKey = ref<string[]>([])
  /** The deployment the reader chose — the CONTEXT's, read here so the view keeps one place to ask. */
  const selectedDeploymentId = computed(() => context.main.deployment.id)
  const detail = ref<DeploymentDetail | null>(null)
  const periods = ref<DeploymentBookingPeriodsReport | null>(null)
  const loadingList = ref(false)
  const loadingDetail = ref(false)
  const error = ref<string | null>(null)
  // the token carries nothing on the `deployments` surface — neither an absence nor an outage,
  // and the one failure a component must phrase differently from "could not load"
  const forbiddenSurface = ref<string | null>(null)
  // an id the ledger does not contain — a stored selection of a deployment that is gone since
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

  function clearLoaded(): void {
    detail.value = null
    periods.value = null
    unknownDeploymentId.value = null
  }

  function clearSelection(): void {
    context.selectDeployment(null)
    clearLoaded()
  }

  /**
   * The ledger listing. Fetched once per store lifetime rather than on every mount of the view:
   * it does not change while a deployment is open, and the backend measured this route at ~100 ms
   * of which 74 % is stat-ing every index fragment to prove the index still valid. Navigating away
   * and back therefore costs nothing. A browser reload gets a fresh list; `refresh` forces one.
   *
   * Deliberately NOT time-based. A validity window is a staleness decision, and the backend is
   * taking that one on its own side for every store index it has — inventing a different answer
   * here would just be a second opinion nobody asked for.
   */
  async function loadDeployments(refresh = false): Promise<void> {
    if (!refresh && deployments.value.length) return
    loadingList.value = true
    error.value = null
    forbiddenSurface.value = null
    try {
      const response = await getDeployments()
      // the order is a decision of the backend's — newest first, so the row you came for is on top
      deployments.value = response.deployments
      deploymentsKey.value = response.key
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
   * Loads what the context names, without touching the context — the restore after a reload, and
   * the second half of choosing a deployment. Same rule as the runs: the ledger is the authority,
   * so a stored deployment that is gone says so instead of producing a request whose 404 the view
   * cannot explain.
   */
  async function loadDeployment(deploymentId: string): Promise<void> {
    clearLoaded()
    if (!deployments.value.some(row => row.deployment_id === deploymentId)) {
      unknownDeploymentId.value = deploymentId
      return
    }

    loadingDetail.value = true
    error.value = null
    try {
      // both sides of the deployment are loaded together — the sessions and the periods they
      // booked are one picture, and nothing here is derived from the other
      const [sessions, booked] = await Promise.all([
        getDeployment(deploymentId),
        getDeploymentBookingPeriods(deploymentId),
      ])
      // an answer for a deployment the reader has left since is not this deployment's answer
      if (selectedDeploymentId.value !== deploymentId) return
      detail.value = sessions
      periods.value = booked
    } catch (e) {
      if (selectedDeploymentId.value !== deploymentId) return
      if (e instanceof SurfaceForbiddenError) {
        forbiddenSurface.value = e.surface
      } else {
        error.value = describeFailure(e, t('Could not load the deployment'))
      }
    } finally {
      if (selectedDeploymentId.value === deploymentId) loadingDetail.value = false
    }
  }

  /** A deployment the reader chose: it becomes the main link's, then it loads. */
  async function selectDeployment(deploymentId: string): Promise<void> {
    context.selectDeployment(deploymentId)
    await loadDeployment(deploymentId)
  }

  return {
    deployments,
    deploymentsKey,
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
    loadDeployment,
    selectDeployment,
    clearSelection,
  }
})
