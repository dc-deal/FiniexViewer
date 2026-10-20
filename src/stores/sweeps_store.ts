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
 * and the way into the report routes is a combination's `run_id`. The list of sweeps, and each
 * sweep's ranking loaded the first time its line is opened.
 */
export const useSweepsStore = defineStore('sweeps', () => {
  const context = useContextStore()

  const sweeps = ref<SweepRow[]>([])
  /** What makes one row unique, as the response declares it — `sweep_id`. Kept, not assumed. */
  const sweepsKey = ref<string[]>([])
  /** The sweep looked at last — the link's, so a reload and the run header's jump find it open. */
  const selectedSweepId = computed(() => context.main.sweep.id)
  /** Each sweep's ranking exactly as the route serves it, by sweep id. Nothing here re-sorts it. */
  const rankings = ref<Record<string, SweepDetail>>({})
  /** The sweeps whose ranking is on its way. */
  const loadingRankings = ref<string[]>([])
  /** A ranking that could not be read, by sweep — the sentence its line shows instead. */
  const rankingFailures = ref<Record<string, string>>({})
  /** The sweeps the ledger answered `404 sweep_not_found` for since the list was read. */
  const goneSweeps = ref<string[]>([])
  const loadingList = ref(false)
  const error = ref<string | null>(null)
  // the token carries nothing on the `sweeps` surface — neither an absence nor an outage
  const forbiddenSurface = ref<string | null>(null)
  // the sweep the link names where the list holds no such sweep — a stored or followed link gone stale
  const unknownSweepId = ref<string | null>(null)

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
   * One sweep's ranking, asked once — and again only when told to refresh, quietly: a running
   * sweep grows a combination at a time.
   */
  async function loadRanking(sweepId: string, refresh = false): Promise<void> {
    if (loadingRankings.value.includes(sweepId)) return
    if (!refresh && rankings.value[sweepId]) return
    if (!refresh) loadingRankings.value = [...loadingRankings.value, sweepId]
    rankingFailures.value = Object.fromEntries(Object.entries(rankingFailures.value).filter(([id]) => id !== sweepId))
    try {
      const ranked = await getSweep(sweepId)
      if (ranked === null) {
        goneSweeps.value = [...new Set([...goneSweeps.value, sweepId])]
      } else {
        rankings.value = { ...rankings.value, [sweepId]: ranked }
        goneSweeps.value = goneSweeps.value.filter(id => id !== sweepId)
      }
    } catch (e) {
      if (e instanceof SurfaceForbiddenError) {
        forbiddenSurface.value = e.surface
      } else {
        rankingFailures.value = { ...rankingFailures.value, [sweepId]: describeFailure(e, t('Could not load the ranking')) }
      }
    } finally {
      loadingRankings.value = loadingRankings.value.filter(id => id !== sweepId)
    }
  }

  /**
   * A sweep the reader opened or a link led to: it becomes the main link's, and its ranking loads.
   * One the list does not show YET is asked for once more before it is called gone: a run header
   * can name a sweep newer than the list on screen.
   */
  async function selectSweep(sweepId: string): Promise<void> {
    if (sweepId !== selectedSweepId.value) context.selectSweep(sweepId)
    unknownSweepId.value = null
    const listed = () => sweeps.value.some(row => row.sweep_id === sweepId)
    if (!listed()) {
      await loadSweeps(true)
      if (selectedSweepId.value !== sweepId) return
      if (!listed()) {
        unknownSweepId.value = sweepId
        return
      }
    }
    await loadRanking(sweepId)
  }

  /** Everything on screen fetched again, quietly: the panel came back, and a running sweep grew. */
  async function refresh(): Promise<void> {
    await loadSweeps(true)
    await Promise.all(Object.keys(rankings.value).map(sweepId => loadRanking(sweepId, true)))
  }

  return {
    sweeps,
    sweepsKey,
    selectedSweepId,
    rankings,
    loadingRankings,
    rankingFailures,
    goneSweeps,
    loadingList,
    error,
    forbiddenSurface,
    unknownSweepId,
    loadSweeps,
    loadRanking,
    selectSweep,
    refresh,
  }
})
