import { withAlpha } from '@/components/chart_colours'
import type { DrawingStyle, IndicatorPlot, IndicatorSeriesEntry } from '@/types/api/indicator_series_types'
import type { PaneLegendEntry, SeriesLegendLine } from '@/types/chart_pane_types'
import type { IndicatorInks } from '@/types/indicator_drawing_types'

/** The pane on the candles, in the backend's word as in ours. */
export const PRICE_PANE = 'price'

/** A line's width by its emphasis, in the library's whole pixels; none given leaves it normal. */
const WIDTHS: Partial<Record<string, number>> = { strong: 2, normal: 1, quiet: 1 }
/**
 * A point's radius by its emphasis, in pixels. The library's own is half the line's width and 2 more,
 * and a strong plot's points stood as one band of blots over the candles of a chart zoomed out (on
 * screen 2026-11-13, a bar's close on M15 over M5 candles).
 */
const POINT_RADII: Partial<Record<string, number>> = { strong: 2, normal: 1.5, quiet: 1 }
/** How far a quiet drawing stands back: its ink at this share. */
const QUIET_ALPHA = 0.55
/** A histogram's bars stand behind the lines drawn over them. */
const HISTOGRAM_ALPHA = 0.6
/** An area's fill under its line. */
const AREA_ALPHA = 0.18

/**
 * The dash a neutral plot takes by its `series`, in the library's codes — the second of one role
 * dashed, the third dotted: what tells the macd line from its signal line is its FORM first, never
 * the hue alone. A served `line_style` wins.
 */
const SERIES_DASH = [0, 2, 1]

/** The name of a series in a legend and a list: its title, then its inputs' values — `RSI 14`. */
export function seriesTitle(entry: IndicatorSeriesEntry): string {
  return [entry.title, ...Object.values(entry.inputs).map(String)].join(' ')
}

/** That name with the timeframe its values belong to — `RSI 14 · M5`. */
export function seriesLabel(entry: IndicatorSeriesEntry): string {
  return `${seriesTitle(entry)} · ${entry.timeframe}`
}

/**
 * Whether a series is drawn on a chart of a timeframe: on its own, and on every finer one, where
 * each of its bars falls on a candle. On a coarser chart it would set times between the candles,
 * and the library would part the candles to make room for them — so it is not drawn there.
 */
export function drawsOn(
  seriesTimeframe: string, chartTimeframe: string, minutesFor: (timeframe: string) => number | null | undefined,
): boolean {
  if (seriesTimeframe === chartTimeframe) return true
  const own = minutesFor(seriesTimeframe)
  const chart = minutesFor(chartTimeframe)
  return own !== null && own !== undefined && chart !== null && chart !== undefined && own >= chart
}

/** The panes of their own the series name, top to bottom in the order they are served. */
export function servedPanes(entries: readonly IndicatorSeriesEntry[]): string[] {
  return [...new Set(entries.map(entry => entry.pane).filter(pane => pane !== PRICE_PANE))]
}

/**
 * A plot's ink: the role's own where it names one of ours, else a neutral ink by the series' place
 * in its pane — the first series of a pane in the first, the next in the next. An explicit `color`
 * leaves the theme and its check for colour blindness, and their document lets a client ignore it.
 */
export function plotInk(plot: IndicatorPlot, inks: IndicatorInks, place: number): string {
  const own = plot.style.role !== 'neutral' ? inks.roles[plot.style.role] : undefined
  return own ?? inks.neutral[place % inks.neutral.length]!
}

/** A plot's options for the library, by its kind: its ink at the layer's opacity, its width and dash. */
export function plotOptions(
  plot: IndicatorPlot, ink: string, opacity: number, inks: IndicatorInks,
): Record<string, unknown> {
  const quiet = plot.style.emphasis === 'quiet' ? QUIET_ALPHA : 1
  const colour = withAlpha(ink, quiet * opacity)
  const width = WIDTHS[plot.style.emphasis ?? 'normal'] ?? 1
  const options = plot.options
  const line: Record<string, unknown> = {
    lineWidth: width,
    lineStyle: options.line_style ?? SERIES_DASH[plot.style.series ?? 0] ?? 0,
    ...(options.line_type !== null ? { lineType: options.line_type } : {}),
    ...(options.line_visible !== null ? { lineVisible: options.line_visible } : {}),
    ...(options.point_markers_visible !== null ? { pointMarkersVisible: options.point_markers_visible } : {}),
    ...(options.point_markers_visible ? { pointMarkersRadius: POINT_RADII[plot.style.emphasis ?? 'normal'] ?? 1.5 } : {}),
  }
  const shared = { priceLineVisible: false, lastValueVisible: true }
  switch (plot.kind) {
    case 'histogram':
      return { ...shared, color: withAlpha(ink, HISTOGRAM_ALPHA * quiet * opacity), ...(options.base !== null ? { base: options.base } : {}) }
    case 'area':
      return { ...shared, ...line, lineColor: colour, topColor: withAlpha(ink, AREA_ALPHA * opacity), bottomColor: withAlpha(ink, 0) }
    case 'baseline': {
      // a baseline parts what stands above its value from what stands below: the two polarities
      const above = inks.roles['positive'] ?? ink
      const below = inks.roles['negative'] ?? ink
      return {
        ...shared, ...line,
        baseValue: { type: 'price', price: options.base_value ?? 0 },
        topLineColor: withAlpha(above, opacity), bottomLineColor: withAlpha(below, opacity),
        topFillColor1: withAlpha(above, AREA_ALPHA * opacity), topFillColor2: withAlpha(above, 0),
        bottomFillColor1: withAlpha(below, 0), bottomFillColor2: withAlpha(below, AREA_ALPHA * opacity),
      }
    }
    default:
      return { ...shared, ...line, color: colour }
  }
}

/**
 * How strongly an area is filled by its emphasis — under the lines and the candles, never over them.
 * A quiet one at 8 % vanished on the light theme's ground (on screen 2026-11-13, an entry zone).
 */
const FILL_ALPHA: Partial<Record<string, number>> = { strong: 0.28, normal: 0.18, quiet: 0.12 }

/**
 * An area's colour: its role's ink — a neutral one the plain ink of the series' pane — at the share
 * its emphasis gives, at the layer's opacity. Their default for an area is `annotation`, quiet.
 */
export function fillColour(style: DrawingStyle, inks: IndicatorInks, opacity: number): string {
  const ink = (style.role !== 'neutral' ? inks.roles[style.role] : undefined) ?? inks.neutral[0]!
  return withAlpha(ink, (FILL_ALPHA[style.emphasis ?? 'normal'] ?? FILL_ALPHA['normal']!) * opacity)
}

/** A plot's points for the library: one per bar, a null left a gap — never filled, never left out. */
export function plotPoints(entry: IndicatorSeriesEntry, plotId: string): { time: number, value?: number }[] {
  const values = entry.data[plotId] ?? []
  return entry.times.map((time, index) => {
    const at = Math.floor(Date.parse(time) / 1000)
    const value = values[index]
    return value === null || value === undefined ? { time: at } : { time: at, value }
  })
}

/**
 * The bar of a series a moment falls in: the last whose opening is not after it — on a finer chart
 * a coarser series' bar spans several candles. The last bar where no moment is pointed at, none
 * before the series' first, and none past the last one's end where its length is known: a series
 * that stops — the session ended, the read not that far yet — says nothing over the candles after it.
 */
function barAt(entry: IndicatorSeriesEntry, at: number | null, span: number | null): number | null {
  const last = entry.times.length - 1
  if (last < 0) return null
  if (at === null) return last
  let low = 0
  let high = last
  let found: number | null = null
  while (low <= high) {
    const middle = (low + high) >> 1
    if (Date.parse(entry.times[middle]!) / 1000 <= at) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  if (found === last && span !== null && at >= Date.parse(entry.times[last]!) / 1000 + span) return null
  return found
}

/**
 * A series' line of its pane's legend: its name, then each plot's value on the bar under the
 * pointer, the last bar's otherwise — printed as its own scale prints it. A plot is named only where
 * the series has several: a lone RSI's value needs no `rsi_value` before it. A gap says nothing.
 */
export function seriesLegend(
  entry: IndicatorSeriesEntry, at: number | null, format: (value: number) => string, span: number | null = null,
): SeriesLegendLine {
  const bar = barAt(entry, at, span)
  const named = entry.plots.length > 1
  const entries: PaneLegendEntry[] = entry.plots.map(plot => {
    const value = bar === null ? null : entry.data[plot.id]?.[bar] ?? null
    return { label: named ? plot.id : '', value: value === null ? null : format(value) }
  })
  return { layer: entry.layer, title: seriesLabel(entry), entries }
}
