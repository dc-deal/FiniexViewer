import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { findCoverage, getBars } from '@/api/api_client'
import { autoTimeframe, chartUnits, defaultUnit, focusTime, tradeMarks } from '@/components/runs/run_chart'
import { useArrangementStore } from '@/stores/arrangement_store'
import { toChartBars } from '@/stores/bars_store'
import { useContextStore } from '@/stores/context_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunsStore } from '@/stores/runs_store'
import { useTimeframeStore } from '@/stores/timeframe_store'
import type { ChartBar, CoverageResponse } from '@/types/api/bar_types'
import type { PositionRef } from '@/types/context_types'
import type { ChartMark, ChartUnit } from '@/types/run_chart_types'

/** One market's coverage as asked — the answer, or that the archive holds nothing for it. */
type CoverageEntry = CoverageResponse | 'none'

function marketKey(unit: ChartUnit): string {
  return `${unit.broker}/${unit.symbol}`
}

/**
 * The run-bound chart (viewer#31, the item #21 left open): one unit of the chosen run on its
 * candles, its trades marked where they opened and closed.
 *
 * The UNIT is the chart's own choice — set in its quick bar, or by the chart mark on a trade or an
 * order — and kept per run with the arrangement; until one is made it follows the narrowing. The
 * position it centres on is the link's marked position, so a jump between the lists and the chart
 * agree on what is being looked at.
 *
 * It asks the archive only while a run chart is open: the units are read off what the run report
 * already loaded, and nothing is fetched for a reader who never opens the panel.
 */
export const useRunChartStore = defineStore('runChart', () => {
  const runsStore = useRunsStore()
  const reports = useRunReportsStore()
  const context = useContextStore()
  const arrangement = useArrangementStore()
  const timeframeStore = useTimeframeStore()

  /** How many run charts are on show. Nothing is fetched while there are none. */
  const viewers = ref(0)

  /** The units of the chosen run, or null while what names their market is still on its way. */
  const units = computed<ChartUnit[] | null>(() => {
    const run = runsStore.selectedRun
    if (!run) return null
    // the trade counts decide the default unit, so it waits for them rather than changing after
    if (reports.loadingTradeHistory) return null
    return chartUnits({
      group: run.group,
      windows: run.data_windows,
      scenarios: reports.scenarios?.units ?? null,
      config: reports.config?.config ?? null,
      trades: reports.tradeHistory?.trades ?? null,
    })
  })

  /** Whether the run's sources are still arriving — said as loading, never as "names no market". */
  const waiting = computed(() => runsStore.selectedRun !== null && units.value === null
    && (reports.loadingScenarios || reports.loadingConfig || reports.loadingTradeHistory))

  /** The reader's choice, where it was made for the run on show. */
  const choice = computed(() =>
    arrangement.runChart.run !== null && arrangement.runChart.run === runsStore.selectedRunId
      ? arrangement.runChart
      : null)

  const unit = computed<ChartUnit | null>(() => {
    const list = units.value
    if (!list) return null
    const chosen = list.find(entry => entry.name === choice.value?.unit && entry.block === null)
    return chosen ?? defaultUnit(list, runsStore.selectedUnits)
  })

  const coverage = ref<Record<string, CoverageEntry>>({})
  const coverageError = ref<string | null>(null)

  const unitCoverage = computed<CoverageEntry | null>(() =>
    unit.value ? coverage.value[marketKey(unit.value)] ?? null : null)

  /** The window drawn, as ISO-8601: the unit's span, an open one ending where the coverage ends. */
  const window = computed<{ from: string, to: string } | null>(() => {
    const entry = unitCoverage.value
    if (!unit.value?.from || !entry || entry === 'none') return null
    return { from: unit.value.from, to: unit.value.to ?? entry.end }
  })

  /** The timeframes the archive renders for the market, shortest first. */
  const coveredTimeframes = computed<string[]>(() => {
    const entry = unitCoverage.value
    if (!entry || entry === 'none') return []
    return [...entry.timeframes].sort((a, b) =>
      (timeframeStore.minutesFor(a) ?? Infinity) - (timeframeStore.minutesFor(b) ?? Infinity))
  })

  const timeframe = computed<string | null>(() => {
    if (!window.value) return null
    const chosen = choice.value?.timeframe
    if (chosen && coveredTimeframes.value.includes(chosen)) return chosen
    const minutes = (Date.parse(window.value.to) - Date.parse(window.value.from)) / 60_000
    return autoTimeframe(coveredTimeframes.value, timeframeStore.minutesFor, minutes)
  })

  const bars = ref<ChartBar[]>([])
  const truncated = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** Raised for every request; an answer for an earlier one writes nothing. */
  let generation = 0

  const unitTrades = computed(() =>
    (reports.tradeHistory?.trades ?? []).filter(trade => trade.scenario_name === unit.value?.name))

  /** The position looked at, where it belongs to the unit on show. */
  const focus = computed<PositionRef | null>(() => {
    const marked = context.main.run.position
    return marked && marked.scenario === unit.value?.name ? marked : null
  })

  const marks = computed<ChartMark[]>(() =>
    tradeMarks(
      unitTrades.value, reports.tradeHistory?.keys.trades ?? [], bars.value.map(bar => bar.time), focus.value,
    ))

  const focusAt = computed<number | null>(() => focusTime(unitTrades.value, focus.value))

  async function askCoverage(target: ChartUnit): Promise<void> {
    const key = marketKey(target)
    if (coverage.value[key]) return
    try {
      // the archive holding nothing for the market is an answer, and said as one
      const answer = await findCoverage(target.broker!, target.symbol!)
      coverage.value = { ...coverage.value, [key]: answer ?? 'none' }
    } catch (failure) {
      coverageError.value = failure instanceof Error ? failure.message : String(failure)
    }
  }

  async function loadBars(): Promise<void> {
    const target = unit.value
    const span = window.value
    const tf = timeframe.value
    const run = ++generation
    bars.value = []
    truncated.value = false
    error.value = null
    if (!target || !span || !tf || Date.parse(span.to) <= Date.parse(span.from)) {
      loading.value = false
      return
    }
    loading.value = true
    // The route answers the bars that OPEN in the range, and a bar is stamped with its open — so the
    // bar the first tick fell in opened BEFORE the window, and is asked for from one period earlier.
    // Measured 2026-10-15: `from=05:00:00.274` answered from the 05:01 bar, and the trade at
    // 05:00:40 had no candle. The length only widens the ask; marks stand on the bars served.
    const period = (timeframeStore.minutesFor(tf) ?? 0) * 60_000
    const from = new Date(Date.parse(span.from) - period).toISOString()
    try {
      const answer = await getBars(target.broker!, target.symbol!, tf, from, span.to)
      if (run !== generation) return
      bars.value = toChartBars(answer.bars)
      truncated.value = answer.truncated
    } catch (failure) {
      if (run !== generation) return
      error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
      if (run === generation) loading.value = false
    }
  }

  watch([viewers, unit], () => {
    if (!viewers.value) return
    void timeframeStore.loadTimeframes()
    if (unit.value && unit.value.block === null) void askCoverage(unit.value)
  }, { immediate: true })

  watch(
    () => [viewers.value > 0, unit.value?.name, unit.value?.broker, unit.value?.symbol, window.value?.from, window.value?.to, timeframe.value],
    () => { if (viewers.value) void loadBars() },
  )

  function remember(next: { unit?: string, timeframe?: string | null }): void {
    arrangement.setRunChart({
      run: runsStore.selectedRunId,
      unit: next.unit ?? unit.value?.name ?? null,
      timeframe: next.timeframe !== undefined ? next.timeframe : choice.value?.timeframe ?? null,
    })
  }

  function chooseUnit(name: string): void {
    remember({ unit: name })
  }

  function chooseTimeframe(next: string): void {
    remember({ timeframe: next })
  }

  /** Points the chart at a position: its unit, and the position marked — which it centres on. */
  function showPosition(ref: PositionRef): void {
    remember({ unit: ref.scenario })
    context.mark(ref)
  }

  /** Whether a unit can be drawn at all — what decides if a row offers the chart mark. */
  function canShow(scenario: string): boolean {
    return units.value?.some(entry => entry.name === scenario && entry.block === null) ?? false
  }

  function attach(): void {
    viewers.value++
  }

  function detach(): void {
    viewers.value = Math.max(0, viewers.value - 1)
  }

  return {
    units, unit, waiting, unitCoverage, coverageError, window, coveredTimeframes, timeframe,
    bars, truncated, loading, error, marks, focusAt,
    chooseUnit, chooseTimeframe, showPosition, canShow, attach, detach,
  }
})
