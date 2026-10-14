import { watch } from 'vue'
import { hasArtifact } from '@/api/report_artifacts'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'

/**
 * Loads the sections of the run the reader chose. Called ONCE, at the app root: a section shown as
 * a panel of its own needs its data while the Runs panel is closed or behind a tab, and a docked
 * panel is drawn only once it is first shown. The run view loaded them until 2026-10-14.
 */
export function useRunReportsLoading(): void {
  const runs = useRunsStore()
  const reports = useRunReportsStore()

  // One request per section per run. Loading a section only when its panel is first shown is
  // deferred until there are enough sections to justify the plumbing — see viewer#36.
  //
  // Keyed on the RESOLVED run, not on the chosen id: after a reload the id is back before the index
  // is, so a watch on the id fired once with no run to load and never again.
  watch(() => runs.selectedRun?.run_id ?? null, runId => {
    reports.clear()
    const run = runs.selectedRun
    if (!runId || !run) return

    /**
     * The HEADER first, and ungated. It is not in a run's `artifacts` and it answers even where that
     * list is empty — measured 2026-10-10 on all three logs-only runs here. It is the one section a
     * run without reports still has, which is exactly what the Run Header panel is for.
     */
    reports.loadRunHeader(runId)

    // a logs-only run stops here, for the same reason the store skips the summary
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
    // not an artifact of the run but its SOURCE configuration — ungated, with its own two 404s
    reports.loadConfig(runId)
  }, { immediate: true })
}
