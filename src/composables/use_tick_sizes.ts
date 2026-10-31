import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'

/** The tick size of a unit's instrument, where the run's broker report states it. */
export type TickSizeLookup = (unit: string, symbol: string | null) => number | null

const TICK_SIZES: InjectionKey<TickSizeLookup> = Symbol('tick-sizes')

/** The host hands the lookup to every section it draws: a section is given its own report and no other. */
export function provideTickSizes(lookup: TickSizeLookup): void {
  provide(TICK_SIZES, lookup)
}

/** The lookup in force, or one that knows nothing where no host supplied it. */
export function useTickSizes(): TickSizeLookup {
  return inject(TICK_SIZES, () => null)
}
