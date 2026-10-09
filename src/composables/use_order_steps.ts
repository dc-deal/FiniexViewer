import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'
import type { PositionRef } from '@/composables/use_position_link'
import type { OrderEvent } from '@/types/api/report_types'

/**
 * The steps an order went through, asked for ONE POSITION at a time.
 *
 * Ambient for the same reason the position link is: the panel must stay ignorant of the workspace.
 * It is also the one section that is not loaded per run — the stream is the largest thing this API
 * serves here, 1,025 events on one stored run against the four of a position a reader opened, and
 * the route itself narrows on `(scenario_name, order_id)`. So the request a reader causes is the
 * one they asked for, and the host owns when it happens.
 */
export interface OrderSteps {
  /**
   * Does this run have a stream at all? The HOST answers it, from the run index's `stream_files` —
   * which is where the backend names it, because the file is not a report artifact and appears in
   * no run's `artifacts` list. Drawing the affordance without it would offer a reader a disclosure
   * that can only ever answer 404.
   */
  available: () => boolean
  /** The steps held for this position, or null where none have been asked for yet. */
  heldFor: (ref: PositionRef) => OrderEvent[] | null
  /** Whether this position's request is in flight — several positions may be open at once. */
  loadingFor: (ref: PositionRef) => boolean
  /** Ask for them. Idempotent: a position already held is not fetched a second time. */
  askFor: (ref: PositionRef) => void
}

const ORDER_STEPS: InjectionKey<OrderSteps> = Symbol('order-steps')

export function provideOrderSteps(steps: OrderSteps): void {
  provide(ORDER_STEPS, steps)
}

const NONE: OrderSteps = {
  available: () => false,
  heldFor: () => null,
  loadingFor: () => false,
  askFor: () => {},
}

/**
 * The capability in force, or a dead one where no host supplied it — so a panel mounted on its own
 * draws no disclosure rather than throwing.
 */
export function useOrderSteps(): OrderSteps {
  return inject(ORDER_STEPS, NONE)
}

/** A denied order was never submitted, so it belongs to no submission and gets its own bucket. */
const UNSUBMITTED = 'unsubmitted'

/**
 * Which ORDER a step belongs to, as the key a list groups by.
 *
 * **`order_id` does not identify an order and must never be used for this.** Their sentence: *"a
 * position's open and its market closes share it"* — measured on `pos_ethusd_1` of the field study,
 * one `order_id` covers two orders, and on the capture's partial close it covers four. The field
 * that identifies one order is `submitted_seq`, and grouping by it is their instruction rather than
 * our arrangement.
 *
 * `scenario_name` is the other half of their rule and is not applied here, because the request was
 * already narrowed to one scenario — every step in this list belongs to it.
 *
 * Null is a VALUE here, not a missing one: *"A `denied` order was never submitted and carries
 * none"*, so those steps group together rather than each becoming an order of its own.
 */
export function orderKeyOf(step: OrderEvent): string {
  return step.submitted_seq === null ? UNSUBMITTED : String(step.submitted_seq)
}
