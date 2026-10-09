import { ref } from 'vue'
import type { Ref } from 'vue'
import { provideOrderSteps } from '@/composables/use_order_steps'
import type { PositionRef } from '@/composables/use_position_link'
import type { OrderEvent } from '@/types/api/report_types'

/** What a test host hands the panel, and what it records about what the panel asked for. */
export interface TestOrderSteps {
  /** Every position whose steps a panel asked for, in order. One entry per request. */
  asked: PositionRef[]
  /** The steps the host answers with, keyed `scenario~position`. Empty means nothing is held. */
  held: Ref<Map<string, OrderEvent[]>>
  /** Which positions the host is still reading, so the waiting state can be exercised. */
  reading: Ref<Set<string>>
}

/**
 * The step capability for a test host, behaving the way `RunsView` does.
 *
 * The request is RECORDED rather than performed: which run is selected and when a fetch happens is
 * the view's work, and a panel test has no workspace to do it in. What the panel is responsible for
 * — asking once, on opening, for the position the reader opened — is exactly what `asked` proves.
 *
 * `available` defaults to true because most tests are about the disclosure rather than its absence.
 * A run that wrote no stream is the case for `available: false`, and the panel must then draw no
 * affordance at all rather than one that can only answer 404.
 */
export function provideTestOrderSteps(
  held: Record<string, OrderEvent[]> = {},
  available = true,
  reading: string[] = []
): TestOrderSteps {
  const state: TestOrderSteps = {
    asked: [],
    held: ref(new Map(Object.entries(held))),
    reading: ref(new Set(reading)),
  }
  const key = (ref_: PositionRef) => `${ref_.scenario}~${ref_.position}`
  provideOrderSteps({
    available: () => available,
    heldFor: (ref_: PositionRef) => state.held.value.get(key(ref_)) ?? null,
    loadingFor: (ref_: PositionRef) => state.reading.value.has(key(ref_)),
    askFor: (ref_: PositionRef) => { state.asked.push(ref_) },
  })
  return state
}

/** One step, with the fields a display reads and nulls everywhere a real stream carries them. */
export function step(overrides: Partial<OrderEvent> = {}): OrderEvent {
  return {
    scenario_name: 'EURGBP_partial_close',
    seq: 1,
    event_type: 'submitted',
    order_id: 'pos_eurgbp_1',
    submitted_seq: 1,
    record_plane: 'bot',
    position_id: null,
    action: 'open',
    order_type: 'limit',
    symbol: 'EURGBP',
    direction: 'long',
    client_order_id: null,
    broker_ref: null,
    previous_broker_ref: null,
    trade_id: null,
    lots: 0.01,
    cum_lots: null,
    fill_price: null,
    limit_price: null,
    trigger_price: null,
    fee: null,
    fee_currency: null,
    submission_mid: null,
    submission_time_msc: null,
    in_flight_ms: null,
    event_time: '2026-10-08T10:36:27.000000+00:00',
    ts_init: null,
    initiator: null,
    end_reason: null,
    rejection_reason: null,
    venue_reason: null,
    message: null,
    lost_request: null,
    ...overrides,
  }
}
