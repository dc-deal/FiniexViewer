import { computed, inject, provide } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { PositionRef } from '@/types/context_types'

/**
 * The position a reader asked to look at, and the jump that puts them in front of it.
 *
 * Ambient for the same reason the scenario narrowing is: it applies to every panel, only some act
 * on it, and the panels must stay ignorant of the WORKSPACE. A panel that reached for the layout
 * store to open its sibling, or for the router to write a param, would stop being renderable from
 * a different host — which is the half of the panel contract that keeps one component usable for a
 * stored run and for a streamed frame later.
 */
export interface PositionLink {
  /** The position on show, or null. Stored with the run's context, so a reload brings it back. */
  marked: Ref<PositionRef | null> | ComputedRef<PositionRef | null>
  /** Put the reader in front of this position in that panel: make it visible, open it, scroll. */
  jumpTo: (panelId: string, ref: PositionRef) => void
  /**
   * Does that panel have a model at all? A jump to a section this run does not carry would show a
   * panel the column drops again and scroll to nothing, so the affordance is not drawn at all.
   *
   * The HOST answers it: which sections a run carries is the workspace's knowledge, and a panel
   * asking its sibling directly would be the coupling this channel exists to avoid.
   */
  canJumpTo: (panelId: string) => boolean
}

const POSITION_LINK: InjectionKey<PositionLink> = Symbol('position-link')

export function providePositionLink(link: PositionLink): void {
  provide(POSITION_LINK, link)
}

const NOWHERE: PositionLink = {
  marked: computed(() => null),
  jumpTo: () => {},
  canJumpTo: () => false,
}

/**
 * The link in force, or a dead one where no host supplied it — so a panel mounted on its own draws
 * no affordance rather than throwing.
 */
export function usePositionLink(): PositionLink {
  return inject(POSITION_LINK, NOWHERE)
}

/**
 * Is this row the marked position? Both halves must match, and a row without a `position_id` can
 * never be one — a submission, a refusal and an expiry have no position.
 */
export function marksPosition(
  marked: PositionRef | null,
  scenario: string,
  position: string | null
): boolean {
  if (!marked || position === null) return false
  return marked.scenario === scenario && marked.position === position
}
