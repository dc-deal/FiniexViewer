import type {
  IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time,
} from 'lightweight-charts'
import type { IndicatorSeriesEntry } from '@/types/api/indicator_series_types'

/** The canvas target the library hands a renderer — taken from its own signature, not a second import. */
type CanvasTarget = Parameters<IPrimitivePaneRenderer['draw']>[0]

/** One area to fill: its two edges as served, and the colour it is filled in. */
export interface FillArea {
  between: string[]
  colour: string
}

/** A shape to fill, in the pane's own pixels: a closed outline, corner by corner. */
export type FillShape = [number, number][]

/** Where an edge stands: on a price line, or along a plot's values. */
type Edge = { line: number } | { plot: string }

/** An edge as served — `price_line:<price>` or `plot:<id>` — or none where it is neither. */
function edgeOf(edge: string): Edge | null {
  const [kind, name] = [edge.slice(0, edge.indexOf(':')), edge.slice(edge.indexOf(':') + 1)]
  if (kind === 'price_line' && name !== '' && Number.isFinite(Number(name))) return { line: Number(name) }
  if (kind === 'plot' && name) return { plot: name }
  return null
}

/**
 * The shapes an area fills, in the pane's pixels (contract 55). Between two price lines a band across
 * the pane's whole width; between two plots the stretch between their values bar by bar, broken where
 * either has a gap — a null is no value, and nothing is filled across it. Their document: never one
 * edge of each kind, so a mixed pair fills nothing. Nothing is computed: the outline joins the
 * served points.
 */
export function fillShapes(
  between: string[], entry: IndicatorSeriesEntry, width: number,
  x: (time: number) => number | null, y: (price: number) => number | null,
): FillShape[] {
  const [first, second] = between.map(edgeOf)
  if (!first || !second) return []
  if ('line' in first && 'line' in second) {
    const top = y(first.line)
    const bottom = y(second.line)
    if (top === null || bottom === null) return []
    return [[[0, top], [width, top], [width, bottom], [0, bottom]]]
  }
  if (!('plot' in first) || !('plot' in second)) return []
  const upper = entry.data[first.plot] ?? []
  const lower = entry.data[second.plot] ?? []
  const shapes: FillShape[] = []
  let run: { x: number, top: number, bottom: number }[] = []
  const close = (): void => {
    if (run.length > 1) {
      shapes.push([...run.map(point => [point.x, point.top] as [number, number]),
        ...[...run].reverse().map(point => [point.x, point.bottom] as [number, number])])
    }
    run = []
  }
  entry.times.forEach((time, index) => {
    const a = upper[index]
    const b = lower[index]
    const at = x(Math.floor(Date.parse(time) / 1000))
    const top = a === null || a === undefined ? null : y(a)
    const bottom = b === null || b === undefined ? null : y(b)
    if (at === null || top === null || bottom === null) {
      close()
      return
    }
    run.push({ x: at, top, bottom })
  })
  close()
  return shapes
}

/**
 * A series' filled areas, painted by one series primitive attached to its first plot: behind the
 * lines, and behind the candles where it stands on theirs (the library's `bottom` stage).
 */
export class IndicatorFill implements ISeriesPrimitive<Time> {
  private _chart: SeriesAttachedParameter<Time>['chart'] | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  // the library caches by the array it is handed, so the same one is handed every time
  private readonly _views: readonly IPrimitivePaneView[]

  constructor(private readonly _entry: IndicatorSeriesEntry, private readonly _areas: readonly FillArea[]) {
    const renderer: IPrimitivePaneRenderer = { draw: target => this._draw(target) }
    this._views = [{ zOrder: () => 'bottom', renderer: () => renderer }]
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart = param.chart
    this._series = param.series
  }

  detached(): void {
    this._chart = null
    this._series = null
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._views
  }

  private _draw(target: CanvasTarget): void {
    const chart = this._chart
    const series = this._series
    if (!chart || !series) return
    const timeScale = chart.timeScale()
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      for (const area of this._areas) {
        const shapes = fillShapes(area.between, this._entry, mediaSize.width,
          time => timeScale.timeToCoordinate(time as Time),
          price => series.priceToCoordinate(price))
        context.fillStyle = area.colour
        for (const shape of shapes) {
          context.beginPath()
          shape.forEach(([px, py], index) => index ? context.lineTo(px, py) : context.moveTo(px, py))
          context.closePath()
          context.fill()
        }
      }
    })
  }
}
