import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import CandleChart from '@/components/CandleChart.vue'
import type { ChartBar } from '@/types/api/bar_types'
import type { IndicatorSeriesEntry } from '@/types/api/indicator_series_types'
import type { RecordedWindow } from '@/types/api/state_frame_types'
import type { ChartLayer, SegmentDrawing } from '@/types/chart_drawing_types'
import type { DrawnSeries } from '@/types/indicator_drawing_types'
import type { ChartCandles, ChartMark, ChartVolume } from '@/types/run_chart_types'
import seriesWindow from './fixtures/recorded_window_series.json'

/**
 * The chart library itself is replaced: what is under test is WHEN the component builds, fits and
 * resizes a chart, and what it paints with — which the library cannot report from inside jsdom (it
 * measures nothing there).
 */
const lw = vi.hoisted(() => {
  const fitContent = vi.fn()
  const setData = vi.fn<(data: unknown[]) => void>()
  const setVisibleLogicalRange = vi.fn<(range: { from: number, to: number }) => void>()
  /** The bars in view and the plot's width, as the library reports them — set by a test to zoom. */
  const zoom: {
    change: (() => void) | null, range: { from: number, to: number } | null, width: number,
    size: ((width: number) => void) | null,
  } = {
    change: null, range: { from: 0, to: 100 }, width: 600, size: null,
  }
  const series = {
    setData,
    applyOptions: vi.fn<(options: Record<string, unknown>) => void>(),
    attachPrimitive: vi.fn<(primitive: unknown) => void>(),
    detachPrimitive: vi.fn<(primitive: unknown) => void>(),
  }
  /** The candlestick series' definition, as the library exports it — what `addSeries` is handed. */
  const CandlestickSeries = { type: 'Candlestick' }
  /** The other forms the price takes — the candles layer's choice (operator, 2026-10-27). */
  const BarSeries = { type: 'Bar' }
  const LineSeries = { type: 'Line' }
  const AreaSeries = { type: 'Area' }
  /** The volume's series, a second one — built only where the chart is handed a volume. */
  const HistogramSeries = { type: 'Histogram' }
  /** The pane the volume stands in, by index, and the scale of its own pane — moved, never built anew. */
  const volumePane = { index: 0 }
  const volumeScaleOptions = vi.fn<(options: Record<string, unknown>) => void>()
  const volumeSeries = {
    setData: vi.fn<(data: { time: number, value: number, color: string }[]) => void>(),
    applyOptions: vi.fn<(options: Record<string, unknown>) => void>(),
    getPane: () => ({ paneIndex: () => volumePane.index }),
    moveToPane: vi.fn((index: number) => { volumePane.index = index }),
    setSeriesOrder: vi.fn<(order: number) => void>(),
    priceScale: () => ({ applyOptions: volumeScaleOptions }),
    /** The volume's own scale format, as the library prints it: two decimals at most, K from a thousand. */
    priceFormatter: () => ({ format: (value: number) => value < 995 ? String(Math.round(value * 100) / 100) : `${Math.round(value / 10) / 100}K` }),
  }
  /**
   * The workers' series the chart built (contract 55), each with the pane it was put in and what it
   * was handed — removed ones kept, marked, so a test can tell what was taken down.
   */
  const built: {
    definition: { type: string }, options: Record<string, unknown>, pane: number, data: unknown[],
    lines: Record<string, unknown>[], fills: unknown[], scales: Record<string, unknown>[], removed: boolean,
  }[] = []
  function indicatorSeriesOf(definition: { type: string }, options: Record<string, unknown>, pane: number) {
    const made = {
      definition, options, pane, data: [] as unknown[], lines: [] as Record<string, unknown>[], fills: [] as unknown[],
      scales: [] as Record<string, unknown>[], removed: false,
    }
    built.push(made)
    return {
      made,
      setData: (data: unknown[]) => { made.data = data },
      createPriceLine: (line: Record<string, unknown>) => { made.lines.push(line) },
      attachPrimitive: (primitive: unknown) => { made.fills.push(primitive) },
      priceScale: () => ({ applyOptions: (scale: Record<string, unknown>) => { made.scales.push(scale) } }),
      detachPrimitive: (primitive: unknown) => { made.fills = made.fills.filter(held => held !== primitive) },
      /** A format no number prints by itself, so a legend read through it shows that it was. */
      priceFormatter: () => ({ format: (value: number) => `~${value}` }),
    }
  }
  /** Each pane's weight as the library keeps it, set by the chart and read back after a drag. */
  const weights: number[] = [2, 1]
  /** Where each pane's row stands, top and height — jsdom lays nothing out, so a test says it. */
  const paneRows: { top: number, height: number }[] = []
  /** The primitives on each pane, by the pane's index — a pane's look (viewer#57). */
  const panePrimitives = new Map<number, unknown[]>()
  const panes = () => Array.from({ length: Math.max(volumePane.index, ...built.filter(made => !made.removed).map(made => made.pane)) + 1 }, (_, index) => ({
    attachPrimitive: (primitive: unknown) => { panePrimitives.set(index, [...panePrimitives.get(index) ?? [], primitive]) },
    detachPrimitive: (primitive: unknown) => { panePrimitives.set(index, (panePrimitives.get(index) ?? []).filter(held => held !== primitive)) },
    getStretchFactor: () => weights[index]!,
    setStretchFactor: (weight: number) => { weights[index] = weight },
    getHTMLElement: () => {
      const row = paneRows[index]
      if (!row) return null
      const element = document.createElement('tr')
      element.getBoundingClientRect = () => ({ top: row.top, height: row.height } as DOMRect)
      return element
    },
  }))
  const priceScaleOptions = vi.fn<(options: Record<string, unknown>) => void>()
  /**
   * What the chart hands its drawing host, call by call. The host itself paints on a canvas and is
   * tested on its own; here it is the chart's part that is under test — what it hands over, when.
   */
  const drawn: { layers: { id: string, drawings: { id: string }[] }[], bars: Map<number, unknown>, colours: { roles: Record<string, string>, surface: string, ink: string } }[] = []
  /** What the chart told its host lies under the pointer, call by call. */
  const hovered: (string | null)[] = []
  /** Where the chart asked to be told the lane's share of the pane — held so a test can tell it. */
  const lane: { share: ((share: number) => void) | null } = { share: null }
  class DrawingHostProbe {
    setDrawings(layers: never, bars: never, colours: never): void { drawn.push({ layers, bars, colours }) }
    setHovered(id: string | null): void { hovered.push(id) }
    onLaneShare(callback: (share: number) => void): void { lane.share = callback }
  }
  /** What the library calls as the pointer moves — held so a test can move it. */
  const pointer: { move: ((param: Record<string, unknown>) => void) | null } = { move: null }
  const chart = {
    subscribeCrosshairMove: vi.fn((handler: (param: Record<string, unknown>) => void) => { pointer.move = handler }),
    addSeries: vi.fn<(definition: { type: string }, options: Record<string, unknown>, paneIndex?: number) => unknown>(
      (definition, options, paneIndex) => {
        // the price series is built without a pane, the volume with its own; a worker's series names one
        if (paneIndex === undefined) return series
        if (definition === HistogramSeries && options['lastValueVisible'] === false) {
          volumePane.index = paneIndex
          return volumeSeries
        }
        return indicatorSeriesOf(definition, options, paneIndex)
      }),
    panes,
    priceScale: vi.fn((id: string) => ({ id, applyOptions: priceScaleOptions })),
    removeSeries: vi.fn<(series: unknown) => void>(removed => {
      const made = (removed as { made?: { removed: boolean } }).made
      if (made) made.removed = true
    }),
    applyOptions: vi.fn<(options: Record<string, unknown>) => void>(),
    timeScale: vi.fn(() => ({
      fitContent,
      setVisibleLogicalRange,
      subscribeVisibleLogicalRangeChange: (handler: () => void) => { zoom.change = handler },
      getVisibleLogicalRange: () => zoom.range,
      width: () => zoom.width,
      subscribeSizeChange: (handler: (width: number) => void) => { zoom.size = handler },
    })),
    resize: vi.fn<(width: number, height: number) => void>(),
    remove: vi.fn(),
  }
  const createChart = vi.fn<(container: HTMLElement, options: Record<string, unknown>) => typeof chart>(
    () => chart
  )
  return {
    chart, series, pointer, zoom, setData, setVisibleLogicalRange, fitContent, createChart, CandlestickSeries,
    HistogramSeries, BarSeries, LineSeries, AreaSeries, BaselineSeries: { type: 'Baseline' }, volumeSeries, volumePane,
    volumeScaleOptions, weights, paneRows, built, panePrimitives,
    priceScaleOptions, drawn, hovered, lane, DrawingHostProbe,
  }
})

vi.mock('@/components/chart_drawing_host', () => ({ ChartDrawingHost: lw.DrawingHostProbe }))

vi.mock('lightweight-charts', () => ({
  createChart: lw.createChart,
  CandlestickSeries: lw.CandlestickSeries,
  HistogramSeries: lw.HistogramSeries,
  BarSeries: lw.BarSeries,
  LineSeries: lw.LineSeries,
  AreaSeries: lw.AreaSeries,
  BaselineSeries: lw.BaselineSeries,
  ColorType: { Solid: 'solid' },
}))

/**
 * A ResizeObserver the test can fire. The global stub in `tests/setup.ts` never calls back, which is
 * right for components that only need the API to exist — this one is ABOUT the callback. Every
 * observer made is fired: the container's, and the one that follows the panes' sizes.
 */
let observers: (() => void)[] = []

function fireResize(): void {
  for (const fire of observers) fire()
}

class ResizeObserverProbe {
  constructor(callback: ResizeObserverCallback) {
    observers.push(() => callback([], this as unknown as ResizeObserver))
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** jsdom lays nothing out, so the container's size is set where the component reads it. */
let size = { width: 0, height: 0 }

const BARS: ChartBar[] = [
  { time: 1_760_000_000, open: 1.1, high: 1.2, low: 1.0, close: 1.15 },
  { time: 1_760_003_600, open: 1.15, high: 1.25, low: 1.1, close: 1.2 },
]

let mounted: VueWrapper | null = null

function mountChart(
  data: ChartBar[] = BARS,
  extra: {
    marks?: ChartMark[], focus?: number | null, priceFormat?: { precision: number, minMove: number } | null,
    volume?: ChartVolume | null,
    candles?: ChartCandles | null,
  } = {},
): VueWrapper {
  const { marks, ...rest } = extra
  mounted = mount(CandleChart, { props: { data, ...rest, ...(marks ? { layers: tradesLayer(marks) } : {}) } })
  return mounted
}

/** Marks as the run chart hands them: the trades' layer. */
function tradesLayer(marks: ChartMark[]): ChartLayer[] {
  return [{ id: 'trades', drawings: marks }]
}

/** The ids the chart last handed its drawing host, layer by layer. */
function lastDrawn(): { layers: { id: string, drawings: { id: string }[] }[], colours: { roles: Record<string, string>, surface: string, ink: string } } {
  return lw.drawn.at(-1)!
}

function mark(fields: Partial<ChartMark>): ChartMark {
  return {
    kind: 'marker', time: BARS[0]!.time, at: BARS[0]!.time, position: 'belowBar', shape: 'arrowUp', role: 'entry', text: '',
    focused: false, id: 'entry|unit|pos_1', card: { title: 'pos_1 · long 0.1', details: [] },
    line: { label: 'pos_1', value: 'long 0.1' },
    ...fields,
  }
}

/** A long window: one bar an hour. */
const LONG: ChartBar[] = Array.from({ length: 200 }, (_, index) => ({
  time: 1_760_000_000 + index * 3600, open: 1, high: 1, low: 1, close: 1,
}))

describe('CandleChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    observers = []
    lw.volumePane.index = 0
    lw.weights.splice(0, lw.weights.length, 2, 1)
    lw.paneRows.splice(0, lw.paneRows.length)
    lw.built.splice(0, lw.built.length)
    lw.panePrimitives.clear()
    size = { width: 0, height: 0 }
    vi.stubGlobal('ResizeObserver', ResizeObserverProbe)
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(() => size.width)
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(() => size.height)
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /**
   * A container of 0×0 is a panel not yet laid out or not in view. A chart built at that size keeps
   * a collapsed time scale, and bars fitted to nothing stay fitted to nothing once it is shown.
   */
  it('draws nothing while its container has no size', () => {
    mountChart()
    fireResize()
    expect(lw.createChart).not.toHaveBeenCalled()
  })

  it('builds the chart at its first real size, with the bars it was given, fitted', () => {
    mountChart()
    size = { width: 800, height: 400 }
    fireResize()

    expect(lw.createChart).toHaveBeenCalledTimes(1)
    expect(lw.createChart.mock.calls[0]![1]).toMatchObject({ width: 800, height: 400 })
    // no logo over the lowest pane: the licence's notice is in NOTICE, its link in the About dialog
    expect(lw.createChart.mock.calls[0]![1]).toMatchObject({ layout: { attributionLogo: false } })
    expect(lw.setData).toHaveBeenCalledTimes(1)
    expect(lw.setData.mock.calls[0]![0]).toHaveLength(2)
    expect(lw.fitContent).toHaveBeenCalledTimes(1)
  })

  /** The path the Viewer takes today: it mounts the chart only once the bars are there. */
  it('builds at once where the container already has a size, with its bars, fitted', () => {
    size = { width: 640, height: 320 }
    mountChart()
    expect(lw.createChart).toHaveBeenCalledTimes(1)
    expect(lw.createChart.mock.calls[0]![1]).toMatchObject({ width: 640, height: 320 })
    expect(lw.setData).toHaveBeenCalledTimes(1)
    expect(lw.setData.mock.calls[0]![0]).toHaveLength(2)
    expect(lw.fitContent).toHaveBeenCalledTimes(1)
  })

  /** A chart that stays mounted — a panel that keeps it while the selection changes — follows its bars. */
  it('draws new bars into the chart it already has, and fits them', async () => {
    size = { width: 800, height: 400 }
    const wrapper = mountChart()
    await wrapper.setProps({ data: [BARS[0]!] })
    expect(lw.setData.mock.lastCall![0]).toHaveLength(1)
    expect(lw.fitContent).toHaveBeenCalledTimes(2)
    expect(lw.createChart).toHaveBeenCalledTimes(1)
  })

  /**
   * Hidden and shown again, a chart keeps its place instead of being squeezed to nothing — and a
   * resize never refits, or a reader's zoom would jump back every time a seam is dragged.
   */
  it('ignores a collapse to nothing and follows the next real size', () => {
    size = { width: 800, height: 400 }
    mountChart()

    size = { width: 0, height: 0 }
    fireResize()
    expect(lw.chart.resize).not.toHaveBeenCalled()

    size = { width: 1000, height: 500 }
    fireResize()
    expect(lw.chart.resize).toHaveBeenCalledWith(1000, 500)
    // the chart is built once, never a second time on the way back, and fitted only at the build
    expect(lw.createChart).toHaveBeenCalledTimes(1)
    expect(lw.fitContent).toHaveBeenCalledTimes(1)
  })

  /** One axis at 0 is as unusable as both: a pane collapsed sideways still has a height. */
  it('treats a collapse along one axis as no size at all', () => {
    size = { width: 0, height: 400 }
    mountChart()
    fireResize()
    expect(lw.createChart).not.toHaveBeenCalled()

    size = { width: 800, height: 400 }
    fireResize()
    size = { width: 800, height: 0 }
    fireResize()
    expect(lw.createChart).toHaveBeenCalledTimes(1)
    expect(lw.chart.resize).not.toHaveBeenCalled()
  })

  it('hands bars that arrived before it had a size to the chart it builds', async () => {
    const wrapper = mountChart([])
    await wrapper.setProps({ data: BARS })
    expect(lw.setData).not.toHaveBeenCalled()

    size = { width: 800, height: 400 }
    fireResize()
    expect(lw.setData.mock.calls[0]![0]).toHaveLength(2)
    expect(lw.fitContent).toHaveBeenCalledTimes(1)
  })

  /** Around the position looked at where the window is long; a short window is shown whole. */
  it('centres a long window on its focus, and shows a short one whole', () => {
    size = { width: 800, height: 400 }
    mountChart(LONG, { focus: LONG[120]!.time + 60 })
    expect(lw.setVisibleLogicalRange).toHaveBeenCalledWith({ from: 45, to: 195 })
    expect(lw.fitContent).not.toHaveBeenCalled()

    mounted!.unmount()
    vi.clearAllMocks()
    mountChart(BARS, { focus: BARS[1]!.time })
    expect(lw.fitContent).toHaveBeenCalledTimes(1)
    expect(lw.setVisibleLogicalRange).not.toHaveBeenCalled()
  })

  /**
   * What is drawn says what it is, at the pointer. The library reports the id of the thing under
   * the pointer; the chart looks its card up in one register — the trade marks are its first source.
   */
  describe('the card at the pointer', () => {
    const MARKS = [
      mark({
        id: 'entry|unit|pos_1',
        card: { title: 'pos_1 · long 0.1', details: [{ label: 'Opened', value: '05:00' }] },
      }),
      mark({
        id: 'exit|unit|pos_1|7',
        role: 'negative',
        card: { title: 'pos_1 · long 0.1', details: [{ label: 'Net', value: '-0.40 EUR', tone: 'negative' }] },
      }),
    ]

    it('hands every drawing to its host with its id, so a hit can say which one is under the pointer', () => {
      size = { width: 800, height: 400 }
      mountChart(BARS, { marks: MARKS })
      expect(lastDrawn().layers.map(layer => layer.id)).toEqual(['trades'])
      expect(lastDrawn().layers[0]!.drawings.map(drawing => drawing.id)).toEqual(['entry|unit|pos_1', 'exit|unit|pos_1|7'])
    })

    /** A level and a line say what they are too: the register holds every layer, not the marks alone. */
    it('shows the card of a level as it does a mark\'s', async () => {
      size = { width: 800, height: 400 }
      const level: SegmentDrawing = {
        kind: 'segment', id: 'level|SL|unit|pos_1|7', from: BARS[0]!.time, to: BARS[1]!.time, price: 1.05,
        label: 'SL', role: 'negative', focused: true, card: { title: 'Stop loss · pos_1', details: [] },
      }
      const wrapper = mount(CandleChart, { props: { data: BARS, layers: [{ id: 'levels', drawings: [level] }, ...tradesLayer(MARKS)] } })
      mounted = wrapper
      lw.pointer.move!({ hoveredInfo: { objectId: 'level|SL|unit|pos_1|7' }, point: { x: 100, y: 80 } })
      await nextTick()
      expect(wrapper.find('.chart-card').text()).toContain('Stop loss · pos_1')
    })

    it('shows the card of the mark under the pointer, and none off every mark', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountChart(BARS, { marks: MARKS })
      expect(wrapper.find('.chart-card').exists()).toBe(false)

      lw.pointer.move!({ hoveredInfo: { objectId: 'exit|unit|pos_1|7' }, point: { x: 100, y: 80 } })
      await nextTick()
      expect(wrapper.find('.chart-card').text()).toContain('pos_1 · long 0.1')
      expect(wrapper.find('.chart-card').text()).toContain('-0.40 EUR')
      // the host is told what lies under the pointer: a booking period draws its bounds while it does
      expect(lw.hovered.at(-1)).toBe('exit|unit|pos_1|7')

      // a thing the register does not know, and no thing at all, both show nothing
      lw.pointer.move!({ hoveredInfo: { objectId: 'line|elsewhere' }, point: { x: 100, y: 80 } })
      await nextTick()
      expect(wrapper.find('.chart-card').exists()).toBe(false)
      lw.pointer.move!({ point: { x: 300, y: 80 } })
      await nextTick()
      expect(wrapper.find('.chart-card').exists()).toBe(false)
      expect(lw.hovered.at(-1)).toBeNull()
    })

    /** A frame played moves the layers several times a second: the card under the pointer stays, and says what it says now. */
    it('keeps a card whose drawing still stands as the layers change, with what the drawing says now', async () => {
      size = { width: 800, height: 400 }
      const moment = (title: string): ChartLayer[] => [
        { id: 'state-frame', drawings: [{ kind: 'time', id: 'state-frame', time: BARS[0]!.time, role: 'annotation', card: { title, details: [] } }] },
      ]
      const wrapper = mount(CandleChart, { props: { data: BARS, layers: moment('frame 1') } })
      mounted = wrapper
      lw.pointer.move!({ hoveredInfo: { objectId: 'state-frame' }, point: { x: 100, y: 80 } })
      await nextTick()
      expect(wrapper.find('.chart-card').text()).toContain('frame 1')
      await wrapper.setProps({ layers: moment('frame 2') })
      expect(wrapper.find('.chart-card').text()).toContain('frame 2')
      expect(wrapper.find('.candle-chart').attributes('data-time-at')).toBe(String(BARS[0]!.time))
    })

    it('drops a card whose mark is gone', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountChart(BARS, { marks: MARKS })
      lw.pointer.move!({ hoveredInfo: { objectId: 'entry|unit|pos_1' }, point: { x: 100, y: 80 } })
      await nextTick()
      expect(wrapper.find('.chart-card').exists()).toBe(true)
      await wrapper.setProps({ layers: [] })
      expect(wrapper.find('.chart-card').exists()).toBe(false)
    })
  })

  /**
   * The library rounds every price to two decimals unless told otherwise — EURUSD read `1.16` on every
   * label. A format handed in is the series' from the start, follows a change, and a format taken away
   * returns the library's own rather than keeping the previous instrument's decimals.
   */
  it('draws prices in the format it is handed, and follows a change', async () => {
    size = { width: 800, height: 400 }
    const wrapper = mountChart(BARS, { priceFormat: { precision: 5, minMove: 0.00001 } })
    expect(lw.chart.addSeries.mock.calls[0]![1]).toMatchObject({
      priceFormat: { type: 'price', precision: 5, minMove: 0.00001 },
    })

    await wrapper.setProps({ priceFormat: { precision: 3, minMove: 0.001 } })
    expect(lw.series.applyOptions).toHaveBeenLastCalledWith({ priceFormat: { type: 'price', precision: 3, minMove: 0.001 } })
    await wrapper.setProps({ priceFormat: null })
    expect(lw.series.applyOptions).toHaveBeenLastCalledWith({ priceFormat: { type: 'price', precision: 2, minMove: 0.01 } })
  })

  it('leaves the library its own format where it is handed none', () => {
    size = { width: 800, height: 400 }
    mountChart()
    expect(lw.chart.addSeries.mock.calls[0]![1]).not.toHaveProperty('priceFormat')
  })

  /**
   * Fitted at the library's own floor of 0.5 px a bar, 2,000 bars needed 1,000 px, and on a narrower
   * chart the window's start was out of view at first look.
   */
  it('lets a long window fit a narrow chart, below the library\'s own least bar width', () => {
    size = { width: 800, height: 400 }
    mountChart()
    const options = lw.createChart.mock.lastCall![1] as { timeScale: { minBarSpacing: number } }
    // the route serves at most 10,000 bars at once: they fit 500 px
    expect(10_000 * options.timeScale.minBarSpacing).toBeLessThanOrEqual(500)
  })

  /** The marks are drawn on a canvas, where nothing can read them back — so the element counts them. */
  /** The chart draws for itself through ONE primitive of its candles, attached once, when it is built. */
  it('attaches its drawing host to its candles once, when it is built', () => {
    size = { width: 800, height: 400 }
    mountChart()
    expect(lw.series.attachPrimitive).toHaveBeenCalledTimes(1)
    expect(lw.series.attachPrimitive.mock.calls[0]![0]).toBeInstanceOf(lw.DrawingHostProbe)
  })

  /** The marks stand away from their bars, so the host is handed every bar's range by its time. */
  it('hands the host the range of every bar it draws', () => {
    size = { width: 800, height: 400 }
    mountChart(BARS, { marks: [mark({})] })
    expect(lw.drawn.at(-1)!.bars.get(BARS[0]!.time)).toEqual({ high: BARS[0]!.high, low: BARS[0]!.low })
  })

  it('says on its element how many marks it draws, and what each layer holds', () => {
    size = { width: 800, height: 400 }
    const wrapper = mountChart(BARS, { marks: [mark({}), mark({ role: 'positive' })] })
    expect(wrapper.attributes('data-marks')).toBe('2')
    expect(wrapper.attributes('data-drawings')).toBe('trades:2')
  })

  /**
   * A canvas is painted with values, so the theme cannot reach it the way it reaches every other
   * surface. Two themes with values nobody would choose, under the token names the chart reads: a
   * value that arrives in the chart can only have come from the token it names.
   */
  describe('colours', () => {
    const THEMES = `
      :root[data-theme='dark'] {
        --color-bg-base: #000001; --color-text-secondary: #000002; --color-border: #000003;
        --color-accent: #000004; --color-positive: #000005; --color-negative: #000006;
        --color-text-primary: #000007;
      }
      :root[data-theme='light'] {
        --color-bg-base: #ffff01; --color-text-secondary: #ffff02; --color-border: #ffff03;
        --color-accent: #ffff04; --color-positive: #ffff05; --color-negative: #ffff06;
        --color-text-primary: #ffff07;
      }
    `
    let sheet: HTMLStyleElement | null = null

    beforeEach(() => {
      sheet = document.createElement('style')
      sheet.textContent = THEMES
      document.head.appendChild(sheet)
      document.documentElement.dataset.theme = 'dark'
    })

    // unmounted FIRST, so a chart still observing the document never sees the theme taken down
    afterEach(() => {
      mounted?.unmount()
      mounted = null
      sheet?.remove()
      sheet = null
      document.documentElement.removeAttribute('data-theme')
    })

    /**
     * The volume, where one is handed: a series of its own built BEFORE the candles — so it stands
     * behind them — on a scale nothing shows, in the lowest fifth; each bar faint in the colour of
     * its candle's direction, and none shown where the layer is hidden.
     */
    it('draws the volume behind the candles on its own scale, faint in the colour of each candle', async () => {
      size = { width: 800, height: 400 }
      const volume: ChartVolume = {
        basis: 'ticks', shown: true, ownPane: false, opacity: 1,
        bars: [{ time: BARS[0]!.time, value: 11, rising: true }, { time: BARS[1]!.time, value: 4, rising: false }],
      }
      mountChart(BARS, { volume })
      expect(lw.chart.addSeries.mock.calls.map(call => call[0])).toEqual([lw.HistogramSeries, lw.CandlestickSeries])
      expect(lw.chart.addSeries.mock.calls[0]![1]).toMatchObject({ lastValueVisible: false, priceLineVisible: false })
      expect(lw.chart.addSeries.mock.calls[0]![2]).toBe(0)
      expect(lw.volumeSeries.applyOptions).toHaveBeenCalledWith({ priceScaleId: 'volume' })
      expect(lw.volumeSeries.setSeriesOrder).toHaveBeenCalledWith(0)
      expect(lw.priceScaleOptions).toHaveBeenCalledWith({ scaleMargins: { top: 0.8, bottom: 0 } })
      expect(lw.volumeSeries.applyOptions).toHaveBeenLastCalledWith({ visible: true })
      expect(lw.volumeSeries.setData.mock.calls.at(-1)![0]).toEqual([
        { time: BARS[0]!.time, value: 11, color: 'rgba(0, 0, 5, 0.45)' },
        { time: BARS[1]!.time, value: 4, color: 'rgba(0, 0, 6, 0.45)' },
      ])
      await mounted!.setProps({ volume: { ...volume, shown: false } })
      expect(lw.volumeSeries.applyOptions).toHaveBeenLastCalledWith({ visible: false })
    })

    /** Under the lane its strip and marks were drawn over the volume's bars (on screen 2026-11-08). */
    it('lifts the volume above the time lane by the share of the pane the host says it takes, once the frame is drawn', async () => {
      size = { width: 800, height: 400 }
      mountChart(BARS, { volume: { basis: 'ticks', shown: true, ownPane: false, opacity: 1, bars: [] } })
      lw.priceScaleOptions.mockClear()
      lw.lane.share!(0.1)
      expect(lw.priceScaleOptions).not.toHaveBeenCalled()
      await Promise.resolve()
      expect(lw.priceScaleOptions).toHaveBeenLastCalledWith({ scaleMargins: { top: expect.closeTo(0.7), bottom: 0.1 } })
    })

    /**
     * Its option on, the volume stands in a pane of its own below the candles (viewer#57), on that
     * pane's own scale, a fifth of the height — the lane stays with the candles, so nothing lifts it.
     */
    it('stands the volume in a pane of its own below the candles, a fifth of the height', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountChart(BARS, { volume: { basis: 'ticks', shown: true, ownPane: true, opacity: 1, bars: [] } })
      expect(lw.chart.addSeries.mock.calls[0]![2]).toBe(1)
      expect(lw.volumeSeries.applyOptions).toHaveBeenCalledWith({ priceScaleId: 'right' })
      // a fifth above the tallest bar: the line its legend and its controls stand on
      expect(lw.volumeScaleOptions).toHaveBeenCalledWith({ scaleMargins: { top: 0.2, bottom: 0 } })
      expect(lw.weights).toEqual([2, 0.5])
      await nextTick()
      expect(wrapper.attributes('data-panes')).toBe('2')
      lw.priceScaleOptions.mockClear()
      lw.lane.share!(0.1)
      await Promise.resolve()
      expect(lw.priceScaleOptions).not.toHaveBeenCalled()
    })

    /** The option switched while the chart stands: the same series moves, it is never built anew. */
    it('moves the volume between the panes as its option is switched, and gives its pane up while hidden', async () => {
      size = { width: 800, height: 400 }
      const volume: ChartVolume = { basis: 'ticks', shown: true, ownPane: false, opacity: 1, bars: [] }
      const wrapper = mountChart(BARS, { volume })
      expect(wrapper.attributes('data-panes')).toBe('1')

      await mounted!.setProps({ volume: { ...volume, ownPane: true } })
      expect(lw.volumeSeries.moveToPane).toHaveBeenLastCalledWith(1)
      expect(wrapper.attributes('data-panes')).toBe('2')

      // hidden, it takes no room: its pane goes and the candles take the whole height (operator,
      // on screen 2026-11-12) — and shown again, its pane comes back at the height kept
      lw.weights.splice(0, 2, 2, 0.5)
      await mounted!.setProps({ volume: { ...volume, ownPane: true, shown: false } })
      expect(lw.volumeSeries.moveToPane).toHaveBeenLastCalledWith(0)
      expect(wrapper.attributes('data-panes')).toBe('1')
      await mounted!.setProps({ volume: { ...volume, ownPane: true } })
      expect(lw.volumeSeries.moveToPane).toHaveBeenLastCalledWith(1)
      expect(wrapper.attributes('data-panes')).toBe('2')

      await mounted!.setProps({ volume: { ...volume, ownPane: false } })
      expect(lw.volumeSeries.moveToPane).toHaveBeenLastCalledWith(0)
      expect(lw.volumeSeries.setSeriesOrder).toHaveBeenLastCalledWith(0)
      expect(lw.volumeSeries.applyOptions).toHaveBeenCalledWith({ priceScaleId: 'volume' })
      expect(wrapper.attributes('data-panes')).toBe('1')
      expect(lw.chart.addSeries.mock.calls.filter(call => call[0] === lw.HistogramSeries)).toHaveLength(1)
    })

    /**
     * Placed once for each change of pane: laid out again on every change of the volume — bars loaded
     * at an edge, a layer switched — the weights undid a drag the reader still held, and the drag was
     * lost once let go without another move.
     */
    it('leaves the panes as they stand while the volume changes in its pane', async () => {
      size = { width: 800, height: 400 }
      const volume: ChartVolume = { basis: 'ticks', shown: true, ownPane: true, opacity: 1, bars: [] }
      mountChart(BARS, { volume })
      expect(lw.weights).toEqual([2, 0.5])
      // the library mid-drag: the seam held where the reader took it
      lw.weights.splice(0, 2, 1.6, 0.9)
      lw.volumeScaleOptions.mockClear()
      await mounted!.setProps({ volume: { ...volume, opacity: 0.5, bars: [{ time: BARS[0]!.time, value: 3, rising: true }] } })
      await mounted!.setProps({ volume: { ...volume, basis: 'traded' } })
      expect(lw.volumeScaleOptions).not.toHaveBeenCalled()
      expect(lw.weights).toEqual([1.6, 0.9])
      expect(lw.volumeSeries.moveToPane).not.toHaveBeenCalled()
    })

    /**
     * The heights the reader dragged: laid out as kept, and told once a separator was let go. The
     * library says nothing while it drags, so the weights are read when the pointer is released.
     */
    it('lays the panes out at the kept weights, and tells the weights once a drag moved one', async () => {
      size = { width: 800, height: 400 }
      const volume: ChartVolume = { basis: 'ticks', shown: true, ownPane: true, opacity: 1, bars: [] }
      mounted = mount(CandleChart, { props: { data: BARS, volume, paneWeights: { volume: 1.2 } } })
      expect(lw.weights).toEqual([2, 1.2])

      // a click that dragged nothing tells nothing
      window.dispatchEvent(new Event('pointerup'))
      expect(mounted.emitted('paneWeights')).toBeUndefined()

      lw.weights.splice(0, 2, 1.7, 1.5)
      window.dispatchEvent(new Event('pointerup'))
      expect(mounted.emitted('paneWeights')).toEqual([[{ price: 1.7, volume: 1.5 }]])

      // a layout loaded holds other weights: the panes take them
      await mounted.setProps({ paneWeights: { price: 3, volume: 1 } })
      expect(lw.weights).toEqual([3, 1])
    })

    /** One pane is never dragged: a release over a chart without a second pane tells nothing. */
    it('tells no weights while the volume shares the pane of the candles', () => {
      size = { width: 800, height: 400 }
      mountChart(BARS, { volume: { basis: 'ticks', shown: true, ownPane: false, opacity: 1, bars: [] } })
      lw.weights.splice(0, 1, 5)
      window.dispatchEvent(new Event('pointerup'))
      expect(mounted!.emitted('paneWeights')).toBeUndefined()
    })

    /**
     * The candles are a layer (operator, 2026-10-27): another form builds the price series anew —
     * the drawing host goes with it — a line takes the close alone, and hidden the series stays,
     * fully transparent, so the drawings and the price scale stay where they were.
     */
    it('draws the price in the form the candles layer asks for, faint or hidden in place', async () => {
      size = { width: 800, height: 400 }
      const candles: ChartCandles = { form: 'candles', shown: true, opacity: 1 }
      mountChart(BARS, { candles })
      expect(lw.chart.addSeries).toHaveBeenLastCalledWith(lw.CandlestickSeries, expect.objectContaining({ upColor: '#000005' }))

      await mounted!.setProps({ candles: { ...candles, form: 'line' } })
      expect(lw.chart.removeSeries).toHaveBeenCalledTimes(1)
      // the new one stands before the old one goes: a pane left empty is removed by the library
      expect(lw.chart.addSeries.mock.invocationCallOrder.at(-1)!).toBeLessThan(lw.chart.removeSeries.mock.invocationCallOrder[0]!)
      expect(lw.series.detachPrimitive).toHaveBeenCalledTimes(1)
      expect(lw.chart.addSeries).toHaveBeenLastCalledWith(lw.LineSeries, expect.objectContaining({ color: '#000007' }))
      expect(lw.series.attachPrimitive).toHaveBeenCalledTimes(2)
      expect(lw.setData.mock.calls.at(-1)![0]).toEqual(BARS.map(bar => ({ time: bar.time, value: bar.close })))

      await mounted!.setProps({ candles: { ...candles, form: 'line', opacity: 0.5 } })
      expect(lw.series.applyOptions).toHaveBeenLastCalledWith(expect.objectContaining({ color: 'rgba(0, 0, 7, 0.5)' }))
      await mounted!.setProps({ candles: { ...candles, form: 'line', shown: false } })
      expect(lw.series.applyOptions).toHaveBeenLastCalledWith(expect.objectContaining({
        color: 'rgba(0, 0, 7, 0)', lastValueVisible: false, priceLineVisible: false,
      }))
      // hidden is transparent, never removed: the series it rests on stays
      expect(lw.chart.removeSeries).toHaveBeenCalledTimes(1)
    })

    it('builds no volume series where none is handed — the free chart', () => {
      size = { width: 800, height: 400 }
      mountChart()
      expect(lw.chart.addSeries.mock.calls.map(call => call[0])).toEqual([lw.CandlestickSeries])
    })

    it('paints with the tokens of the theme the document shows', () => {
      size = { width: 800, height: 400 }
      mountChart()

      expect(lw.chart.applyOptions).toHaveBeenCalledWith({
        layout: {
          background: { type: 'solid', color: '#000001' }, textColor: '#000002',
          // the seam between two panes: a rule at rest, the accent faint under the pointer
          panes: { separatorColor: '#000003', separatorHoverColor: 'rgba(0, 0, 4, 0.3)' },
        },
        grid: { vertLines: { color: '#000003' }, horzLines: { color: '#000003' } },
        crosshair: { vertLine: { color: '#000004' }, horzLine: { color: '#000004' } },
        rightPriceScale: { borderColor: '#000003' },
        timeScale: { borderColor: '#000003' },
      })
      expect(lw.chart.addSeries).toHaveBeenCalledWith(lw.CandlestickSeries, {
        borderVisible: false,
        upColor: '#000005',
        downColor: '#000006',
        wickUpColor: '#000005',
        wickDownColor: '#000006',
        // the candles shown: the last price is said on the axis
        lastValueVisible: true,
        priceLineVisible: true,
      })
    })

    /** A result is the polarity of a figure; an entry is a fact in plain ink; the shape says the rest. */
    it('paints every drawing by its role, from the tokens, and again when the theme changes', async () => {
      size = { width: 800, height: 400 }
      mountChart(BARS, { marks: [
        mark({ role: 'entry', focused: true }),
        mark({ role: 'positive', shape: 'circle', position: 'aboveBar', text: '+' }),
        mark({ role: 'negative', shape: 'circle', text: '−' }),
        mark({ role: 'flat', shape: 'circle', text: '0' }),
        mark({ role: 'mixed', shape: 'circle', text: '±×3', count: 3 }),
      ] })

      // a gathered mark whose results point different ways claims neither: quiet, like a flat one
      const roles = (): string[] => ['entry', 'positive', 'negative', 'flat', 'mixed'].map(role => lastDrawn().colours.roles[role]!)
      expect(roles()).toEqual(['#000007', '#000005', '#000006', '#000002', '#000002'])
      expect(lastDrawn().colours.surface).toBe('#000001')
      // a word inside a filled shape: plain ink, as an entry
      expect(lastDrawn().colours.ink).toBe('#000007')

      document.documentElement.dataset.theme = 'light'
      await flushPromises()
      expect(roles()).toEqual(['#ffff07', '#ffff05', '#ffff06', '#ffff02', '#ffff02'])
    })

    /** A moment is a boundary on the chart: the annotation role, from its own token. */
    it('paints a moment in the annotation token', () => {
      size = { width: 800, height: 400 }
      const annotation = getComputedStyle(document.documentElement).getPropertyValue('--color-annotation').trim()
      mountChart(BARS, { marks: [mark({})] })
      expect(lastDrawn().colours.roles['annotation']).toBe(annotation)
    })

    /** The width of a bar is what overlapping marks are gathered by, so the chart reports every zoom. */
    it('reports the width a bar has on screen whenever the reader zooms', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountChart()
      lw.zoom.range = { from: 10, to: 110 }
      lw.zoom.width = 600
      lw.zoom.change!()
      expect(wrapper.emitted('spacing')!.at(-1)).toEqual([6])
      const before = wrapper.emitted('spacing')!.length
      lw.zoom.range = null
      lw.zoom.change!()
      expect(wrapper.emitted('spacing')!.length).toBe(before)
    })

    it('counts what the marks stand for, a gathered one for each of its members', () => {
      size = { width: 800, height: 400 }
      const wrapper = mountChart(BARS, { marks: [mark({ id: 'gathered|a', count: 3, text: '×3' }), mark({ id: 'b' })] })
      expect(wrapper.find('.candle-chart').attributes('data-marks')).toBe('2')
      expect(wrapper.find('.candle-chart').attributes('data-events')).toBe('4')
    })

    /** Notices stand over the plot: a line above it would move the chart each time one appeared. */
    it('places what it is handed inside its frame', () => {
      size = { width: 800, height: 400 }
      mounted = mount(CandleChart, { props: { data: BARS }, slots: { default: '<p class="probe">notice</p>' } })
      expect(mounted.find('.candle-chart .probe').exists()).toBe(true)
    })

    it('repaints when the theme changes, without being built again', async () => {
      size = { width: 800, height: 400 }
      mountChart()

      document.documentElement.dataset.theme = 'light'
      await flushPromises()

      expect(lw.chart.applyOptions.mock.lastCall![0]).toMatchObject({
        layout: { background: { color: '#ffff01' }, textColor: '#ffff02' },
        crosshair: { vertLine: { color: '#ffff04' } },
      })
      expect(lw.series.applyOptions).toHaveBeenCalledWith({
        upColor: '#ffff05',
        downColor: '#ffff06',
        wickUpColor: '#ffff05',
        wickDownColor: '#ffff06',
        lastValueVisible: true,
        priceLineVisible: true,
      })
      expect(lw.createChart).toHaveBeenCalledTimes(1)
    })

    /** A theme switched while the chart waits for a size is the one it is built in. */
    it('is built in the theme the document shows by then', async () => {
      mountChart()
      document.documentElement.dataset.theme = 'light'
      await flushPromises()
      expect(lw.chart.applyOptions).not.toHaveBeenCalled()

      size = { width: 800, height: 400 }
      fireResize()
      expect(lw.chart.applyOptions.mock.lastCall![0]).toMatchObject({
        layout: { background: { color: '#ffff01' } },
      })
      expect(lw.chart.addSeries.mock.lastCall![1]).toMatchObject({ upColor: '#ffff05' })
    })

    /** A chart that is gone must not be painted: the library refuses a removed chart. */
    it('stops following the theme once it is unmounted', async () => {
      const release = vi.spyOn(MutationObserver.prototype, 'disconnect')
      size = { width: 800, height: 400 }
      mountChart()
      mounted!.unmount()
      mounted = null
      expect(release).toHaveBeenCalled()
      const painted = lw.chart.applyOptions.mock.calls.length

      document.documentElement.dataset.theme = 'light'
      await flushPromises()
      expect(lw.chart.applyOptions).toHaveBeenCalledTimes(painted)
      expect(lw.series.applyOptions).not.toHaveBeenCalled()
    })
  })

  /**
   * Bars loaded as the view moves (viewer#9): the chart says when the view nears the first or the
   * last bar it holds, keeps the view on the bars it showed as more arrive, and says in that corner
   * that a batch is on its way or failed.
   */
  /**
   * A worker's series (contract 55): each plot a series of the library in the pane its series names,
   * the panes of their own below the candles and the volume's, in the order served. Read from the
   * session FiniexTestingIDE produced to draw every kind of pane.
   */
  describe('the workers\u2019 series', () => {
    const SERIES = (seriesWindow as RecordedWindow).indicator_series
    const entry = (layer: string): IndicatorSeriesEntry => SERIES.find(item => item.layer === layer)!
    const drawn = (...layers: string[]): DrawnSeries[] => layers.map(layer => ({ entry: entry(layer), opacity: 1, span: null, place: 0 }))
    const live = () => lw.built.filter(made => !made.removed)
    const OWN_VOLUME: ChartVolume = { basis: 'ticks', shown: true, ownPane: true, opacity: 1, bars: [] }

    function mountWith(indicators: DrawnSeries[], volume: ChartVolume | null = OWN_VOLUME): VueWrapper {
      mounted = mount(CandleChart, { props: { data: BARS, volume, indicators } })
      return mounted
    }

    it('draws each plot in the pane its series names, the panes of their own below the volume\u2019s', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountWith(drawn('worker:bollinger_main', 'worker:rsi_fast', 'worker:macd_main'))
      await nextTick()
      const bands = entry('worker:bollinger_main')
      expect(live().filter(made => made.pane === 0)).toHaveLength(bands.plots.length)
      expect(live().filter(made => made.pane === 2).map(made => made.definition.type)).toEqual(['Line'])
      expect(live().filter(made => made.pane === 3).map(made => made.definition.type))
        .toEqual(entry('worker:macd_main').plots.map(plot => plot.kind === 'histogram' ? 'Histogram' : 'Line'))
      expect(wrapper.attributes('data-panes')).toBe('4')
      expect(wrapper.attributes('data-indicators')).toBe('3')
      // every bar handed, in the library's seconds
      const first = live()[0]!
      expect(first.data).toHaveLength(bands.times.length)
    })

    /** The volume's own pane is pane 1: a worker's pane standing there would take it — so they go first. */
    it('builds the series anew below the volume once it moves into a pane of its own', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountWith(drawn('worker:rsi_fast'), { ...OWN_VOLUME, ownPane: false })
      await nextTick()
      expect(live().map(made => made.pane)).toEqual([1])
      await wrapper.setProps({ volume: OWN_VOLUME })
      expect(lw.volumeSeries.moveToPane).toHaveBeenCalledWith(1)
      expect(live().map(made => made.pane)).toEqual([2])
      expect(lw.built.filter(made => made.removed)).toHaveLength(1)
    })

    /** Their RSI holds 0 to 100 whatever its values, with its lines at 30 and 70 on its own scale. */
    it('holds a fixed range, and draws the reference lines with a title only where it says more', async () => {
      size = { width: 800, height: 400 }
      const rsi = entry('worker:rsi_fast')
      const named = { ...rsi, price_lines: [...rsi.price_lines, { price: 50, line_style: 1, title: 'middle' }] }
      mountWith([{ entry: named, opacity: 1, span: null, place: 0 }])
      await nextTick()
      const made = live()[0]!
      const provider = made.options['autoscaleInfoProvider'] as () => unknown
      expect(provider()).toEqual({ priceRange: { minValue: rsi.range!.min_value, maxValue: rsi.range!.max_value } })
      expect(made.options['priceFormat']).toMatchObject({ type: 'price', precision: rsi.price_format!.precision })
      expect(made.lines.map(line => [line['price'], line['title']])).toEqual([
        ...rsi.price_lines.map(line => [line.price, '']), [50, 'middle'],
      ])
    })

    /** TradingView's "Scale price chart only": a band switched on or off moves no candle (operator, 2026-11-13). */
    it('leaves the candles their own scale, and a series of its own pane its values', async () => {
      size = { width: 800, height: 400 }
      mountWith(drawn('worker:bollinger_main', 'worker:macd_main'))
      await nextTick()
      const scaleOf = (pane: number) => live().filter(made => made.pane === pane)
        .map(made => (made.options['autoscaleInfoProvider'] as (() => unknown) | undefined)?.())
      expect(scaleOf(0).length).toBeGreaterThan(0)
      expect(scaleOf(0).every(scale => scale === null)).toBe(true)
      // the MACD has no fixed range: the library scales its pane to its values
      expect(scaleOf(2).every(scale => scale === undefined)).toBe(true)
    })

    it('says each series in the legend of its pane, as its own scale prints it', async () => {
      size = { width: 800, height: 400 }
      // the candles, the volume and the RSI's pane, where the library stood them
      lw.paneRows.push({ top: 0, height: 250 }, { top: 251, height: 70 }, { top: 322, height: 78 })
      const wrapper = mountWith(drawn('worker:bollinger_main', 'worker:rsi_fast'))
      await nextTick()
      const rsi = entry('worker:rsi_fast')
      const last = rsi.data['rsi_value']!.at(-1)!
      const legend = wrapper.find('[data-legend="rsi_fast"]')
      expect(legend.attributes('style')).toContain('top: 322px')
      // inside its pane: its lines below the pane's height are cut, never laid over the pane below
      expect(legend.attributes('style')).toContain('max-height: 76px')
      expect(legend.find('[data-series="worker:rsi_fast"]').text()).toBe(`RSI ${rsi.inputs['period']} · M5~${last}`)
      // a series on the candles stands as a line of their legend
      expect(wrapper.find('[data-legend="price"] [data-series="worker:bollinger_main"]').exists()).toBe(true)
    })

    /** Their RSI's band between 30 and 70, their bands' channel: on the series' first plot, taken off with it. */
    it('fills a series\' areas on its first plot, and takes them off before the series goes', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountWith(drawn('worker:bollinger_main', 'worker:macd_main'))
      await nextTick()
      const firsts = live().filter(made => made.fills.length)
      // the bands fill their channel; the MACD names no area
      expect(firsts).toHaveLength(1)
      expect(firsts[0]!.pane).toBe(0)
      await wrapper.setProps({ indicators: [] })
      expect(lw.built.every(made => made.fills.length === 0)).toBe(true)
    })

    /**
     * A pane given the whole height can go — a worker's on a timeframe that cannot draw it, the volume
     * hidden. The choice stands, but folds nothing while its pane is gone: every pane keeps its controls.
     */
    it('folds nothing beside a pane at the whole height that is not drawn, and holds again once it is', async () => {
      size = { width: 800, height: 400 }
      lw.paneRows.push({ top: 0, height: 250 }, { top: 251, height: 70 }, { top: 322, height: 78 })
      mounted = mount(CandleChart, { props: { data: BARS, volume: OWN_VOLUME, indicators: [], maximizedPane: 'rsi_fast' } })
      const wrapper = mounted
      await nextTick()
      expect(wrapper.attributes('data-maximized')).toBeUndefined()
      expect(wrapper.find('.pane-controls[data-pane="price"]').exists()).toBe(true)
      expect(wrapper.find('[data-legend="price"]').classes()).not.toContain('folded')
      await wrapper.setProps({ indicators: drawn('worker:rsi_fast') })
      await nextTick()
      expect(wrapper.attributes('data-maximized')).toBe('rsi_fast')
      expect(wrapper.find('.pane-controls[data-pane="price"]').exists()).toBe(false)
    })

    /**
     * A new list handed with the same series — every panel's view written anywhere hands one — builds
     * nothing again: a pane the reader scaled by hand keeps its scale, a held drag its heights.
     */
    it('builds the series again only where what they draw changed', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountWith(drawn('worker:rsi_fast'))
      await nextTick()
      const built = lw.built.length
      await wrapper.setProps({ indicators: drawn('worker:rsi_fast') })
      expect(lw.built.length).toBe(built)
      await wrapper.setProps({ indicators: [{ entry: entry('worker:rsi_fast'), opacity: 0.5, span: null, place: 0 }] })
      expect(lw.built.length).toBeGreaterThan(built)
    })

    /** A worker's own pane sets its own margins: a pane made later took the volume's, by the chart's history. */
    it('sets a worker\'s own pane its own margins, and none on the candles\' pane', async () => {
      size = { width: 800, height: 400 }
      mountWith(drawn('worker:rsi_fast', 'worker:bollinger_main'))
      await nextTick()
      expect(live().find(made => made.pane === 2)!.scales).toEqual([{ scaleMargins: { top: 0.1, bottom: 0.1 } }])
      expect(live().filter(made => made.pane === 0).every(made => made.scales.length === 0)).toBe(true)
    })

    /** The symbol's format arriving after the series were built — the broker report loads apart — reaches them. */
    it('gives a series in price units the symbol\'s format once it arrives', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountWith(drawn('worker:bollinger_main'))
      await nextTick()
      expect(live()[0]!.options['priceFormat']).toBeUndefined()
      await wrapper.setProps({ priceFormat: { precision: 5, minMove: 0.00001 } })
      expect(live()[0]!.options['priceFormat']).toEqual({ type: 'price', precision: 5, minMove: 0.00001 })
    })

    /** A pane set apart by its name: the candles' pane, the volume's, a worker's — painted on that pane, anew after a rebuild. */
    it('paints each pane\u2019s look on the pane of its name, and again after the panes are laid out anew', async () => {
      size = { width: 800, height: 400 }
      mounted = mount(CandleChart, {
        props: { data: BARS, volume: OWN_VOLUME, indicators: drawn('worker:rsi_fast'), paneLooks: { price: { frame: true }, rsi_fast: { background: true } } },
      })
      const wrapper = mounted
      await nextTick()
      const held = (): number[] => [...lw.panePrimitives].filter(([, primitives]) => primitives.length).map(([index]) => index).sort()
      expect(held()).toEqual([0, 2])
      await wrapper.setProps({ volume: { ...OWN_VOLUME, ownPane: false } })
      // the volume in the candles' pane: the worker's pane is pane 1 now, and its look went with it
      expect(held()).toEqual([0, 1])
      await wrapper.setProps({ paneLooks: null })
      expect(held()).toEqual([])
    })

    it('takes every series down, and its panes with them, once none is handed', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountWith(drawn('worker:rsi_fast', 'worker:obv_volume'))
      await nextTick()
      expect(wrapper.attributes('data-panes')).toBe('4')
      await wrapper.setProps({ indicators: [] })
      expect(live()).toEqual([])
      expect(wrapper.attributes('data-panes')).toBe('2')
      expect(wrapper.find('[data-legend="rsi_fast"]').exists()).toBe(false)
    })
  })

  describe('the legend of each pane', () => {
    /** A legend's figures as they read: label, then value. */
    function legendOf(wrapper: VueWrapper, pane: string): string[] {
      return wrapper.findAll(`[data-legend="${pane}"] .legend-entry`).map(entry =>
        [entry.find('.legend-label').text(), entry.find('.legend-value').exists() ? entry.find('.legend-value').text() : '']
          .filter(Boolean).join(' '))
    }

    /** At the top left of the pane of the candles, as TradingView and Kraken Pro set it. */
    it('says the open, high, low and close of the last bar, and of the bar under the pointer while it is on one', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountChart()
      await nextTick()
      expect(legendOf(wrapper, 'price')).toEqual(['O 1.15', 'H 1.25', 'L 1.1', 'C 1.2'])
      expect(wrapper.find('[data-legend="price"]').attributes('style')).toContain('top: 0px')

      lw.pointer.move!({ time: BARS[0]!.time, point: { x: 10, y: 10 } })
      await nextTick()
      expect(legendOf(wrapper, 'price')).toEqual(['O 1.1', 'H 1.2', 'L 1', 'C 1.15'])
      // off the bars: the last one again
      lw.pointer.move!({})
      await nextTick()
      expect(legendOf(wrapper, 'price')).toEqual(['O 1.15', 'H 1.25', 'L 1.1', 'C 1.2'])
    })

    /** The volume's legend stands where its pane begins, and follows it when a seam moves it. */
    it('gives the volume in its own pane a legend at the top of that pane, and none once hidden', async () => {
      size = { width: 800, height: 400 }
      lw.paneRows.push({ top: 0, height: 300 }, { top: 301, height: 99 })
      const volume: ChartVolume = {
        basis: 'ticks', shown: true, ownPane: true, opacity: 1,
        bars: [{ time: BARS[0]!.time, value: 11, rising: true }, { time: BARS[1]!.time, value: 4, rising: false }],
      }
      const wrapper = mountChart(BARS, { volume })
      await nextTick()
      expect(legendOf(wrapper, 'volume')).toEqual(['Ticks 4'])
      expect(wrapper.find('[data-legend="volume"]').attributes('style')).toContain('top: 301px')

      // a seam dragged: the rows move, and the observer of the panes says so
      lw.paneRows.splice(0, 2, { top: 0, height: 250 }, { top: 251, height: 149 })
      fireResize()
      await nextTick()
      expect(wrapper.find('[data-legend="volume"]').attributes('style')).toContain('top: 251px')

      // hidden, it gives its pane up, and its legend goes with it
      await mounted!.setProps({ volume: { ...volume, shown: false } })
      expect(wrapper.find('[data-legend="volume"]').exists()).toBe(false)
    })

    it('puts the volume behind the close where it shares the pane of the candles', async () => {
      size = { width: 800, height: 400 }
      mountChart(BARS, { volume: { basis: 'traded', shown: true, ownPane: false, opacity: 1, bars: [{ time: BARS[1]!.time, value: 669.41895978, rising: true }] } })
      await nextTick()
      // in the form of the volume's own scale: the library's format, two decimals
      expect(legendOf(mounted!, 'price').at(-1)).toBe('Volume 669.42')
      expect(mounted!.find('[data-legend="volume"]').exists()).toBe(false)
    })

    /** The notices stand at the plot's top right, beside the price scale, by the width the library tells. */
    it('states the width of the plot, for the notices at its right edge', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountChart()
      lw.zoom.size!(731)
      await nextTick()
      expect(wrapper.attributes('style')).toContain('--chart-plot-width: 731px')
    })
  })

  describe('the controls of each pane', () => {
    const VOLUME: ChartVolume = {
      basis: 'ticks', shown: true, ownPane: true, opacity: 1,
      bars: [{ time: BARS[0]!.time, value: 11, rising: true }, { time: BARS[1]!.time, value: 4, rising: false }],
    }
    const CANDLES: ChartCandles = { form: 'candles', shown: true, opacity: 1 }

    /** The run chart: candles and the volume in its own pane, its rows where a test says. */
    async function mountPanes(maximizedPane: 'price' | 'volume' | null = null): Promise<VueWrapper> {
      size = { width: 800, height: 400 }
      lw.paneRows.push({ top: 0, height: 300 }, { top: 301, height: 99 })
      mounted = mount(CandleChart, { props: { data: BARS, volume: VOLUME, candles: CANDLES, maximizedPane } })
      await nextTick()
      return mounted
    }

    /** A pointer event at a height in the frame — jsdom has no PointerEvent, and the handler reads clientY alone. */
    async function at(wrapper: VueWrapper, type: string, clientY: number): Promise<void> {
      wrapper.element.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true }))
      await nextTick()
    }

    it('shows the controls of the pane under the pointer at the top right of its plot, and none once it leaves', async () => {
      const wrapper = await mountPanes()
      expect(wrapper.findAll('.pane-controls')).toHaveLength(2)
      expect(wrapper.findAll('.pane-controls.visible')).toHaveLength(0)
      await at(wrapper, 'pointermove', 350)
      expect(wrapper.find('.pane-controls[data-pane="volume"]').classes()).toContain('visible')
      expect(wrapper.find('.pane-controls[data-pane="price"]').classes()).not.toContain('visible')
      await at(wrapper, 'pointermove', 120)
      expect(wrapper.find('.pane-controls[data-pane="price"]').classes()).toContain('visible')
      wrapper.element.dispatchEvent(new MouseEvent('pointerleave'))
      await nextTick()
      expect(wrapper.findAll('.pane-controls.visible')).toHaveLength(0)
    })

    /** The lever of the layer the pane draws first: the candles above, the volume below. */
    it('asks for what a pane draws to be hidden or shown at its eye', async () => {
      const wrapper = await mountPanes()
      await wrapper.find('[data-pane="volume"] [data-action="pane-shown"]').trigger('click')
      await wrapper.find('[data-pane="price"] [data-action="pane-shown"]').trigger('click')
      expect(wrapper.emitted('paneShown')).toEqual([['volume', false], ['price', false]])
      await wrapper.setProps({ candles: { ...CANDLES, shown: false } })
      expect(wrapper.find('[data-pane="price"] [data-action="pane-shown"]').attributes('aria-label')).toBe('Show what this pane draws')
      // the controls stand by the pane's top, not behind its figures, whose width changes bar by bar
      expect(wrapper.find('.pane-controls[data-pane="volume"]').attributes('style')).toContain('top: 301px')
    })

    /** The folded pane keeps its legend as a line in the whole-height pane, and no controls of its own. */
    it('asks for the whole height of a pane, lays it out once given, and asks the heights back', async () => {
      const wrapper = await mountPanes()
      await wrapper.find('[data-pane="volume"] [data-action="pane-whole"]').trigger('click')
      expect(wrapper.emitted('maximize')).toEqual([['volume']])

      await wrapper.setProps({ maximizedPane: 'volume' })
      expect(lw.weights).toEqual([0, 1])
      expect(wrapper.attributes('data-maximized')).toBe('volume')
      // the library keeps 2 px of the folded pane: its legend stands as the first line of the other
      lw.paneRows.splice(0, 2, { top: 0, height: 2 }, { top: 3, height: 397 })
      fireResize()
      await nextTick()
      expect(wrapper.find('[data-legend="price"]').attributes('style')).toContain('top: 3px')
      expect(wrapper.find('[data-legend="volume"]').attributes('style')).toContain('top: 23px')
      expect(wrapper.find('.pane-controls[data-pane="price"]').exists()).toBe(false)
      // the arrows on the pane at the whole height give the heights back
      await wrapper.find('[data-pane="volume"] [data-action="pane-whole"]').trigger('click')
      expect(wrapper.emitted('maximize')).toEqual([['volume'], [null]])

      await wrapper.setProps({ maximizedPane: null })
      expect(lw.weights).toEqual([2, 0.5])
    })

    it('asks for the first heights at a double click on the seam, and at no other', async () => {
      const wrapper = await mountPanes()
      await at(wrapper, 'dblclick', 150)
      expect(wrapper.emitted('resetPanes')).toBeUndefined()
      await at(wrapper, 'dblclick', 299)
      expect(wrapper.emitted('resetPanes')).toHaveLength(1)
    })

    /** The free chart: one pane, and no layer to switch — nothing to offer. */
    it('offers no controls on a chart of one pane with no lever', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountChart()
      await nextTick()
      expect(wrapper.find('.pane-controls').exists()).toBe(false)
    })
  })

  describe('bars loaded at an edge', () => {
    /** A bar a minute; the one before it, fifty more. */
    const SPAN: ChartBar[] = Array.from({ length: 200 }, (_, index) => ({
      time: 1_760_000_000 + index * 60, open: 1, high: 1, low: 1, close: 1,
    }))
    const EARLIER: ChartBar[] = Array.from({ length: 50 }, (_, index) => ({
      time: SPAN[0]!.time - (50 - index) * 60, open: 1, high: 1, low: 1, close: 1,
    }))

    /** The library has painted what it was handed: the frames the chart waits before reading its edges. */
    const painted = (): Promise<void> => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

    beforeEach(() => {
      lw.zoom.range = { from: 80, to: 120 }
      lw.zoom.width = 600
    })

    afterEach(() => {
      lw.zoom.range = { from: 0, to: 100 }
    })

    it('says so as the view comes near the first or the last bar it holds, and not in between', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountChart(SPAN)
      const edges = (): unknown[] => (wrapper.emitted('edge') ?? []).map(([side]) => side)
      await painted()
      expect(edges()).toEqual([])
      lw.zoom.range = { from: 10, to: 60 }
      lw.zoom.change!()
      expect(edges()).toEqual(['left'])
      lw.zoom.range = { from: 150, to: 190 }
      lw.zoom.change!()
      expect(edges()).toEqual(['left', 'right'])
      await nextTick()
      // the first bar in view, on the element: what a browser test reads to tell the view did not jump
      expect(wrapper.find('.candle-chart').attributes('data-visible-from')).toBe(String(SPAN[150]!.time))
      expect(wrapper.find('.candle-chart').attributes('data-bars')).toBe('200')
    })

    /** Bars before the ones on show move the view by exactly as many: the reader sees the same bars. */
    it('keeps the view on the bars it showed as earlier ones arrive, without framing anew', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountChart(SPAN)
      vi.clearAllMocks()
      await wrapper.setProps({ data: [...EARLIER, ...SPAN] })
      expect(lw.setData.mock.calls[0]![0]).toHaveLength(250)
      expect(lw.setVisibleLogicalRange).toHaveBeenCalledWith({ from: 130, to: 170 })
      expect(lw.fitContent).not.toHaveBeenCalled()
      // later ones move nothing at all: the range is put back as it was
      vi.clearAllMocks()
      await wrapper.setProps({ data: [...EARLIER, ...SPAN, { ...SPAN.at(-1)!, time: SPAN.at(-1)!.time + 60 }] })
      expect(lw.setVisibleLogicalRange).toHaveBeenCalledWith({ from: 80, to: 120 })
      expect(lw.fitContent).not.toHaveBeenCalled()
    })

    /** The library reports the ranges it passes through while a set is handed: those are not the view. */
    it('says nothing of a range the library passes through while it is handed a set', async () => {
      size = { width: 800, height: 400 }
      lw.setData.mockImplementationOnce(() => {
        lw.zoom.range = { from: 0, to: 10 }
        lw.zoom.change?.()
        lw.zoom.range = { from: 80, to: 120 }
      })
      const wrapper = mountChart(SPAN)
      await painted()
      expect(wrapper.emitted('edge')).toBeUndefined()
    })

    /**
     * Measured on a live run: a first batch framed in its middle reported the right end first, the
     * range it was given applying only at the next paint. What counts is the range after that paint.
     */
    it('reads the edges once the library has painted what it was handed', async () => {
      size = { width: 800, height: 400 }
      lw.zoom.range = { from: 150, to: 190 }
      const framed = mountChart(SPAN, { focus: SPAN[100]!.time })
      lw.zoom.change!()
      expect(framed.emitted('edge')).toBeUndefined()
      lw.zoom.range = { from: 25, to: 175 }
      lw.zoom.change!()
      await painted()
      expect(framed.emitted('edge')).toBeUndefined()
      framed.unmount()

      // a set that stands at an edge once painted says so, with no move of the reader's
      lw.zoom.range = { from: 80, to: 120 }
      const atEdge = mountChart(SPAN)
      lw.zoom.range = { from: -1, to: 199 }
      await painted()
      expect((atEdge.emitted('edge') ?? []).map(([side]) => side)).toEqual(['left', 'right'])
    })

    it('frames a set that is another one, as at the first look', async () => {
      size = { width: 800, height: 400 }
      const wrapper = mountChart(SPAN)
      vi.clearAllMocks()
      await wrapper.setProps({ data: BARS })
      expect(lw.fitContent).toHaveBeenCalledTimes(1)
    })

    it('shows a quiet sign in the corner of an edge a batch is on its way to, and says there that one failed', async () => {
      const wrapper = mountChart(SPAN, {})
      await wrapper.setProps({ loadingEdges: ['left'] })
      expect(wrapper.find('.edge-state.left .app-spinner').exists()).toBe(true)
      expect(wrapper.find('.edge-state.right').exists()).toBe(false)
      await wrapper.setProps({ loadingEdges: [], edgeError: { edge: 'right', message: 'Network Error' } })
      expect(wrapper.find('.edge-state.left').exists()).toBe(false)
      const failed = wrapper.find('.edge-state.right')
      expect(failed.text()).toBe('Later bars could not be loaded: Network Error')
      expect(failed.find('[data-icon="status-error"]').exists()).toBe(true)
    })
  })
})
