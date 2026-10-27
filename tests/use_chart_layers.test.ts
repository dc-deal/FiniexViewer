import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChartLayers } from '@/composables/use_chart_layers'
import { useArrangementStore } from '@/stores/arrangement_store'

/**
 * The drawing layers of one chart, arranged by its dock id: read front first, written with the
 * chart's own view as only what differs from the chart's own arrangement.
 */
describe('useChartLayers', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('reads a chart\'s layers front first', () => {
    const { rows } = useChartLayers(() => 'run-chart')
    expect(rows.value.map(row => row.id)).toEqual(['trades', 'entry-exit', 'levels', 'candles', 'volume'])
  })

  it('keeps a hidden layer, a fainter one and a switched option with the chart\'s own view', () => {
    const arrangement = useArrangementStore()
    arrangement.setPanelView('run-chart', { expanded: { 'periods-table': true } })
    const { show, setOpacity, setOption } = useChartLayers(() => 'run-chart')
    show('levels', false)
    setOpacity('trades', 40)
    setOption('levels', true)
    expect(arrangement.panelViews['run-chart']).toEqual({
      expanded: { 'periods-table': true },
      layers: { hidden: ['levels'], opacity: { trades: 40 }, options: { 'every-position': true } },
    })
  })

  /** Below the least opacity a layer would be hidden, which the lever does; above the whole there is nothing. */
  it('holds an opacity between the least one and the whole', () => {
    const { rows, setOpacity } = useChartLayers(() => 'run-chart')
    setOpacity('trades', 0)
    expect(rows.value[0]!.opacity).toBe(10)
    setOpacity('trades', 150)
    expect(rows.value[0]!.opacity).toBe(100)
    expect(useArrangementStore().panelViews).toEqual({})
  })

  /** One place at a time, no further than either end, and never past the volume, which keeps its place at the back. */
  it('moves a layer one place toward the front or the back, and no further than either end', () => {
    const { rows, move } = useChartLayers(() => 'run-chart')
    move('levels', 1)
    expect(rows.value.map(row => row.id)).toEqual(['trades', 'levels', 'entry-exit', 'candles', 'volume'])
    move('trades', 1)
    move('entry-exit', -1)
    move('volume', 1)
    move('candles', 1)
    expect(rows.value.map(row => row.id)).toEqual(['trades', 'levels', 'entry-exit', 'candles', 'volume'])
  })

  /** Back to the chart's own arrangement, nothing is kept — no entry stands for a chart nobody arranged. */
  it('keeps nothing once the layers are back as the chart has them', () => {
    const arrangement = useArrangementStore()
    const { show } = useChartLayers(() => 'run-chart')
    show('trades', false)
    show('trades', true)
    expect(arrangement.panelViews).toEqual({})
  })

  it('has nothing to arrange without a chart', () => {
    const { rows, show } = useChartLayers(() => null)
    show('trades', false)
    expect(rows.value).toEqual([])
    expect(useArrangementStore().panelViews).toEqual({})
  })
})
