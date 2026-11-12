import { priceAt, quantity } from '@/components/runs/report_format'
import { t } from '@/translate'
import type { ChartBar } from '@/types/api/bar_types'
import type { PaneLegend, PaneLegendEntry } from '@/types/chart_pane_types'
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
}

/**
 * The legend of each pane, top to bottom (viewer#57): the open, high, low and close of the bar, and
 * the volume's value in its own pane — or behind the close where it shares the pane of the candles.
 * Only what the bars serve, printed; no change from the bar before is computed here. A hidden volume
 * in its own pane keeps its name there, quiet and without a value, as TradingView keeps a study it
 * hid; in the pane of the candles it says nothing.
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
  const legends: PaneLegend[] = [{ pane: 'price', entries: candles, quiet: false }]
  if (!volume) return legends
  // the word says what the volume counts: what traded, or the ticks where the venue prints no trade
  const label = volume.basis === 'traded' ? t('Volume') : t('Ticks')
  const value = volume.shown && source.volumeValue !== null ? quantity(source.volumeValue) : null
  if (volume.ownPane) legends.push({ pane: 'volume', entries: [{ label, value }], quiet: !volume.shown })
  else if (value !== null) candles.push({ label, value })
  return legends
}
