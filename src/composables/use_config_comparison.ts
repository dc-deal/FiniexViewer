import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'
import type { CompareSide } from '@/stores/config_compare_store'
import type { RunConfigReport } from '@/types/api/report_types'

/** The configuration a shown one is compared with, and where that comparison stands. */
export interface ComparedConfig {
  runId: string
  side: CompareSide
  body: RunConfigReport | null
  loading: boolean
  missing: string | null
}

export interface ConfigComparison {
  /** The comparison for the run on show, or null where none was asked for. */
  compared: () => ComparedConfig | null
  stop: () => void
}

const CONFIG_COMPARISON: InjectionKey<ConfigComparison> = Symbol('config-comparison')

/** The host says what the configuration on show is compared with; the panel reads no store. */
export function provideConfigComparison(comparison: ConfigComparison): void {
  provide(CONFIG_COMPARISON, comparison)
}

const NONE: ConfigComparison = { compared: () => null, stop: () => {} }

/** The comparison in force, or none where no host supplied one. */
export function useConfigComparison(): ConfigComparison {
  return inject(CONFIG_COMPARISON, NONE)
}
