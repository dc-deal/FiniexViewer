import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { provideChartLink } from '@/composables/use_chart_link'
import { provideCheckTitles } from '@/composables/use_check_titles'
import { provideConfigComparison } from '@/composables/use_config_comparison'
import { provideDisplaySettings } from '@/composables/use_display_settings'
import { provideFramePlayer } from '@/composables/use_frame_player'
import { provideOrderSteps } from '@/composables/use_order_steps'
import { usePanelJump } from '@/composables/use_panel_jump'
import { providePositionLink } from '@/composables/use_position_link'
import { provideScenarioSelection } from '@/composables/use_scenario_selection'
import { panelById } from '@/panel_registry'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useFramePlayerStore } from '@/stores/frame_player_store'
import { useRunChartStore } from '@/stores/run_chart_store'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunSectionsStore } from '@/stores/run_sections_store'
import { useConfigCompareStore } from '@/stores/config_compare_store'
import { useSettingsStore } from '@/stores/settings_store'
import { useValidationChecksStore } from '@/stores/validation_checks_store'
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

  // What a warning's check id means, read once: a reader should never meet a bare id
  const validationChecks = useValidationChecksStore()
  void validationChecks.load()
  provideCheckTitles(check => validationChecks.checks.get(check) ?? null)

  // A configuration compared with the one across a change mark — for the run it was asked for, and
  // gone the moment another run is chosen
  const compare = useConfigCompareStore()
  watch(() => runsStore.selectedRunId, runId => {
    if (compare.shown !== null && runId !== compare.shown) compare.stop()
  })
  provideConfigComparison({
    compared: () => compare.shown !== null && compare.shown === runsStore.selectedRunId && compare.other && compare.side
      ? { runId: compare.other, side: compare.side, body: compare.otherConfig, loading: compare.loading, missing: compare.missing }
      : null,
    stop: () => compare.stop(),
  })

  // A session's frames over time, a unit at a time — for the run on show, and forgotten, playing
  // stopped, the moment another run is chosen
  const frames = useFramePlayerStore()
  watch(() => runsStore.selectedRunId, () => frames.reset())
  provideFramePlayer({
    view: (unit: string) => {
      const player = frames.playerOf(unit)
      if (!player || player.runId !== runsStore.selectedRunId) return null
      return {
        stream: player.stream,
        absence: player.absence,
        error: player.error,
        loading: player.loading,
        frame: frames.frameOf(player),
        following: player.cursor === null,
        playing: player.playing,
        speed: player.speed,
      }
    },
    open: (unit: string) => {
      const runId = runsStore.selectedRunId
      if (runId) void frames.open(runId, unit)
    },
    seek: (unit: string, at: number) => { void frames.seek(unit, at) },
    step: (unit: string, by: 1 | -1) => { void frames.step(unit, by) },
    first: (unit: string) => { void frames.first(unit) },
    latest: (unit: string) => { void frames.latest(unit) },
    toggle: (unit: string) => {
      if (frames.playerOf(unit)?.playing) frames.stop(unit)
      else frames.play(unit)
    },
    setSpeed: (unit: string, speed: number) => frames.setSpeed(unit, speed),
  })

  // The narrowing is ambient for the same reason the display preferences are — see the composable.
  provideScenarioSelection({
    units: selectedUnits,
    toggle: (unit: string) => runsStore.toggleUnit(unit),
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
   * reader a disclosure that can only answer 404. It asks for the stream's own NAME: since contract
   * 38 a session also lists `state_frames.jsonl`, so a non-empty list no longer means order events.
   */
  provideOrderSteps({
    available: () => runsStore.selectedRun?.stream_files.includes('order_events.jsonl') ?? false,
    heldFor: (ref: PositionRef) => reportsStore.stepsFor(ref.scenario, ref.position),
    loadingFor: (ref: PositionRef) => reportsStore.stepsLoading(ref.scenario, ref.position),
    askFor: (ref: PositionRef) => {
      const runId = runsStore.selectedRunId
      if (runId) void reportsStore.loadOrderEvents(runId, ref.scenario, ref.position)
    },
  })
}
