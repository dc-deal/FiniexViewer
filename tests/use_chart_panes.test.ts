import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, type Ref } from 'vue'
import type { IChartApi } from 'lightweight-charts'
import { useChartPanes, DEFAULT_PANE_WEIGHTS } from '@/composables/use_chart_panes'
import type { ChartPaneId, PaneBox, PaneWeights } from '@/types/chart_pane_types'

/** An element that says where it stands — jsdom lays nothing out. */
function placed(top: number, height: number): HTMLElement {
  const element = document.createElement('div')
  element.getBoundingClientRect = () => ({ top, height } as DOMRect)
  return element
}

/**
 * The library's panes as far as weights and places go: each keeps the weight set on it, a drag
 * changes them, and each stands where `rows` says, top and height.
 */
function fakeChart(weights: number[], rows: { top: number, height: number }[] = []): IChartApi {
  const elements = rows.map(row => placed(row.top, row.height))
  const panes = () => weights.map((_, index) => ({
    getStretchFactor: () => weights[index]!,
    setStretchFactor: (weight: number) => { weights[index] = weight },
    getHTMLElement: () => elements[index] ?? null,
  }))
  return { panes } as unknown as IChartApi
}

/** What the observer of the panes' elements was given, and its callback — fired by a test. */
const observed: { elements: Element[], fire: () => void } = { elements: [], fire: () => {} }

class PaneObserverProbe {
  constructor(callback: ResizeObserverCallback) {
    observed.fire = () => callback([], this as unknown as ResizeObserver)
  }

  observe(element: Element): void { observed.elements.push(element) }
  unobserve(): void {}
  disconnect(): void { observed.elements = [] }
}

/** A host that lays its panes out on mount, as the chart does once it is built. */
function hosted(
  chart: IChartApi, ids: ChartPaneId[], kept: PaneWeights | null, told: (weights: PaneWeights) => void,
  frame: HTMLElement | null = null, maximized: ChartPaneId | null = null,
): VueWrapper & { boxes: Readonly<Ref<PaneBox[]>>, track: () => void } {
  let exposed: { boxes: Readonly<Ref<PaneBox[]>>, track: () => void } | null = null
  const wrapper = mount(defineComponent({
    setup() {
      const panes = useChartPanes({
        chart: () => chart, ids: () => ids, weights: () => kept, onWeights: told, frame: () => frame,
        maximized: () => maximized,
      })
      panes.applyWeights()
      exposed = panes
      return () => h('div')
    },
  }))
  return Object.assign(wrapper, exposed!)
}

function release(): void {
  window.dispatchEvent(new Event('pointerup'))
}

describe('use_chart_panes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** The legends stand by these: each pane's top inside the chart's frame, measured from its element. */
  it('measures where each pane stands in the frame, and again when one changes size', () => {
    vi.stubGlobal('ResizeObserver', PaneObserverProbe)
    const rows = [{ top: 110, height: 400 }, { top: 511, height: 100 }]
    const wrapper = hosted(fakeChart([2, 0.5], rows), ['price', 'volume'], null, () => {}, placed(100, 520))
    wrapper.track()
    expect(wrapper.boxes.value).toEqual([{ id: 'price', top: 10, height: 400 }, { id: 'volume', top: 411, height: 100 }])
    expect(observed.elements).toHaveLength(2)
    // a seam dragged: the rows move, the library says nothing, the observer does
    observed.elements[0]!.getBoundingClientRect = () => ({ top: 110, height: 300 } as DOMRect)
    observed.elements[1]!.getBoundingClientRect = () => ({ top: 411, height: 200 } as DOMRect)
    observed.fire()
    expect(wrapper.boxes.value).toEqual([{ id: 'price', top: 10, height: 300 }, { id: 'volume', top: 311, height: 200 }])
    wrapper.unmount()
    expect(observed.elements).toHaveLength(0)
  })

  it('measures nothing without a frame to measure from', () => {
    vi.stubGlobal('ResizeObserver', PaneObserverProbe)
    const wrapper = hosted(fakeChart([2], [{ top: 0, height: 300 }]), ['price'], null, () => {})
    wrapper.track()
    expect(wrapper.boxes.value).toEqual([])
    wrapper.unmount()
  })

  /** Folded to nothing — the library keeps 2 px of a pane, too little to draw in. */
  it('gives one pane the whole height, the others folded', () => {
    const weights = [1, 1]
    const told = vi.fn<(weights: PaneWeights) => void>()
    const wrapper = hosted(fakeChart(weights), ['price', 'volume'], null, told, null, 'volume')
    expect(weights).toEqual([0, 1])
    // a click that dragged nothing is no drag, though the weights are not the ones kept
    release()
    expect(told).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  /** A release is compared with what was laid out: a drag is told once, not again at the next click. */
  it('tells a drag once, and nothing at the clicks after it', () => {
    const weights = [1, 1]
    const told = vi.fn<(weights: PaneWeights) => void>()
    const wrapper = hosted(fakeChart(weights), ['price', 'volume'], null, told)
    weights.splice(0, 2, 1.8, 0.7)
    release()
    release()
    expect(told).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('lays each pane out at the weight kept for it, a pane never dragged at its default', () => {
    const weights = [1, 1]
    hosted(fakeChart(weights), ['price', 'volume'], { volume: 0.8 }, () => {}).unmount()
    expect(weights).toEqual([DEFAULT_PANE_WEIGHTS.price, 0.8])
  })

  /** The library says nothing while a separator is dragged: the weights are read when the pointer is let go. */
  it('tells the weights of every pane once a release finds one moved, and nothing where none did', () => {
    const weights = [1, 1]
    const told = vi.fn<(weights: PaneWeights) => void>()
    const wrapper = hosted(fakeChart(weights), ['price', 'volume'], null, told)
    release()
    expect(told).not.toHaveBeenCalled()
    weights.splice(0, 2, 1.8, 0.7)
    release()
    expect(told).toHaveBeenCalledExactlyOnceWith({ price: 1.8, volume: 0.7 })
    wrapper.unmount()
  })

  /** Heard on its way down to its target: a panel that keeps a release to itself cannot lose a drag. */
  it('hears a release that an element of the page keeps to itself', () => {
    const weights = [1, 1]
    const told = vi.fn<(weights: PaneWeights) => void>()
    const wrapper = hosted(fakeChart(weights), ['price', 'volume'], null, told)
    const keeper = document.createElement('div')
    keeper.addEventListener('pointerup', event => event.stopPropagation())
    document.body.append(keeper)
    weights.splice(0, 2, 1.5, 1)
    keeper.dispatchEvent(new Event('pointerup', { bubbles: true }))
    expect(told).toHaveBeenCalledExactlyOnceWith({ price: 1.5, volume: 1 })
    keeper.remove()
    wrapper.unmount()
  })

  it('tells nothing where the chart stacks one pane — there is no separator to drag', () => {
    const weights = [1]
    const told = vi.fn<(weights: PaneWeights) => void>()
    const wrapper = hosted(fakeChart(weights), ['price'], null, told)
    weights[0] = 3
    release()
    expect(told).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('stops listening once its chart is gone', () => {
    const weights = [1, 1]
    const told = vi.fn<(weights: PaneWeights) => void>()
    hosted(fakeChart(weights), ['price', 'volume'], null, told).unmount()
    weights[1] = 2
    release()
    expect(told).not.toHaveBeenCalled()
  })
})
