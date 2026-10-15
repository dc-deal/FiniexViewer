<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { createChart, ColorType } from 'lightweight-charts'
import type {
  CandlestickSeriesPartialOptions, ChartOptions, DeepPartial, IChartApi, ISeriesApi, UTCTimestamp,
} from 'lightweight-charts'
import type { ChartBar } from '@/types/api/bar_types'
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
}>()

/** How many bars are on show around a focus, where the whole window would make them too narrow to read. */
const FOCUS_SPAN = 150

const container = ref<HTMLElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<'Candlestick'> | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

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
  if (mark.role === 'gain') return colours.rise
  if (mark.role === 'loss') return colours.fall
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

  series = chart.addCandlestickSeries({ borderVisible: false, ...candleColours(colours) })
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
watch(() => props.marks, () => showMarks())
watch(() => props.focus, () => frame())
</script>

<template>
  <div ref="container" class="candle-chart" :data-marks="marks?.length ?? 0" />
</template>

<style scoped>
.candle-chart {
  width: 100%;
  height: 100%;
}
</style>
