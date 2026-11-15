import type {
  AutoscaleInfo, IChartApiBase, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive,
  ISeriesPrimitiveAxisView, PrimitiveHoveredItem, SeriesAttachedParameter, SeriesType, Time,
} from 'lightweight-charts'
import {
  MARK_TEXT_PX, hitDrawing, laneBox, placeLayer, type BarRange, type ChartScale, type LaneBox, type PlacedLayer,
} from '@/components/chart_geometry'
import type { ChartLayer, DrawingRole } from '@/types/chart_drawing_types'

/** The canvas target the library hands a renderer — taken from its own signature, not a second import. */
type CanvasTarget = Parameters<IPrimitivePaneRenderer['draw']>[0]

/**
 * What the host paints with, read from the theme tokens by the chart that owns it: a canvas is
 * painted with values, so the theme reaches it only through the chart.
 */
export interface DrawingColours {
  roles: Record<DrawingRole, string>
  /** The chart's surface — the ink of a label on a coloured axis tag. */
  surface: string
  /** Plain ink — a word inside a shape filled in its role, where the role's own colour would vanish. */
  ink: string
}

/** A bar on screen when nothing has been drawn yet — the library's own default spacing. */
const DEFAULT_SPACING = 6
/** How strong a booking period's strip is filled: quiet, so the candles above it read first. */
const SPAN_FILL = 0.35

/**
 * The chart's own drawings, painted by ONE series primitive (viewer#41, decided 2026-10-19). One
 * host for every layer, not a primitive per layer: the library paints primitives in the order they
 * were attached and hit-tests them in another, so reordering layers would mean detaching and
 * attaching them again — here the order is a list, painted front last and searched front first.
 *
 * It draws in the library's `top` stage, in front of every series of its pane — the candles, and a
 * worker's series on them (contract 55): what the run did stands over what its workers computed. The marks of the trades moved
 * here from the library's markers, which stood fixed directly behind the candles' own drawing and so
 * could take no place in an order of layers; drawn here they also size to the bar, where the
 * library's never went below 12 px.
 */
export class ChartDrawingHost implements ISeriesPrimitive<Time> {
  private _chart: IChartApiBase<Time> | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _requestUpdate: (() => void) | null = null
  private _layers: ChartLayer[] = []
  private _bars: ReadonlyMap<number, BarRange> = new Map()
  private _colours: DrawingColours | null = null
  private _font = `${MARK_TEXT_PX}px sans-serif`
  private _placed: PlacedLayer[] = []
  private _reach = { above: 0, below: 0 }
  private _lane: LaneBox | null = null
  /** The share of the pane's height the lane takes, as last told — measured here, where the pane's height is current. */
  private _laneShare = 0
  private _onLaneShare: ((share: number) => void) | null = null
  /** The drawing under the pointer, as the chart last reported it — a span's bounds are drawn while it is. */
  private _hovered: string | null = null
  private _axisViews: readonly ISeriesPrimitiveAxisView[] = []
  // the library caches by the array it is handed, so the same one is handed every time
  private readonly _views: readonly IPrimitivePaneView[]

  constructor() {
    const renderer: IPrimitivePaneRenderer = { draw: target => this._draw(target) }
    this._views = [{ zOrder: () => 'top', renderer: () => renderer }]
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart = param.chart
    this._series = param.series
    this._requestUpdate = param.requestUpdate
    this._font = `${MARK_TEXT_PX}px ${param.chart.options().layout.fontFamily}`
    this._place()
  }

  detached(): void {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }

  /** What to draw: the layers in order, the bars the marks stand away from, the colours of the roles. */
  setDrawings(layers: ChartLayer[], bars: ReadonlyMap<number, BarRange>, colours: DrawingColours): void {
    this._layers = layers
    this._bars = bars
    this._colours = colours
    this._place()
    this._requestUpdate?.()
  }

  /**
   * Told the share of the pane's height the time lane takes, each time it changes: the volume, on a
   * scale of its own the lane does not reach, stands above it by that share. Only here is the pane's
   * height current — after a resize the library lays the pane out at its next frame.
   */
  onLaneShare(callback: (share: number) => void): void {
    this._onLaneShare = callback
  }

  /** The drawing under the pointer, or null: a booking period's bounds run through the candles while it is hovered. */
  setHovered(id: string | null): void {
    if (id === this._hovered) return
    this._hovered = id
    this._requestUpdate?.()
  }

  /** Called by the library whenever the view moves: everything stands somewhere else now. */
  updateAllViews(): void {
    this._place()
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._views
  }

  /** The price of each level of the position looked at on the axis, in the colour of its role. */
  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._axisViews
  }

  /**
   * Room above and below the candles for the marks that stand beyond them, so the price scale
   * leaves it rather than cutting the outermost ones off — and the levels of the position looked at
   * inside the scale. A stop or a target usually stands beyond the candles on screen, and asked for
   * no room it was drawn off the scale, where nobody saw it (#41's browser pass, 2026-10-19). Only the
   * position looked at: every position's levels would squash the candles into a line, and a reader
   * who wants the candles' full height hides the levels in the Layers panel.
   */
  autoscaleInfo(): AutoscaleInfo | null {
    // the room counts a hidden layer's marks too, so switching one rescales nothing; a level widens
    // the scale only while its layer is shown, since a hidden one is not looked at
    const prices = this._layers.filter(layer => !layer.hidden).flatMap(layer => layer.drawings)
      .flatMap(drawing => drawing.kind === 'segment' && drawing.focused ? [drawing.price] : [])
    if (!prices.length && !this._reach.above && !this._reach.below) return null
    return {
      priceRange: prices.length ? { minValue: Math.min(...prices), maxValue: Math.max(...prices) } : null,
      margins: { above: this._reach.above, below: this._reach.below },
    }
  }

  /** The drawing under the pointer, its id reported by the library as `hoveredInfo.objectId`. */
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const hit = hitDrawing(this._shown(), x, y)
    if (!hit) return null
    return {
      externalId: hit.id,
      zOrder: 'top',
      distance: hit.distance,
      // a point outranks a stroke where both are hit, the way the library ranks its own
      hitTestPriority: hit.point ? 2 : 1,
      itemType: hit.point ? 'marker' : 'primitive',
    }
  }

  /** The placed layers that are painted — a hidden one only keeps its room. */
  private _shown(): PlacedLayer[] {
    return this._placed.filter(layer => !layer.hidden)
  }

  private _scale(): ChartScale | null {
    const chart = this._chart
    const series = this._series
    if (!chart || !series) return null
    const timeScale = chart.timeScale()
    const range = timeScale.getVisibleLogicalRange()
    const width = timeScale.width()
    const bars = range ? range.to - range.from : 0
    // the lane's rows from every layer's drawings, a hidden layer's too: switching one rescales nothing
    const drawings = this._layers.flatMap(layer => layer.drawings)
    const height = chart.paneSize(0).height
    this._lane = laneBox(height, {
      strip: drawings.some(drawing => drawing.kind === 'span'),
      marks: drawings.some(drawing => drawing.kind === 'lane-mark'),
    })
    // the volume stands above the lane while something of it is shown; with all of it switched off it
    // sinks into the lane's room, which the candles' scale keeps free, so nothing of the candles moves
    // (operator, on screen 2026-11-12: it floated over an empty band)
    const shown = this._layers.some(layer => !layer.hidden
      && layer.drawings.some(drawing => drawing.kind === 'span' || drawing.kind === 'lane-mark'))
    const share = this._lane && height > 0 && shown ? this._lane.height / height : 0
    if (share !== this._laneShare) {
      this._laneShare = share
      this._onLaneShare?.(share)
    }
    return {
      x: time => timeScale.timeToCoordinate(time as Time),
      y: price => series.priceToCoordinate(price),
      spacing: bars > 0 ? width / bars : DEFAULT_SPACING,
      width,
      lane: this._lane,
    }
  }

  private _place(): void {
    const scale = this._scale()
    this._placed = scale ? this._layers.map(layer => placeLayer(layer, this._bars, scale)) : []
    // the lane takes the bottom of the pane: the price scale leaves it free below the lowest marks
    this._reach = {
      above: Math.max(0, ...this._placed.map(layer => layer.reach.above)),
      below: Math.max(0, ...this._placed.map(layer => layer.reach.below)) + (this._lane?.height ?? 0),
    }
    const series = this._series
    const colours = this._colours
    // only the levels of the position looked at: every position's would bury the axis in tags
    this._axisViews = series && colours
      ? this._shown().flatMap(layer => layer.segments).filter(placed => placed.segment.focused).map(placed => {
        const text = series.priceFormatter().format(placed.segment.price)
        return {
          coordinate: () => placed.y,
          text: () => text,
          textColor: () => colours.surface,
          backColor: () => colours.roles[placed.segment.role],
        }
      })
      : []
  }

  private _draw(target: CanvasTarget): void {
    const colours = this._colours
    if (!colours) return
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      for (const layer of this._shown()) paintLayer(context, layer, colours, this._font, mediaSize.height)
      const hovered = this._shown().flatMap(layer => layer.spans).find(placed => placed.span.id === this._hovered)
      if (hovered) paintBounds(context, hovered.x1, hovered.x2, hovered.y, colours.roles.annotation)
    })
  }
}

/** A booking period's two bounds, dashed through the candles above the lane while it is hovered. */
export function paintBounds(context: CanvasRenderingContext2D, x1: number, x2: number, bottom: number, colour: string): void {
  context.save()
  context.strokeStyle = colour
  context.lineWidth = 1
  context.setLineDash([4, 3])
  for (const x of [x1, x2]) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, bottom)
    context.stroke()
  }
  context.restore()
}

/**
 * One placed layer onto the canvas: a moment as a dashed rule over the pane's `height`, the time lane's
 * periods and orders, its levels as dashed rules with their word, its lines, then its marks — the
 * shape, and its count or sign beyond it in the same colour, since a colour never travels alone. A
 * layer set fainter in the Layers panel is painted so, whole.
 */
export function paintLayer(
  context: CanvasRenderingContext2D, layer: PlacedLayer, colours: DrawingColours, font: string, height: number,
): void {
  context.save()
  if (layer.opacity < 1) context.globalAlpha = layer.opacity
  context.font = font
  context.lineWidth = 1
  for (const placed of layer.times) {
    context.strokeStyle = colours.roles[placed.time.role]
    context.setLineDash([4, 3])
    context.beginPath()
    context.moveTo(placed.x, 0)
    context.lineTo(placed.x, height)
    context.stroke()
    context.setLineDash([])
  }
  // the time lane: each booking period quiet in the colour of its result, its sign inside where it fits
  for (const placed of layer.spans) {
    const colour = colours.roles[placed.span.role]
    const left = placed.x1 + 0.5
    const width = Math.max(1, placed.x2 - placed.x1 - 1)
    context.fillStyle = colour
    context.globalAlpha = layer.opacity * SPAN_FILL
    context.fillRect(left, placed.y, width, placed.height)
    context.globalAlpha = layer.opacity
    const label = placed.span.label
    if (label && context.measureText(label).width + 4 <= width) {
      // the sign in plain ink: in its role's colour on its role's tint it was barely seen (2026-11-08)
      context.fillStyle = colours.ink
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(label, left + width / 2, placed.y + placed.height / 2)
    }
  }
  // an order refused or expired: its shape, and its count beside it where it stands for several
  for (const placed of layer.laneMarks) {
    const colour = colours.roles[placed.mark.role]
    context.strokeStyle = colour
    context.fillStyle = colour
    paintLaneShape(context, placed.mark.shape, placed.x, placed.y, placed.size)
    if (placed.mark.text) {
      context.textAlign = 'left'
      context.textBaseline = 'middle'
      context.fillText(placed.mark.text, placed.x + placed.size / 2 + 2, placed.y)
    }
  }
  for (const placed of layer.segments) {
    const colour = colours.roles[placed.segment.role]
    context.strokeStyle = colour
    context.setLineDash([4, 3])
    context.beginPath()
    context.moveTo(placed.x1, placed.y)
    context.lineTo(placed.x2, placed.y)
    context.stroke()
    context.setLineDash([])
    context.fillStyle = colour
    context.textAlign = 'left'
    context.textBaseline = 'bottom'
    context.fillText(placed.segment.label, placed.x1 + 2, placed.y - 2)
  }
  for (const placed of layer.lines) {
    context.strokeStyle = colours.roles[placed.line.role]
    context.beginPath()
    context.moveTo(placed.x1, placed.y1)
    context.lineTo(placed.x2, placed.y2)
    context.stroke()
  }
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  for (const placed of layer.marks) {
    context.fillStyle = colours.roles[placed.mark.role]
    paintShape(context, placed.mark.shape, placed.x, placed.y, placed.size)
    if (placed.textY !== null && !placed.mark.textHidden) context.fillText(placed.mark.text, placed.x, placed.textY)
  }
  context.restore()
}

/** A cross for an order refused, a ring for one that ran out — strokes, so they read apart from a trade's filled marks. */
function paintLaneShape(context: CanvasRenderingContext2D, shape: 'cross' | 'ring', x: number, y: number, size: number): void {
  const half = size / 2
  context.lineWidth = 1.5
  context.beginPath()
  if (shape === 'cross') {
    context.moveTo(x - half, y - half)
    context.lineTo(x + half, y + half)
    context.moveTo(x + half, y - half)
    context.lineTo(x - half, y + half)
  } else {
    context.arc(x, y, half, 0, Math.PI * 2)
  }
  context.stroke()
  context.lineWidth = 1
}

/** An arrow — a head and a shaft — pointing the way a position was opened, or a dot where one closed. */
function paintShape(
  context: CanvasRenderingContext2D, shape: 'arrowUp' | 'arrowDown' | 'circle', x: number, y: number, size: number,
): void {
  const half = size / 2
  context.beginPath()
  if (shape === 'circle') {
    context.arc(x, y, half, 0, Math.PI * 2)
  } else {
    // the head takes the outer three fifths, the shaft the rest, a third of the head's width
    const tip = shape === 'arrowUp' ? -half : half
    const base = shape === 'arrowUp' ? half : -half
    const neck = tip + (base - tip) * 0.6
    const shaft = size / 6
    context.moveTo(x, y + tip)
    context.lineTo(x + half, y + neck)
    context.lineTo(x + shaft, y + neck)
    context.lineTo(x + shaft, y + base)
    context.lineTo(x - shaft, y + base)
    context.lineTo(x - shaft, y + neck)
    context.lineTo(x - half, y + neck)
    context.closePath()
  }
  context.fill()
}
