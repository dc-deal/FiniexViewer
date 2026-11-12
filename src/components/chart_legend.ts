import { priceAt } from '@/components/runs/report_format'
import { t } from '@/translate'
import type { ChartBar } from '@/types/api/bar_types'
import type { ChartPaneId, PaneBox, PaneLegend, PaneLegendEntry } from '@/types/chart_pane_types'
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
  const legends: PaneLegend[] = [{ pane: 'price', entries: candles }]
  if (!volume?.shown) return legends
  // the word says what the volume counts: what traded, or the ticks where the venue prints no trade
  const label = volume.basis === 'traded' ? t('Volume') : t('Ticks')
  const value = source.volumeValue !== null ? source.formatVolume(source.volumeValue) : null
  if (volume.ownPane) legends.push({ pane: 'volume', entries: [{ label, value }] })
  else if (value !== null) candles.push({ label, value })
  return legends
}

/** How tall a line of a legend stands — where the folded panes' lines are stacked. */
export const LEGEND_LINE = 20

/**
 * Where each pane's legend stands, in pixels from the frame's top: at the top of its pane — and
 * where one pane has the whole height, the folded panes, which keep no room the library draws in,
 * stand as lines in it: one folded above it at its top, pushing its own legend down a line, one
 * folded below it just over the seam at its bottom.
 */
export function legendTops(boxes: PaneBox[], maximized: ChartPaneId | null): Map<ChartPaneId, number> {
  const whole = boxes.find(box => box.id === maximized)
  if (!whole || boxes.length < 2) return new Map(boxes.map(box => [box.id, box.top]))
  const above = boxes.filter(box => box.top < whole.top)
  const below = boxes.filter(box => box.top > whole.top)
  const tops = new Map<ChartPaneId, number>()
  above.forEach((box, index) => tops.set(box.id, whole.top + index * LEGEND_LINE))
  tops.set(whole.id, whole.top + above.length * LEGEND_LINE)
  below.forEach((box, index) => tops.set(box.id, whole.top + whole.height - (below.length - index) * LEGEND_LINE))
  return tops
}
