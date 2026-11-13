import { shallowRef } from 'vue'
import type { Ref } from 'vue'
import { AreaSeries, BaselineSeries, HistogramSeries, LineSeries } from 'lightweight-charts'
import type {
  IChartApi, ISeriesApi, LineData, SeriesDefinition, SeriesPartialOptionsMap, SeriesType, Time, WhitespaceData,
} from 'lightweight-charts'
import {
  PRICE_PANE, plotInk, plotOptions, plotPoints, servedPanes,
} from '@/components/indicator_drawing'
import type { IndicatorSeriesEntry } from '@/types/api/indicator_series_types'
import type { DrawnSeries, IndicatorInks } from '@/types/indicator_drawing_types'

/** The library's series by a plot's kind; an unknown kind is drawn as a line rather than not at all. */
const KINDS = { line: LineSeries, histogram: HistogramSeries, area: AreaSeries, baseline: BaselineSeries }

/** A price format for the library: the symbol's, where the series states none. */
interface LibraryFormat {
  type: 'price' | 'percent' | 'volume'
  precision: number
  minMove: number
}

interface IndicatorSeriesOptions {
  chart: () => IChartApi | null
  /** The series to draw, in the order served, each at its layer's opacity. */
  drawn: () => readonly DrawnSeries[]
  /** The index the first pane of a worker's own takes: below the candles, and the volume's pane where it has one. */
  firstPane: () => number
  inks: () => IndicatorInks
  /** The symbol's price format, for a series in price units — one that states no format of its own. */
  symbolFormat: () => LibraryFormat | null
}

interface IndicatorSeries {
  /** Draws every series handed, each plot a series of the library in the pane its series names. */
  build: () => void
  /** Takes every series down again — a pane left empty goes with it. */
  remove: () => void
  /** The panes of their own drawn now, top to bottom, by the backend's names. */
  panes: Readonly<Ref<string[]>>
  /** How a layer's values print: as its first plot's own scale prints them. */
  formatOf: (layer: string) => ((value: number) => string) | null
}

/**
 * The workers' series on a chart (contract 55): each plot a series of the library in the pane its
 * series names — `price` on the candles, any other name a pane of its own under them, one per name
 * in the order served. A series states its scale's format, a fixed range where it has one, and its
 * reference lines; its colours are roles the theme gives. Built whole and taken down whole: the
 * panes of the chart change with it, and the chart that owns it says when.
 */
export function useIndicatorSeries(options: IndicatorSeriesOptions): IndicatorSeries {
  let built: ISeriesApi<SeriesType>[] = []
  /** Replaced whole at each build, so what reads a format reads again. */
  const formats = shallowRef(new Map<string, (value: number) => string>())
  const panes = shallowRef<string[]>([])

  function formatFor(entry: IndicatorSeriesEntry): LibraryFormat | null {
    const own = entry.price_format
    if (!own) return options.symbolFormat()
    const type = own.type === 'percent' || own.type === 'volume' ? own.type : 'price'
    return { type, precision: own.precision, minMove: own.min_move ?? 10 ** -own.precision }
  }

  function build(): void {
    const chart = options.chart()
    if (!chart) return
    remove()
    const drawn = options.drawn()
    const order = servedPanes(drawn.map(item => item.entry))
    const inks = options.inks()
    // the k-th series of a pane takes the k-th neutral ink
    const places = new Map<string, number>()
    const printed = new Map<string, (value: number) => string>()
    for (const { entry, opacity } of drawn) {
      const pane = entry.pane === PRICE_PANE ? 0 : options.firstPane() + order.indexOf(entry.pane)
      const place = places.get(entry.pane) ?? 0
      places.set(entry.pane, place + 1)
      const format = formatFor(entry)
      const range = entry.range
      let first: ISeriesApi<SeriesType> | null = null
      // the first plot is drawn behind the others: the library draws in the order series are added
      for (const plot of entry.plots) {
        const kind = (KINDS[plot.kind as keyof typeof KINDS] ?? LineSeries) as SeriesDefinition<SeriesType>
        // the options are built per kind from the served plot, a record the library's typing cannot follow
        const own = {
          ...plotOptions(plot, plotInk(plot, inks, place), opacity, inks),
          ...(format ? { priceFormat: format } : {}),
          ...(range ? { autoscaleInfoProvider: () => ({ priceRange: { minValue: range.min_value, maxValue: range.max_value } }) } : {}),
        } as SeriesPartialOptionsMap[SeriesType]
        const series = chart.addSeries(kind, own, pane)
        series.setData(plotPoints(entry, plot.id) as (LineData<Time> | WhitespaceData<Time>)[])
        built.push(series)
        first ??= series
      }
      if (!first) continue
      for (const line of entry.price_lines) {
        // the scale prints the line's price already: a title that only repeats it is a second tag
        // beside the first (on screen 2026-11-13: `70` beside `70.00`), one that says more stays
        const title = line.title !== null && Number(line.title) !== line.price ? line.title : ''
        first.createPriceLine({
          price: line.price, lineStyle: line.line_style, lineWidth: 1, color: inks.quiet,
          axisLabelVisible: true, title,
        })
      }
      const formatter = first.priceFormatter()
      printed.set(entry.layer, value => formatter.format(value))
    }
    formats.value = printed
    panes.value = order
  }

  function remove(): void {
    const chart = options.chart()
    if (chart) for (const series of built) chart.removeSeries(series)
    built = []
    formats.value = new Map()
    panes.value = []
  }

  return { build, remove, panes, formatOf: layer => formats.value.get(layer) ?? null }
}
