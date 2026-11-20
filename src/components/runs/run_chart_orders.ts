import { priceAt, sortInstant, utcInstant } from '@/components/runs/report_format'
import { barOf } from '@/components/runs/run_chart_marks'
import type { OrderEvent } from '@/types/api/report_types'
import type { SegmentDrawing } from '@/types/chart_drawing_types'
import type { Figure } from '@/types/figure_types'
import { t } from '@/translate'

/**
 * The orders of a unit that rested at the venue, each on its price from where it was taken to the
 * step that ended it (viewer#41) — read off the unit's order-event stream. Their glossary: *resting*
 * is "a pending order the venue (or the trade simulator) has accepted and that waits for its price".
 *
 * Every value is a served field. The steps of one order are grouped by `submitted_seq`, their join
 * key ("Group by `scenario_name` and `submitted_seq`", the order-events document), read in `seq`
 * order, never by time; the price is the step's `limit_price`, or its `trigger_price` where it has no
 * limit or waits for its trigger; the times are the steps' `event_time`. A market order has no price
 * to rest at, a `denied` one was never sent, and one the venue never took never rested: none is drawn.
 */

/** The steps from which an order rests: taken by the venue, or found there at a session's start. */
const RESTS = new Set(['accepted', 'adopted'])
/** The steps after which it waits for nothing. `unaccounted` is none: the venue may still hold it. */
const ENDS = new Set(['filled', 'cancelled', 'expired', 'rejected', 'undelivered'])

function seconds(iso: string): number {
  return sortInstant(iso) / 1000
}

/** One stretch at one price: from the step it began at, to the one it ended at — none while it rests on. */
interface Stretch {
  price: number
  /** Whether the price is the order's trigger, the stop it waits for — else its limit. */
  trigger: boolean
  from: OrderEvent
  to: OrderEvent | null
  /** The step that moved the order to this price, after the first: a modification or its trigger. */
  moved: OrderEvent | null
}

/** The price an order waits at on a step: its trigger until that is reached, its limit after. */
function waitsAt(step: OrderEvent, triggered: boolean): { price: number, trigger: boolean } | null {
  if (!triggered && step.trigger_price !== null) return { price: step.trigger_price, trigger: true }
  if (step.limit_price !== null) return { price: step.limit_price, trigger: false }
  return null
}

/** One order's stretches at rest, in order — a modification or a trigger starting the next. */
function stretchesOf(steps: OrderEvent[]): Stretch[] {
  const stretches: Stretch[] = []
  let open: Stretch | null = null
  let triggered = false
  const close = (step: OrderEvent): void => {
    if (open) stretches.push({ ...open, to: step })
    open = null
  }
  for (const step of steps) {
    if (RESTS.has(step.event_type)) {
      if (open) continue
      const at = waitsAt(step, triggered)
      if (at) open = { ...at, from: step, to: null, moved: null }
    } else if (step.event_type === 'modified' || step.event_type === 'triggered') {
      if (!open) continue
      close(step)
      if (step.event_type === 'triggered') triggered = true
      // a `modified` step carries the order's NEW limit or trigger, and the steps after it the same —
      // measured 2026-11-16 on run 20261116_143059_c6c7e202, unit EURUSD_sweep_w1: 1.16953, then 1.16914
      // a stop without a limit fills at the market once reached: it rests no longer
      const at = waitsAt(step, triggered)
      if (at) open = { ...at, from: step, to: null, moved: step }
    } else if (ENDS.has(step.event_type)) {
      close(step)
    }
  }
  if (open) stretches.push(open)
  return stretches
}

/** The first value a field has over an order's steps — every step carries the order's facts. */
function factOf<K extends 'order_type' | 'action' | 'direction' | 'lots' | 'position_id'>(
  steps: OrderEvent[], field: K,
): OrderEvent[K] | null {
  return steps.find(step => step[field] !== null)?.[field] ?? null
}

/** The order's own words, as served: `limit · open long`. */
function wordsOf(steps: OrderEvent[]): string {
  const side = [factOf(steps, 'action'), factOf(steps, 'direction')].filter(Boolean).join(' ')
  return [factOf(steps, 'order_type'), side].filter(Boolean).join(' · ')
}

function when(step: OrderEvent): string {
  return step.event_time ? utcInstant(step.event_time) : t('before the session clock was set')
}

/** A stretch's card: the order's facts, the price of this stretch, and the step that ended the order. */
function card(steps: OrderEvent[], stretch: Stretch, end: OrderEvent | null, tick: number | null): SegmentDrawing['card'] {
  const first = steps.find(step => RESTS.has(step.event_type))!
  const details: Figure[] = [
    { label: stretch.trigger ? t('Trigger') : t('Limit'), value: priceAt(stretch.price, tick) },
  ]
  const lots = factOf(steps, 'lots')
  if (lots !== null) details.push({ label: t('Lots'), value: String(lots) })
  details.push({ label: first.event_type === 'adopted' ? t('Adopted') : t('Accepted'), value: when(first) })
  if (stretch.moved) {
    details.push({ label: stretch.moved.event_type === 'triggered' ? t('Triggered') : t('Modified'), value: when(stretch.moved) })
  }
  details.push({ label: t('Ended'), value: end ? `${end.event_type} · ${when(end)}` : t('not in the record') })
  if (end?.end_reason) details.push({ label: t('End reason'), value: end.end_reason })
  if (end?.initiator) details.push({ label: t('Initiator'), value: end.initiator })
  const position = factOf(steps, 'position_id')
  if (position !== null) details.push({ label: t('Position'), value: position })
  return { title: `${t('Resting order')} · ${wordsOf(steps)}`, details }
}

/**
 * The bar a stretch starts at — none past how far the bars are loaded. One that rested into the bars
 * from before them starts at their first bar; an order taken over at a session's start, its time
 * unset, starts there as well.
 */
function startBar(step: OrderEvent, barTimes: number[], first: number, cutAt: number | null): number | null {
  if (!step.event_time) return first
  const at = seconds(step.event_time)
  if (cutAt !== null && at > cutAt) return null
  return barOf(barTimes, at) ?? first
}

/**
 * The resting orders of one unit's steps, one segment per stretch at one price. `cutAt` is how far
 * the bars are loaded while the window holds more: a stretch that ends past it runs to the edge, one
 * that starts past it waits for its bar. `tick` prints a card's price at the instrument's tick size,
 * while the drawing keeps the price as served.
 */
export function restingOrders(
  events: OrderEvent[], unit: string, barTimes: number[], cutAt: number | null, tick: number | null = null,
): SegmentDrawing[] {
  const orders = new Map<number, OrderEvent[]>()
  for (const step of events) {
    if (step.scenario_name !== unit || step.submitted_seq === null) continue
    const steps = orders.get(step.submitted_seq) ?? []
    steps.push(step)
    orders.set(step.submitted_seq, steps)
  }
  const first = barTimes[0]
  if (first === undefined) return []
  const segments: SegmentDrawing[] = []
  for (const [order, unsorted] of orders) {
    const steps = [...unsorted].sort((a, b) => a.seq - b.seq)
    const all = stretchesOf(steps)
    const ended = all.at(-1)?.to ?? null
    all.forEach((stretch, index) => {
      const end = stretch.to?.event_time ? seconds(stretch.to.event_time) : null
      // over before the bars begin: nothing of it stands on a candle
      if (end !== null && end < first) return
      const from = startBar(stretch.from, barTimes, first, cutAt)
      if (from === null) return
      // still resting, or ended past what is loaded: to the edge
      const to = end === null || (cutAt !== null && end > cutAt) ? null : barOf(barTimes, end)
      segments.push({
        kind: 'segment',
        id: `order|${unit}|${order}|${index}`,
        from,
        to,
        price: stretch.price,
        // the order's words where it begins, once: a moved price continues the same order
        label: index === 0 ? wordsOf(steps) : '',
        role: 'order',
        stroke: 'dotted',
        focused: false,
        card: card(steps, stretch, ended, tick),
      })
    })
  }
  return segments
}
