import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getSweep, getSweeps } from '@/api/api_client'
import { SurfaceForbiddenError } from '@/api/surface_forbidden_error'
import { useContextStore } from '@/stores/context_store'
import { describeFailure } from '@/stores/describe_failure'
import type { SweepDetail, SweepRow } from '@/types/api/sweep_types'
import { t } from '@/translate'

/**
 * Parameter searches. A sweep is not a run: it has no report of its own, only an identity its
 * combinations name — so everything here comes from the run-results ledger, ranked by the route,
 * and the way into the report routes is a combination's `run_id`. Built the way the deployments
 * are: the list, the sweep the context names, its ranking.
 */
export const useSweepsStore = defineStore('sweeps', () => {
  const context = useContextStore()

  const sweeps = ref<SweepRow[]>([])
  /** What makes one row unique, as the response declares it — `sweep_id`. Kept, not assumed. */
  const sweepsKey = ref<string[]>([])
  /** The sweep the reader chose — the CONTEXT's, read here so the view keeps one place to ask. */
  const selectedSweepId = computed(() => context.main.sweep.id)
  const selectedSweep = computed(() => sweeps.value.find(row => row.sweep_id === selectedSweepId.value) ?? null)
  const detail = ref<SweepDetail | null>(null)
  const loadingList = ref(false)
  const loadingDetail = ref(false)
  const error = ref<string | null>(null)
  // the token carries nothing on the `sweeps` surface — neither an absence nor an outage
  const forbiddenSurface = ref<string | null>(null)
  // an id the ledger does not contain — a stored selection of a sweep that is gone since
  const unknownSweepId = ref<string | null>(null)

  function clearLoaded(): void {
    detail.value = null
    unknownSweepId.value = null
  }

  function clearSelection(): void {
    context.selectSweep(null)
    clearLoaded()
  }

  /**
   * The list of sweeps, fetched once per store lifetime and again when the panel comes back.
   *
   * @param refresh Fetch again a list already on screen — quietly, with no spinner in its place.
   */
  async function loadSweeps(refresh = false): Promise<void> {
    if (!refresh && sweeps.value.length) return
    if (!refresh) loadingList.value = true
    error.value = null
    forbiddenSurface.value = null
    try {
      const response = await getSweeps()
      // newest first, as the route orders it
      sweeps.value = response.sweeps
      sweepsKey.value = response.key
    } catch (e) {
      if (e instanceof SurfaceForbiddenError) {
        forbiddenSurface.value = e.surface
      } else {
        error.value = describeFailure(e, t('Could not load the sweeps'))
      }
    } finally {
      loadingList.value = false
    }
  }

  /**
   * Loads what the context names, without touching the context — the restore after a reload, and
   * the second half of choosing a sweep. A sweep the list does not show YET is asked for once more
   * before it is called gone: a run header can name a sweep newer than the list on screen.
   */
  async function loadSweep(sweepId: string): Promise<void> {
    clearLoaded()
    const listed = () => sweeps.value.some(row => row.sweep_id === sweepId)
    if (!listed()) {
      await loadSweeps(true)
      if (selectedSweepId.value !== sweepId) return
    }
    if (!listed()) {
      unknownSweepId.value = sweepId
      return
    }

    loadingDetail.value = true
    error.value = null
    try {
      const ranked = await getSweep(sweepId)
      // an answer for a sweep the reader has left since is not this sweep's answer
      if (selectedSweepId.value !== sweepId) return
      if (ranked === null) unknownSweepId.value = sweepId
      detail.value = ranked
    } catch (e) {
      if (selectedSweepId.value !== sweepId) return
      if (e instanceof SurfaceForbiddenError) {
        forbiddenSurface.value = e.surface
      } else {
        error.value = describeFailure(e, t('Could not load the sweep'))
      }
    } finally {
      if (selectedSweepId.value === sweepId) loadingDetail.value = false
    }
  }

  /**
   * A sweep the reader chose: it becomes the main link's, then it loads. The one already chosen
   * loads again only where it is not on show — it failed, or the ledger did not know it.
   */
  async function selectSweep(sweepId: string): Promise<void> {
    const same = sweepId === selectedSweepId.value
    const shown = (detail.value !== null || loadingDetail.value) && unknownSweepId.value === null
    if (same && shown) return
    if (!same) context.selectSweep(sweepId)
    await loadSweep(sweepId)
  }

  return {
    sweeps,
    sweepsKey,
    selectedSweepId,
    selectedSweep,
    detail,
    loadingList,
    loadingDetail,
    error,
    forbiddenSurface,
    unknownSweepId,
    loadSweeps,
    loadSweep,
    selectSweep,
    clearSelection,
  }
})
