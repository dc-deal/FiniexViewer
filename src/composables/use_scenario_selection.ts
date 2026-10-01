import { computed, inject, provide } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'

/** The scenarios a reader has narrowed to, and the only ways to change that. */
export interface ScenarioSelection {
  /** The scenarios on show. EMPTY means the whole run — never "nothing". */
  units: Ref<string[]> | ComputedRef<string[]>
  /** Adds a scenario to the narrowing, or takes it out again. */
  toggle: (unit: string) => void
  /** Back to the whole run. */
  clear: () => void
}

const SCENARIO_SELECTION: InjectionKey<ScenarioSelection> = Symbol('scenario-selection')

/**
 * The host supplies the narrowing for everything it renders.
 *
 * Ambient rather than a prop, for the same reason the display preferences are: it applies to every
 * panel, only some act on it, and a prop on `<component :is>` would hang a stray attribute on the
 * ones that do not declare it. A panel still receives its MODEL as a prop — that half of the
 * contract is what keeps one component usable for a stored run and for a streamed frame later.
 *
 * The channel carries the WRITERS too, because the roster changes the selection. Routed back as an
 * event, the generic panel shell would have to forward a run-specific emit, which is the domain
 * leaking into the part that must not know it.
 */
export function provideScenarioSelection(selection: ScenarioSelection): void {
  provide(SCENARIO_SELECTION, selection)
}

const WHOLE_RUN: ScenarioSelection = {
  units: computed(() => []),
  toggle: () => {},
  clear: () => {},
}

/**
 * The narrowing in force, or the whole run where no host supplied one — so a panel mounted on its
 * own behaves exactly as it did before a selection existed.
 */
export function useScenarioSelection(): ScenarioSelection {
  return inject(SCENARIO_SELECTION, WHOLE_RUN)
}

/**
 * Does this row belong to what is on show? An empty narrowing admits everything, which is what
 * makes the same predicate serve both states without a branch at every call site.
 */
export function showsUnit(units: string[], name: string): boolean {
  return units.length === 0 || units.includes(name)
}
