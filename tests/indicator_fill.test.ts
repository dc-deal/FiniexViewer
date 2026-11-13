import { describe, it, expect } from 'vitest'
import { fillShapes } from '@/components/indicator_fill'
import type { IndicatorSeriesEntry } from '@/types/api/indicator_series_types'
import type { RecordedWindow } from '@/types/api/state_frame_types'
import windowFixture from './fixtures/recorded_window_series.json'

/** The series of the session FiniexTestingIDE produced to draw every kind of pane (contract 55). */
const SERIES = (windowFixture as RecordedWindow).indicator_series
const entry = (layer: string): IndicatorSeriesEntry => SERIES.find(item => item.layer === layer)!

/** A pane where a second is a pixel from the first bar on, and a price is its own pixel upside down. */
function scale(of: IndicatorSeriesEntry) {
  const start = Math.floor(Date.parse(of.times[0]!) / 1000)
  return { x: (time: number) => time - start, y: (price: number) => -price }
}

describe('fillShapes', () => {
  /** Their RSI: the band between its lines at 70 and 30, across the pane's whole width. */
  it('fills a band across the pane between two price lines', () => {
    const rsi = entry('worker:rsi_fast')
    const { x, y } = scale(rsi)
    expect(fillShapes(['price_line:70', 'price_line:30'], rsi, 400, x, y))
      .toEqual([[[0, -70], [400, -70], [400, -30], [0, -30]]])
  })

  /** Their Bollinger bands: the channel between the upper and the lower one, bar by bar. */
  it('fills between two plots bar by bar, along the top and back along the bottom', () => {
    const bands = entry('worker:bollinger_main')
    const { x, y } = scale(bands)
    const [shape] = fillShapes(['plot:upper', 'plot:lower'], bands, 400, x, y)
    const count = bands.times.length
    expect(shape).toHaveLength(2 * count)
    expect(shape![0]).toEqual([0, -bands.data['upper']![0]!])
    expect(shape!.at(-1)).toEqual([0, -bands.data['lower']![0]!])
  })

  /** A null is no value: nothing is filled across it, the area breaks in two. */
  it('breaks the area where either plot has a gap, and fills no lone bar', () => {
    const bands = entry('worker:bollinger_main')
    const times = ['2026-01-25T02:00:00Z', '2026-01-25T02:30:00Z', '2026-01-25T03:00:00Z', '2026-01-25T03:30:00Z', '2026-01-25T04:00:00Z']
    const gappy = { ...bands, times, data: { upper: [5, 6, null, 8, 9], lower: [1, 2, 3, 4, null] } }
    const { x, y } = scale(gappy)
    const shapes = fillShapes(['plot:upper', 'plot:lower'], gappy, 400, x, y)
    // the first two bars make an area; the fourth stands alone between two gaps and fills nothing
    expect(shapes).toEqual([[[0, -5], [1800, -6], [1800, -2], [0, -1]]])
  })

  /** Their document: never one edge of each kind — such a pair, or an edge of no known kind, fills nothing. */
  it('fills nothing for a mixed pair or an edge it does not know', () => {
    const rsi = entry('worker:rsi_fast')
    const { x, y } = scale(rsi)
    expect(fillShapes(['price_line:70', 'plot:rsi_value'], rsi, 400, x, y)).toEqual([])
    expect(fillShapes(['level:70', 'price_line:30'], rsi, 400, x, y)).toEqual([])
    expect(fillShapes(['price_line:', 'price_line:30'], rsi, 400, x, y)).toEqual([])
  })

  it('fills nothing where an edge is off the scale', () => {
    const rsi = entry('worker:rsi_fast')
    const { x } = scale(rsi)
    expect(fillShapes(['price_line:70', 'price_line:30'], rsi, 400, x, () => null)).toEqual([])
  })
})
