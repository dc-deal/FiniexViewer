import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'
import type { ValidationCheck } from '@/types/api/validation_check_types'

/** What a warning's check id means, where the backend's catalogue knows it. */
export type CheckLookup = (check: string) => ValidationCheck | null

const CHECK_TITLES: InjectionKey<CheckLookup> = Symbol('check-titles')

/** The host hands the catalogue to every section it draws; a panel never reads the store itself. */
export function provideCheckTitles(lookup: CheckLookup): void {
  provide(CHECK_TITLES, lookup)
}

/** The lookup in force, or one that knows nothing where no host supplied it. */
export function useCheckTitles(): CheckLookup {
  return inject(CHECK_TITLES, () => null)
}
