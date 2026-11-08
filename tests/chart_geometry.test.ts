import { describe, it, expect } from 'vitest'
import {
  LANE_STRIP_PX, MARK_TEXT_PX, hitDrawing, laneBox, markSize, placeLayer, type BarRange, type ChartScale,
} from '@/components/chart_geometry'
import type { LaneMarkDrawing, LineDrawing, SegmentDrawing, SpanDrawing } from '@/types/chart_drawing_types'
import type { ChartMark } from '@/types/run_chart_types'

/**
 * Where a chart's own drawings stand, and which one the pointer rests on — over a scale of plain
 * numbers, so nothing needs a canvas: bar `t` stands at x = 10·t, price `p` at y = 500 − p.
 */
const SCALE: ChartScale = {
  x: time => (time <= 100 ? time * 10 : null),
  y: price => 500 - price,
  spacing: 10,
  width: 800,
}
const BARS = new Map<number, BarRange>([[1, { high: 300, low: 200 }], [2, { high: 310, low: 210 }]])

function mark(fields: Partial<ChartMark>): ChartMark {
  return {
    kind: 'marker', time: 1, at: 1, position: 'aboveBar', shape: 'circle', role: 'positive', text: '', focused: false,
    id: 'exit|a', card: { title: 'a', details: [] }, line: { label: 'a', value: '' },
    ...fields,
  }
}

const SEGMENT: SegmentDrawing = {
  kind: 'segment', id: 'level|SL|a', from: 1, to: 2, price: 250, label: 'SL', role: 'negative', focused: true,
  card: { title: 'Stop loss · a', details: [] },
}
const LINE: LineDrawing = {
  kind: 'line', id: 'line|a', from: { time: 1, price: 250 }, to: { time: 2, price: 290 }, role: 'positive',
  card: { title: 'a', details: [] },
}

describe('chart_geometry', () => {
  /** As wide as a bar, never narrower than a readable floor, never wider than the library's 12 px. */
  it('sizes a mark to its bar, within a floor and a ceiling, the one looked at larger', () => {
    expect(markSize(0.3)).toBe(5)
    expect(markSize(8)).toBe(8)
    expect(markSize(40)).toBe(12)
    expect(markSize(8, true)).toBe(12)
  })

  /** A mark stands beyond its bar — above its high, below its low — and the next one beyond it. */
  it('stacks the marks of a bar away from it, each beyond the one before, its text beyond its shape', () => {
    const placed = placeLayer({
      id: 'trades',
      drawings: [mark({ id: 'one' }), mark({ id: 'two', text: '+' }), mark({ id: 'low', position: 'belowBar' })],
    }, BARS, SCALE)
    const [one, two, low] = placed.marks
    // the high of bar 1 stands at y 200: the first mark just above it, the second above the first
    expect(one!.y).toBeLessThan(200)
    expect(two!.y).toBeLessThan(one!.y - one!.size / 2)
    expect(two!.textY).toBeLessThan(two!.y)
    expect(one!.textY).toBeNull()
    // below the low of bar 1, at y 300
    expect(low!.y).toBeGreaterThan(300)
    expect(placed.reach.above).toBeGreaterThan(placed.reach.below)
    expect(placed.reach.above).toBeGreaterThanOrEqual(2 * one!.size + MARK_TEXT_PX)
  })

  it('leaves out what falls off the scale, rather than drawing it at a guessed place', () => {
    const placed = placeLayer({ id: 'trades', drawings: [mark({ time: 200 }), mark({ time: 3 })] }, BARS, SCALE)
    expect(placed.marks).toEqual([])
  })

  it('runs a level from its first bar to its last, and one open to the right to the edge', () => {
    const placed = placeLayer({ id: 'levels', drawings: [SEGMENT, { ...SEGMENT, id: 'open', to: null }] }, BARS, SCALE)
    expect(placed.segments.map(segment => [segment.x1, segment.x2, segment.y])).toEqual([[10, 20, 250], [10, 800, 250]])
  })

  /** A level known at one bar alone, as a trade row's is at its exit: a short stroke ending there, no span. */
  it('draws a level known at one bar alone as a short stroke ending at that bar', () => {
    const placed = placeLayer({ id: 'levels', drawings: [{ ...SEGMENT, from: 2, to: 2 }] }, BARS, SCALE)
    expect(placed.segments.map(segment => [segment.x1, segment.x2, segment.y])).toEqual([[-4, 20, 250]])
  })

  it('joins a line\'s two points', () => {
    const placed = placeLayer({ id: 'entry-exit', drawings: [LINE] }, BARS, SCALE)
    expect(placed.lines[0]).toMatchObject({ x1: 10, y1: 250, x2: 20, y2: 210 })
  })

  /**
   * What is seen in front is what is found: the layers are searched front first, and within one a
   * mark wins over the line beneath it.
   */
  describe('hitDrawing', () => {
    const levels = placeLayer({ id: 'levels', drawings: [SEGMENT] }, BARS, SCALE)
    const lines = placeLayer({ id: 'entry-exit', drawings: [LINE] }, BARS, SCALE)
    const trades = placeLayer({ id: 'trades', drawings: [mark({ id: 'exit|front' })] }, BARS, SCALE)

    it('finds a mark under the pointer, by its shape and by its text', () => {
      const placed = trades.marks[0]!
      expect(hitDrawing([trades], placed.x, placed.y)).toMatchObject({ id: 'exit|front', point: true })
      const withText = placeLayer({ id: 'trades', drawings: [mark({ id: 'counted', text: '×3' })] }, BARS, SCALE).marks[0]!
      expect(hitDrawing([placeLayer({ id: 'trades', drawings: [withText.mark] }, BARS, SCALE)], withText.x, withText.textY!))
        .toMatchObject({ id: 'counted' })
    })

    it('finds a level near its rule, and a line near its stretch — within a few pixels', () => {
      expect(hitDrawing([levels], 15, 252)).toMatchObject({ id: 'level|SL|a', point: false })
      expect(hitDrawing([levels], 15, 260)).toBeNull()
      expect(hitDrawing([lines], 15, 230)).toMatchObject({ id: 'line|a' })
    })

    it('searches the layer in front first', () => {
      const covering = placeLayer({ id: 'entry-exit', drawings: [{ ...LINE, id: 'line|front', from: { time: 1, price: 250 }, to: { time: 2, price: 250 } }] }, BARS, SCALE)
      expect(hitDrawing([levels, covering], 15, 250)).toMatchObject({ id: 'line|front' })
      expect(hitDrawing([covering, levels], 15, 250)).toMatchObject({ id: 'level|SL|a' })
    })

    /** A moment is found anywhere along its height, and a mark in a layer in front of it wins. */
    it('finds a moment near its rule, and the mark in front of it first', () => {
      const moment = placeLayer({
        id: 'state-frame',
        drawings: [{ kind: 'time', id: 'state-frame', time: 1, role: 'annotation', card: { title: 'a', details: [] } }],
      }, BARS, SCALE)
      const x = moment.times[0]!.x
      expect(x).toBe(10)
      expect(hitDrawing([moment], x + 3, 400)).toMatchObject({ id: 'state-frame', point: false })
      expect(hitDrawing([moment], x + 6, 400)).toBeNull()
      const mark = trades.marks[0]!
      expect(hitDrawing([moment, trades], mark.x, mark.y)).toMatchObject({ id: 'exit|front', point: true })
      // off the time scale it is left out, never drawn at a guessed place
      expect(placeLayer({
        id: 'state-frame',
        drawings: [{ kind: 'time', id: 'state-frame', time: 500, role: 'annotation', card: { title: 'a', details: [] } }],
      }, BARS, SCALE).times).toEqual([])
    })

    it('finds nothing where nothing is drawn', () => {
      expect(hitDrawing([levels, lines, trades], 700, 20)).toBeNull()
    })
  })

  /**
   * The time lane along the bottom of the pane (viewer#41, section D): the booking periods' strip at the
   * bottom, the orders refused or expired in a row above it — only the rows something is drawn in.
   */
  describe('the time lane', () => {
    const SPAN: SpanDrawing = {
      kind: 'span', id: 'period|u|1', from: 1, to: 3, endsAtOpen: false, label: '+', role: 'positive',
      card: { title: 'u · booking period 1', details: [] },
    }
    const REFUSED: LaneMarkDrawing = {
      kind: 'lane-mark', id: 'order|u|1', time: 2, at: 2, shape: 'cross', text: '×3', role: 'warning',
      card: { title: '3 orders refused', details: [] },
    }

    it('takes from the bottom only the rows something is drawn in', () => {
      expect(laneBox(400, { strip: false, marks: false })).toBeNull()
      const strip = laneBox(400, { strip: true, marks: false })!
      expect(strip.stripTop + strip.stripHeight).toBeLessThan(400)
      expect(strip.markY).toBeNull()
      const both = laneBox(400, { strip: true, marks: true })!
      // the marks' row stands above the strip, and the lane is taller by it
      expect(both.markY!).toBeLessThan(both.stripTop)
      expect(both.height).toBeGreaterThan(strip.height)
      expect(laneBox(400, { strip: false, marks: true })!.stripHeight).toBe(0)
    })

    it('runs a period from the left edge of its first bar to the right edge of its last, or to the left edge where it closed at the open of that bar', () => {
      const scale = { ...SCALE, lane: laneBox(400, { strip: true, marks: false }) }
      const [placed] = placeLayer({ id: 'periods', drawings: [SPAN] }, BARS, scale).spans
      expect([placed!.x1, placed!.x2]).toEqual([5, 35])
      expect(placed!.height).toBe(LANE_STRIP_PX)
      const [atOpen] = placeLayer({ id: 'periods', drawings: [{ ...SPAN, endsAtOpen: true }] }, BARS, scale).spans
      expect(atOpen!.x2).toBe(25)
    })

    it('stands an order in the row of the marks at its bar, and nothing of the lane without one', () => {
      const scale = { ...SCALE, lane: laneBox(400, { strip: true, marks: true }) }
      const placed = placeLayer({ id: 'refusals', drawings: [REFUSED] }, BARS, scale)
      expect(placed.laneMarks[0]).toMatchObject({ x: 20, y: scale.lane!.markY })
      expect(placeLayer({ id: 'refusals', drawings: [REFUSED] }, BARS, SCALE).laneMarks).toEqual([])
      expect(placeLayer({ id: 'periods', drawings: [SPAN] }, BARS, SCALE).spans).toEqual([])
    })

    it('finds an order as a point and a period anywhere in its strip', () => {
      const scale = { ...SCALE, lane: laneBox(400, { strip: true, marks: true }) }
      const periods = placeLayer({ id: 'periods', drawings: [SPAN] }, BARS, scale)
      const refusals = placeLayer({ id: 'refusals', drawings: [REFUSED] }, BARS, scale)
      const stripY = scale.lane!.stripTop + 2
      expect(hitDrawing([periods, refusals], 12, stripY)).toMatchObject({ id: 'period|u|1', point: false })
      expect(hitDrawing([periods, refusals], 20, scale.lane!.markY!)).toMatchObject({ id: 'order|u|1', point: true })
      expect(hitDrawing([periods, refusals], 50, stripY)).toBeNull()
    })
  })
})
