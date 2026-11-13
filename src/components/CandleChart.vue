<script setup lang="ts">
import { computed, ref, shallowRef, watch, onMounted, onUnmounted } from 'vue'
import {
  AreaSeries, BarSeries, CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart,
} from 'lightweight-charts'
import type {
  ChartOptions, DeepPartial, IChartApi, ISeriesApi, MouseEventParams, SeriesType, UTCTimestamp,
} from 'lightweight-charts'
import AppIcon from '@/components/base/AppIcon.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import ChartCard from '@/components/base/ChartCard.vue'
import ChartPaneControls from '@/components/ChartPaneControls.vue'
import ChartPaneLegend from '@/components/ChartPaneLegend.vue'
import { withAlpha } from '@/components/chart_colours'
import { ChartDrawingHost, type DrawingColours } from '@/components/chart_drawing_host'
import type { BarRange } from '@/components/chart_geometry'
import { legendLines, legendTops, paneLegends } from '@/components/chart_legend'
import { NEUTRAL_TOKENS, seriesLegend } from '@/components/indicator_drawing'
import { PaneLookPrimitive } from '@/components/pane_look'
import type { BarEdge } from '@/composables/use_bar_loader'
import { useChartPanes } from '@/composables/use_chart_panes'
import { useIndicatorSeries } from '@/composables/use_indicator_series'
import type { ChartBar } from '@/types/api/bar_types'
import type { ChartLayer } from '@/types/chart_drawing_types'
import type { PaneLooks, PaneWeights } from '@/types/chart_pane_types'
import type { FigureCard } from '@/types/figure_types'
import type { DrawnSeries, IndicatorInks } from '@/types/indicator_drawing_types'
import type { ChartCandles, ChartVolume, PriceForm } from '@/types/run_chart_types'
import { t } from '@/translate'

const props = defineProps<{
  data: ChartBar[]
  /**
   * What the chart draws beside its candles, layer by layer, in front of them and each in front of
   * the one before — marks, levels, lines. What is drawn is counted on the element (`data-marks`,
   * `data-events`, `data-drawings`): a canvas cannot be read back by an assertion.
   */
  layers?: ChartLayer[]
  /** An instant to centre on, in UTC seconds — the position the reader is looking at. */
  focus?: number | null
  /**
   * The decimals and the least move of the instrument's prices. Left out, the library's own format
   * applies, which is two decimals for every instrument.
   */
  priceFormat?: { precision: number, minMove: number } | null
  /**
   * The volume, drawn by the library as a series of its own behind the candles. Left out, the chart
   * draws none and builds no series for it — the free chart; null, nothing yet.
   */
  volume?: ChartVolume | null
  /**
   * The candles layer: the form the price is drawn in, whether it is shown, how strongly. Left out,
   * candles at full strength — the free chart.
   */
  candles?: ChartCandles | null
  /** The edges a batch of bars is on its way to: a quiet sign in that corner, the chart stays drawn. */
  loadingEdges?: BarEdge[]
  /** A batch at an edge that failed: said in that corner — the bars loaded stay. */
  edgeError?: { edge: BarEdge, message: string } | null
  /** The panes as tall as the reader dragged them; a pane not named stands at its default (viewer#57). */
  paneWeights?: PaneWeights | null
  /** The pane given the whole height, the others folded to their legend's line. */
  maximizedPane?: string | null
  /**
   * The workers' series to draw (contract 55), each at its layer's opacity — on the candles, or in a
   * pane of its own below the volume's, one per name the backend gives. Left out, none.
   */
  indicators?: DrawnSeries[] | null
  /** Each pane's frame and background, by name; a pane not named stands plain (viewer#57). */
  paneLooks?: PaneLooks | null
}>()

const emit = defineEmits<{
  /**
   * The width of one bar on screen, in pixels, whenever the reader zooms or the chart is resized —
   * what a caller gathers marks by that would otherwise cover each other.
   */
  spacing: [width: number]
  /**
   * The view came within a few bars of the first or the last bar it holds — where a caller that
   * loads as the view moves asks for more (viewer#9). Said on every move near it; asking twice is
   * the caller's to prevent.
   */
  edge: [side: BarEdge]
  /** The weights of every pane, once the reader dragged a separator between two of them. */
  paneWeights: [weights: PaneWeights]
  /** What a pane draws, shown or hidden at its lever on the chart — by the pane's name. */
  paneShown: [pane: string, shown: boolean]
  /** One pane given the whole height, or none. */
  maximize: [pane: string | null]
  /** The panes asked back at their first heights — a double click on a seam. */
  resetPanes: []
}>()

/** How many bars are on show around a focus, where the whole window would make them too narrow to read. */
const FOCUS_SPAN = 150

/**
 * The narrowest a bar may be drawn, in pixels. The library's own floor is 0.5 px, and fitting a
 * window to the chart stops there: 2,000 bars then need 1,000 px, and on a chart narrower than that
 * the window's start — and every mark on it — was out of view at first look (measured 2026-10-19:
 * a unit of 1,217 H4 bars at the default split showed from mid-February of a window that began in
 * January). Low enough for the route's 10,000 bars to fit 500 px.
 */
const MIN_BAR_SPACING = 0.05

/** How close to the first or the last bar held the view comes before it says so. */
const EDGE_BARS = 20

/**
 * The volume's own price scale, which nothing shows: it is drawn in the lowest fifth of the pane, as
 * established charts draw it, and leaves the candles' scale alone — so switching it on or off moves
 * no candle.
 */
const VOLUME_SCALE = 'volume'
/** How strongly a volume bar is drawn at full opacity — behind the candles, it must not compete. */
const VOLUME_ALPHA = 0.45
/**
 * The inks of a worker's NEUTRAL series, the first series of a pane in the first: plain ink, then the
 * quiet one — two lightness steps and no hue. Measured 2026-11-13 with the dataviz validator: every
 * hue left over collides with a role this chart draws — an orange stood 6.1 from the falling
 * candles to full colour vision, a violet 3.4 from the annotation under protan — so what tells two
 * workers on one pane apart is lightness, the legend's word and the dash, never a hue alone.
 */
/** Where the volume's scale begins: the lowest fifth of the pane is the volume's. */
const VOLUME_TOP = 0.8
/**
 * In a pane of its own, the volume's scale leaves a fifth of the pane above its tallest bar: the
 * line its legend and its controls stand on. At a tenth they stood over the tallest bars (operator,
 * 2026-11-12).
 */
const OWN_PANE_MARGINS = { top: 0.2, bottom: 0 }

const container = ref<HTMLElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<SeriesType> | null = null
/** The form the price series was built in — a change of form builds it anew. */
let builtForm: PriceForm | null = null
let volumeSeries: ISeriesApi<'Histogram'> | null = null
/** What the chart draws for itself — one series primitive for every layer. */
let host: ChartDrawingHost | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

/** The size the chart was last drawn at — the frame a card has to stay inside. */
const frameSize = ref({ width: 0, height: 0 })

/** Whether the volume stands in a pane of its own — what the panes are laid out by. */
const volumeOwnPane = ref(false)
/** Where the volume was last placed, in a pane of its own or not — null before the chart placed it. */
let placedOwn: boolean | null = null
/**
 * The volume's own scale format, once its series stands: a ref, so the legends worked out before the
 * chart was built print the value again in that form — a series held in a plain variable left them
 * with the value as served until the pointer moved.
 */
const volumeFormat = shallowRef<((value: number) => string) | null>(null)
/** How many panes the chart stacks, on the element: a canvas cannot be read back by an assertion. */
const paneCount = ref(1)
/** The share of the price pane the time lane takes, as the host last told it. */
let laneShare = 0

/**
 * The workers' series, each plot a series of the library in the pane its series names (contract 55).
 * Their panes stand below the candles and the volume's own; built and taken down whole, here, when
 * the panes above them change.
 */
const indicatorSeries = useIndicatorSeries({
  chart: () => chart,
  drawn: () => props.indicators ?? [],
  firstPane: () => volumeOwnPane.value ? 2 : 1,
  inks: () => indicatorInks(readColours()),
  symbolFormat: () => props.priceFormat ? { type: 'price', ...props.priceFormat } : null,
})

/** The panes the chart stacks now, top to bottom, by name. */
const paneIds = computed(() => ['price', ...(volumeOwnPane.value ? ['volume'] : []), ...indicatorSeries.panes.value])

/**
 * The pane at the whole height — only while it stands. A pane given it can go: the volume hidden, a
 * worker's series on a timeframe that cannot draw it. The choice is kept and holds again once the
 * pane is back; meanwhile no pane is folded, or every one would lose its controls with nothing at the
 * whole height to fold beside.
 */
const wholePane = computed(() =>
  props.maximizedPane && paneIds.value.includes(props.maximizedPane) ? props.maximizedPane : null)

/** The panes the chart stacks, top to bottom, at the heights the reader kept (viewer#57). */
const panes = useChartPanes({
  chart: () => chart,
  ids: () => paneIds.value,
  weights: () => props.paneWeights,
  onWeights: weights => emit('paneWeights', weights),
  frame: () => container.value,
  maximized: () => wholePane.value,
})

/** Where each pane stands in the frame — the legends and the controls are placed by it. */
const paneBoxes = panes.boxes
/** The pane the pointer is over — its controls show at the top right of its plot. */
const hoveredPane = ref<string | null>(null)
/** How far above and below a seam a double click still lands on it — the library's handle is 9 px. */
const SEAM_REACH = 5

/** Where the pointer stands inside the frame, from the top. */
function frameY(event: MouseEvent): number {
  return event.clientY - (container.value?.getBoundingClientRect().top ?? 0)
}

/** The pane under the pointer, by where each was measured — the chart says it only over its plot. */
function onFramePointer(event: PointerEvent): void {
  const y = frameY(event)
  hoveredPane.value = panes.boxes.value.find(box => y >= box.top && y < box.top + box.height)?.id ?? null
}

/** A double click on a seam asks for the first heights, as VS Code's sashes do. */
function onFrameDoubleClick(event: MouseEvent): void {
  const y = frameY(event)
  if (panes.boxes.value.slice(1).some(box => Math.abs(y - box.top) <= SEAM_REACH)) emit('resetPanes')
}

/**
 * Whether what a pane draws first is on show — null where the chart is handed no lever for it. A
 * worker's pane stands only while one of its series is shown, so its lever hides it.
 */
function paneShown(pane: string): boolean | null {
  if (pane === 'price') return props.candles ? props.candles.shown : null
  if (pane === 'volume') return props.volume ? props.volume.shown : null
  return true
}

/** The whole height for a pane, or — where one has it — the heights back. */
function toggleWhole(pane: string): void {
  emit('maximize', wholePane.value ? null : pane)
}

/** The time of the bar under the pointer — null off the bars, where the legends say the last one. */
const pointerTime = ref<number | null>(null)
/** Each bar's place by its time, so the bar under the pointer is found at once on every move. */
const barIndex = computed(() => new Map(props.data.map((bar, index) => [bar.time, index])))
/** The volume's value of each bar, by its time. */
const volumeByTime = computed(() => new Map((props.volume?.bars ?? []).map(bar => [bar.time, bar.value])))

/** What each pane's legend says (viewer#57): the bar under the pointer, else the last one drawn. */
const legends = computed(() => {
  const index = pointerTime.value === null ? undefined : barIndex.value.get(pointerTime.value)
  const bar = props.data[index ?? props.data.length - 1] ?? null
  return paneLegends({
    bar,
    volumeValue: bar ? volumeByTime.value.get(bar.time) ?? null : null,
    volume: props.volume ?? null,
    tickSize: props.priceFormat?.minMove ?? null,
    formatVolume: value => volumeFormat.value?.(value) ?? String(value),
    // a series' values print as its own scale prints them, the value as served until it is drawn
    series: (props.indicators ?? []).map(({ entry, span }) => ({
      pane: entry.pane,
      line: seriesLegend(entry, pointerTime.value, indicatorSeries.formatOf(entry.layer) ?? String, span),
    })),
  })
})

/** Where each pane's legend stands — the folded panes' as their lines in the one given the whole height. */
const tops = computed(() => {
  const lines = new Map(legends.value.map(legend => [legend.pane, legendLines(legend)]))
  return legendTops(panes.boxes.value, wholePane.value, pane => lines.get(pane) ?? 1)
})

/** Where a pane's legend stands: by its pane, the first pane's before any was measured. */
function legendTop(pane: string): number | null {
  return tops.value.get(pane) ?? (pane === 'price' ? 0 : null)
}

/** How tall a pane's legend may stand: its pane's height, where it is not folded and was measured. */
function legendRoom(pane: string): number | null {
  if (folded(pane)) return null
  return panes.boxes.value.find(box => box.id === pane)?.height ?? null
}

/** A pane folded beside one given the whole height: it keeps its legend's lines and no controls. */
function folded(pane: string): boolean {
  return wholePane.value !== null && wholePane.value !== pane && paneCount.value > 1
}

/**
 * The plot's width, beside the price scale — the notices stand at its right edge, the top left being
 * the legend's. The library tells it whenever the scale's labels widen or narrow it.
 */
const plotWidth = ref(0)

/** The bars the series was last handed — what a new set is compared with, to keep the view where it is. */
let shown: ChartBar[] = []
/**
 * While a set is handed and framed: the library reports the ranges it passes through, later and in
 * order, and those are not the view. Measured 2026-10-29 on a live run: a first batch framed at
 * 922–1072 reported 1934–1999 first, and asked for more at once. A range it is given applies at its
 * next paint, so the edges are read after that, once.
 */
let settling = false
let settleFrame = 0
/**
 * The open of the first bar in view, in UTC seconds — on the element, so a browser test can tell
 * that bars loaded at an edge moved nothing the reader was looking at.
 */
const visibleFrom = ref<number | null>(null)

/**
 * Every drawn thing that can say what it is, by the id the library reports under the pointer.
 *
 * ONE register over every layer: a mark, a level and a line each bring their id and their card, and
 * the host's hit test answers with that id. The drawings an algo makes (testingide#379) will come
 * the same way, as one more layer.
 */
const shownLayers = computed(() => (props.layers ?? []).filter(layer => !layer.hidden))
const drawings = computed(() => shownLayers.value.flatMap(layer => layer.drawings))
const cards = computed(() => new Map<string, FigureCard>(drawings.value.map(drawing => [drawing.id, drawing.card])))

/** The marks drawn, and how many events they stand for — a gathered mark for each of its members. */
const markCount = computed(() => drawings.value.filter(drawing => drawing.kind === 'marker').length)
const events = computed(() => drawings.value.reduce(
  (sum, drawing) => sum + (drawing.kind === 'marker' ? drawing.count ?? 1 : 0), 0))
/** The moment marked over the whole height, in UTC seconds — on the element, as the marks are counted there. */
const timeAt = computed(() => drawings.value.find(drawing => drawing.kind === 'time')?.time)
/** Each layer and how many drawings it holds — `levels:2 entry-exit:1 trades:12`. */
const drawingCounts = computed(() => shownLayers.value.map(layer => `${layer.id}:${layer.drawings.length}`).join(' '))

/** The range of every bar drawn, by its time — what the marks stand away from. */
const barRanges = computed(() => new Map<number, BarRange>(props.data.map(bar => [bar.time, { high: bar.high, low: bar.low }])))

const EDGE_FAILED: Record<BarEdge, string> = {
  left: t('Earlier bars could not be loaded'),
  right: t('Later bars could not be loaded'),
}

/** Each edge with a batch on its way or failed — its failure said, with the reason after it. */
const edgeStates = computed(() => (['left', 'right'] as const).flatMap(edge => {
  const failed = props.edgeError?.edge === edge ? `${EDGE_FAILED[edge]}: ${props.edgeError.message}` : null
  return failed || props.loadingEdges?.includes(edge) ? [{ edge, error: failed }] : []
}))

/** The card under the pointer, and where the pointer is — null off every drawn thing. */
const pointed = shallowRef<{ id: string, card: FigureCard, x: number, y: number } | null>(null)

function onPointer(param: MouseEventParams): void {
  pointerTime.value = typeof param.time === 'number' ? param.time : null
  const id = param.hoveredInfo?.objectId
  const card = typeof id === 'string' ? cards.value.get(id) : undefined
  pointed.value = card && param.point ? { id: id as string, card, x: param.point.x, y: param.point.y } : null
  // a booking period under the pointer draws its bounds through the candles
  host?.setHovered(pointed.value?.id ?? null)
}

/** What the chart paints with — each one a token, in its role where `tokens.css` names one. */
interface ChartColours {
  surface: string
  text: string
  rule: string
  focus: string
  rise: string
  fall: string
  mark: string
  quiet: string
  annotation: string
  warning: string
  /** The inks of the workers' neutral series, one per series of a pane in turn. */
  indicators: string[]
  /** A pane's background, a raised surface, and its frame's rule. */
  paneSurface: string
  paneFrame: string
}

/**
 * The chart's colours, read from the theme tokens rather than written here.
 *
 * A canvas is painted with VALUES, so the theme cannot reach it through CSS the way it reaches every
 * other surface — the chart reads the tokens itself, when it is built and whenever it repaints.
 */
function readColours(): ChartColours {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string): string => style.getPropertyValue(name).trim()
  return {
    surface: token('--color-bg-base'),
    text: token('--color-text-secondary'),
    rule: token('--color-border'),
    // the crosshair follows the pointer: interactive focus, the accent's second role
    focus: token('--color-accent'),
    // a candle's direction is the polarity of a figure
    rise: token('--color-positive'),
    fall: token('--color-negative'),
    // an entry is a fact about the trade, not a result: plain ink
    mark: token('--color-text-primary'),
    quiet: token('--color-text-secondary'),
    annotation: token('--color-annotation'),
    // an order refused: something to weigh before trusting what is beside it
    warning: token('--color-warning'),
    indicators: NEUTRAL_TOKENS.map(token),
    // a pane set apart stands on the surface a panel stands on, framed in the rule an overlay has
    paneSurface: token('--color-bg-surface'),
    paneFrame: token('--color-border-overlay'),
  }
}

/**
 * A worker's series by its role (contract 55): a result's polarity, a warning and an annotation are
 * ours of the same names; a neutral one takes the next indicator ink of its pane, and a reference
 * line on its scale the quiet ink of the price scale's labels.
 */
function indicatorInks(colours: ChartColours): IndicatorInks {
  return {
    roles: { positive: colours.rise, negative: colours.fall, warning: colours.warning, annotation: colours.annotation },
    neutral: colours.indicators,
    quiet: colours.quiet,
  }
}

/**
 * A drawing's colour by its role — a result is the polarity of a figure; the shape and the word say
 * the rest. A gathered mark whose results point different ways claims neither: quiet, like a flat
 * one. An entry is a fact about the trade, not a result: plain ink.
 */
function drawingColours(colours: ChartColours): DrawingColours {
  return {
    roles: {
      positive: colours.rise,
      negative: colours.fall,
      flat: colours.quiet,
      mixed: colours.quiet,
      entry: colours.mark,
      annotation: colours.annotation,
      warning: colours.warning,
    },
    surface: colours.surface,
    ink: colours.mark,
  }
}

function showDrawings(): void {
  host?.setDrawings(props.layers ?? [], barRanges.value, drawingColours(readColours()))
}

/**
 * The bars on show: around the focus where there is one and the window is long, all of them
 * otherwise. A short window is shown whole, focus or not — every trade is in sight already.
 */
function frame(): void {
  if (!chart) return
  const at = props.focus
  if (at === null || at === undefined || props.data.length <= FOCUS_SPAN) {
    chart.timeScale().fitContent()
    return
  }
  // the bar the focus fell in: the last one that opened at or before it
  let middle = 0
  props.data.forEach((bar, index) => { if (bar.time <= at) middle = index })
  chart.timeScale().setVisibleLogicalRange({ from: middle - FOCUS_SPAN / 2, to: middle + FOCUS_SPAN / 2 })
}

function chartColours(colours: ChartColours): DeepPartial<ChartOptions> {
  return {
    layout: {
      background: { type: ColorType.Solid, color: colours.surface },
      textColor: colours.text,
      // the separator between two panes is a seam to drag: a rule at rest, interactive under the pointer
      panes: { separatorColor: colours.rule, separatorHoverColor: withAlpha(colours.focus, 0.3) },
    },
    grid: {
      vertLines: { color: colours.rule },
      horzLines: { color: colours.rule },
    },
    crosshair: {
      vertLine: { color: colours.focus },
      horzLine: { color: colours.focus },
    },
    rightPriceScale: { borderColor: colours.rule },
    timeScale: { borderColor: colours.rule },
  }
}

/**
 * The price series' colours for its form, at the strength the candles layer is drawn at — a bar's
 * direction is the polarity of a figure, and a line or an area of the close is plain ink. Hidden, every
 * colour is transparent and the last price says nothing on the axis.
 */
function priceColours(colours: ChartColours): Record<string, unknown> {
  const layer = candlesLayer()
  const alpha = layer.shown ? layer.opacity : 0
  const rise = withAlpha(colours.rise, alpha)
  const fall = withAlpha(colours.fall, alpha)
  const ink = withAlpha(colours.mark, alpha)
  const marks = { lastValueVisible: layer.shown, priceLineVisible: layer.shown }
  if (layer.form === 'line') return { color: ink, lineWidth: 1, ...marks }
  if (layer.form === 'area') {
    return { lineColor: ink, topColor: withAlpha(colours.mark, alpha * 0.25), bottomColor: withAlpha(colours.mark, 0), lineWidth: 1, ...marks }
  }
  if (layer.form === 'bars') return { upColor: rise, downColor: fall, ...marks }
  return { upColor: rise, downColor: fall, wickUpColor: rise, wickDownColor: fall, ...marks }
}

/**
 * The size the chart can be drawn at, or null while the container has none.
 *
 * A container of 0×0 is a panel not yet laid out or not in view. A chart created at that size, or
 * fitted to it, keeps a collapsed time scale; resized to it, it loses its place. So nothing is drawn
 * or resized until there is a real size, and the bars are fitted to the first one.
 */
function drawableSize(): { width: number, height: number } | null {
  const element = container.value
  if (!element || element.clientWidth === 0 || element.clientHeight === 0) return null
  return { width: element.clientWidth, height: element.clientHeight }
}

function initChart(size: { width: number, height: number }): void {
  if (!container.value) return

  const colours = readColours()
  chart = createChart(container.value, {
    width: size.width,
    height: size.height,
    timeScale: { timeVisible: true, minBarSpacing: MIN_BAR_SPACING },
    // the library's licence asks for its notice in the code and a link to tradingview.com on a page
    // the reader can open; the logo is one way to meet the link, and may go where both are met
    // otherwise (`attributionLogo`, lightweight-charts 5.2.1): the notice is in NOTICE, the link in
    // the About dialog. The logo stood over the lowest pane's first bars
    layout: { attributionLogo: false },
  })
  chart.applyOptions(chartColours(colours))
  chart.subscribeCrosshairMove(onPointer)
  chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
  chart.timeScale().subscribeSizeChange(width => { plotWidth.value = width })
  frameSize.value = size

  // built before the candles, so it is drawn behind them where it shares their pane
  if (props.volume !== undefined) {
    const built = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false,
    }, volumeInOwnPane() ? 1 : 0)
    volumeSeries = built
    volumeFormat.value = value => built.priceFormatter().format(value)
    placeVolume()
  }
  host = new ChartDrawingHost()
  // told from inside the library's drawing of a frame: the scale is moved once that has finished
  host.onLaneShare(share => queueMicrotask(() => fitVolume(share)))
  buildPriceSeries()
  panes.track()
}

/** The candles as handed, or candles at full strength where none were — the free chart. */
function candlesLayer(): ChartCandles {
  return props.candles ?? { form: 'candles', shown: true, opacity: 1 }
}

/**
 * The price series in the form the candles layer asks for, the drawing host attached to it. Built
 * again on a change of form: the library has one series type per form, and the host goes with the
 * series it is attached to. Hidden, it stays and is drawn fully transparent, so the drawings and the
 * price scale that rests on it stay where they were.
 */
function buildPriceSeries(): void {
  if (!chart || !host) return
  const previous = series
  const form = candlesLayer().form
  const options = { ...priceColours(readColours()), ...seriesFormat() }
  series = form === 'bars' ? chart.addSeries(BarSeries, options)
    : form === 'line' ? chart.addSeries(LineSeries, options)
      : form === 'area' ? chart.addSeries(AreaSeries, options)
        : chart.addSeries(CandlestickSeries, { borderVisible: false, ...options })
  builtForm = form
  // the old series goes only once the new one stands: the library removes a pane left empty, and the
  // volume's own pane would then move up and take the candles (viewer#57)
  if (previous) {
    previous.detachPrimitive(host)
    chart.removeSeries(previous)
  }
  series.attachPrimitive(host)
  // a series added later is drawn over those before it: the workers' series go over the candles anew
  layoutIndicators()
}

/**
 * The workers' series drawn anew below the panes above them — after the candles were built, the
 * volume moved, or the series, their layers or the theme changed — and every pane laid out at its
 * weight again.
 */
function layoutIndicators(): void {
  if (!chart || !series) return
  // taken off while their panes stand: the build takes a worker's pane down with its series
  clearLooks()
  indicatorSeries.build()
  panes.applyWeights()
  paneCount.value = chart.panes().length
  panes.track()
  applyLooks()
}

/** The pane primitives that paint each pane's look, and the pane each is attached to. */
let looks: { pane: ReturnType<IChartApi['panes']>[number], primitive: PaneLookPrimitive }[] = []

/** Every pane's look taken off — before the panes are laid out anew, while each still stands. */
function clearLooks(): void {
  for (const { pane, primitive } of looks) pane.detachPrimitive(primitive)
  looks = []
}

/**
 * Each pane's frame and background, as set — painted anew after every layout of the panes, since a
 * pane the library takes down takes its primitives with it, and a pane built again has none.
 */
function applyLooks(): void {
  clearLooks()
  if (!chart) return
  const colours = readColours()
  const ids = paneIds.value
  chart.panes().forEach((pane, index) => {
    const id = ids[index]
    const look = id && props.paneLooks && Object.prototype.hasOwnProperty.call(props.paneLooks, id) ? props.paneLooks[id] : undefined
    if (!look || (!look.frame && !look.background)) return
    const primitive = new PaneLookPrimitive(look, { background: colours.paneSurface, frame: colours.paneFrame })
    pane.attachPrimitive(primitive)
    looks.push({ pane, primitive })
  })
}

/** The bars as the series of the form drawn takes them: OHLC, or the close alone for a line or an area. */
function priceData(data: ChartBar[]): unknown[] {
  const form = candlesLayer().form
  return form === 'line' || form === 'area'
    ? data.map(bar => ({ time: bar.time as UTCTimestamp, value: bar.close }))
    : data.map(bar => ({ ...bar, time: bar.time as UTCTimestamp }))
}

/** The width of a bar on screen: the plot's width over the bars in view, however far zoomed. */
function reportSpacing(): void {
  if (!chart) return
  const range = chart.timeScale().getVisibleLogicalRange()
  const bars = range ? range.to - range.from : 0
  if (bars > 0) emit('spacing', chart.timeScale().width() / bars)
}

/** The view near the first or the last bar it holds: said, so more can be asked for there. */
function reportEdges(): void {
  if (!chart || !shown.length) return
  const range = chart.timeScale().getVisibleLogicalRange()
  if (!range) return
  visibleFrom.value = shown[Math.min(shown.length - 1, Math.max(0, Math.ceil(range.from)))]!.time
  if (range.from < EDGE_BARS) emit('edge', 'left')
  if (range.to > shown.length - 1 - EDGE_BARS) emit('edge', 'right')
}

function onRange(): void {
  reportSpacing()
  if (!settling) reportEdges()
}

/** Holds the edges back until the library has painted what it was just handed, then reads them once. */
function settle(): void {
  settling = true
  cancelAnimationFrame(settleFrame)
  settleFrame = requestAnimationFrame(() => {
    settleFrame = requestAnimationFrame(() => {
      settling = false
      reportEdges()
    })
  })
}

/**
 * Where the bars held so far stand in a new set, or null where the set is another one. A set that
 * keeps them whole, with bars before or after, extends them: the index of the first of them in it.
 */
function extensionOf(before: ChartBar[], after: ChartBar[]): number | null {
  if (!before.length) return null
  const at = after.findIndex(bar => bar.time === before[0]!.time)
  if (at < 0 || after[at + before.length - 1]?.time !== before.at(-1)!.time) return null
  return at
}

/** The series' price format where one was handed in — nothing, and the library keeps its own. */
function seriesFormat(): { priceFormat?: { type: 'price', precision: number, minMove: number } } {
  return props.priceFormat ? { priceFormat: { type: 'price', ...props.priceFormat } } : {}
}

/**
 * Repaint in the theme the document now shows. Called by the observer on `data-theme`, the
 * attribute `App.vue` sets; a chart not built yet reads the theme when it is built.
 */
function repaint(): void {
  if (!chart || !series) return
  const colours = readColours()
  chart.applyOptions(chartColours(colours))
  series.applyOptions(priceColours(colours))
  showDrawings()
  showVolume()
  layoutIndicators()
}

/**
 * The volume stands above the time lane, never under it: its fifth of the pane is lifted by the
 * lane's share, so the lane's strip and marks are not drawn over its bars (on screen 2026-11-08).
 * In a pane of its own it is clear of the lane already; the share is kept for when it comes back.
 */
function fitVolume(share: number): void {
  laneShare = share
  if (!chart || !volumeSeries || volumeOwnPane.value) return
  chart.priceScale(VOLUME_SCALE).applyOptions({ scaleMargins: { top: VOLUME_TOP - share, bottom: share } })
}

/** Whether the volume stands in a pane of its own: its option on, and shown — hidden, it takes no room. */
function volumeInOwnPane(): boolean {
  return (props.volume?.ownPane ?? false) && (props.volume?.shown ?? false)
}

/**
 * Where the volume stands (viewer#57): in a pane of its own below the candles, on that pane's own
 * scale, or behind the candles in the lowest fifth of their pane, on a scale nothing shows. Hidden it
 * gives its pane up and the candles take the whole height (operator, on screen 2026-11-12: an empty
 * pane is room taken for nothing); shown again, its pane comes back at the height kept. Moved, never
 * built anew; back in the candles' pane it is put first there, so they are drawn over it.
 */
function placeVolume(): void {
  if (!chart || !volumeSeries) return
  const own = volumeInOwnPane()
  // placed once for each change of pane: placed on every change of the volume — bars loaded at an
  // edge, a layer switched — the weights laid out again undid a drag the reader still held
  if (own === placedOwn) return
  placedOwn = own
  // the workers' panes stand below the volume's: taken down first, the volume's own pane is pane 1 —
  // and the looks off them before, while they stand
  clearLooks()
  indicatorSeries.remove()
  const index = own ? 1 : 0
  if (volumeSeries.getPane().paneIndex() !== index) volumeSeries.moveToPane(index)
  volumeOwnPane.value = own
  if (own) {
    volumeSeries.applyOptions({ priceScaleId: 'right' })
    // the library keeps a right scale's options as its default for a pane made later as well
    // (lightweight-charts 5.2.1): a pane of another kind sets its own margins
    volumeSeries.priceScale().applyOptions({ scaleMargins: OWN_PANE_MARGINS })
  } else {
    volumeSeries.applyOptions({ priceScaleId: VOLUME_SCALE })
    volumeSeries.setSeriesOrder(0)
    fitVolume(laneShare)
  }
  if (series) {
    layoutIndicators()
    return
  }
  panes.applyWeights()
  paneCount.value = chart.panes().length
  panes.track()
}

/** The volume bars, in the colour of their candle's direction, faint — or none, where hidden. */
function showVolume(): void {
  if (!volumeSeries) return
  placeVolume()
  const volume = props.volume
  volumeSeries.applyOptions({ visible: volume?.shown ?? false })
  if (!volume) {
    volumeSeries.setData([])
    return
  }
  const colours = readColours()
  const alpha = VOLUME_ALPHA * volume.opacity
  const rise = withAlpha(colours.rise, alpha)
  const fall = withAlpha(colours.fall, alpha)
  settle()
  volumeSeries.setData(volume.bars.map(bar => ({
    time: bar.time as UTCTimestamp, value: bar.value, color: bar.rising ? rise : fall,
  })))
}

function showData(data: ChartBar[]): void {
  if (!series || !chart) return
  // bars loaded at an edge keep the view on the bars it showed: the range is put back, moved by the
  // bars that came before them. Which side the library anchors to on a new set is its own matter,
  // and nothing here relies on it
  const shift = extensionOf(shown, data)
  const range = shift !== null ? chart.timeScale().getVisibleLogicalRange() : null
  settle()
  series.setData(priceData(data) as never)
  shown = data
  showDrawings()
  if (shift === null) frame()
  else if (range) chart.timeScale().setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift })
}

/** The candles layer changed: another form builds the series anew, the same one is repainted. */
function showCandles(): void {
  if (!series) return
  if (candlesLayer().form !== builtForm) {
    buildPriceSeries()
    settle()
    series.setData(priceData(props.data) as never)
    showDrawings()
    return
  }
  series.applyOptions(priceColours(readColours()))
}

/** Build at the first real size, follow every later one, and ignore a collapse to nothing. */
function onResize(): void {
  const size = drawableSize()
  if (!size) return
  if (!chart) {
    initChart(size)
    if (props.data.length) showData(props.data)
    showVolume()
    return
  }
  chart.resize(size.width, size.height)
  frameSize.value = size
}

onMounted(() => {
  onResize()
  resizeObserver = new ResizeObserver(onResize)
  if (container.value) resizeObserver.observe(container.value)
  themeObserver = new MutationObserver(repaint)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
})

onUnmounted(() => {
  cancelAnimationFrame(settleFrame)
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  chart?.remove()
  // a lane share told in the last frame arrives after this: nothing is left to fit
  volumeSeries = null
})

// bars that arrive before the chart has a size wait for it: onResize hands them over at build time
watch(() => props.data, newData => showData(newData))
// a card of a drawing that is gone is not shown on: the next move of the pointer finds what is there.
// One whose drawing stands stays, and says what it says now: a frame played moves the layers several
// times a second, and a card under the pointer would blink with each step
watch(() => props.layers, () => {
  const card = pointed.value ? cards.value.get(pointed.value.id) : undefined
  pointed.value = pointed.value && card ? { ...pointed.value, card } : null
  showDrawings()
})
watch(() => props.focus, () => frame())
watch(() => props.volume, () => showVolume())
watch(() => props.candles, () => showCandles())
/**
 * What the workers' series draw, as one word: their layers, their strength and the stretch each
 * holds. The series are built again only where it changed — a new list handed with the same series
 * (every panel's view written anywhere hands one) left a pane the reader had scaled by hand at its
 * own scale again, and a held drag undone.
 */
const indicatorsDrawn = computed(() => (props.indicators ?? [])
  .map(({ entry, opacity, place }) => `${entry.layer}|${opacity}|${place}|${entry.times.length}|${entry.times[0]}|${entry.times.at(-1)}`)
  .join(' '))
watch(indicatorsDrawn, () => layoutIndicators())
watch(() => props.paneLooks, () => applyLooks())
// a layout loaded: the panes take the weights it holds
watch(() => props.paneWeights, () => panes.applyWeights())
watch(wholePane, () => panes.applyWeights())
// a format taken away goes back to the library's own (lightweight-charts 5.2.1: two decimals, a
// least move of 0.01) — applying nothing would keep the previous instrument's decimals
watch(() => props.priceFormat, () => {
  series?.applyOptions(props.priceFormat ? seriesFormat() : { priceFormat: { type: 'price', precision: 2, minMove: 0.01 } })
  // a worker's series in price units takes the symbol's format: one built before it arrived takes it now
  layoutIndicators()
})
</script>

<template>
  <div
    class="candle-chart"
    :data-marks="markCount"
    :data-events="events"
    :data-drawings="drawingCounts"
    :data-panes="paneCount"
    :data-indicators="(indicators ?? []).length"
    :data-bars="data.length"
    :data-time-at="timeAt"
    :data-visible-from="visibleFrom ?? undefined"
    :style="plotWidth ? { '--chart-plot-width': `${plotWidth}px` } : undefined"
    :data-maximized="wholePane ?? undefined"
    @pointermove="onFramePointer"
    @pointerleave="hoveredPane = null"
    @dblclick="onFrameDoubleClick"
  >
    <!-- what is drawn, counted on the element above: the canvas cannot be read back. `data-events`
         counts what the marks stand for, a gathered one for each of its members; `data-bars` the
         bars handed, which grows as more are loaded at an edge -->
    <div ref="container" class="candle-canvas" />
    <!-- each pane's legend at its top left, where TradingView and Kraken Pro set it -->
    <template v-for="legend in legends" :key="legend.pane">
      <ChartPaneLegend
        v-if="legendTop(legend.pane) !== null"
        :legend="legend"
        :top="legendTop(legend.pane)!"
        :folded="folded(legend.pane)"
        :room="legendRoom(legend.pane)"
      />
    </template>
    <!-- each pane's controls at the top right of its plot, where no figure of the legend can move them -->
    <template v-for="box in paneBoxes" :key="`controls-${box.id}`">
      <ChartPaneControls
        v-if="!folded(box.id) && (paneShown(box.id) !== null || paneCount > 1)"
        :shown="paneShown(box.id)"
        :whole="wholePane !== null"
        :can-maximize="paneCount > 1"
        :visible="hoveredPane === box.id"
        :top="legendTop(box.id) ?? box.top"
        :data-pane="box.id"
        @toggle-shown="emit('paneShown', box.id, !paneShown(box.id))"
        @toggle-whole="toggleWhole(box.id)"
      />
    </template>
    <!-- notices stand INSIDE the frame, over the plot, at its top right beside the price scale: a line
         above it would move the chart each time one appeared, and a selection never moves the layout -->
    <slot />
    <!-- a batch at an edge: a quiet sign at that edge while it is on its way, its failure said
         there — never a block over the plot -->
    <div v-for="side in edgeStates" :key="side.edge" class="edge-state" :class="side.edge" :data-edge="side.edge">
      <span v-if="side.error" class="edge-error">
        <AppIcon name="status-error" class="edge-error-mark" />{{ side.error }}
      </span>
      <AppSpinner v-else />
    </div>
    <ChartCard
      v-if="pointed"
      :card="pointed.card"
      :x="pointed.x"
      :y="pointed.y"
      :width="frameSize.width"
      :height="frameSize.height"
    />
  </div>
</template>

<style scoped>
/* the frame a card is placed in: the library draws into the canvas element beside it.
   In a column with a line above it — a hint — it takes the room left, not the column's whole
   height: sized to 100% it overflowed by that line, and the panel clipped its time axis */
.candle-chart {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.candle-canvas {
  width: 100%;
  height: 100%;
}

/* the edge a batch is on its way to, halfway up it: clear of the notices at the top left, of the
   time lane and the lowest pane at the bottom, and of the price scale at the right (on screen
   2026-10-29: low at the left it covered the library's logo, which the chart no longer draws) */
.edge-state {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: var(--z-chart);
  display: flex;
  max-width: calc(100% - 6rem);
  pointer-events: none;
}

.edge-state.left {
  left: var(--space-xs);
}

.edge-state.right {
  right: 4.5rem;
}

/* the request failed: the error role, with its mark and its words */
.edge-error {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 2px var(--space-sm);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-bg-overlay);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  pointer-events: auto;
}

.edge-error-mark {
  flex-shrink: 0;
  color: var(--color-error);
}
</style>
