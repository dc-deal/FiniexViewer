import type { StoredLayers } from '@/types/arrangement_types'
import type { ChartLayerId } from '@/types/chart_drawing_types'
import type { LayerDefinition, LayerOptionId, LayerState } from '@/types/layer_types'
import { t } from '@/translate'

/**
 * Every drawing layer a chart can draw, in ONE register (viewer#41): its title, what it draws, and
 * the one option it offers. A record over the ids, so a layer added to the type is a type error here
 * until it is described.
 */
const LAYERS: Record<ChartLayerId, LayerDefinition> = {
  levels: {
    title: t('Levels'),
    description: t('The stop loss and take profit in force when a trade closed, drawn at its exit — where they stood before is not recorded'),
    emptyHint: t('Drawn for the position looked at — choose one in the trade history or the orders — or for every position where that is switched on. A position that set no stop and no target has none to draw.'),
    option: {
      id: 'every-position',
      label: t('every position'),
      description: t('The levels of every position of the unit, not only of the one looked at'),
      fallback: false,
      changed: t('every position'),
    },
  },
  'entry-exit': {
    title: t('Entry–exit line'),
    description: t('Where each trade of the position looked at entered, and where it left'),
    emptyHint: t('Drawn for the position looked at — choose one in the trade history or the orders — or for every position where that is switched on. A trade that entered and left in one candle draws no line.'),
    // its own id: kept by id, the levels' option of the same word would switch both
    option: {
      id: 'every-position-line',
      label: t('every position'),
      description: t('The lines of every position of the unit, not only of the one looked at'),
      fallback: false,
      changed: t('every position'),
    },
  },
  trades: {
    title: t('Trades'),
    description: t('Where each position opened and each trade closed'),
    emptyHint: t('The unit on show opened no position in the window drawn.'),
    option: {
      id: 'trade-signs',
      label: t('signs'),
      description: t('The sign of each exit and the count of each gathered mark, beside its shape'),
      fallback: true,
      changed: t('no signs'),
    },
  },
}

/**
 * The drawing layers each chart draws, back to front, by the chart's dock id — a chart not named
 * draws only its candles, and the Layers panel has nothing to arrange for it: the free chart today.
 */
const CHART_LAYERS: Record<string, readonly ChartLayerId[]> = {
  'run-chart': ['levels', 'entry-exit', 'trades'],
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
  return order.map(id => {
    const option = LAYERS[id].option
    return {
      id,
      shown: !stored?.hidden?.includes(id),
      opacity: stored?.opacity?.[id] ?? 100,
      option: option ? stored?.options?.[option.id] ?? option.fallback : null,
    }
  })
}

/**
 * What a closed row says of a layer: its option, where it differs from the default — `no signs`.
 * Its opacity is not repeated here: the handle of its lever, in the same row, shows it.
 */
export function layerSummary(state: LayerState): string {
  const option = LAYERS[state.id].option
  return option && state.option !== null && state.option !== option.fallback ? option.changed : ''
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
  return Object.keys(kept).length ? kept : undefined
}
