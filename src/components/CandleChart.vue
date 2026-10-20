<script setup lang="ts">
import { computed, ref, shallowRef, watch, onMounted, onUnmounted } from 'vue'
import { CandlestickSeries, ColorType, createChart } from 'lightweight-charts'
import type {
  CandlestickSeriesPartialOptions, ChartOptions, DeepPartial, IChartApi, ISeriesApi, MouseEventParams, UTCTimestamp,
} from 'lightweight-charts'
import ChartCard from '@/components/base/ChartCard.vue'
import { ChartDrawingHost, type DrawingColours } from '@/components/chart_drawing_host'
import type { BarRange } from '@/components/chart_geometry'
import type { ChartBar } from '@/types/api/bar_types'
import type { ChartLayer } from '@/types/chart_drawing_types'
import type { FigureCard } from '@/types/figure_types'

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
}>()

const emit = defineEmits<{
  /**
   * The width of one bar on screen, in pixels, whenever the reader zooms or the chart is resized —
   * what a caller gathers marks by that would otherwise cover each other.
   */
  spacing: [width: number]
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

const container = ref<HTMLElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<'Candlestick'> | null = null
/** What the chart draws for itself — one series primitive for every layer. */
let host: ChartDrawingHost | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

/** The size the chart was last drawn at — the frame a card has to stay inside. */
const frameSize = ref({ width: 0, height: 0 })

/**
 * Every drawn thing that can say what it is, by the id the library reports under the pointer.
 *
 * ONE register over every layer: a mark, a level and a line each bring their id and their card, and
 * the host's hit test answers with that id. The drawings an algo makes (testingide#379) will come
 * the same way, as one more layer.
 */
const drawings = computed(() => (props.layers ?? []).flatMap(layer => layer.drawings))
const cards = computed(() => new Map<string, FigureCard>(drawings.value.map(drawing => [drawing.id, drawing.card])))

/** The marks drawn, and how many events they stand for — a gathered mark for each of its members. */
const markCount = computed(() => drawings.value.filter(drawing => drawing.kind === 'marker').length)
const events = computed(() => drawings.value.reduce(
  (sum, drawing) => sum + (drawing.kind === 'marker' ? drawing.count ?? 1 : 0), 0))
/** Each layer and how many drawings it holds — `levels:2 entry-exit:1 trades:12`. */
const drawingCounts = computed(() => (props.layers ?? []).map(layer => `${layer.id}:${layer.drawings.length}`).join(' '))

/** The range of every bar drawn, by its time — what the marks stand away from. */
const barRanges = computed(() => new Map<number, BarRange>(props.data.map(bar => [bar.time, { high: bar.high, low: bar.low }])))

/** The card under the pointer, and where the pointer is — null off every drawn thing. */
const pointed = shallowRef<{ card: FigureCard, x: number, y: number } | null>(null)

function onPointer(param: MouseEventParams): void {
  const id = param.hoveredInfo?.objectId
  const card = typeof id === 'string' ? cards.value.get(id) : undefined
  pointed.value = card && param.point ? { card, x: param.point.x, y: param.point.y } : null
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
    },
    surface: colours.surface,
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

function candleColours(colours: ChartColours): CandlestickSeriesPartialOptions {
  return {
    upColor: colours.rise,
    downColor: colours.fall,
    wickUpColor: colours.rise,
    wickDownColor: colours.fall,
  }
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
  })
  chart.applyOptions(chartColours(colours))
  chart.subscribeCrosshairMove(onPointer)
  chart.timeScale().subscribeVisibleLogicalRangeChange(reportSpacing)
  frameSize.value = size

  series = chart.addSeries(CandlestickSeries, { borderVisible: false, ...candleColours(colours), ...seriesFormat() })
  host = new ChartDrawingHost()
  series.attachPrimitive(host)
}

/** The width of a bar on screen: the plot's width over the bars in view, however far zoomed. */
function reportSpacing(): void {
  if (!chart) return
  const range = chart.timeScale().getVisibleLogicalRange()
  const bars = range ? range.to - range.from : 0
  if (bars > 0) emit('spacing', chart.timeScale().width() / bars)
}

/** The series' price format where one was handed in — nothing, and the library keeps its own. */
function seriesFormat(): CandlestickSeriesPartialOptions {
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
  series.applyOptions(candleColours(colours))
  showDrawings()
}

function showData(data: ChartBar[]): void {
  if (!series) return
  series.setData(data.map(b => ({ ...b, time: b.time as UTCTimestamp })))
  showDrawings()
  frame()
}

/** Build at the first real size, follow every later one, and ignore a collapse to nothing. */
function onResize(): void {
  const size = drawableSize()
  if (!size) return
  if (!chart) {
    initChart(size)
    if (props.data.length) showData(props.data)
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
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  chart?.remove()
})

// bars that arrive before the chart has a size wait for it: onResize hands them over at build time
watch(() => props.data, newData => showData(newData))
// a card of a drawing that is gone is not shown on: the next move of the pointer finds what is there
watch(() => props.layers, () => {
  pointed.value = null
  showDrawings()
})
watch(() => props.focus, () => frame())
// a format taken away goes back to the library's own (lightweight-charts 5.2.1: two decimals, a
// least move of 0.01) — applying nothing would keep the previous instrument's decimals
watch(() => props.priceFormat, () => series?.applyOptions(
  props.priceFormat ? seriesFormat() : { priceFormat: { type: 'price', precision: 2, minMove: 0.01 } }))
</script>

<template>
  <div class="candle-chart" :data-marks="markCount" :data-events="events" :data-drawings="drawingCounts">
    <!-- what is drawn, counted on the element above: the canvas cannot be read back. `data-events`
         counts what the marks stand for, a gathered one for each of its members -->
    <div ref="container" class="candle-canvas" />
    <!-- notices stand INSIDE the frame, over the plot: a line above it would move the chart each
         time one appeared, and a selection never moves the layout -->
    <slot />
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
</style>
