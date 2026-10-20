import { describe, it, expect } from 'vitest'
import { arrangeLayers, chartLayers, keptLayers, layerDefinition, layerSummary } from '@/layer_registry'
import { CHART_LAYER_IDS } from '@/types/chart_drawing_types'

/**
 * The register of drawing layers: what each one is called and offers, which chart draws which, and
 * the reader's arrangement read against the chart's own — and written back as only what differs.
 */
describe('layer_registry', () => {
  it('describes every layer there is', () => {
    for (const id of CHART_LAYER_IDS) {
      const layer = layerDefinition(id)
      expect(layer.title).not.toBe('')
      expect(layer.description).not.toBe('')
      expect(layer.emptyHint).not.toBe('')
    }
  })

  /** The free chart draws only its candles: the Layers panel has nothing to arrange there. */
  it('says which chart draws which layers, back to front', () => {
    expect(chartLayers('run-chart')).toEqual(['levels', 'entry-exit', 'trades'])
    expect(chartLayers('chart')).toEqual([])
  })

  it('arranges a chart nobody touched in its own order, every layer shown at full strength, each option at its default', () => {
    expect(arrangeLayers('run-chart', undefined)).toEqual([
      { id: 'levels', shown: true, opacity: 100, option: false },
      { id: 'entry-exit', shown: true, opacity: 100, option: null },
      { id: 'trades', shown: true, opacity: 100, option: true },
    ])
  })

  it('applies what was kept: the order, the hidden layers, the opacities, the options switched', () => {
    const arranged = arrangeLayers('run-chart', {
      order: ['trades', 'entry-exit', 'levels'], hidden: ['entry-exit'], opacity: { levels: 40 },
      options: { 'trade-signs': false, 'every-position': true },
    })
    expect(arranged).toEqual([
      { id: 'trades', shown: true, opacity: 100, option: false },
      { id: 'entry-exit', shown: false, opacity: 100, option: null },
      { id: 'levels', shown: true, opacity: 40, option: true },
    ])
  })

  /** The closed row says the option where it differs; the opacity stands on its own handle beside it. */
  it('sums up a layer by its option where it differs from the default, and says nothing else', () => {
    const [levels, entryExit, trades] = arrangeLayers('run-chart', { opacity: { trades: 40 }, options: { 'trade-signs': false } })
    expect(layerSummary(trades!)).toBe('no signs')
    expect(layerSummary(levels!)).toBe('')
    expect(layerSummary(entryExit!)).toBe('')
  })

  /** A kept order is reconciled: what the chart no longer draws goes, what it draws since stands where its own order has it. */
  it('reconciles a kept order against the layers the chart draws', () => {
    expect(arrangeLayers('run-chart', { order: ['trades', 'levels'] }).map(state => state.id))
      .toEqual(['trades', 'entry-exit', 'levels'])
    expect(arrangeLayers('chart', { order: ['trades'] })).toEqual([])
  })

  it('keeps only what differs from the chart\'s own arrangement, and nothing where nothing does', () => {
    const own = arrangeLayers('run-chart', undefined)
    expect(keptLayers('run-chart', own)).toBeUndefined()
    const changed = own.map(state => state.id === 'trades' ? { ...state, shown: false, opacity: 40, option: false } : state)
    expect(keptLayers('run-chart', [...changed].reverse())).toEqual({
      order: ['trades', 'entry-exit', 'levels'], hidden: ['trades'], opacity: { trades: 40 }, options: { 'trade-signs': false },
    })
  })
})
