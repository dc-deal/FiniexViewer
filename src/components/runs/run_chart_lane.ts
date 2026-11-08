import { periodCard } from '@/components/runs/booking_period_card'
import { ORDER_REFUSALS, polarity, quantity, sortInstant, utcInstant } from '@/components/runs/report_format'
import { barOf } from '@/components/runs/run_chart_marks'
import type { BookingPeriodRow, OrderHistoryRow } from '@/types/api/report_types'
import type { LaneMarkDrawing, SpanDrawing } from '@/types/chart_drawing_types'
import type { Figure, FigureCard, Polarity } from '@/types/figure_types'
import { plural, t } from '@/translate'

/**
 * What the run chart draws in its TIME LANE along the bottom of the pane (viewer#41, section D): the
 * booking periods of the unit on show, and its orders refused or expired, which have no price to
 * stand at. Pure functions over what the run's reports already hold — the booking periods and the
 * order history; nothing here fetches, and nothing is computed that the rows do not state.
 */

/** A period's result as a word inside its strip, beside its colour — a colour never travels alone. */
const SIGN_WORD: Record<Polarity, string> = { positive: '+', negative: '−', flat: '0' }

/** The order endings the lane shows: the refusals, read together, and the expiry (their `order-history`). */
const ENDINGS = new Set([...ORDER_REFUSALS, 'expired'])

/** How many members a gathered mark's card lists before it says how many more there are. */
const GATHERED_LINES = 8

function seconds(iso: string): number {
  return sortInstant(iso) / 1000
}

/** The ISO-8601 form of an instant in UTC seconds, for the formatter that reads a stamp. */
function stamp(at: number): string {
  return new Date(at * 1000).toISOString()
}

/**
 * The unit's booking periods as spans, from the bar each opened in to the bar it closed in. A period
 * that opened before the first bar loaded starts at it; one that closed before it, or opened past
 * the bars loaded (`cutAt`), is not drawn yet. Its colour is the polarity of its `net_pnl`, its card
 * the one the period table and the timeline show.
 */
export function periodSpans(
  periods: BookingPeriodRow[], unit: string, barTimes: number[], cutAt: number | null,
): SpanDrawing[] {
  const first = barTimes[0]
  if (first === undefined) return []
  const spans: SpanDrawing[] = []
  for (const period of periods) {
    if (period.unit_name !== unit) continue
    const opened = seconds(period.opened_at)
    const closed = seconds(period.closed_at)
    if (closed <= first || (cutAt !== null && opened > cutAt)) continue
    const from = barOf(barTimes, opened) ?? first
    const to = barOf(barTimes, cutAt !== null ? Math.min(closed, cutAt) : closed)!
    // closed at a bar's open, the period ends where that bar starts — where the next one opens
    const endsAtOpen = to === closed
    if (endsAtOpen && to <= from) continue
    const role = polarity(period.net_pnl)
    spans.push({
      kind: 'span',
      id: `period|${unit}|${period.period_no}`,
      from,
      to,
      endsAtOpen,
      label: SIGN_WORD[role],
      role,
      card: periodCard(period),
    })
  }
  return spans
}

/** One order refused or expired, with its line in the card of a gathered mark. */
interface LaneEvent {
  mark: LaneMarkDrawing
  line: Figure
}

/** Why it ended, in the backend's words: a refusal's reason, or what ended an expiry. */
function reasonOf(row: OrderHistoryRow): string | null {
  return row.rejection_reason ?? row.end_reason ?? null
}

/**
 * The card of one order, in the words of the Orders panel: its status and when it ended, how it was
 * asked, why — the reason and the backend's sentence on one line, as that panel joins them — and the
 * order id last, since that id is the POSITION's and repeats on every order of it.
 */
function orderCard(row: OrderHistoryRow): FigureCard {
  const details: Figure[] = [
    { label: t('Status'), value: row.status },
    { label: t('Event'), value: utcInstant(row.event_time) },
  ]
  if (row.direction) details.push({ label: t('Direction'), value: row.direction })
  if (row.order_type) details.push({ label: t('Type'), value: row.order_type })
  if (row.requested_lots !== null) details.push({ label: t('Lots'), value: quantity(row.requested_lots) })
  const reason = [reasonOf(row), row.rejection_message].filter(Boolean).join(' · ')
  if (reason) details.push({ label: t('Reason'), value: reason })
  details.push({ label: t('Order id'), value: row.order_id })
  const refused = ORDER_REFUSALS.has(row.status)
  return { title: refused ? t('Order refused') : t('Order expired'), details }
}

/**
 * The unit's orders refused (`ORDER_REFUSALS`) or expired, one mark each at the bar it ended in:
 * a cross for a refusal in the warning role, a ring for an expiry in the quiet one. An order that
 * ended before the first bar loaded or past the bars loaded is not drawn.
 */
function laneEvents(orders: OrderHistoryRow[], unit: string, barTimes: number[], cutAt: number | null): LaneEvent[] {
  const events: LaneEvent[] = []
  for (const row of orders) {
    if (row.scenario_name !== unit || !ENDINGS.has(row.status) || row.event_time === null) continue
    const at = seconds(row.event_time)
    if (cutAt !== null && at > cutAt) continue
    const time = barOf(barTimes, at)
    if (time === null) continue
    const refused = ORDER_REFUSALS.has(row.status)
    events.push({
      mark: {
        kind: 'lane-mark',
        id: `order|${unit}|${row.order_id}|${row.event_time}`,
        time,
        at,
        shape: refused ? 'cross' : 'ring',
        text: '',
        role: refused ? 'warning' : 'flat',
        card: orderCard(row),
      },
      line: { label: row.status, value: [utcInstant(row.event_time), reasonOf(row)].filter(Boolean).join(' · ') },
    })
  }
  return events.sort((a, b) => a.mark.at - b.mark.at)
}

/**
 * A gathered mark's card: what its members are and when they ended, one line each under its status
 * — nothing summed. Its title counts the refused and the expired apart where both are among them.
 */
function gatheredCard(members: LaneEvent[]): FigureCard {
  const refused = members.filter(member => member.mark.shape === 'cross').length
  const expired = members.length - refused
  const shown = members.slice(0, GATHERED_LINES)
  const rest = members.length - shown.length
  const instants = members.map(member => member.mark.at)
  const details: Figure[] = [
    { label: t('Between'), value: `${utcInstant(stamp(Math.min(...instants)))} – ${utcInstant(stamp(Math.max(...instants)))}` },
    ...shown.map(member => member.line),
  ]
  if (rest > 0) details.push({ label: `+${rest}`, value: t('more — zoom in to draw them apart') })
  const title = [
    refused ? plural(refused, t('order refused'), t('orders refused')) : null,
    expired ? plural(expired, refused ? t('expired') : t('order expired'), refused ? t('expired') : t('orders expired')) : null,
  ].filter(Boolean).join(' · ')
  return { title, details }
}

/** One mark for a group: a cross where a refusal is among them — the one to weigh — a ring where only expiries are. */
function gathered(members: LaneEvent[]): LaneMarkDrawing {
  const first = members[0]!.mark
  if (members.length === 1) return first
  const refusal = members.find(member => member.mark.shape === 'cross')?.mark ?? first
  return {
    ...first, shape: refusal.shape, role: refusal.role,
    id: `gathered|${first.id}`, text: `×${members.length}`, card: gatheredCard(members),
  }
}

/** How many marks wide a mark with its count stands: the count beside it takes about two more. */
const COUNTED_REACH = 3

/**
 * The unit's orders refused or expired as the lane draws them: marks that stand closer than a mark
 * is wide gathered into ONE with a count, its card listing them — the way the trades' marks gather
 * (`gatherMarks`), so one run's 761 refusals, up to 119 in one M1 candle, read as a few counted marks
 * and split again as the reader zooms in. The lane is ONE row, so crosses and rings gather together:
 * kept apart they stood over each other. A group runs from its first member `perMark` bars on, and
 * once it carries a count, `COUNTED_REACH` times that — the count stands beside the mark, and the next
 * mark drawn within it covered the count (on screen 2026-11-08).
 */
export function refusalMarks(
  orders: OrderHistoryRow[], unit: string, barTimes: number[], cutAt: number | null, perMark: number,
): LaneMarkDrawing[] {
  const index = new Map(barTimes.map((time, at) => [time, at]))
  const result: LaneMarkDrawing[] = []
  let group: LaneEvent[] = []
  for (const event of laneEvents(orders, unit, barTimes, cutAt)) {
    const reach = group.length > 1 ? perMark * COUNTED_REACH : perMark
    if (group.length && (index.get(event.mark.time) ?? 0) - (index.get(group[0]!.mark.time) ?? 0) < reach) {
      group.push(event)
      continue
    }
    if (group.length) result.push(gathered(group))
    group = [event]
  }
  if (group.length) result.push(gathered(group))
  return result
}
