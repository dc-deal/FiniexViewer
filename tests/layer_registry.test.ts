import { describe, it, expect } from 'vitest'
import { arrangeLayers, chartLayers, keptLayers, layerDefinition, layerSummary } from '@/layer_registry'
import { hintById } from '@/hint_registry'
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
      // why it may draw nothing is a hint of the shared register, dismissible like the others
      expect(hintById(layer.emptyHintId)).not.toBeNull()
    }
  })

  /** The free chart draws only its candles: the Layers panel has nothing to arrange there. */
  it('says which chart draws which layers, back to front', () => {
    expect(chartLayers('run-chart')).toEqual(['volume', 'levels', 'entry-exit', 'trades'])
    expect(chartLayers('chart')).toEqual([])
  })

  it('arranges a chart nobody touched in its own order, every layer shown at full strength, each option at its default', () => {
    expect(arrangeLayers('run-chart', undefined)).toEqual([
      { id: 'volume', shown: true, opacity: 100, option: null },
      { id: 'levels', shown: true, opacity: 100, option: false },
      { id: 'entry-exit', shown: true, opacity: 100, option: false },
      { id: 'trades', shown: true, opacity: 100, option: true },
    ])
  })

  it('applies what was kept: the order, the hidden layers, the opacities, the options switched', () => {
    const arranged = arrangeLayers('run-chart', {
      order: ['trades', 'entry-exit', 'levels'], hidden: ['entry-exit'], opacity: { levels: 40 },
      options: { 'trade-signs': false, 'every-position': true },
    })
    expect(arranged).toEqual([
      // the volume, not in that older order, stands at the back where its fixed place is
      { id: 'volume', shown: true, opacity: 100, option: null },
      { id: 'trades', shown: true, opacity: 100, option: false },
      // the line's option is its own: the levels' of the same word leaves it alone
      { id: 'entry-exit', shown: false, opacity: 100, option: false },
      { id: 'levels', shown: true, opacity: 40, option: true },
    ])
  })

  /** The closed row says the option where it differs; the opacity stands on its own handle beside it. */
  it('sums up a layer by its option where it differs from the default, and says nothing else', () => {
    const [volume, levels, entryExit, trades] = arrangeLayers('run-chart', { opacity: { trades: 40 }, options: { 'trade-signs': false } })
    expect(layerSummary(trades!)).toBe('no signs')
    expect(layerSummary(volume!)).toBe('')
    expect(layerSummary(levels!)).toBe('')
    expect(layerSummary(entryExit!)).toBe('')
  })

  /** A kept order is reconciled: what the chart no longer draws goes, what it draws since stands where its own order has it. */
  it('reconciles a kept order against the layers the chart draws', () => {
    expect(arrangeLayers('run-chart', { order: ['trades', 'levels'] }).map(state => state.id))
      .toEqual(['volume', 'trades', 'entry-exit', 'levels'])
    expect(arrangeLayers('chart', { order: ['trades'] })).toEqual([])
  })

  /** A fixed layer is drawn by the library behind the candles: whatever order was kept, it stands at the back. */
  it('keeps a fixed layer at the back whatever order was kept', () => {
    expect(layerDefinition('volume').fixed).toBe(true)
    expect(arrangeLayers('run-chart', { order: ['trades', 'volume', 'levels', 'entry-exit'] }).map(state => state.id))
      .toEqual(['volume', 'trades', 'levels', 'entry-exit'])
  })

  it('keeps only what differs from the chart\'s own arrangement, and nothing where nothing does', () => {
    const own = arrangeLayers('run-chart', undefined)
    expect(keptLayers('run-chart', own)).toBeUndefined()
    const changed = own.map(state => state.id === 'trades' ? { ...state, shown: false, opacity: 40, option: false } : state)
    expect(keptLayers('run-chart', [...changed].reverse())).toEqual({
      order: ['trades', 'entry-exit', 'levels', 'volume'], hidden: ['trades'], opacity: { trades: 40 }, options: { 'trade-signs': false },
    })
  })
})
