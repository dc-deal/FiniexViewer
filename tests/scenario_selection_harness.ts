import { ref } from 'vue'
import type { Ref } from 'vue'
import { provideScenarioSelection } from '@/composables/use_scenario_selection'

/**
 * A scenario narrowing for a test host, behaving the way `RunsView` does.
 *
 * Shared rather than rebuilt in each panel test: four suites mount a panel under a host that
 * carries the narrowing, and four copies of the toggle logic would drift the moment the channel
 * changes — which it already did once, from one name to a list.
 *
 * Call inside a host component's `setup`, then assert against the returned ref.
 */
export function provideTestSelection(initial: string[] = []): Ref<string[]> {
  const units = ref<string[]>([...initial])
  provideScenarioSelection({
    units,
    toggle: (unit: string) => {
      units.value = units.value.includes(unit)
        ? units.value.filter(name => name !== unit)
        : [...units.value, unit]
    },
    clear: () => { units.value = [] },
  })
  return units
}
