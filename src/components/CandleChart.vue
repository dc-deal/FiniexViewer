<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { createChart, ColorType } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { ChartBar } from '@/types/api/bar_types'

const props = defineProps<{
  data: ChartBar[]
}>()

const container = ref<HTMLElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<'Candlestick'> | null = null
let resizeObserver: ResizeObserver | null = null

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

  chart = createChart(container.value, {
    width: size.width,
    height: size.height,
    layout: {
      background: { type: ColorType.Solid, color: '#0d0d0f' },
      textColor: '#888888',
    },
    grid: {
      vertLines: { color: '#2a2a2e' },
      horzLines: { color: '#2a2a2e' },
    },
    crosshair: {
      vertLine: { color: '#4aaeff' },
      horzLine: { color: '#4aaeff' },
    },
    rightPriceScale: { borderColor: '#2a2a2e' },
    timeScale: { borderColor: '#2a2a2e', timeVisible: true },
  })

  series = chart.addCandlestickSeries({
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: false,
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
  })
}

function showData(data: ChartBar[]): void {
  if (!series) return
  series.setData(data.map(b => ({ ...b, time: b.time as UTCTimestamp })))
  chart?.timeScale().fitContent()
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
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  chart?.remove()
})

// bars that arrive before the chart has a size wait for it: onResize hands them over at build time
watch(() => props.data, newData => showData(newData))
</script>

<template>
  <div ref="container" class="candle-chart" />
</template>

<style scoped>
.candle-chart {
  width: 100%;
  height: 100%;
}
</style>
