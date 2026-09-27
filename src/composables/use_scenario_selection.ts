import { computed, inject, provide } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'

/** The unit a reader has narrowed to, and the only way to change it. */
export interface ScenarioSelection {
  /** The unit on show, or null for the whole run. */
  unit: Ref<string | null> | ComputedRef<string | null>
  /** Narrows to a unit; null clears the narrowing. */
  select: (unit: string | null) => void
}

const SCENARIO_SELECTION: InjectionKey<ScenarioSelection> = Symbol('scenario-selection')

/**
 * The host supplies the narrowing for everything it renders.
 *
 * Ambient rather than a prop, for the same reason the display preferences are: it applies to every
 * panel, only some act on it, and a prop on `<component :is>` would hang a stray attribute on the
 * six that do not declare it. A panel still receives its MODEL as a prop — that half of the
 * contract is what keeps one component usable for a stored run and for a live frame.
 *
 * The channel carries the setter as well, because the roster CHANGES the selection. Routing that
 * back as an event would make the generic panel shell forward a run-specific emit, which is the
 * domain leaking into the part that must not know it.
 */
export function provideScenarioSelection(selection: ScenarioSelection): void {
  provide(SCENARIO_SELECTION, selection)
}

const WHOLE_RUN: ScenarioSelection = {
  unit: computed(() => null),
  select: () => {},
}

/**
 * The narrowing in force, or the whole run where no host supplied one — so a panel mounted on its
 * own behaves exactly as it did before a selection existed.
 */
export function useScenarioSelection(): ScenarioSelection {
  return inject(SCENARIO_SELECTION, WHOLE_RUN)
}
