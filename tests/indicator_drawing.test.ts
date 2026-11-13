import { describe, it, expect } from 'vitest'
import {
  drawsOn, fillColour, holdsValues, plotInk, plotOptions, plotSample, plotPoints, seriesLabel, seriesLegend, seriesTitle, servedPanes,
} from '@/components/indicator_drawing'
import type { IndicatorPlot, IndicatorSeriesEntry } from '@/types/api/indicator_series_types'
import type { RecordedWindow } from '@/types/api/state_frame_types'
import type { IndicatorInks } from '@/types/indicator_drawing_types'
import windowFixture from './fixtures/recorded_window_series.json'

/** The series of the session FiniexTestingIDE produced to draw every kind of pane (contract 55). */
const SERIES = (windowFixture as RecordedWindow).indicator_series
const entry = (layer: string): IndicatorSeriesEntry => SERIES.find(item => item.layer === layer)!

const INKS: IndicatorInks = {
  roles: { positive: '#00aa00', negative: '#aa0000', warning: '#aaaa00', annotation: '#aa00aa' },
  neutral: ['#eeeeee', '#888888'],
  quiet: '#555555',
}

const MINUTES: Record<string, number> = { M1: 1, M5: 5, M30: 30, H1: 60 }
const minutesFor = (timeframe: string): number | null => MINUTES[timeframe] ?? null

interface PlotFields {
  id?: string
  kind?: string
  style?: Partial<IndicatorPlot['style']>
  options?: Partial<IndicatorPlot['options']>
}

function plot(fields: PlotFields = {}): IndicatorPlot {
  return {
    id: fields.id ?? 'value', kind: fields.kind ?? 'line',
    options: { line_type: null, line_style: null, line_visible: null, point_markers_visible: null, base: null, base_value: null, ...fields.options },
    style: { role: 'neutral', series: null, emphasis: null, color: null, ...fields.style },
  }
}

describe('indicator drawing', () => {
  /** Their document: `RSI 14` is the title and the inputs' values — the timeframe joins it here. */
  it('names a series by its title and its inputs, then its timeframe', () => {
    expect(seriesTitle(entry('worker:rsi_fast'))).toBe('RSI 14')
    expect(seriesTitle(entry('worker:bollinger_main'))).toBe('Bollinger 20 2 sma')
    expect(seriesLabel(entry('worker:tide_wave:tide'))).toBe(`Tide ${Object.values(entry('worker:tide_wave:tide').inputs).join(' ')} · M30`)
  })

  /**
   * On its own timeframe and every finer one, where each of its bars falls on a candle; never on a
   * coarser one, where the library would part the candles for its times.
   */
  it('draws a series on its own timeframe and every finer one, never on a coarser one', () => {
    expect(drawsOn('M5', 'M5', minutesFor)).toBe(true)
    expect(drawsOn('M30', 'M5', minutesFor)).toBe(true)
    expect(drawsOn('M5', 'M30', minutesFor)).toBe(false)
    // a timeframe whose length is not known draws only where it is the chart's own
    expect(drawsOn('X7', 'M5', minutesFor)).toBe(false)
    expect(drawsOn('X7', 'X7', minutesFor)).toBe(true)
  })

  it('stacks the panes of their own in the order served, the candles’ pane left out', () => {
    expect(servedPanes(SERIES)).toEqual([...new Set(SERIES.map(item => item.pane))].filter(pane => pane !== 'price'))
    expect(servedPanes(SERIES)).not.toContain('price')
    expect(servedPanes([entry('worker:tide_wave'), entry('worker:rsi_fast'), entry('worker:tide_wave')]))
      .toEqual(['tide_wave', 'rsi_fast'])
  })

  /**
   * The sample beside a worker's name in the Layers panel is the chart's look in a few pixels: the
   * same ink, by role or by place, the same dash and strength (operator, 2026-11-13: which line is whose).
   */
  it('samples a plot in the ink, the dash and the strength the chart draws it in', () => {
    expect(plotSample(plot(), 0)).toEqual({ form: 'line', ink: 'var(--color-text-primary)', dash: '', width: 1, alpha: 1 })
    expect(plotSample(plot(), 1).ink).toBe('var(--color-text-secondary)')
    expect(plotSample(plot({ style: { role: 'positive' } }), 1).ink).toBe('var(--color-positive)')
    // the second series of a role dashed, the third dotted, as on the chart; their own style wins
    expect(plotSample(plot({ style: { series: 1 } }), 0).dash).toBe('4 3')
    expect(plotSample(plot({ style: { series: 2 } }), 0).dash).toBe('1 2')
    expect(plotSample(plot({ style: { series: 1 }, options: { line_style: 0 } }), 0).dash).toBe('')
    // strong is wider, quiet fainter; a histogram is bars, an area filled
    expect(plotSample(plot({ style: { emphasis: 'strong' } }), 0).width).toBe(2)
    expect(plotSample(plot({ style: { emphasis: 'quiet' } }), 0).alpha).toBeLessThan(1)
    expect(plotSample(plot({ kind: 'histogram' }), 0)).toMatchObject({ form: 'bars', dash: '' })
    expect(plotSample(plot({ kind: 'area' }), 0).form).toBe('area')
  })

  /** A role of ours keeps its colour; a neutral one takes the next neutral ink of its pane, round again. */
  it('inks a plot by its role, a neutral one by its place in its pane', () => {
    expect(plotInk(plot({ style: { role: 'positive' } }), INKS, 0)).toBe('#00aa00')
    expect(plotInk(plot(), INKS, 0)).toBe('#eeeeee')
    expect(plotInk(plot(), INKS, 1)).toBe('#888888')
    expect(plotInk(plot(), INKS, 2)).toBe('#eeeeee')
    // a role of theirs we do not know draws as a neutral one rather than in no colour
    expect(plotInk(plot({ style: { role: 'novel' } }), INKS, 1)).toBe('#888888')
    // an explicit colour leaves the theme: it is not taken
    expect(plotInk(plot({ style: { color: '#123456' } }), INKS, 0)).toBe('#eeeeee')
  })

  /** What tells two series of one role apart is their FORM: the second dashed, the third dotted. */
  it('dashes the second series of a role and dots the third, unless the plot states its dash', () => {
    expect(plotOptions(plot({ style: { series: 0 } }), '#eeeeee', 1, INKS)['lineStyle']).toBe(0)
    expect(plotOptions(plot({ style: { series: 1 } }), '#eeeeee', 1, INKS)['lineStyle']).toBe(2)
    expect(plotOptions(plot({ style: { series: 2 } }), '#eeeeee', 1, INKS)['lineStyle']).toBe(1)
    expect(plotOptions(plot({ style: { series: 1 }, options: { line_style: 3 } }), '#eeeeee', 1, INKS)['lineStyle']).toBe(3)
  })

  it('draws a strong plot wider and a quiet one fainter, at the layer’s opacity', () => {
    expect(plotOptions(plot({ style: { emphasis: 'strong' } }), '#eeeeee', 1, INKS)['lineWidth']).toBe(2)
    expect(plotOptions(plot(), '#eeeeee', 1, INKS)['color']).toBe('#eeeeee')
    expect(plotOptions(plot({ style: { emphasis: 'quiet' } }), '#eeeeee', 1, INKS)['color']).toBe('rgba(238, 238, 238, 0.55)')
    expect(plotOptions(plot(), '#eeeeee', 0.5, INKS)['color']).toBe('rgba(238, 238, 238, 0.5)')
  })

  /** Each kind is the library's own series; what it needs beyond the kind passes in the library's codes. */
  it('gives each kind of plot the options its series takes', () => {
    const histogram = plotOptions(plot({ kind: 'histogram', options: { base: 0 } }), '#eeeeee', 1, INKS)
    expect(histogram['base']).toBe(0)
    expect(histogram['color']).toMatch(/^rgba\(238, 238, 238, /)
    const area = plotOptions(plot({ kind: 'area' }), '#eeeeee', 1, INKS)
    expect(area['lineColor']).toBe('#eeeeee')
    expect(area['topColor']).toMatch(/^rgba/)
    const baseline = plotOptions(plot({ kind: 'baseline', options: { base_value: 50 } }), '#eeeeee', 1, INKS)
    expect(baseline['baseValue']).toEqual({ type: 'price', price: 50 })
    expect(baseline['topLineColor']).toBe('#00aa00')
    expect(baseline['bottomLineColor']).toBe('#aa0000')
    const line = plotOptions(plot({ options: { line_type: 1, point_markers_visible: true } }), '#eeeeee', 1, INKS)
    expect(line).toMatchObject({ lineType: 1, pointMarkersVisible: true, priceLineVisible: false })
    // points small enough that a chart zoomed out shows them apart, a strong plot's a little larger
    expect(line['pointMarkersRadius']).toBe(1.5)
    const strong = plotOptions(plot({ options: { line_visible: false, point_markers_visible: true }, style: { emphasis: 'strong' } }), '#eeeeee', 1, INKS)
    expect(strong).toMatchObject({ lineVisible: false, pointMarkersRadius: 2 })
  })

  /** Their default for an area: the annotation's ink, quiet — an area stands under the lines, never over them. */
  it('fills an area in its role’s ink at the share its emphasis gives, at the layer’s opacity', () => {
    const style = { role: 'annotation', series: null, emphasis: 'quiet', color: null }
    expect(fillColour(style, INKS, 1)).toBe('rgba(170, 0, 170, 0.12)')
    expect(fillColour({ ...style, emphasis: 'strong' }, INKS, 0.5)).toBe('rgba(170, 0, 170, 0.14)')
    expect(fillColour({ ...style, role: 'neutral', emphasis: null }, INKS, 1)).toBe('rgba(238, 238, 238, 0.18)')
  })

  /** A setup that never formed holds no value in what was read: its row in the Layers panel says so. */
  it('tells a series that holds no value from one that holds some', () => {
    const rsi = entry('worker:rsi_fast')
    expect(holdsValues(rsi)).toBe(true)
    expect(holdsValues({ ...rsi, data: { rsi_value: rsi.times.map(() => null) } })).toBe(false)
    expect(holdsValues({ ...rsi, times: [], data: {} })).toBe(false)
  })

  /** Their document: a value the worker had none for is null — a gap, never filled, never left out. */
  it('hands every bar to the library, a null as a gap', () => {
    const rsi = { ...entry('worker:rsi_fast'), data: { rsi_value: [null, 41.2, 44.8] }, times: ['2026-01-25T02:15:00Z', '2026-01-25T02:20:00Z', '2026-01-25T02:25:00Z'] }
    const start = Date.parse('2026-01-25T02:15:00Z') / 1000
    expect(plotPoints(rsi, 'rsi_value')).toEqual([
      { time: start }, { time: start + 300, value: 41.2 }, { time: start + 600, value: 44.8 },
    ])
  })

  /**
   * The legend line of a series: its name, then each plot's value on the bar under the pointer — a
   * coarser series' bar spans several candles, so the bar a moment falls in — the last bar's where no
   * moment is pointed at. A lone plot needs no name before its value.
   */
  it('says each plot’s value on the bar a moment falls in, the last bar’s without one', () => {
    const macd = entry('worker:macd_main')
    const last = macd.times.length - 1
    const line = seriesLegend(macd, null, String)
    expect(line.title).toBe(`${seriesTitle(macd)} · M5`)
    expect(line.entries.map(item => item.label)).toEqual(macd.plots.map(item => item.id))
    expect(line.entries.map(item => item.value)).toEqual(macd.plots.map(item => String(macd.data[item.id]![last])))
    const second = Date.parse(macd.times[1]!) / 1000
    // a moment inside the second bar, a minute after it opened
    expect(seriesLegend(macd, second + 60, String).entries[0]!.value).toBe(String(macd.data[macd.plots[0]!.id]![1]))
    // before the first bar there is none: a dash says so, never a name with nothing beside it
    expect(seriesLegend(macd, Date.parse(macd.times[0]!) / 1000 - 60, String).entries.every(item => item.value === '—')).toBe(true)
    expect(seriesLegend(entry('worker:rsi_fast'), null, String).entries.map(item => item.label)).toEqual([''])
    // past the last bar's end, where its length is known, the series says nothing: it stopped there
    const end = Date.parse(macd.times[last]!) / 1000 + 300
    expect(seriesLegend(macd, end - 1, String, 300).entries[0]!.value).not.toBeNull()
    expect(seriesLegend(macd, end, String, 300).entries.every(item => item.value === '—')).toBe(true)
    // a gap on the bar: the dash
    const gappy = { ...macd, data: { ...macd.data, [macd.plots[0]!.id]: macd.times.map(() => null) } }
    expect(seriesLegend(gappy, null, String).entries[0]!.value).toBe('—')
  })
})
