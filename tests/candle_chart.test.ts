import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import CandleChart from '@/components/CandleChart.vue'
import type { ChartBar } from '@/types/api/bar_types'
import type { ChartMark } from '@/types/run_chart_types'

/**
 * The chart library itself is replaced: what is under test is WHEN the component builds, fits and
 * resizes a chart, and what it paints with — which the library cannot report from inside jsdom (it
 * measures nothing there).
 */
const lw = vi.hoisted(() => {
  const fitContent = vi.fn()
  const setData = vi.fn<(data: unknown[]) => void>()
  const setMarkers = vi.fn<(marks: Record<string, unknown>[]) => void>()
  const setVisibleLogicalRange = vi.fn<(range: { from: number, to: number }) => void>()
  const series = { setData, setMarkers, applyOptions: vi.fn<(options: Record<string, unknown>) => void>() }
  const chart = {
    addCandlestickSeries: vi.fn<(options: Record<string, unknown>) => typeof series>(() => series),
    applyOptions: vi.fn<(options: Record<string, unknown>) => void>(),
    timeScale: vi.fn(() => ({ fitContent, setVisibleLogicalRange })),
    resize: vi.fn<(width: number, height: number) => void>(),
    remove: vi.fn(),
  }
  const createChart = vi.fn<(container: HTMLElement, options: Record<string, unknown>) => typeof chart>(
    () => chart
  )
  return { chart, series, setData, setMarkers, setVisibleLogicalRange, fitContent, createChart }
})

vi.mock('lightweight-charts', () => ({
  createChart: lw.createChart,
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

function mountChart(data: ChartBar[] = BARS, extra: { marks?: ChartMark[], focus?: number | null } = {}): VueWrapper {
  mounted = mount(CandleChart, { props: { data, ...extra } })
  return mounted
}

function mark(fields: Partial<ChartMark>): ChartMark {
  return { time: BARS[0]!.time, position: 'belowBar', shape: 'arrowUp', role: 'entry', text: '', focused: false, ...fields }
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

  /** The marks are drawn on a canvas, where nothing can read them back — so the element counts them. */
  it('says on its element how many marks it draws', () => {
    size = { width: 800, height: 400 }
    const wrapper = mountChart(BARS, { marks: [mark({}), mark({ role: 'gain' })] })
    expect(wrapper.attributes('data-marks')).toBe('2')
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
      expect(lw.chart.addCandlestickSeries).toHaveBeenCalledWith({
        borderVisible: false,
        upColor: '#000005',
        downColor: '#000006',
        wickUpColor: '#000005',
        wickDownColor: '#000006',
      })
    })

    /** A result is the polarity of a figure; an entry is a fact in plain ink; the shape says the rest. */
    it('paints the marks of trades by their role, the one looked at larger', async () => {
      size = { width: 800, height: 400 }
      mountChart(BARS, { marks: [
        mark({ role: 'entry', focused: true }),
        mark({ role: 'gain', shape: 'circle', position: 'aboveBar', text: '+' }),
        mark({ role: 'loss', shape: 'circle', text: '−' }),
        mark({ role: 'flat', shape: 'circle', text: '0' }),
      ] })

      expect(lw.setMarkers.mock.lastCall![0].map(entry => [entry['color'], entry['size']])).toEqual([
        ['#000007', 2], ['#000005', 1], ['#000006', 1], ['#000002', 1],
      ])
      expect(lw.setMarkers.mock.lastCall![0][1]).toMatchObject({ shape: 'circle', position: 'aboveBar', text: '+' })

      document.documentElement.dataset.theme = 'light'
      await flushPromises()
      expect(lw.setMarkers.mock.lastCall![0].map(entry => entry['color'])).toEqual(['#ffff07', '#ffff05', '#ffff06', '#ffff02'])
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
      expect(lw.chart.addCandlestickSeries.mock.lastCall![0]).toMatchObject({ upColor: '#ffff05' })
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
