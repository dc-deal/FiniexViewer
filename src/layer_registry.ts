import type { StoredLayers } from '@/types/arrangement_types'
import type { ChartLayerId } from '@/types/chart_drawing_types'
import type { LayerDefinition, LayerOptionId, LayerState } from '@/types/layer_types'
import { t } from '@/translate'

/**
 * Every drawing layer a chart can draw, in ONE register (viewer#41): its title, the hint saying
 * what it draws, and the one option it offers. A record over the ids, so a layer added to the type is a type error here
 * until it is described.
 */
const LAYERS: Record<ChartLayerId, LayerDefinition> = {
  levels: {
    title: t('Levels'),
    hintId: 'layer-levels',
    emptyHintId: 'layer-empty-levels',
    option: { id: 'every-position', label: t('every position'), fallback: false },
  },
  'entry-exit': {
    title: t('Entry–exit line'),
    hintId: 'layer-entry-exit',
    emptyHintId: 'layer-empty-entry-exit',
    // its own id: kept by id, the levels' option of the same word would switch both
    option: { id: 'every-position-line', label: t('every position'), fallback: false },
  },
  volume: {
    title: t('Volume'),
    hintId: 'layer-volume',
    fixed: true,
  },
  candles: {
    title: t('Candles'),
    hintId: 'layer-candles',
    fixed: true,
    forms: [
      { id: 'candles', label: t('candles') },
      { id: 'bars', label: t('OHLC bars') },
      { id: 'line', label: t('line') },
      { id: 'area', label: t('area') },
    ],
  },
  trades: {
    title: t('Trades'),
    hintId: 'layer-trades',
    emptyHintId: 'layer-empty-trades',
    option: { id: 'trade-signs', label: t('signs'), fallback: true },
  },
}

/**
 * The drawing layers each chart draws, back to front, by the chart's dock id — a chart not named
 * draws only its candles, and the Layers panel has nothing to arrange for it: the free chart today.
 */
const CHART_LAYERS: Record<string, readonly ChartLayerId[]> = {
  'run-chart': ['volume', 'candles', 'levels', 'entry-exit', 'trades'],
}

export function layerDefinition(id: ChartLayerId): LayerDefinition {
  return LAYERS[id]
}

/** The drawing layers a chart draws, back to front, in its own order. */
export function chartLayers(chartId: string): readonly ChartLayerId[] {
  return CHART_LAYERS[chartId] ?? []
}

/**
 * A chart's drawing layers as the reader arranged them, back to front. The kept order is
 * reconciled, never trusted: a layer the chart no longer draws is left out, and one it draws since
 * stands where the chart's own order puts it. Whatever was not kept is the layer's default.
 */
export function arrangeLayers(chartId: string, stored: StoredLayers | undefined): LayerState[] {
  const own = chartLayers(chartId)
  const order = (stored?.order ?? []).filter((id, index, all) => own.includes(id) && all.indexOf(id) === index)
  own.forEach((id, index) => {
    if (!order.includes(id)) order.splice(Math.min(index, order.length), 0, id)
  })
  // the fixed layers stand at the back in their own order, whatever was kept
  const fixed = own.filter(id => LAYERS[id].fixed)
  const placed = [...fixed, ...order.filter(id => !LAYERS[id].fixed)]
  return placed.map(id => {
    const { option, forms } = LAYERS[id]
    return {
      id,
      shown: !stored?.hidden?.includes(id),
      opacity: stored?.opacity?.[id] ?? 100,
      option: option ? stored?.options?.[option.id] ?? option.fallback : null,
      form: forms ? forms.find(entry => entry.id === stored?.forms?.[id])?.id ?? forms[0]!.id : null,
    }
  })
}

/**
 * What is kept of an arrangement: only what differs from the chart's own — nothing at all where
 * nothing does, so a chart the reader never arranged keeps no entry.
 */
export function keptLayers(chartId: string, states: LayerState[]): StoredLayers | undefined {
  const kept: StoredLayers = {}
  const order = states.map(state => state.id)
  if (order.join() !== chartLayers(chartId).join()) kept.order = order
  const hidden = states.filter(state => !state.shown).map(state => state.id)
  if (hidden.length) kept.hidden = hidden
  const faint = states.filter(state => state.opacity < 100)
  if (faint.length) kept.opacity = Object.fromEntries(faint.map(state => [state.id, state.opacity]))
  const options: Partial<Record<LayerOptionId, boolean>> = {}
  for (const state of states) {
    const option = LAYERS[state.id].option
    if (option && state.option !== null && state.option !== option.fallback) options[option.id] = state.option
  }
  if (Object.keys(options).length) kept.options = options
  const forms: StoredLayers['forms'] = {}
  for (const state of states) {
    const own = LAYERS[state.id].forms?.[0]?.id
    if (own && state.form && state.form !== own) forms[state.id] = state.form
  }
  if (Object.keys(forms).length) kept.forms = forms
  return Object.keys(kept).length ? kept : undefined
}
