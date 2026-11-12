import { describe, it, expect, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { IChartApi } from 'lightweight-charts'
import { useChartPanes, DEFAULT_PANE_WEIGHTS } from '@/composables/use_chart_panes'
import type { ChartPaneId, PaneWeights } from '@/types/chart_pane_types'

/** The library's panes as far as weights go: each keeps the one set on it, and a drag changes them. */
function fakeChart(weights: number[]): IChartApi {
  const panes = () => weights.map((_, index) => ({
    getStretchFactor: () => weights[index]!,
    setStretchFactor: (weight: number) => { weights[index] = weight },
  }))
  return { panes } as unknown as IChartApi
}

/** A host that lays its panes out on mount, as the chart does once it is built. */
function hosted(
  chart: IChartApi, ids: ChartPaneId[], kept: PaneWeights | null, told: (weights: PaneWeights) => void,
): VueWrapper {
  return mount(defineComponent({
    setup() {
      const panes = useChartPanes({ chart: () => chart, ids: () => ids, weights: () => kept, onWeights: told })
      panes.applyWeights()
      return () => h('div')
    },
  }))
}

function release(): void {
  window.dispatchEvent(new Event('pointerup'))
}

describe('use_chart_panes', () => {
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
