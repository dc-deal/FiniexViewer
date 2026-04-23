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

function initChart(): void {
  if (!container.value) return

  chart = createChart(container.value, {
    width: container.value.clientWidth,
    height: container.value.clientHeight,
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

onMounted(() => {
  initChart()

  if (props.data.length && series) {
    series.setData(props.data.map(b => ({ ...b, time: b.time as UTCTimestamp })))
    chart?.timeScale().fitContent()
  }

  resizeObserver = new ResizeObserver(() => {
    if (container.value && chart) {
      chart.resize(container.value.clientWidth, container.value.clientHeight)
    }
  })
  if (container.value) resizeObserver.observe(container.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  chart?.remove()
})

watch(
  () => props.data,
  (newData) => {
    if (!series) return
    series.setData(newData.map(b => ({ ...b, time: b.time as UTCTimestamp })))
    chart?.timeScale().fitContent()
  }
)
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
