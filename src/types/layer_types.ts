import type { ChartLayerId } from '@/types/chart_drawing_types'

/**
 * The one switch a drawing layer may offer beyond being shown — ours, so a closed set: a name read
 * back from storage is checked against it.
 */
export const LAYER_OPTION_IDS = ['trade-signs', 'every-position'] as const
export type LayerOptionId = typeof LAYER_OPTION_IDS[number]

/** The least opacity a layer is drawn at, in percent — below it a layer is hidden, which the eye does. */
export const LAYER_OPACITY_MIN = 10

export interface LayerOption {
  id: LayerOptionId
  /** Its word beside the checkbox. */
  label: string
  /** What it changes, in one line. */
  description: string
  /** Its value where the reader never set one. */
  fallback: boolean
  /** What the closed row says while the option differs from its default: `no signs`. */
  changed: string
}

/** What the register says about one drawing layer (`layer_registry.ts`). */
export interface LayerDefinition {
  title: string
  /** What it draws, in one line. */
  description: string
  /** Why it may have nothing to draw — said where it has nothing, so a lever that changes nothing is explained. */
  emptyHint: string
  option?: LayerOption
}

/** One layer of a chart as the reader arranged it. */
export interface LayerState {
  id: ChartLayerId
  shown: boolean
  /** In percent, `LAYER_OPACITY_MIN` to 100. */
  opacity: number
  /** Its option's value, or null for a layer that offers none. */
  option: boolean | null
}
