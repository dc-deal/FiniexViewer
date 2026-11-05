import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { findCoverage } from '@/api/api_client'
import {
  autoTimeframe, chartPriceFormat, chartUnits, defaultUnit, unitTickSize,
} from '@/components/runs/run_chart'
import { entryExitLines, frameMoment, positionLevels } from '@/components/runs/run_chart_levels'
import {
  barsPerMark, executedOpenings, exitMarks, focusTime, gatherMarks, openingMarks, timeframeOffer,
} from '@/components/runs/run_chart_marks'
import { BARS_PER_BATCH, useBarLoader } from '@/composables/use_bar_loader'
import type { BarEdge } from '@/composables/use_bar_loader'
import { arrangeLayers } from '@/layer_registry'
import { useArrangementStore } from '@/stores/arrangement_store'
import { toChartBars } from '@/stores/bars_store'
import { useContextStore } from '@/stores/context_store'
import { useFramePlayerStore } from '@/stores/frame_player_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunsStore } from '@/stores/runs_store'
import { useTimeframeStore } from '@/stores/timeframe_store'
import type { ChartBar, CoverageResponse } from '@/types/api/bar_types'
import type { ChartDrawing, ChartLayer, DrawingLayerId } from '@/types/chart_drawing_types'
import type { PositionRef } from '@/types/context_types'
import type { ChartCandles, ChartMark, ChartUnit, ChartVolume, TimeframeOffer, VolumeBasis } from '@/types/run_chart_types'

/** One market's coverage as asked — the answer, or that the archive holds nothing for it. */
type CoverageEntry = CoverageResponse | 'none'

/** The run chart's dock id — the drawing layers the reader arranged for it are kept under it. */
const RUN_CHART = 'run-chart'

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
  const framePlayers = useFramePlayerStore()

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

  /** The unit's bars, loaded as the view moves (viewer#9). */
  const loader = useBarLoader()
  /** The bars as served, for what the candles do not carry: the two counts the volume is drawn from. */
  const served = loader.served
  const bars = computed<ChartBar[]>(() => toChartBars(served.value))
  /** The file's price basis, as the route stated it with the bars — '' where it did not. */
  const priceBasis = loader.priceBasis
  const loading = loader.loading
  const error = loader.error

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

  /**
   * How far the bars are loaded, in UTC seconds, while the window holds more to the right — null
   * once its end is loaded. An event past it would stand on the last bar loaded, weeks from where it
   * happened (measured 2026-10-19: a unit cut at M1 piled fifteen marks onto its last candle), so it
   * is drawn once its bar arrives. Before the first bar loaded, `barOf` places nothing already.
   */
  const cutAt = computed(() => loader.more.value.right && loader.loadedTo.value !== null
    ? loader.loadedTo.value / 1000
    : null)

  /** The tick size of the unit's instrument, from the run's broker report — null without one. */
  const tickSize = computed(() => unit.value ? unitTickSize(reports.broker, unit.value) : null)

  /** Every opening and exit of the unit on show, one mark each, in time order. */
  const events = computed<ChartMark[]>(() => {
    const all = [
      ...openingMarks(
        unitOpenings.value, unitPortfolio.value?.open_positions ?? [], unitTrades.value,
        unitPortfolio.value?.currency ?? '', barTimes.value, focus.value, tickSize.value,
      ),
      ...exitMarks(unitTrades.value, reports.tradeHistory?.keys.trades ?? [], barTimes.value, focus.value, tickSize.value),
    ].sort((a, b) => a.time - b.time)
    const cut = cutAt.value
    return cut !== null ? all.filter(mark => mark.at <= cut) : all
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

  /** The trade rows of the position looked at, and its entry in `open_positions` where it ended open. */
  const focusTrades = computed(() => {
    const looked = focus.value
    return looked ? unitTrades.value.filter(trade => trade.position_id === looked.position) : []
  })
  const focusOpen = computed(() => {
    const looked = focus.value
    return looked ? unitPortfolio.value?.open_positions.find(entry => entry.position_id === looked.position) ?? null : null
  })

  /** The chart's drawing layers as the reader arranged them in the Layers panel, back to front. */
  const arranged = computed(() => arrangeLayers(RUN_CHART, arrangement.panelViews[RUN_CHART]?.layers))

  /** The option a drawing layer stands at, as arranged. */
  function optionOf(id: DrawingLayerId): boolean | null {
    return arranged.value.find(state => state.id === id)?.option ?? null
  }

  /**
   * Each layer's drawings, apart: a step of the frame player, several a second while it plays, moves
   * one of them and rebuilds no other.
   */
  const drawn: Record<DrawingLayerId, ComputedRef<ChartDrawing[]>> = {
    levels: computed(() => {
      const key = reports.tradeHistory?.keys.trades ?? []
      const looked = focus.value?.position ?? null
      return optionOf('levels')
        ? positionLevels(
          unitTrades.value, key, unitPortfolio.value?.open_positions ?? [], looked, barTimes.value, cutAt.value, tickSize.value,
        )
        : positionLevels(
          focusTrades.value, key, focusOpen.value ? [focusOpen.value] : [], looked, barTimes.value, cutAt.value, tickSize.value,
        )
    }),
    'entry-exit': computed(() => entryExitLines(
      optionOf('entry-exit') ? unitTrades.value : focusTrades.value,
      reports.tradeHistory?.keys.trades ?? [], barTimes.value, cutAt.value, tickSize.value,
    )),
    // without their signs the marks keep their shapes and the signs' room, so the switch rescales
    // nothing; a gathered mark's card still counts it
    trades: computed(() => optionOf('trades') === false ? marks.value.map(mark => ({ ...mark, textHidden: true })) : marks.value),
    // the player of the unit on show and of the run on show: its name is the unit's in `data_windows`
    'state-frame': computed(() => {
      const player = unit.value ? framePlayers.playerOf(unit.value.name) : null
      if (!player || player.runId !== runsStore.selectedRunId) return []
      const frame = framePlayers.frameOf(player)
      return frame ? frameMoment(frame, player.stream?.record_count ?? null, barTimes.value, cutAt.value) : []
    }),
  }

  /**
   * What the chart draws, layer by layer, each in front of the one before, as the reader arranged
   * them — by default the state frame on show at the back, the levels of the position looked at, the
   * line from its entry to its exit, and the marks of every trade in front. A hidden layer is handed over marked so: the chart paints
   * nothing of it, and its marks keep their room, so the candles stay where they were (operator,
   * on screen 2026-10-27: switching the trades off stretched the candles).
   */
  const layers = computed<ChartLayer[]>(() => arranged.value.flatMap(state =>
    state.id === 'volume' || state.id === 'candles' ? [] : [{
      id: state.id,
      drawings: drawn[state.id].value,
      ...(state.opacity < 100 ? { opacity: state.opacity / 100 } : {}),
      ...(state.shown ? {} : { hidden: true }),
    }]))

  /**
   * What the volume layer counts. Their `market-data` document: `v` is the traded volume, `0.0` on
   * every bar of a feed that carries none, and then `tc` is the measure of how busy the market was;
   * `order_driven` names a venue that prints trades. So the traded volume where the bars say so, the
   * ticks otherwise — our reading of those two sentences, put to them for confirmation.
   */
  const volumeBasis = computed<VolumeBasis>(() => priceBasis.value === 'order_driven' ? 'traded' : 'ticks')

  /** The candles layer: the form the price is drawn in, shown and as strong as arranged. */
  const candles = computed<ChartCandles | null>(() => {
    const state = arranged.value.find(entry => entry.id === 'candles')
    if (!state) return null
    return { form: state.form ?? 'candles', shown: state.shown, opacity: state.opacity / 100 }
  })

  /** The volume layer: one value a bar, behind the candles, shown and as strong as arranged. */
  const volume = computed<ChartVolume | null>(() => {
    const state = arranged.value.find(entry => entry.id === 'volume')
    if (!state) return null
    const traded = volumeBasis.value === 'traded'
    return {
      basis: volumeBasis.value,
      shown: state.shown,
      opacity: state.opacity / 100,
      bars: served.value.map(bar => ({ time: bar.t, value: traded ? bar.v : bar.tc, rising: bar.c >= bar.o })),
    }
  })

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

  /** The unit's prices at its instrument's tick size — null without one. */
  const priceFormat = computed(() => chartPriceFormat(tickSize.value))

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

  /**
   * Loads the unit's bars afresh: the window's from the position looked at on — half a batch before
   * it — or from the window's start where none is (decided 2026-10-29). The rest arrives as
   * the reader moves toward it.
   */
  async function loadBars(): Promise<void> {
    const target = unit.value
    const span = window.value
    const tf = timeframe.value
    if (!target || !span || !tf || Date.parse(span.to) <= Date.parse(span.from)) {
      loader.clear()
      return
    }
    // A minute where the length is not known: a piece of it holds at most one bar of any timeframe,
    // so loading stays whole, only slower
    const period = (timeframeStore.minutesFor(tf) ?? 1) * 60_000
    // The route answers the bars that OPEN in the range, and a bar is stamped with its open — so the
    // bar the first tick fell in opened BEFORE the window, and is asked for from one period earlier.
    // Measured 2026-10-15: `from=05:00:00.274` answered from the 05:01 bar, and the trade at
    // 05:00:40 had no candle. The length only widens the ask; marks stand on the bars served.
    const from = Date.parse(span.from) - period
    const at = focusAt.value
    await loader.open({
      broker: target.broker!,
      symbol: target.symbol!,
      timeframe: tf,
      period,
      from,
      to: Date.parse(span.to),
      start: at !== null ? at * 1000 - (BARS_PER_BATCH / 2) * period : from,
    })
  }

  /** More bars at an edge the reader came near. */
  function extendBars(edge: BarEdge): void {
    void loader.extend(edge)
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

  // a position looked at outside what is loaded: the bars are loaded afresh around it — inside, the
  // chart only centres on it. Not while a first load is on its way, which reads the focus itself
  watch(focusAt, at => {
    const from = loader.loadedFrom.value
    const to = loader.loadedTo.value
    if (!viewers.value || at === null || loader.loading.value || from === null || to === null) return
    if (at * 1000 < from || at * 1000 > to) void loadBars()
  })

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
    bars, loading, error, events, marks, layers, candles, volume, volumeBasis, focus, offer, focusAt, priceFormat,
    loadingEdges: loader.loadingEdges, edgeError: loader.edgeError,
    chooseUnit, chooseTimeframe, acceptOffer, setSpacing, showPosition, canShow, attach, detach, extendBars,
  }
})
