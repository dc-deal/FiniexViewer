import { describe, it, expect } from 'vitest'
import { LEGEND_LINE, legendFolds, legendLines, legendTops, paneLegends, type LegendSource } from '@/components/chart_legend'
import type { PaneLegend } from '@/types/chart_pane_types'

const BAR = { time: 1_760_000_000, open: 0.87412, high: 0.8743, low: 0.87401, close: 0.8742 }

function source(fields: Partial<LegendSource> = {}): LegendSource {
  // a format no number would print by itself, so a value read through it shows that it was
  return {
    bar: BAR, volumeValue: 1234.5, volume: null, tickSize: null, formatVolume: value => `${value / 1000}K`, series: [],
    ...fields,
  }
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
    // in the form of the volume's own scale, which the chart hands in
    expect(read(traded[1])).toEqual(['Volume 1.2345K'])
    const ticks = paneLegends(source({ volumeValue: 12, volume: { basis: 'ticks', shown: true, ownPane: true } }))
    expect(read(ticks[1])).toEqual(['Ticks 0.012K'])
  })

  /** Hidden, the volume gives its pane up (operator, 2026-11-12): nothing of it is said. */
  it('says nothing of a hidden volume, which has no pane to stand in', () => {
    const legends = paneLegends(source({ volume: { basis: 'ticks', shown: false, ownPane: true } }))
    expect(legends.map(legend => legend.pane)).toEqual(['price'])
  })

  it('puts the volume behind the close where it shares the pane of the candles, and nothing while hidden', () => {
    const shared = paneLegends(source({ volumeValue: 12, volume: { basis: 'ticks', shown: true, ownPane: false } }))
    expect(shared.map(legend => legend.pane)).toEqual(['price'])
    expect(read(shared[0]).at(-1)).toBe('Ticks 0.012K')
    const hidden = paneLegends(source({ volume: { basis: 'ticks', shown: false, ownPane: false } }))
    expect(read(hidden[0])).toHaveLength(4)
  })

  it('leaves the value out where the volume has none on that bar', () => {
    const legends = paneLegends(source({ volumeValue: null, volume: { basis: 'traded', shown: true, ownPane: true } }))
    expect(read(legends[1])).toEqual(['Volume'])
  })

  /**
   * A worker's series (contract 55): one on the candles is a line of the price pane's legend, below
   * its figures; one in a pane of its own makes that pane's legend — below the volume's, in the order
   * the series are served, two series naming one pane sharing it.
   */
  it('gives each worker’s series a line in the legend of the pane it is drawn in', () => {
    const line = (layer: string) => ({ layer, title: layer, entries: [{ label: '', value: '1' }] })
    const legends = paneLegends(source({
      volume: { basis: 'traded', shown: true, ownPane: true },
      series: [
        { pane: 'macd', line: line('worker:macd') },
        { pane: 'price', line: line('worker:bands') },
        { pane: 'rsi', line: line('worker:rsi') },
        { pane: 'macd', line: line('worker:macd:signal') },
      ],
    }))
    expect(legends.map(legend => legend.pane)).toEqual(['price', 'volume', 'macd', 'rsi'])
    expect(legends[0]!.series.map(item => item.layer)).toEqual(['worker:bands'])
    expect(legends[2]!.series.map(item => item.layer)).toEqual(['worker:macd', 'worker:macd:signal'])
    expect(legends[2]!.entries).toEqual([])
    // the candles' figures, the series beneath them and the line of their fold; a pane of series alone
    // has no line of its own to keep, and does not fold
    expect(legends.map(legend => legendLines(legend))).toEqual([3, 1, 2, 1])
    expect(legends.map(legendFolds)).toEqual([true, false, false, false])
    // closed: the figures and the fold, the series behind it
    expect(legendLines(legends[0]!, true)).toBe(2)
    expect(legendLines(legends[2]!, true)).toBe(2)
  })
})

describe('legendTops', () => {
  const PRICE = { id: 'price' as const, top: 0, height: 300 }
  const VOLUME = { id: 'volume' as const, top: 301, height: 99 }

  it('stands each legend at the top of its pane', () => {
    expect([...legendTops([PRICE, VOLUME], null)]).toEqual([['price', 0], ['volume', 301]])
  })

  /** A folded pane keeps 2 px the library draws nothing in: its legend is a line of the whole-height pane. */
  it('stands a folded pane above the whole-height one as its first line, and pushes its legend down', () => {
    const tops = legendTops([{ ...PRICE, height: 2 }, { ...VOLUME, top: 3, height: 397 }], 'volume')
    expect(tops.get('price')).toBe(3)
    expect(tops.get('volume')).toBe(3 + LEGEND_LINE)
  })

  it('stands a folded pane below the whole-height one just over its seam', () => {
    const tops = legendTops([{ ...PRICE, height: 397 }, { ...VOLUME, top: 398, height: 2 }], 'price')
    expect(tops.get('price')).toBe(0)
    expect(tops.get('volume')).toBe(397 - LEGEND_LINE)
  })

  /** A folded legend of several lines — the candles' figures and a series on them — takes that many. */
  it('stacks the folded legends by the lines each takes', () => {
    const MACD = { id: 'macd', top: 402, height: 2 }
    const tops = legendTops([{ ...PRICE, height: 2 }, { ...VOLUME, top: 3, height: 2 }, { ...MACD, top: 6, height: 394 }], 'macd',
      pane => pane === 'price' ? 3 : 1)
    expect(tops.get('price')).toBe(6)
    expect(tops.get('volume')).toBe(6 + 3 * LEGEND_LINE)
    expect(tops.get('macd')).toBe(6 + 4 * LEGEND_LINE)
  })

  it('places by the panes alone where the pane named is not among them', () => {
    expect([...legendTops([PRICE], 'volume')]).toEqual([['price', 0]])
  })
})
