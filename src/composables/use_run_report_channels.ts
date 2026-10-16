import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { provideChartLink } from '@/composables/use_chart_link'
import { provideDisplaySettings } from '@/composables/use_display_settings'
import { provideOrderSteps } from '@/composables/use_order_steps'
import { usePanelJump } from '@/composables/use_panel_jump'
import { providePositionLink } from '@/composables/use_position_link'
import { provideScenarioSelection } from '@/composables/use_scenario_selection'
import { panelById } from '@/panel_registry'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useRunChartStore } from '@/stores/run_chart_store'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunSectionsStore } from '@/stores/run_sections_store'
import { useSettingsStore } from '@/stores/settings_store'
import type { PositionRef } from '@/types/context_types'

/**
 * The channels the run report's sections read, provided ONCE at the app root so they reach every
 * place a section is drawn — the run report's column, and a section opened as a panel of its own,
 * which is a sibling of the run report and no child of it. The run view and its column provided
 * them until 2026-10-14.
 */
export function provideRunReportChannels(): void {
  const runsStore = useRunsStore()
  const reportsStore = useRunReportsStore()
  const sections = useRunSectionsStore()
  const context = useContextStore()
  const { selectedUnits } = storeToRefs(runsStore)

  // The host supplies the preferences for every panel it renders. A panel that reached into the
  // store itself would stop being renderable from a different source, which the panel contract
  // forbids.
  provideDisplaySettings(storeToRefs(useSettingsStore()).display)

  // The narrowing is ambient for the same reason the display preferences are — see the composable.
  provideScenarioSelection({
    units: selectedUnits,
    toggle: (unit: string) => runsStore.toggleUnit(unit),
    clear: () => runsStore.clearUnits(),
  })

  // The position a reader asked to look at, and the jump that puts them in front of it — the
  // workspace's business, see `use_panel_jump`.
  providePositionLink({
    marked: computed(() => context.main.run.position),
    jumpTo: usePanelJump(),
    canJumpTo: (panelId: string) => {
      const descriptor = panelById(panelId)
      if (!descriptor) return false
      // the same record the column is handed, read by the source a descriptor declares
      return sections.sources[descriptor.source] != null
    },
  })

  // the way from a row to its candles: the run chart pointed at the position, brought to the front
  const runChart = useRunChartStore()
  const dock = useDockStore()
  provideChartLink({
    canShow: (scenario: string) => runChart.canShow(scenario),
    show: (ref: PositionRef) => {
      runChart.showPosition(ref)
      dock.reveal('run-chart', 'command')
    },
  })

  /**
   * The steps one position's orders went through, which the Orders panel asks for a position at a
   * time rather than for the run.
   *
   * The ROOT owns it for the same reason it owns the jump: which run is selected, and whether that
   * run wrote a stream at all, is the workspace's knowledge. **The gate is `stream_files`, not
   * `artifacts`** — the stream is not a report artifact and appears in no run's artifact list, and
   * the backend names it on the index row instead. Measured 2026-10-08: 51 of 52 runs carry
   * `["order_events.jsonl"]` there and one carries `[]`. Without the gate the panel would offer a
   * reader a disclosure that can only answer 404.
   */
  provideOrderSteps({
    available: () => (runsStore.selectedRun?.stream_files.length ?? 0) > 0,
    heldFor: (ref: PositionRef) => reportsStore.stepsFor(ref.scenario, ref.position),
    loadingFor: (ref: PositionRef) => reportsStore.stepsLoading(ref.scenario, ref.position),
    askFor: (ref: PositionRef) => {
      const runId = runsStore.selectedRunId
      if (runId) void reportsStore.loadOrderEvents(runId, ref.scenario, ref.position)
    },
  })
}
