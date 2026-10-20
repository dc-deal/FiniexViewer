import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import CandleChart from '@/components/CandleChart.vue'
import type { ChartBar } from '@/types/api/bar_types'
import type { ChartLayer, SegmentDrawing } from '@/types/chart_drawing_types'
import type { ChartMark } from '@/types/run_chart_types'

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
  const zoom: { change: (() => void) | null, range: { from: number, to: number } | null, width: number } = {
    change: null, range: { from: 0, to: 100 }, width: 600,
  }
  const series = {
    setData,
    applyOptions: vi.fn<(options: Record<string, unknown>) => void>(),
    attachPrimitive: vi.fn<(primitive: unknown) => void>(),
  }
  /** The candlestick series' definition, as the library exports it — what `addSeries` is handed. */
  const CandlestickSeries = { type: 'Candlestick' }
  /**
   * What the chart hands its drawing host, call by call. The host itself paints on a canvas and is
   * tested on its own; here it is the chart's part that is under test — what it hands over, when.
   */
  const drawn: { layers: { id: string, drawings: { id: string }[] }[], bars: Map<number, unknown>, colours: { roles: Record<string, string>, surface: string } }[] = []
  class DrawingHostProbe {
    setDrawings(layers: never, bars: never, colours: never): void { drawn.push({ layers, bars, colours }) }
  }
  /** What the library calls as the pointer moves — held so a test can move it. */
  const pointer: { move: ((param: Record<string, unknown>) => void) | null } = { move: null }
  const chart = {
    subscribeCrosshairMove: vi.fn((handler: (param: Record<string, unknown>) => void) => { pointer.move = handler }),
    addSeries: vi.fn<(definition: typeof CandlestickSeries, options: Record<string, unknown>) => typeof series>(() => series),
    applyOptions: vi.fn<(options: Record<string, unknown>) => void>(),
    timeScale: vi.fn(() => ({
      fitContent,
      setVisibleLogicalRange,
      subscribeVisibleLogicalRangeChange: (handler: () => void) => { zoom.change = handler },
      getVisibleLogicalRange: () => zoom.range,
      width: () => zoom.width,
    })),
    resize: vi.fn<(width: number, height: number) => void>(),
    remove: vi.fn(),
  }
  const createChart = vi.fn<(container: HTMLElement, options: Record<string, unknown>) => typeof chart>(
    () => chart
  )
  return {
    chart, series, pointer, zoom, setData, setVisibleLogicalRange, fitContent, createChart, CandlestickSeries,
    drawn, DrawingHostProbe,
  }
})

vi.mock('@/components/chart_drawing_host', () => ({ ChartDrawingHost: lw.DrawingHostProbe }))

vi.mock('lightweight-charts', () => ({
  createChart: lw.createChart,
  CandlestickSeries: lw.CandlestickSeries,
  ColorType: { Solid: 'solid' },
}))

/**
 * A ResizeObserver the test can fire. The global stub in `tests/setup.ts` never calls back, which is
 * right for components that only need the API to exist — this one is ABOUT the callback.
 */
let fireResize: () => void = () => {}

class ResizeObserverProbe {
  constructor(callback: ResizeObserverCallback) {
    fireResize = () => callback([], this as unknown as ResizeObserver)
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
  extra: { marks?: ChartMark[], focus?: number | null, priceFormat?: { precision: number, minMove: number } | null } = {},
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
function lastDrawn(): { layers: { id: string, drawings: { id: string }[] }[], colours: { roles: Record<string, string>, surface: string } } {
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

      // a thing the register does not know, and no thing at all, both show nothing
      lw.pointer.move!({ hoveredInfo: { objectId: 'line|elsewhere' }, point: { x: 100, y: 80 } })
      await nextTick()
      expect(wrapper.find('.chart-card').exists()).toBe(false)
      lw.pointer.move!({ point: { x: 300, y: 80 } })
      await nextTick()
      expect(wrapper.find('.chart-card').exists()).toBe(false)
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

    it('paints with the tokens of the theme the document shows', () => {
      size = { width: 800, height: 400 }
      mountChart()

      expect(lw.chart.applyOptions).toHaveBeenCalledWith({
        layout: { background: { type: 'solid', color: '#000001' }, textColor: '#000002' },
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

      document.documentElement.dataset.theme = 'light'
      await flushPromises()
      expect(roles()).toEqual(['#ffff07', '#ffff05', '#ffff06', '#ffff02', '#ffff02'])
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
})
