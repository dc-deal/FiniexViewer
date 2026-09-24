<script setup lang="ts">
import { computed } from 'vue'
import TimelineChart from '@/components/base/TimelineChart.vue'
import { rowKey } from '@/api/list_key'
import {
  amount, magnitude, duration, numberOrNa, percentOrNa, signClass, utcInstant,
} from '@/components/runs/report_format'
import type { BookingPeriodRow } from '@/types/api/report_types'
import type { DeploymentSessionRow } from '@/types/api/deployment_types'
import type { LaneOrder } from '@/types/settings_types'
import type { TimelineLane, TimelineSpan } from '@/types/timeline_types'
import { t } from '@/translate'

/**
 * Booking periods as a timeline. This is the domain half: it decides what a lane is, which clock
 * the axis carries and how a period becomes a span. The drawing is `TimelineChart`, which knows
 * none of that and can be pointed at anything else.
 *
 * TWO SCOPES, TWO CLOCKS — and the second one is what goes wrong silently:
 *
 *   run scope         one lane per UNIT, axis on the run's own clock. A simulation's scenarios
 *                     each have their own period sequence, so the unit is the lane.
 *
 *   deployment scope  one lane per SESSION, axis on the SAME clock. `unit_name` is the profile
 *                     name and identical in every session, so laning by it stacks them all into
 *                     one row — that is the only thing the sessions change here.
 *
 * The stamps are never rescaled. A replayed session compresses ~27 h of market time into ~26 s of
 * wall clock, so the two differ by a factor of thousands: no single axis can carry both, and a
 * chart that squeezed the periods into their session's wall-clock window would draw a session
 * that does not exist. Where four sessions replayed one window their lanes look IDENTICAL, and
 * that is the finding — those runs are comparable because they covered the same stretch. In a
 * real forward-running deployment the two clocks coincide, so the staircase appears by itself.
 *
 * The wall-clock sequence lives in the sessions table, in `started` / `ran` / `gap_hours`.
 */
type PeriodRow = BookingPeriodRow & { run_id?: string }

const props = defineProps<{
  periods: PeriodRow[]
  /** The key tuple the response declares — a period is not unique by segment_no alone. */
  keyFields: string[]
  /**
   * Present only at deployment scope. Supplying them switches the lane to the session and the
   * axis to the wall clock; without them the periods are drawn on their own clock.
   */
  sessions?: DeploymentSessionRow[]
  /**
   * How the lanes are ordered. Owned by the HOST, because the table under the chart has to follow
   * the same order — two orders one above the other means the reader finds every row twice.
   */
  order: LaneOrder
}>()

const emit = defineEmits<{ 'update:order': [LaneOrder] }>()

function instant(iso: string): number {
  return new Date(iso).getTime()
}

/** Only periods with a readable pair of stamps — a broken one is dropped, never guessed. */
const usable = computed(() =>
  props.periods.filter(period =>
    Number.isFinite(instant(period.opened_at)) && Number.isFinite(instant(period.closed_at))
  )
)

/** Colour carries polarity, so a flat result stays neutral rather than claiming a direction. */
function tone(netPnl: number): string {
  if (netPnl > 0) return 'positive'
  if (netPnl < 0) return 'negative'
  return 'flat'
}

/**
 * Everything the row below says about this period, for the hover layer — including the EQUITY
 * BAND, which the table leaves out for width. The band is what keeps a booked result readable: a
 * trade belongs to the period it CLOSED in, so a position opened on one day and closed the next
 * puts its whole result on the second. The booked figure and the account movement then differ by
 * exactly the unrealised movement across the boundary, and a reader without the band concludes
 * that something is broken.
 */
function details(period: PeriodRow): { label: string, value: string, tone?: string }[] {
  const rows = [
    { label: t('Opened'), value: utcInstant(period.opened_at) },
    { label: t('Closed'), value: utcInstant(period.closed_at) },
    { label: t('Reason'), value: period.reason },
    { label: t('Trades'), value: String(period.trade_count) },
    {
      label: t('Net P&L'),
      value: amount(period.net_pnl, period.currency),
      tone: signClass(period.net_pnl),
    },
    { label: t('Win Rate'), value: percentOrNa(period.win_rate, period.trade_count) },
    { label: t('PF'), value: numberOrNa(period.profit_factor, period.trade_count) },
    { label: t('Fees'), value: amount(period.total_fees, period.currency) },
    { label: t('Max DD'), value: magnitude(period.max_drawdown, period.currency) },
    {
      label: t('Equity band'),
      value: `${amount(period.min_equity, period.currency)} … ${amount(period.max_equity, period.currency)}`,
    },
    { label: t('Final equity'), value: amount(period.final_equity, period.currency) },
  ]
  if (period.run_id) rows.unshift({ label: t('Run'), value: period.run_id })
  return rows
}

function span(period: PeriodRow, from: number, to: number): TimelineSpan {
  return {
    id: rowKey(period, props.keyFields),
    from,
    to,
    // 'seg' spelled out: '#' is no counter on this page, and one glyph for two different numbers
    // is read as one number
    label: `${t('seg')} ${period.segment_no}`,
    // what is left when the bar is a sliver: the number alone still identifies it
    shortLabel: String(period.segment_no),
    tone: tone(period.net_pnl),
    title: `${period.unit_name} · ${t('segment')} ${period.segment_no}`,
    details: details(period),
  }
}

/** Run scope: the periods sit on their own clock, one lane per unit. */
const runScope = computed(() => {
  const byUnit = new Map<string, PeriodRow[]>()
  for (const period of usable.value) {
    byUnit.set(period.unit_name, [...(byUnit.get(period.unit_name) ?? []), period])
  }
  const lanes: TimelineLane[] = [...byUnit.entries()].map(([name, rows]) => ({
    id: name,
    label: name,
    spans: rows.map(row => span(row, instant(row.opened_at), instant(row.closed_at))),
  }))
  const stamps = usable.value.flatMap(row => [instant(row.opened_at), instant(row.closed_at)])
  return { lanes, from: Math.min(...stamps), to: Math.max(...stamps) }
})

/**
 * Deployment scope: the lane is the session on the wall clock, its periods stretched into the
 * window it ran. Where every period shares one instant there is no proportion to preserve, so the
 * window is divided into equal slices in the order the ledger returned them.
 */
const deploymentScope = computed(() => {
  const sessions = props.sessions ?? []
  const lanes: TimelineLane[] = []

  for (const session of sessions) {
    const rows = usable.value.filter(period => period.run_id === session.run_id)
    if (!rows.length) continue

    lanes.push({
      id: session.run_id,
      label: session.run_id,
      // a lane names a run, and a run can be opened — so the label is the way in
      to: { name: 'runs', query: { run: session.run_id } },
      spans: rows.map(row => span(row, instant(row.opened_at), instant(row.closed_at))),
    })
  }

  const stamps = usable.value.flatMap(row => [instant(row.opened_at), instant(row.closed_at)])
  return { lanes, from: Math.min(...stamps), to: Math.max(...stamps) }
})

const unsorted = computed(() =>
  props.sessions?.length ? deploymentScope.value : runScope.value
)

const scope = computed(() => {
  const current = unsorted.value
  if (props.order === 'name') {
    return { ...current, lanes: [...current.lanes].sort((a, b) => a.label.localeCompare(b.label)) }
  }
  const earliest = (lane: typeof current.lanes[number]): number =>
    Math.min(...lane.spans.map(span => span.from))
  return { ...current, lanes: [...current.lanes].sort((a, b) => earliest(a) - earliest(b)) }
})

/**
 * Where a booking closed. Distinct instants only: four sessions that booked at the same trading-day
 * anchor produce one line, not four on top of each other.
 */
const closings = computed(() =>
  [...new Set(usable.value.map(row => instant(row.closed_at)))].sort((a, b) => a - b)
)

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A scale shorter than a day gets clock-only ticks and names its date ONCE, beneath the axis.
 * Five full timestamps do not fit the width and collide into each other, which is the one defect
 * the validator cannot see — it checks colour, not layout.
 */
const withinOneDay = computed(() => scope.value.to - scope.value.from < DAY_MS)

const scaleNote = computed(() => {
  const clock = props.sessions?.length
    ? t("Axis: the run's own clock, unscaled. Sessions that replayed one window therefore look alike — which is what makes them comparable. When they ran is in the table above.")
    : t("Axis: the run's own clock — simulated market time in a backtest.")
  if (!withinOneDay.value) return clock
  const day = utcInstant(new Date(scope.value.from).toISOString()).split(' ')[0] ?? ''
  return `${clock} ${t('All times on')} ${day}.`
})

function axisFormat(value: number): string {
  const stamp = utcInstant(new Date(value).toISOString())
  return withinOneDay.value ? (stamp.split(' ')[1] ?? stamp) : stamp
}

const HOUR_MS = 60 * 60 * 1000

/**
 * An empty stretch longer than the LONGEST booking period is removed from the axis and named.
 *
 * The threshold comes from the data rather than from a constant, because the data is the only
 * thing that knows what "long" means here: a stretch that dwarfs the longest thing anyone booked
 * carries nothing worth the width it would take, and a deployment idle over a weekend otherwise
 * squeezes every bar to a sliver. Nothing is compressed — the stretch is REMOVED — so every drawn
 * length and every ratio between them stays exact.
 */
const longestSpan = computed(() => {
  const lengths = scope.value.lanes.flatMap(lane => lane.spans.map(span => span.to - span.from))
  return lengths.length ? Math.max(...lengths) : 0
})

function gapLabel(millis: number): string {
  return `${duration(millis / HOUR_MS)} ${t('idle')}`
}

/** Said once where there are too many removals to name each — summarised, never hidden. */
function breaksLabel(count: number, total: number): string {
  return `${count} ${t('breaks')} · ${duration(total / HOUR_MS)} ${t('idle removed')}`
}

/**
 * A kept piece of the axis as ONE label. Two timestamps side by side are wider than a short piece
 * of the plot, so they overprint; a range says the same in the room that is there. The shared
 * leading part is dropped, because repeating it is what made the pair too wide to begin with.
 */
function rangeLabel(from: number, to: number): string {
  const start = utcInstant(new Date(from).toISOString())
  const end = utcInstant(new Date(to).toISOString())
  if (start === end) return start
  const [startDay = '', startClock = ''] = start.split(' ')
  const [endDay = '', endClock = ''] = end.split(' ')
  // same day: name it once and let the two clocks carry the difference
  if (startDay === endDay) return `${startDay} ${startClock} → ${endClock}`
  // same year: the year is the same four characters on both sides and says nothing
  if (startDay.slice(0, 4) === endDay.slice(0, 4)) {
    return `${startDay.slice(5)} ${startClock} → ${endDay.slice(5)} ${endClock}`
  }
  return `${start} → ${end}`
}
</script>

<template>
  <div v-if="scope.lanes.length" class="booking-timeline">
    <!-- only where there is more than one lane to order -->
    <div v-if="scope.lanes.length > 1" class="order-control">
      <span class="order-label">{{ t('Order lanes by') }}</span>
      <button
        class="order-button"
        :class="{ active: order === 'time' }"
        @click="emit('update:order', 'time')"
      >{{ t('start time') }}</button>
      <button
        class="order-button"
        :class="{ active: order === 'name' }"
        @click="emit('update:order', 'name')"
      >{{ t('name') }}</button>
    </div>

    <TimelineChart
      :lanes="scope.lanes"
      :from="scope.from"
      :to="scope.to"
      :format="axisFormat"
      :scale-note="scaleNote"
      :markers="closings"
      :collapse-gaps-longer-than="longestSpan"
      :format-gap="gapLabel"
      :format-range="rangeLabel"
      :format-breaks="breaksLabel"
      :ticks="4"
    />
  </div>
</template>

<style scoped>
.booking-timeline {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.order-control {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.order-label { color: var(--color-text-secondary); }

.order-button {
  padding: 1px var(--space-sm);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-bg-elevated);
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.order-button.active {
  color: var(--color-text-primary);
  border-color: var(--color-accent);
}
</style>
