import type { ChartLayer, ChartLayerId, LineDrawing, SegmentDrawing } from '@/types/chart_drawing_types'
import type { ChartMark } from '@/types/run_chart_types'

/**
 * Where a chart's own drawings stand on screen, and which one is under the pointer — plain
 * functions over the scales, so they are tested without a canvas. The drawing host asks the chart
 * library for the scales and paints what is placed here.
 */

/** Where the chart puts a time and a price, in the pane's CSS pixels — null off its scale. */
export interface ChartScale {
  x: (time: number) => number | null
  y: (price: number) => number | null
  /** The width of a bar on screen. */
  spacing: number
  /** The pane's width — where a segment open to the right ends. */
  width: number
}

/** A bar's range: its marks stand away from it, above its high or below its low. */
export interface BarRange {
  high: number
  low: number
}

const MARK_MIN_PX = 5
const MARK_MAX_PX = 12
/** The room between a bar and its first mark, and between two marks of one bar. */
const MARK_GAP_PX = 2
/** The height of a mark's text — its count, or an exit's sign. */
export const MARK_TEXT_PX = 10
/** How far from a level or a line the pointer may rest and still be on it. */
const HIT_TOLERANCE_PX = 4
/** How far a level known at one bar alone reaches back from it: a short stroke, never a span. */
const LEVEL_AT_PX = 24

/**
 * The size a mark is drawn at: as wide as its bar, between a floor still readable and the library's
 * own 12 px — its markers were never narrower, so on a long window they covered their neighbours.
 * The mark of the position looked at is drawn half as large again.
 */
export function markSize(spacing: number, focused = false): number {
  const size = Math.min(MARK_MAX_PX, Math.max(MARK_MIN_PX, Math.round(spacing)))
  return focused ? Math.round(size * 1.5) : size
}

/** The room a mark takes away from its bar: its shape, a gap, and its text where it has one. */
function reach(mark: ChartMark, size: number): number {
  return size + MARK_GAP_PX + (mark.text ? MARK_TEXT_PX + 1 : 0)
}

export interface PlacedMark {
  mark: ChartMark
  x: number
  y: number
  size: number
  /** Where its text stands, beyond the shape — null without text. */
  textY: number | null
}

export interface PlacedSegment {
  segment: SegmentDrawing
  x1: number
  x2: number
  y: number
}

export interface PlacedLine {
  line: LineDrawing
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PlacedLayer {
  id: ChartLayerId
  /** The share of its strength it is painted at, 0–1. */
  opacity: number
  marks: PlacedMark[]
  segments: PlacedSegment[]
  lines: PlacedLine[]
  /** How far the marks reach beyond their bars, above and below — room the price scale has to leave. */
  reach: { above: number, below: number }
}

/**
 * One layer, placed. Marks stack away from their bar — above its high, below its low — each beyond
 * the one before, its text beyond its shape. A segment open to the right runs to the pane's edge.
 * What falls off the scale is left out, never drawn at a guessed place.
 */
export function placeLayer(layer: ChartLayer, bars: ReadonlyMap<number, BarRange>, scale: ChartScale): PlacedLayer {
  const placed: PlacedLayer = {
    id: layer.id, opacity: layer.opacity ?? 1, marks: [], segments: [], lines: [], reach: { above: 0, below: 0 },
  }
  const taken = new Map<string, number>()
  for (const drawing of layer.drawings) {
    if (drawing.kind === 'marker') {
      const x = scale.x(drawing.time)
      const bar = bars.get(drawing.time)
      if (x === null || !bar) continue
      const above = drawing.position === 'aboveBar'
      const edge = scale.y(above ? bar.high : bar.low)
      if (edge === null) continue
      const size = markSize(scale.spacing, drawing.focused)
      const key = `${drawing.time}|${drawing.position}`
      const before = taken.get(key) ?? 0
      const after = before + reach(drawing, size)
      taken.set(key, after)
      if (above) placed.reach.above = Math.max(placed.reach.above, after)
      else placed.reach.below = Math.max(placed.reach.below, after)
      const offset = MARK_GAP_PX + before + size / 2
      const y = above ? edge - offset : edge + offset
      const beyond = size / 2 + 1 + MARK_TEXT_PX / 2
      placed.marks.push({ mark: drawing, x, y, size, textY: drawing.text ? (above ? y - beyond : y + beyond) : null })
    } else if (drawing.kind === 'segment') {
      const x2 = drawing.to === null ? scale.width : scale.x(drawing.to)
      // known at one bar alone: a stroke ending at it, so no time before it is drawn as held
      const x1 = drawing.from === drawing.to ? (x2 === null ? null : x2 - LEVEL_AT_PX) : scale.x(drawing.from)
      const y = scale.y(drawing.price)
      if (x1 === null || x2 === null || y === null) continue
      placed.segments.push({ segment: drawing, x1, x2, y })
    } else {
      const x1 = scale.x(drawing.from.time)
      const y1 = scale.y(drawing.from.price)
      const x2 = scale.x(drawing.to.time)
      const y2 = scale.y(drawing.to.price)
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue
      placed.lines.push({ line: drawing, x1, y1, x2, y2 })
    }
  }
  return placed
}

/** The distance from a point to a stretch between two others. */
function distanceToStretch(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = dx * dx + dy * dy
  const along = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length))
  return Math.hypot(x - (x1 + along * dx), y - (y1 + along * dy))
}

/** What the pointer rests on: its id, how far it is, and whether it is a point (a mark) or a line. */
export interface DrawingHit {
  id: string
  distance: number
  point: boolean
}

/**
 * The drawing under the pointer, from the layer in front down — the order they are painted in,
 * reversed, so what is seen on top is what is found. Within a layer a mark wins over a line, the
 * way the library ranks a point over a stroke; the nearest of each kind is taken.
 */
export function hitDrawing(layers: readonly PlacedLayer[], x: number, y: number): DrawingHit | null {
  for (let index = layers.length - 1; index >= 0; index--) {
    const layer = layers[index]!
    let best: DrawingHit | null = null
    for (const placed of layer.marks) {
      const half = placed.size / 2 + 2
      const onShape = Math.abs(x - placed.x) <= half && Math.abs(y - placed.y) <= half
      const onText = placed.textY !== null && Math.abs(x - placed.x) <= MARK_TEXT_PX
        && Math.abs(y - placed.textY) <= MARK_TEXT_PX / 2 + 1
      if (!onShape && !onText) continue
      const distance = Math.hypot(x - placed.x, y - placed.y)
      if (!best || distance < best.distance) best = { id: placed.mark.id, distance, point: true }
    }
    if (best) return best
    for (const placed of layer.lines) {
      const distance = distanceToStretch(x, y, placed.x1, placed.y1, placed.x2, placed.y2)
      if (distance <= HIT_TOLERANCE_PX && (!best || distance < best.distance)) {
        best = { id: placed.line.id, distance, point: false }
      }
    }
    for (const placed of layer.segments) {
      const distance = Math.abs(y - placed.y)
      const within = x >= Math.min(placed.x1, placed.x2) - HIT_TOLERANCE_PX
        && x <= Math.max(placed.x1, placed.x2) + HIT_TOLERANCE_PX
      if (within && distance <= HIT_TOLERANCE_PX && (!best || distance < best.distance)) {
        best = { id: placed.segment.id, distance, point: false }
      }
    }
    if (best) return best
  }
  return null
}
