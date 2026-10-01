import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getRuns, getRunSummary } from '@/api/api_client'
import { isAbsent } from '@/types/api/absence_types'
import type { SectionAbsence } from '@/types/api/absence_types'
import type { RunInfo, RunSummary } from '@/types/api/report_types'
import { t } from '@/translate'

/** Failure text for the UI: says what failed, keeps the detail, never shows a stack trace. */
function describeFailure(error: unknown, action: string): string {
  const detail = error instanceof Error ? error.message : String(error)
  return `${action}: ${detail}`
}

export const useRunsStore = defineStore('runs', () => {
  const runs = ref<RunInfo[]>([])
  const selectedRunId = ref<string | null>(null)
  const summary = ref<RunSummary | null>(null)
  const loadingRuns = ref(false)
  const loadingSummary = ref(false)
  const error = ref<string | null>(null)
  // the selected run exists but carries no run-summary artifact (backend 404)
  const summaryMissing = ref(false)
  /** Why the summary is not here, where it is not. */
  const summaryAbsence = ref<SectionAbsence | null>(null)
  // a run id the index does not contain — a link or a reloaded URL naming a run that is gone
  const unknownRunId = ref<string | null>(null)
  /**
   * The scenarios the reader narrowed to, one step below the run in the same cascade — part of the
   * SELECTION, so it belongs in the URL rather than in the stored layout. EMPTY means the whole
   * run, never "nothing".
   *
   * Held as plain names because that is what the backend declares as a unit's identity, and one
   * identity under four field names across four responses: `scenario-details.units[].name`,
   * `portfolio.units[].name`, `trade-history.trades[].scenario_name` and
   * `booking-periods.periods[].unit_name`. Confirmed in their code 2026-09-27, not merely observed.
   */
  const selectedUnits = ref<string[]>([])

  /**
   * The feed-health model, or null where the run has nothing to report about its feed.
   *
   * Two different things sit in that panel and only ONE is about SIGNAL. `signal_fresh_ratio` is
   * null when no SIGNAL worker ran. The four disturbance figures come from the feed-stability
   * report and describe the DATA SOURCES — a market feed can stall with no SIGNAL worker anywhere,
   * so they are not vacuous just because the first one is.
   *
   * Worth showing when either half speaks: a measured freshness, or at least one episode. The
   * backend's own console draws the same line — `format_disturbance_line` returns an empty string
   * at zero episodes rather than printing four zeros.
   */
  const feedHealth = computed(() => {
    const current = summary.value
    if (!current) return null
    const measured = current.signal_fresh_ratio !== null
    const disturbed = current.disturbance_episode_count > 0
    return measured || disturbed ? current : null
  })

  const selectedRun = computed(() =>
    runs.value.find(run => run.run_id === selectedRunId.value) ?? null
  )

  async function loadRuns(): Promise<void> {
    // deliberately not cached — new runs appear while the app is open
    loadingRuns.value = true
    error.value = null
    try {
      // the index row carries run_id + group + name, so the cascade needs no request per run
      runs.value = await getRuns()
    } catch (e) {
      error.value = describeFailure(e, t('Could not load the run index'))
    } finally {
      loadingRuns.value = false
    }
  }

  function clearRun(): void {
    selectedRunId.value = null
    summary.value = null
    summaryMissing.value = false
    summaryAbsence.value = null
    unknownRunId.value = null
    // a different run is a different roster, so a narrowing made for the old one means nothing
    selectedUnits.value = []
  }

  /** Adds a scenario to the narrowing, or takes it out again. */
  function toggleUnit(unit: string): void {
    selectedUnits.value = selectedUnits.value.includes(unit)
      ? selectedUnits.value.filter(name => name !== unit)
      : [...selectedUnits.value, unit]
  }

  /** Restores a whole narrowing at once — what a link carries. Duplicates are not a selection. */
  function setUnits(units: string[]): void {
    selectedUnits.value = [...new Set(units)]
  }

  /** Back to the whole run. */
  function clearUnits(): void {
    selectedUnits.value = []
  }

  async function loadSummary(): Promise<void> {
    const runId = selectedRunId.value
    if (!runId) return

    loadingSummary.value = true
    error.value = null
    summary.value = null
    summaryMissing.value = false
    summaryAbsence.value = null

    try {
      const result = await getRunSummary(runId)
      // the summary keeps its own flag rather than joining the absence map: the whole run view
      // gates on whether it arrived, which is a different job from naming a missing section
      summaryMissing.value = isAbsent(result)
      summary.value = isAbsent(result) ? null : result
      summaryAbsence.value = isAbsent(result) ? result : null
    } catch (e) {
      error.value = describeFailure(e, t('Could not load the run summary'))
    } finally {
      loadingSummary.value = false
    }
  }

  /**
   * Selects a run, but only one the index actually contains. A URL, a bookmark or a shared link
   * can name a run whose artifacts have been removed since; requesting it produces one 404 per
   * section, which is not an answer the view can show. The index is the authority — the same
   * rule the layout store applies to stored panel ids.
   */
  async function selectRun(runId: string): Promise<void> {
    clearRun()
    const run = runs.value.find(entry => entry.run_id === runId)
    if (!run) {
      unknownRunId.value = runId
      return
    }
    selectedRunId.value = runId
    // the index already says this run carries no artifacts — asking anyway is one 404 per section
    if (!run.has_reports) return
    await loadSummary()
  }

  return {
    runs,
    selectedRunId,
    selectedRun,
    selectedUnits,
    summary,
    feedHealth,
    summaryMissing,
    summaryAbsence,
    unknownRunId,
    loadingRuns,
    loadingSummary,
    error,
    loadRuns,
    toggleUnit,
    setUnits,
    clearUnits,
    selectRun,
  }
})
