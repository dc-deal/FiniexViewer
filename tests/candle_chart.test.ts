import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import CandleChart from '@/components/CandleChart.vue'
import type { ChartBar } from '@/types/api/bar_types'

/**
 * The chart library itself is replaced: what is under test is WHEN the component builds, fits and
 * resizes a chart, which the library cannot report from inside jsdom (it measures nothing there).
 */
const lw = vi.hoisted(() => {
  const fitContent = vi.fn()
  const setData = vi.fn<(data: unknown[]) => void>()
  const chart = {
    addCandlestickSeries: vi.fn(() => ({ setData })),
    timeScale: vi.fn(() => ({ fitContent })),
    resize: vi.fn<(width: number, height: number) => void>(),
    remove: vi.fn(),
  }
  const createChart = vi.fn<(container: HTMLElement, options: Record<string, unknown>) => typeof chart>(
    () => chart
  )
  return { chart, setData, fitContent, createChart }
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

function mountChart(data: ChartBar[] = BARS): VueWrapper {
  mounted = mount(CandleChart, { props: { data } })
  return mounted
}

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
})
