import type {
  AutoscaleInfo, IChartApiBase, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive,
  ISeriesPrimitiveAxisView, PrimitiveHoveredItem, SeriesAttachedParameter, SeriesType, Time,
} from 'lightweight-charts'
import {
  MARK_TEXT_PX, hitDrawing, placeLayer, type BarRange, type ChartScale, type PlacedLayer,
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
}

/** A bar on screen when nothing has been drawn yet — the library's own default spacing. */
const DEFAULT_SPACING = 6

/**
 * The chart's own drawings, painted by ONE series primitive (viewer#41, decided 2026-10-19). One
 * host for every layer, not a primitive per layer: the library paints primitives in the order they
 * were attached and hit-tests them in another, so reordering layers would mean detaching and
 * attaching them again — here the order is a list, painted front last and searched front first.
 *
 * It draws in the library's `normal` stage, in front of the candles. The marks of the trades moved
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
  private _axisViews: readonly ISeriesPrimitiveAxisView[] = []
  // the library caches by the array it is handed, so the same one is handed every time
  private readonly _views: readonly IPrimitivePaneView[]

  constructor() {
    const renderer: IPrimitivePaneRenderer = { draw: target => this._draw(target) }
    this._views = [{ zOrder: () => 'normal', renderer: () => renderer }]
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

  /** Called by the library whenever the view moves: everything stands somewhere else now. */
  updateAllViews(): void {
    this._place()
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._views
  }

  /** The price of every level on the axis, in the colour of its role. */
  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._axisViews
  }

  /**
   * Room above and below the candles for the marks that stand beyond them, so the price scale
   * leaves it rather than cutting the outermost ones off. Levels ask for none: a distant stop would
   * squash every candle into a line.
   */
  autoscaleInfo(): AutoscaleInfo | null {
    if (!this._reach.above && !this._reach.below) return null
    return { priceRange: null, margins: { above: this._reach.above, below: this._reach.below } }
  }

  /** The drawing under the pointer, its id reported by the library as `hoveredInfo.objectId`. */
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const hit = hitDrawing(this._placed, x, y)
    if (!hit) return null
    return {
      externalId: hit.id,
      zOrder: 'normal',
      distance: hit.distance,
      // a point outranks a stroke where both are hit, the way the library ranks its own
      hitTestPriority: hit.point ? 2 : 1,
      itemType: hit.point ? 'marker' : 'primitive',
    }
  }

  private _scale(): ChartScale | null {
    const chart = this._chart
    const series = this._series
    if (!chart || !series) return null
    const timeScale = chart.timeScale()
    const range = timeScale.getVisibleLogicalRange()
    const width = timeScale.width()
    const bars = range ? range.to - range.from : 0
    return {
      x: time => timeScale.timeToCoordinate(time as Time),
      y: price => series.priceToCoordinate(price),
      spacing: bars > 0 ? width / bars : DEFAULT_SPACING,
      width,
    }
  }

  private _place(): void {
    const scale = this._scale()
    this._placed = scale ? this._layers.map(layer => placeLayer(layer, this._bars, scale)) : []
    this._reach = {
      above: Math.max(0, ...this._placed.map(layer => layer.reach.above)),
      below: Math.max(0, ...this._placed.map(layer => layer.reach.below)),
    }
    const series = this._series
    const colours = this._colours
    this._axisViews = series && colours
      ? this._placed.flatMap(layer => layer.segments).map(placed => {
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
    target.useMediaCoordinateSpace(({ context }) => {
      for (const layer of this._placed) paintLayer(context, layer, colours, this._font)
    })
  }
}

/**
 * One placed layer onto the canvas: its levels as dashed rules with their word, its lines, then
 * its marks — the shape, and its count or sign beyond it in the same colour, since a colour never
 * travels alone.
 */
export function paintLayer(
  context: CanvasRenderingContext2D, layer: PlacedLayer, colours: DrawingColours, font: string,
): void {
  context.save()
  context.font = font
  context.lineWidth = 1
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
    if (placed.textY !== null) context.fillText(placed.mark.text, placed.x, placed.textY)
  }
  context.restore()
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
