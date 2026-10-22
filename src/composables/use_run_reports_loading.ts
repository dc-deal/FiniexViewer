import { computed, onScopeDispose, watch } from 'vue'
import { hasArtifact } from '@/api/report_artifacts'
import { RUN_BUNDLE, reportKindId } from '@/panel_kinds'
import { useDockStore } from '@/stores/dock_store'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import type { RunInfo } from '@/types/api/report_types'

/** The stream a session records its state in, as the run list names it under `stream_files`. */
const STATE_FRAMES = 'state_frames.jsonl'

/** How often a check-in is asked before an answer names the cadence: a minute, the backend's default. */
const DEFAULT_CADENCE_S = 60

function recordsStateFrames(run: RunInfo): boolean {
  return run.stream_files.includes(STATE_FRAMES)
}

/**
 * Loads the sections of the run the reader chose. Called ONCE, at the app root: a section shown as
 * a panel of its own needs its data while the run report is closed or behind a tab, and a docked
 * panel is drawn only once it is first shown. The run view loaded them until 2026-10-14.
 */
export function useRunReportsLoading(): void {
  const runs = useRunsStore()
  const reports = useRunReportsStore()
  const dock = useDockStore()

  // One request per section per run. Loading a section only when its panel is first shown is
  // deferred until there are enough sections to justify the plumbing — see viewer#36.
  //
  // Keyed on the RESOLVED run, not on the chosen id: after a reload the id is back before the index
  // is, so a watch on the id fired once with no run to load and never again. And on whether it has
  // reports: a session that ends while it is on screen writes them, and they load then.
  watch(() => runs.selectedRun ? `${runs.selectedRun.run_id}|${runs.selectedRun.has_reports}` : null, () => {
    reports.clear()
    const run = runs.selectedRun
    if (!run) return
    const runId = run.run_id

    /**
     * The HEADER first, and ungated. It is not in a run's `artifacts` and it answers even where that
     * list is empty — measured 2026-10-10 on all three logs-only runs here. It is the one section a
     * run without reports still has, which is exactly what the Run Header panel is for.
     */
    reports.loadRunHeader(runId)
    /**
     * Not an artifact of the run but its SOURCE configuration — ungated, with its own two 404s. A run
     * without reports answers it too: measured 2026-10-20, 200 on two sessions that reached no
     * report, and a session still running is exactly where its profile is what a reader checks.
     */
    reports.loadConfig(runId)
    // a STREAM, gated on its own name: a session writes it from its first pass, long before a report
    if (recordsStateFrames(run)) reports.loadStateFrames(runId)

    // a run without reports stops here, for the same reason the store skips the summary
    if (!run.has_reports) return

    /**
     * Only the sections this run actually wrote. The index row lists them, and the two pipelines
     * write DIFFERENT sets — asking for the difference produced a 404 per session and a notice
     * claiming a section was missing, where the truth is that a session has no scenario grid
     * to report on. An absence is now only ever a section the run SHOULD have and does not.
     */
    const has = (section: string) => hasArtifact(run, section)

    if (has('warningsErrors')) reports.loadWarningsErrors(runId)
    if (has('portfolio')) reports.loadPortfolio(runId)
    if (has('broker')) reports.loadBroker(runId)
    if (has('aggregated')) reports.loadAggregated(runId)
    if (has('pendingOrders')) reports.loadPendingOrders(runId)
    if (has('orderHistory')) reports.loadOrderHistory(runId)
    if (has('bookingPeriods')) reports.loadBookingPeriods(runId)
    if (has('tradeHistory')) reports.loadTradeHistory(runId)
    if (has('scenarios')) reports.loadScenarios(runId)
  }, { immediate: true })

  /*
   * THE CHECK-IN, asked again once a cadence — their document: "Ask it once a cadence, never
   * faster", since a frame is written once per `cadence_s` and asking sooner returns the same one.
   * Only while the bundle or the section's own panel is on show and the page is in view: a panel
   * behind another tab stays mounted, so on show is read off the dock. It stops once every unit has
   * ended and its outcome is written; then the session's reports exist, and the index is asked
   * again so the bundle loads them.
   */
  const onShow = computed(() =>
    dock.shownIds.includes(RUN_BUNDLE) || dock.shownIds.includes(reportKindId('latest-state')))

  /** Every unit's last frame is the one written at its end, and its outcome is written. */
  function finished(): boolean {
    const units = reports.stateFrames?.units ?? []
    return units.length > 0 && units.every(unit => unit.recording === 'ended' && unit.outcome !== null)
  }

  function cadenceSeconds(): number {
    const cadences = (reports.stateFrames?.units ?? []).map(unit => unit.cadence_s).filter(s => s > 0)
    return cadences.length ? Math.min(...cadences) : DEFAULT_CADENCE_S
  }

  /** The session ended while on screen: its reports are written now, and the index says so. */
  async function reportsWritten(runId: string): Promise<void> {
    if (runs.selectedRun?.run_id !== runId || runs.selectedRun.has_reports) return
    await runs.loadRuns(true)
    if (runs.selectedRun?.run_id === runId && runs.selectedRun.has_reports) await runs.loadRun(runId)
  }

  let timer: ReturnType<typeof setTimeout> | null = null

  function cancel(): void {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function schedule(): void {
    cancel()
    const run = runs.selectedRun
    if (!run || !recordsStateFrames(run) || !onShow.value || finished()) return
    const runId = run.run_id
    timer = setTimeout(async () => {
      timer = null
      if (runs.selectedRun?.run_id !== runId) return
      if (document.visibilityState === 'visible') await reports.refreshStateFrames(runId)
      if (finished()) {
        await reportsWritten(runId)
        return
      }
      schedule()
    }, cadenceSeconds() * 1000)
  }

  watch([() => runs.selectedRun?.run_id ?? null, onShow], schedule, { immediate: true })
  onScopeDispose(cancel)
}
