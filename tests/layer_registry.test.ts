import { describe, it, expect } from 'vitest'
import { arrangeLayers, chartLayers, keptLayers, layerDefinition } from '@/layer_registry'
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
      // what it draws and what its option does is a hint of the shared register (2026-10-28)
      expect(hintById(layer.hintId)).not.toBeNull()
      // why it may draw nothing is a hint of the shared register, dismissible like the others —
      // where a layer can draw nothing while the chart has bars: the candles and the volume cannot
      if (layer.emptyHintId) expect(hintById(layer.emptyHintId)).not.toBeNull()
      else expect(layer.fixed).toBe(true)
    }
  })

  /** The free chart draws only its candles: the Layers panel has nothing to arrange there. */
  it('says which chart draws which layers, back to front', () => {
    expect(chartLayers('run-chart')).toEqual(['volume', 'candles', 'levels', 'entry-exit', 'trades'])
    expect(chartLayers('chart')).toEqual([])
  })

  it('arranges a chart nobody touched in its own order, every layer shown at full strength, each option at its default', () => {
    expect(arrangeLayers('run-chart', undefined)).toEqual([
      { id: 'volume', shown: true, opacity: 100, option: null, form: null },
      { id: 'candles', shown: true, opacity: 100, option: null, form: 'candles' },
      { id: 'levels', shown: true, opacity: 100, option: false, form: null },
      { id: 'entry-exit', shown: true, opacity: 100, option: false, form: null },
      { id: 'trades', shown: true, opacity: 100, option: true, form: null },
    ])
  })

  it('applies what was kept: the order, the hidden layers, the opacities, the options switched', () => {
    const arranged = arrangeLayers('run-chart', {
      order: ['trades', 'entry-exit', 'levels'], hidden: ['entry-exit'], opacity: { levels: 40 },
      options: { 'trade-signs': false, 'every-position': true },
    })
    expect(arranged).toEqual([
      // the volume and the candles, not in that older order, stand at the back where their fixed places are
      { id: 'volume', shown: true, opacity: 100, option: null, form: null },
      { id: 'candles', shown: true, opacity: 100, option: null, form: 'candles' },
      { id: 'trades', shown: true, opacity: 100, option: false, form: null },
      // the line's option is its own: the levels' of the same word leaves it alone
      { id: 'entry-exit', shown: false, opacity: 100, option: false, form: null },
      { id: 'levels', shown: true, opacity: 40, option: true, form: null },
    ])
  })

  /** A kept order is reconciled: what the chart no longer draws goes, what it draws since stands where its own order has it. */
  it('reconciles a kept order against the layers the chart draws', () => {
    expect(arrangeLayers('run-chart', { order: ['trades', 'levels'] }).map(state => state.id))
      .toEqual(['volume', 'candles', 'trades', 'entry-exit', 'levels'])
    expect(arrangeLayers('chart', { order: ['trades'] })).toEqual([])
  })

  /** A fixed layer is drawn by the library behind the candles: whatever order was kept, it stands at the back. */
  it('keeps a fixed layer at the back whatever order was kept', () => {
    expect(layerDefinition('volume').fixed).toBe(true)
    expect(arrangeLayers('run-chart', { order: ['trades', 'candles', 'volume', 'levels', 'entry-exit'] }).map(state => state.id))
      .toEqual(['volume', 'candles', 'trades', 'levels', 'entry-exit'])
  })

  /** The candles' form is kept only where it is not their own first, and a form read back is held to the set. */
  it('keeps the candles\' form where the reader chose another, and nothing where they did not', () => {
    const own = arrangeLayers('run-chart', undefined)
    expect(keptLayers('run-chart', own)).toBeUndefined()
    const line = own.map(state => state.id === 'candles' ? { ...state, form: 'line' as const } : state)
    expect(keptLayers('run-chart', line)).toEqual({ forms: { candles: 'line' } })
    expect(arrangeLayers('run-chart', { forms: { candles: 'area' } }).find(state => state.id === 'candles')!.form).toBe('area')
  })

  it('keeps only what differs from the chart\'s own arrangement, and nothing where nothing does', () => {
    const own = arrangeLayers('run-chart', undefined)
    expect(keptLayers('run-chart', own)).toBeUndefined()
    const changed = own.map(state => state.id === 'trades' ? { ...state, shown: false, opacity: 40, option: false } : state)
    expect(keptLayers('run-chart', [...changed].reverse())).toEqual({
      order: ['trades', 'entry-exit', 'levels', 'candles', 'volume'], hidden: ['trades'], opacity: { trades: 40 }, options: { 'trade-signs': false },
    })
  })
})
