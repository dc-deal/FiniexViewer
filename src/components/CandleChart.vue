<script setup lang="ts">
import { computed, ref, shallowRef, watch, onMounted, onUnmounted } from 'vue'
import { createChart, ColorType } from 'lightweight-charts'
import type {
  CandlestickSeriesPartialOptions, ChartOptions, DeepPartial, IChartApi, ISeriesApi, MouseEventParams,
  UTCTimestamp,
} from 'lightweight-charts'
import ChartCard from '@/components/base/ChartCard.vue'
import type { ChartBar } from '@/types/api/bar_types'
import type { FigureCard } from '@/types/figure_types'
import type { ChartMark } from '@/types/run_chart_types'

const props = defineProps<{
  data: ChartBar[]
  /**
   * Where trades opened and closed — drawn on the candles they fell in. Their count stands on the
   * element as `data-marks`: the canvas draws them where no assertion can read them back.
   */
  marks?: ChartMark[]
  /** An instant to centre on, in UTC seconds — the position the reader is looking at. */
  focus?: number | null
  /**
   * The decimals and the least move of the instrument's prices. Left out, the library's own format
   * applies, which is two decimals for every instrument.
   */
  priceFormat?: { precision: number, minMove: number } | null
}>()

/** How many bars are on show around a focus, where the whole window would make them too narrow to read. */
const FOCUS_SPAN = 150

const container = ref<HTMLElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<'Candlestick'> | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

/** The size the chart was last drawn at — the frame a card has to stay inside. */
const frameSize = ref({ width: 0, height: 0 })

/**
 * Every drawn thing that can say what it is, by the id the library reports under the pointer.
 *
 * ONE register, and the trade marks are only its first source. The library reports an id for a
 * marker (its `id`) and for a series primitive (the `externalId` its `hitTest` answers) alike, and
 * primitives are how the drawings an algo makes will reach this chart (testingide#379): a new kind
 * of drawing brings its id and its card, and nothing here changes.
 */
const cards = computed(() => new Map<string, FigureCard>((props.marks ?? []).map(mark => [mark.id, mark.card])))

/** The card under the pointer, and where the pointer is — null off every drawn thing. */
const pointed = shallowRef<{ card: FigureCard, x: number, y: number } | null>(null)

function onPointer(param: MouseEventParams): void {
  const id = param.hoveredObjectId
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

/** A mark's colour by its role — a result is the polarity of a figure; the shape says the rest. */
function markColour(mark: ChartMark, colours: ChartColours): string {
  if (mark.role === 'positive') return colours.rise
  if (mark.role === 'negative') return colours.fall
  if (mark.role === 'flat') return colours.quiet
  return colours.mark
}

function showMarks(): void {
  if (!series) return
  const colours = readColours()
  series.setMarkers((props.marks ?? []).map(mark => ({
    time: mark.time as UTCTimestamp,
    position: mark.position,
    shape: mark.shape,
    color: markColour(mark, colours),
    text: mark.text,
    size: mark.focused ? 2 : 1,
    id: mark.id,
  })))
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
    timeScale: { timeVisible: true },
  })
  chart.applyOptions(chartColours(colours))
  chart.subscribeCrosshairMove(onPointer)
  frameSize.value = size

  series = chart.addCandlestickSeries({ borderVisible: false, ...candleColours(colours), ...seriesFormat() })
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
  showMarks()
}

function showData(data: ChartBar[]): void {
  if (!series) return
  series.setData(data.map(b => ({ ...b, time: b.time as UTCTimestamp })))
  showMarks()
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
// a card of a mark that is gone is not shown on: the next move of the pointer finds what is there
watch(() => props.marks, () => {
  pointed.value = null
  showMarks()
})
watch(() => props.focus, () => frame())
// a format taken away goes back to the library's own (lightweight-charts 4.2.3: two decimals, a
// least move of 0.01) — applying nothing would keep the previous instrument's decimals
watch(() => props.priceFormat, () => series?.applyOptions(
  props.priceFormat ? seriesFormat() : { priceFormat: { type: 'price', precision: 2, minMove: 0.01 } }))
</script>

<template>
  <div class="candle-chart" :data-marks="marks?.length ?? 0">
    <div ref="container" class="candle-canvas" />
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
/* the frame a card is placed in: the library draws into the canvas element beside it */
.candle-chart {
  position: relative;
  width: 100%;
  height: 100%;
}

.candle-canvas {
  width: 100%;
  height: 100%;
}
</style>
