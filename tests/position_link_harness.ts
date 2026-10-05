import { ref } from 'vue'
import type { Ref } from 'vue'
import { providePositionLink } from '@/composables/use_position_link'
import type { PositionRef } from '@/composables/use_position_link'

/** What a test host hands the panels, and what it records about what they asked for. */
export interface TestPositionLink {
  marked: Ref<PositionRef | null>
  /** Every jump a panel asked for, in order: the panel it named and the position it named. */
  jumps: { panelId: string, ref: PositionRef }[]
}

/**
 * The position link for a test host, behaving the way `RunsView` does.
 *
 * Shared rather than rebuilt per suite, for the reason the scenario harness states: two panels act
 * on this channel and two copies of the recording would drift. The jump is RECORDED rather than
 * performed — making a panel visible and scrolling to a row is the view's work, and a panel test
 * has no workspace to do it in.
 *
 * `reachable` says which panels have a model, which is what decides whether an affordance is drawn
 * at all. Default: every panel, because most tests are about the affordance rather than its absence.
 */
export function provideTestPositionLink(
  marked: PositionRef | null = null,
  reachable: string[] | 'all' = 'all'
): TestPositionLink {
  const state: TestPositionLink = { marked: ref(marked), jumps: [] }
  providePositionLink({
    marked: state.marked,
    jumpTo: (panelId: string, ref: PositionRef) => { state.jumps.push({ panelId, ref }) },
    canJumpTo: (panelId: string) => reachable === 'all' || reachable.includes(panelId),
  })
  return state
}
