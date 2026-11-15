import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { getOrderEvents } from '@/api/api_client'
import { describeFailure } from '@/stores/describe_failure'
import { isAbsent } from '@/types/api/absence_types'
import type { OrderEvent } from '@/types/api/report_types'

/** The unit whose order steps are read. */
export interface OrderStepsTarget {
  runId: string
  unit: string
}

/**
 * The order steps of the unit on the run chart (viewer#41): every step of every order it placed,
 * from the unit's order-event stream — the route's own narrowing, `scenario_name` — for the orders
 * that rested at a price. Read once per run and unit: measured 2026-11-15, one unit of a backtest of
 * 129 trades answered 57 KB in 0.34 s where the whole run is 404 KB.
 *
 * A run without the stream answers an absence, and there is nothing to draw: every backtest that
 * never placed an order, and every run from before the stream existed.
 */
export const useChartOrdersStore = defineStore('chart_orders', () => {
  const events = shallowRef<OrderEvent[]>([])
  /** Why the steps could not be read, in words; null once a later read succeeds. */
  const error = ref<string | null>(null)

  /** The run and unit last asked for, so the same pair is never read twice in a row. */
  let held: string | null = null
  /** Counts the pairs followed, so an answer that arrives after the reader moved on is dropped. */
  let generation = 0

  /** Reads the steps of a unit — or forgets them, where no unit is on show. */
  async function follow(target: OrderStepsTarget | null): Promise<void> {
    const key = target ? `${target.runId}|${target.unit}` : null
    if (key === held) return
    held = key
    const own = ++generation
    events.value = []
    error.value = null
    if (!target) return
    try {
      const answer = await getOrderEvents(target.runId, target.unit)
      if (own !== generation) return
      events.value = isAbsent(answer) ? [] : answer.events
    } catch (failure) {
      if (own !== generation) return
      // asked again at the next pair: a failed read is not held as read
      held = null
      error.value = describeFailure(failure, 'The order steps could not be read')
    }
  }

  return { events, error, follow }
})
