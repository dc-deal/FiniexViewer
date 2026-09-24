import { computed, inject, provide } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import { DEFAULT_SETTINGS } from '@/types/settings_types'
import type { DisplaySettings } from '@/types/settings_types'

const DISPLAY_SETTINGS: InjectionKey<Ref<DisplaySettings> | ComputedRef<DisplaySettings>> =
  Symbol('display-settings')

/**
 * The host supplies the presentation preferences for everything it renders.
 *
 * Ambient rather than a prop, for the same reason the theme is: it applies to every panel, only
 * some panels care, and passing it to all of them would hang a stray attribute on the ones that do
 * not declare it. A panel still receives its MODEL as a prop — that is the half of the contract
 * that keeps one component usable for a stored run and for a live frame.
 */
export function provideDisplaySettings(
  source: Ref<DisplaySettings> | ComputedRef<DisplaySettings>
): void {
  provide(DISPLAY_SETTINGS, source)
}

/**
 * The preferences in force, or the defaults where no host supplied any — so a panel mounted on its
 * own behaves exactly as it did before settings existed.
 */
export function useDisplaySettings(): ComputedRef<DisplaySettings> {
  const supplied = inject(DISPLAY_SETTINGS, null)
  return computed(() => supplied?.value ?? DEFAULT_SETTINGS)
}
