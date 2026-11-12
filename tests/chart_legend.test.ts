import { describe, it, expect } from 'vitest'
import { paneLegends, type LegendSource } from '@/components/chart_legend'
import type { PaneLegend } from '@/types/chart_pane_types'

const BAR = { time: 1_760_000_000, open: 0.87412, high: 0.8743, low: 0.87401, close: 0.8742 }

function source(fields: Partial<LegendSource> = {}): LegendSource {
  return { bar: BAR, volumeValue: 1234.5, volume: null, tickSize: null, ...fields }
}

/** A legend as label and value pairs, the way it reads. */
function read(legend: PaneLegend | undefined): string[] {
  return (legend?.entries ?? []).map(entry => entry.value === null ? entry.label : `${entry.label} ${entry.value}`)
}

describe('paneLegends', () => {
  it('says the open, high, low and close of the bar it is handed, as served', () => {
    const legends = paneLegends(source())
    expect(legends.map(legend => legend.pane)).toEqual(['price'])
    expect(read(legends[0])).toEqual(['O 0.87412', 'H 0.8743', 'L 0.87401', 'C 0.8742'])
  })

  /** On the instrument's price step once its broker report is there, as every price in the app. */
  it('prints the prices at the tick size where one is handed', () => {
    expect(read(paneLegends(source({ tickSize: 0.00001 }))[0])).toEqual(['O 0.87412', 'H 0.87430', 'L 0.87401', 'C 0.87420'])
  })

  it('says nothing where the chart has no bar', () => {
    expect(paneLegends(source({ bar: null }))).toEqual([])
  })

  /** The word says what is counted: the traded volume, or the ticks where the venue prints no trade. */
  it('gives the volume in its own pane a legend of its own, its word saying what it counts', () => {
    const traded = paneLegends(source({ volume: { basis: 'traded', shown: true, ownPane: true } }))
    expect(traded.map(legend => legend.pane)).toEqual(['price', 'volume'])
    expect(read(traded[1])).toEqual(['Volume 1,234.5'])
    expect(traded[1]!.quiet).toBe(false)
    const ticks = paneLegends(source({ volumeValue: 12, volume: { basis: 'ticks', shown: true, ownPane: true } }))
    expect(read(ticks[1])).toEqual(['Ticks 12'])
  })

  /** As TradingView keeps a study it hid: its name stands in its pane, without a value. */
  it('keeps a hidden volume\'s name in its own pane, quiet and without a value', () => {
    const legends = paneLegends(source({ volume: { basis: 'ticks', shown: false, ownPane: true } }))
    expect(read(legends[1])).toEqual(['Ticks'])
    expect(legends[1]!.quiet).toBe(true)
  })

  it('puts the volume behind the close where it shares the pane of the candles, and nothing while hidden', () => {
    const shared = paneLegends(source({ volumeValue: 12, volume: { basis: 'ticks', shown: true, ownPane: false } }))
    expect(shared.map(legend => legend.pane)).toEqual(['price'])
    expect(read(shared[0]).at(-1)).toBe('Ticks 12')
    const hidden = paneLegends(source({ volume: { basis: 'ticks', shown: false, ownPane: false } }))
    expect(read(hidden[0])).toHaveLength(4)
  })

  it('leaves the value out where the volume has none on that bar', () => {
    const legends = paneLegends(source({ volumeValue: null, volume: { basis: 'traded', shown: true, ownPane: true } }))
    expect(read(legends[1])).toEqual(['Volume'])
  })
})
