import { describe, it, expect, vi } from 'vitest'
import { ChartDrawingHost, paintLayer, type DrawingColours } from '@/components/chart_drawing_host'
import { placeLayer, type BarRange } from '@/components/chart_geometry'
import type { ChartLayer } from '@/types/chart_drawing_types'
import type { ChartMark } from '@/types/run_chart_types'

/**
 * The chart's own drawings, painted by one series primitive. The library is replaced by the few
 * calls the host makes — a bar's time to x, a price to y, the bars in view — and the canvas by a
 * context that records what it was told to draw: jsdom has no canvas, and what is painted is a
 * sequence of calls, which a recording can be asked about.
 */

const COLOURS: DrawingColours = {
  roles: { positive: '#0a0', negative: '#a00', flat: '#888', mixed: '#888', entry: '#fff', annotation: '#f0f' },
  surface: '#111',
}
const BARS = new Map<number, BarRange>([[1, { high: 300, low: 200 }], [2, { high: 310, low: 210 }]])

function mark(fields: Partial<ChartMark>): ChartMark {
  return {
    kind: 'marker', time: 1, at: 1, position: 'aboveBar', shape: 'circle', role: 'positive', text: '+', focused: false,
    id: 'exit|a', card: { title: 'a', details: [] }, line: { label: 'a', value: '' },
    ...fields,
  }
}

const LAYERS: ChartLayer[] = [
  {
    id: 'levels',
    drawings: [{
      kind: 'segment', id: 'level|SL|a', from: 1, to: 2, price: 250, label: 'SL', role: 'negative', focused: true,
      card: { title: 'Stop loss · a', details: [] },
    }, {
      // another position's stop, drawn where the reader asks for every position's levels
      kind: 'segment', id: 'level|SL|b', from: 1, to: 2, price: 220, label: 'SL', role: 'negative', focused: false,
      card: { title: 'Stop loss · b', details: [] },
    }],
  },
  { id: 'trades', drawings: [mark({}), mark({ id: 'entry|a', shape: 'arrowUp', position: 'belowBar', role: 'entry', text: '' })] },
]

/** A library that places bar `t` at x = 10·t and price `p` at y = 500 − p, ten bars in view on 800 px. */
function attachTo(host: ChartDrawingHost): { requestUpdate: ReturnType<typeof vi.fn> } {
  const requestUpdate = vi.fn()
  const timeScale = {
    timeToCoordinate: (time: number) => time * 10,
    getVisibleLogicalRange: () => ({ from: 0, to: 10 }),
    width: () => 800,
  }
  const chart = { timeScale: () => timeScale, options: () => ({ layout: { fontFamily: 'Probe Sans' } }) }
  const series = { priceToCoordinate: (price: number) => 500 - price, priceFormatter: () => ({ format: (price: number) => price.toFixed(2) }) }
  host.attached({ chart, series, requestUpdate } as never)
  return { requestUpdate }
}

/** A canvas context that records the calls a painting made. */
function recordingContext(): { context: CanvasRenderingContext2D, calls: string[] } {
  const calls: string[] = []
  const record = (name: string) => (...args: unknown[]) => { calls.push(`${name}(${args.join(',')})`) }
  const context = new Proxy({} as Record<string, unknown>, {
    get: (target, name: string) => target[name] ?? record(name),
    set: (target, name: string, value) => { calls.push(`${name}=${value}`); target[name] = value; return true },
  })
  return { context: context as unknown as CanvasRenderingContext2D, calls }
}

describe('ChartDrawingHost', () => {
  it('asks the library to draw again whenever it is handed something to draw', () => {
    const host = new ChartDrawingHost()
    const { requestUpdate } = attachTo(host)
    host.setDrawings(LAYERS, BARS, COLOURS)
    expect(requestUpdate).toHaveBeenCalledTimes(1)
  })

  /** The library caches by the array it is handed, so the host hands the same one every time. */
  it('hands the library one pane view, the same array every time, in the stage in front of the candles', () => {
    const host = new ChartDrawingHost()
    expect(host.paneViews()).toBe(host.paneViews())
    expect(host.paneViews()[0]!.zOrder!()).toBe('normal')
  })

  it('answers a hit with the drawing\'s id, a mark ranked as a point above a stroke', () => {
    const host = new ChartDrawingHost()
    attachTo(host)
    host.setDrawings(LAYERS, BARS, COLOURS)
    // the level at price 250 stands at y 250, from x 10 to 20
    expect(host.hitTest(15, 250)).toMatchObject({ externalId: 'level|SL|a', zOrder: 'normal', hitTestPriority: 1 })
    const placed = placeLayer(LAYERS[1]!, BARS, { x: time => time * 10, y: price => 500 - price, spacing: 80, width: 800 })
    const exit = placed.marks.find(entry => entry.mark.id === 'exit|a')!
    expect(host.hitTest(exit.x, exit.y)).toMatchObject({ externalId: 'exit|a', hitTestPriority: 2, itemType: 'marker' })
    expect(host.hitTest(700, 20)).toBeNull()
  })

  /** Every position's levels would bury the axis in tags: only the position looked at puts its prices there. */
  it('puts the price of each level of the position looked at on the axis, in the colour of its role', () => {
    const host = new ChartDrawingHost()
    attachTo(host)
    host.setDrawings(LAYERS, BARS, COLOURS)
    const labels = host.priceAxisViews()
    expect(labels).toHaveLength(1)
    expect([labels[0]!.text(), labels[0]!.coordinate(), labels[0]!.backColor(), labels[0]!.textColor()])
      .toEqual(['250.00', 250, '#a00', '#111'])
  })

  /** A layer set fainter is painted at its share, whole; a layer as it is, at full strength. */
  it('paints a layer at the opacity it was given, and leaves the others at full strength', () => {
    const scale = { x: (time: number) => time * 10, y: (price: number) => 500 - price, spacing: 80, width: 800 }
    const faint = recordingContext()
    paintLayer(faint.context, placeLayer({ ...LAYERS[1]!, opacity: 0.4 }, BARS, scale), COLOURS, '10px Probe Sans', 400)
    expect(faint.calls).toContain('globalAlpha=0.4')
    const plain = recordingContext()
    paintLayer(plain.context, placeLayer(LAYERS[1]!, BARS, scale), COLOURS, '10px Probe Sans', 400)
    expect(plain.calls.some(call => call.startsWith('globalAlpha='))).toBe(false)
  })

  /**
   * Room beyond the candles for the marks, and the levels of the position looked at inside the scale
   * — a stop beyond the candles was drawn where nobody saw it. Another position's level does not
   * stretch the scale.
   */
  it('asks the price scale for room for its marks and for the levels looked at, and for nothing without them', () => {
    const host = new ChartDrawingHost()
    attachTo(host)
    host.setDrawings(LAYERS, BARS, COLOURS)
    const room = host.autoscaleInfo()!
    expect(room.priceRange).toEqual({ minValue: 250, maxValue: 250 })
    expect(room.margins!.above).toBeGreaterThan(0)
    expect(room.margins!.below).toBeGreaterThan(0)
    host.setDrawings([LAYERS[1]!], BARS, COLOURS)
    expect(host.autoscaleInfo()!.priceRange).toBeNull()
    host.setDrawings([], BARS, COLOURS)
    expect(host.autoscaleInfo()).toBeNull()
  })

  /**
   * A layer switched off is neither painted nor hit nor on the axis, and its marks keep their room:
   * switching the trades off once stretched the candles to the room they had left. A hidden level
   * stops widening the scale, since nobody is looking at it.
   */
  it('keeps the room of a hidden layer\'s marks, and paints, hits and labels nothing of it', () => {
    const host = new ChartDrawingHost()
    attachTo(host)
    host.setDrawings(LAYERS, BARS, COLOURS)
    const shown = host.autoscaleInfo()!.margins
    host.setDrawings(LAYERS.map(layer => ({ ...layer, hidden: true })), BARS, COLOURS)
    expect(host.autoscaleInfo()!.margins).toEqual(shown)
    expect(host.autoscaleInfo()!.priceRange).toBeNull()
    expect(host.priceAxisViews()).toHaveLength(0)
    expect(host.hitTest(15, 250)).toBeNull()
    const { context, calls } = recordingContext()
    host.paneViews()[0]!.renderer()!.draw({ useMediaCoordinateSpace: (paint: (scope: { context: CanvasRenderingContext2D }) => void) => paint({ context }) } as never)
    expect(calls.filter(call => call.startsWith('fill(') || call.startsWith('stroke('))).toEqual([])
  })

  /** A level is a dashed rule with its word; a mark its shape and its sign beyond it, in one colour. */
  it('paints a level dashed with its word, and a mark with its sign in the colour of its role', () => {
    const placed = LAYERS.map(layer => placeLayer(layer, BARS, { x: time => time * 10, y: price => 500 - price, spacing: 80, width: 800 }))
    const { context, calls } = recordingContext()
    for (const layer of placed) paintLayer(context, layer, COLOURS, '10px Probe Sans', 400)
    expect(calls).toContain('setLineDash(4,3)')
    expect(calls.some(call => call.startsWith('fillText(SL,'))).toBe(true)
    expect(calls).toContain('strokeStyle=#a00')
    // the exit's circle and its sign, in the gain colour; the entry's arrow in plain ink
    expect(calls.some(call => call.startsWith('arc('))).toBe(true)
    expect(calls.some(call => call.startsWith('fillText(+,'))).toBe(true)
    expect(calls).toContain('fillStyle=#0a0')
    expect(calls).toContain('fillStyle=#fff')
  })

  /**
   * The trades' signs switched off: no text is painted, and its room stays, so the switch rescales
   * nothing — emptied, the text gave its room up and the chart moved (operator, on screen 2026-10-28).
   */
  it('keeps the room of a hidden text, and paints none of it', () => {
    const host = new ChartDrawingHost()
    attachTo(host)
    host.setDrawings(LAYERS, BARS, COLOURS)
    const signed = host.autoscaleInfo()!.margins
    const quiet = LAYERS.map(layer => ({
      ...layer,
      drawings: layer.drawings.map(drawing => drawing.kind === 'marker' ? { ...drawing, textHidden: true } : drawing),
    }))
    host.setDrawings(quiet, BARS, COLOURS)
    expect(host.autoscaleInfo()!.margins).toEqual(signed)
    const placed = quiet.map(layer => placeLayer(layer, BARS, { x: time => time * 10, y: price => 500 - price, spacing: 80, width: 800 }))
    const { context, calls } = recordingContext()
    for (const layer of placed) paintLayer(context, layer, COLOURS, '10px Probe Sans', 400)
    expect(calls.some(call => call.startsWith('fillText(+,'))).toBe(false)
  })

  /** A moment stands over the whole height of the pane, dashed: the role's second channel beside its hue. */
  it('paints a moment dashed over the height of the pane, in its role', () => {
    const scale = { x: (time: number) => time * 10, y: (price: number) => 500 - price, spacing: 10, width: 800 }
    const placed = placeLayer({
      id: 'state-frame',
      drawings: [{ kind: 'time', id: 'state-frame', time: 2, role: 'annotation', card: { title: 'a', details: [] } }],
    }, BARS, scale)
    const { context, calls } = recordingContext()
    paintLayer(context, placed, COLOURS, '10px Probe Sans', 400)
    expect(calls).toContain('strokeStyle=#f0f')
    expect(calls).toContain('setLineDash(4,3)')
    expect(calls).toContain('moveTo(20,0)')
    expect(calls).toContain('lineTo(20,400)')
  })
})
