import { priceAt } from '@/components/runs/report_format'
import { t } from '@/translate'
import type { ChartBar } from '@/types/api/bar_types'
import type { PaneBox, PaneLegend, PaneLegendEntry, SeriesLegendLine } from '@/types/chart_pane_types'
import type { ChartVolume } from '@/types/run_chart_types'

/** What a chart's legends are read from: one bar, and how the volume stands. */
export interface LegendSource {
  /** The bar under the pointer, else the last one drawn; none where the chart has no bars. */
  bar: ChartBar | null
  /** The volume's value on that bar, as served; none where no volume is handed for it. */
  volumeValue: number | null
  /** How the volume is drawn, or none — the free chart draws none. */
  volume: Pick<ChartVolume, 'basis' | 'shown' | 'ownPane'> | null
  /** The instrument's price step, where its broker report is there. */
  tickSize: number | null
  /**
   * The volume as its own scale prints it — `669.42`, `1.23K` — so the legend and the scale beside
   * it read alike (operator, 2026-11-12): the library's own format, never a second one of ours.
   */
  formatVolume: (value: number) => string
  /**
   * The workers' series, each with the pane it is drawn in, in the order served (contract 55): those
   * on the candles join the price pane's legend, the others make a legend of their own pane each.
   */
  series: { pane: string, line: SeriesLegendLine }[]
}

/**
 * The legend of each pane, top to bottom (viewer#57): the open, high, low and close of the bar, and
 * the volume's value in its own pane — or behind the close where it shares the pane of the candles.
 * Only what the bars serve, printed; no change from the bar before is computed here. A hidden volume
 * says nothing: it gives its pane up (operator, 2026-11-12).
 */
export function paneLegends(source: LegendSource): PaneLegend[] {
  const { bar, volume } = source
  if (!bar) return []
  const price = (value: number): string => priceAt(value, source.tickSize)
  const candles: PaneLegendEntry[] = [
    { label: t('O'), value: price(bar.open) },
    { label: t('H'), value: price(bar.high) },
    { label: t('L'), value: price(bar.low) },
    { label: t('C'), value: price(bar.close) },
  ]
  const lines = (pane: string): SeriesLegendLine[] =>
    source.series.filter(drawn => drawn.pane === pane).map(drawn => drawn.line)
  const legends: PaneLegend[] = [{ pane: 'price', entries: candles, series: lines('price') }]
  if (volume?.shown) {
    // the word says what the volume counts: what traded, or the ticks where the venue prints no trade
    const label = volume.basis === 'traded' ? t('Volume') : t('Ticks')
    const value = source.volumeValue !== null ? source.formatVolume(source.volumeValue) : null
    if (volume.ownPane) legends.push({ pane: 'volume', entries: [{ label, value }], series: [] })
    else if (value !== null) candles.push({ label, value })
  }
  const own = [...new Set(source.series.map(drawn => drawn.pane).filter(pane => pane !== 'price'))]
  for (const pane of own) legends.push({ pane, entries: [], series: lines(pane) })
  return legends
}

/** How many lines a pane's legend takes: its own figures, and a line per series. */
export function legendLines(legend: PaneLegend): number {
  return (legend.entries.length ? 1 : 0) + legend.series.length
}

/** How tall a line of a legend stands — where the folded panes' lines are stacked. */
export const LEGEND_LINE = 20

/**
 * Where each pane's legend stands, in pixels from the frame's top: at the top of its pane — and
 * where one pane has the whole height, the folded panes, which keep no room the library draws in,
 * stand as their lines in it: those folded above it at its top, pushing its own legend down, those
 * folded below it just over the seam at its bottom. A legend takes as many lines as `lines` says,
 * one where it says nothing.
 */
export function legendTops(
  boxes: PaneBox[], maximized: string | null, lines: (pane: string) => number = () => 1,
): Map<string, number> {
  const whole = boxes.find(box => box.id === maximized)
  if (!whole || boxes.length < 2) return new Map(boxes.map(box => [box.id, box.top]))
  const height = (box: PaneBox): number => Math.max(1, lines(box.id)) * LEGEND_LINE
  const above = boxes.filter(box => box.top < whole.top)
  const below = boxes.filter(box => box.top > whole.top)
  const tops = new Map<string, number>()
  let top = whole.top
  for (const box of above) {
    tops.set(box.id, top)
    top += height(box)
  }
  tops.set(whole.id, top)
  let bottom = whole.top + whole.height
  for (const box of [...below].reverse()) {
    bottom -= height(box)
    tops.set(box.id, bottom)
  }
  return tops
}
