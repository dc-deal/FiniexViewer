import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { findCoverage, getBars } from '@/api/api_client'
import {
  autoTimeframe, chartPriceFormat, chartUnits, defaultUnit, unitTickSize,
} from '@/components/runs/run_chart'
import {
  barsPerMark, executedOpenings, exitMarks, focusTime, gatherMarks, openingMarks, timeframeOffer,
} from '@/components/runs/run_chart_marks'
import { useArrangementStore } from '@/stores/arrangement_store'
import { toChartBars } from '@/stores/bars_store'
import { useContextStore } from '@/stores/context_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunsStore } from '@/stores/runs_store'
import { useTimeframeStore } from '@/stores/timeframe_store'
import type { ChartBar, CoverageResponse } from '@/types/api/bar_types'
import type { PositionRef } from '@/types/context_types'
import type { ChartMark, ChartUnit, TimeframeOffer } from '@/types/run_chart_types'

/** One market's coverage as asked — the answer, or that the archive holds nothing for it. */
type CoverageEntry = CoverageResponse | 'none'

function marketKey(unit: ChartUnit): string {
  return `${unit.broker}/${unit.symbol}`
}

/**
 * The run-bound chart (viewer#31, the item #21 left open): one unit of the chosen run on its
 * candles, its positions marked where they opened and its trades where they closed.
 *
 * The UNIT is the scenario in focus (operator, 2026-10-16): one focus for the lists and the chart,
 * so they show the same case. Choosing a unit in the chart's quick bar puts it in focus; the focus
 * cleared leaves the chart where it was. With no focus the chart shows its own choice — kept per run
 * with the arrangement, made by the chart mark on a trade or an order — else the first unit with
 * trades. The position it centres on is the link's marked position, so a jump between the lists and
 * the chart agree on what is being looked at.
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
    // the counts of openings decide the default unit, so it waits for them rather than changing after
    if (reports.loadingOrderHistory) return null
    return chartUnits({
      group: run.group,
      windows: run.data_windows,
      scenarios: reports.scenarios?.units ?? null,
      config: reports.config?.config ?? null,
      orders: reports.orderHistory?.orders ?? null,
    })
  })

  /** Whether the run's sources are still arriving — said as loading, never as "names no market". */
  const waiting = computed(() => runsStore.selectedRun !== null && units.value === null
    && (reports.loadingScenarios || reports.loadingConfig || reports.loadingOrderHistory))

  /** The reader's choice, where it was made for the run on show. */
  const choice = computed(() =>
    arrangement.runChart.run !== null && arrangement.runChart.run === runsStore.selectedRunId
      ? arrangement.runChart
      : null)

  /** The scenario in focus, where there is one. */
  const focused = computed<string | null>(() =>
    runsStore.selectedUnits.length === 1 ? runsStore.selectedUnits[0]! : null)

  const unit = computed<ChartUnit | null>(() => {
    const list = units.value
    if (!list) return null
    const drawable = (name: string | null | undefined) =>
      list.find(entry => entry.name === name && entry.block === null)
    // a unit that cannot be drawn is not shown for being in focus: the chart keeps what it can draw
    return drawable(focused.value) ?? drawable(choice.value?.unit) ?? defaultUnit(list)
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

  const unitOpenings = computed(() =>
    executedOpenings(reports.orderHistory?.orders ?? []).filter(row => row.scenario_name === unit.value?.name))

  /** The unit's row in the portfolio — what its positions still open at the end stood at. */
  const unitPortfolio = computed(() => reports.portfolio?.units.find(row => row.name === unit.value?.name) ?? null)

  const barTimes = computed(() => bars.value.map(bar => bar.time))

  /** Every opening and exit of the unit on show, one mark each, in time order. */
  const events = computed<ChartMark[]>(() => {
    const all = [
      ...openingMarks(
        unitOpenings.value, unitPortfolio.value?.open_positions ?? [], unitTrades.value,
        unitPortfolio.value?.currency ?? '', barTimes.value, focus.value,
      ),
      ...exitMarks(unitTrades.value, reports.tradeHistory?.keys.trades ?? [], barTimes.value, focus.value),
    ].sort((a, b) => a.time - b.time)
    // Where the route CUT the window, the bars after the last one served were never drawn, and an
    // event among them would stand on that last bar — weeks away from where it happened (measured
    // 2026-10-19: a unit cut at M1 piled fifteen marks onto its last candle). Past the last bar's
    // open nothing is placed for certain, so nothing is drawn there; the notice says the window was cut.
    const last = barTimes.value.at(-1)
    return truncated.value && last !== undefined ? all.filter(mark => mark.at <= last) : all
  })

  /** The width of a bar on screen, as the chart last reported it — null before it has drawn. */
  const spacing = ref<number | null>(null)

  /** How many bars a mark covers at that width — what the marks are gathered by. */
  const perMark = computed(() => barsPerMark(spacing.value))

  /**
   * The marks as drawn: what overlaps at the zoom on screen gathered into one. Recomputed only when
   * the number of bars a mark covers changes, not on every scroll.
   */
  const marks = computed<ChartMark[]>(() => gatherMarks(events.value, barTimes.value, perMark.value))

  /** A finer timeframe that draws apart the marks some candles hold together — where one does. */
  const offer = computed<TimeframeOffer | null>(() => {
    if (!timeframe.value || !window.value) return null
    const minutes = (Date.parse(window.value.to) - Date.parse(window.value.from)) / 60_000
    return timeframeOffer(events.value, timeframe.value, coveredTimeframes.value, timeframeStore.minutesFor, minutes)
  })

  /** Where the chart centres after the offer was taken — until the reader looks elsewhere. */
  const offerAt = ref<number | null>(null)

  const focusAt = computed<number | null>(() =>
    offerAt.value ?? focusTime(unitOpenings.value, unitTrades.value, focus.value))

  /** The unit's prices at its instrument's tick size, from the run's broker report — null without one. */
  const priceFormat = computed(() =>
    unit.value ? chartPriceFormat(unitTickSize(reports.broker, unit.value)) : null)

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

  // the place the offer centred on belongs to the unit and the position it was taken for
  watch(() => [unit.value?.name, focus.value?.position] as const, () => { offerAt.value = null })

  // the focus cleared leaves the chart where it was: the unit it showed becomes its own choice.
  // Only within one run — a new run clears the focus too, and its chart starts afresh
  watch(() => [runsStore.selectedRunId, focused.value] as const, ([run, now], [runBefore, before]) => {
    if (run === runBefore && now === null && before !== null) remember({ unit: before })
  })

  function remember(next: { unit?: string, timeframe?: string | null }): void {
    arrangement.setRunChart({
      run: runsStore.selectedRunId,
      unit: next.unit ?? unit.value?.name ?? null,
      timeframe: next.timeframe !== undefined ? next.timeframe : choice.value?.timeframe ?? null,
    })
  }

  /** A unit chosen in the chart is the focus of every panel, not the chart's alone. */
  function chooseUnit(name: string): void {
    remember({ unit: name })
    runsStore.setUnits([name])
  }

  function chooseTimeframe(next: string): void {
    offerAt.value = null
    remember({ timeframe: next })
  }

  /** Takes the offer: the finer timeframe, centred on the first candle it draws apart. */
  function acceptOffer(): void {
    const taken = offer.value
    if (!taken) return
    remember({ timeframe: taken.timeframe })
    offerAt.value = taken.at
  }

  /** The width of a bar on screen, as the chart reports it on every zoom. */
  function setSpacing(next: number): void {
    spacing.value = next
  }

  /**
   * Points the chart at a position: its unit, and the position marked — which it centres on. Where a
   * scenario is in focus the focus moves with it, or the focus would keep the chart on another unit;
   * where none is, the lists keep showing the whole run.
   */
  function showPosition(ref: PositionRef): void {
    remember({ unit: ref.scenario })
    if (focused.value !== null && focused.value !== ref.scenario) runsStore.setUnits([ref.scenario])
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
    bars, truncated, loading, error, events, marks, offer, focusAt, priceFormat,
    chooseUnit, chooseTimeframe, acceptOffer, setSpacing, showPosition, canShow, attach, detach,
  }
})
