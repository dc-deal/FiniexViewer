<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import AppButton from '@/components/base/AppButton.vue'
import TimelineChart from '@/components/base/TimelineChart.vue'
import { useOpenInContext } from '@/composables/use_open_in_context'
import { useViewWindow } from '@/composables/use_panel_view'
import { rowKey } from '@/api/list_key'
import { periodFigures, periodTitle, type PeriodRow } from '@/components/runs/booking_period_card'
import {
  clampWindow, offeredPresets, openingPreset, presetIn, presetOf, type WindowPreset,
} from '@/components/runs/booking_period_window'
import { duration, polarity, utcInstant } from '@/components/runs/report_format'
import type { DeploymentSessionRow } from '@/types/api/deployment_types'
import type { LaneOrder } from '@/types/settings_types'
import type { TimelineLane, TimelineSpan, TimeWindow } from '@/types/timeline_types'
import { plural, t } from '@/translate'

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
const props = defineProps<{
  periods: PeriodRow[]
  /** The key tuple the response declares — a period is not unique by period_no alone. */
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
  /** The run or deployment on show: the window a long timeline frames is kept for it alone; without one, for this mount. */
  scopeId?: string | null
}>()

const emit = defineEmits<{ 'update:order': [LaneOrder] }>()

const { openRun, canOpen } = useOpenInContext()

/**
 * `NaN` where a stamp cannot be read, which `usable` below drops. Not the pickers' `sortInstant`:
 * a sort needs a number for every row, a drawing must not place a broken row at 1970.
 */
function instant(iso: string): number {
  return new Date(iso).getTime()
}

/** Only periods with a readable pair of stamps — a broken one is dropped, never guessed. */
const usable = computed(() =>
  props.periods.filter(period =>
    Number.isFinite(instant(period.opened_at)) && Number.isFinite(instant(period.closed_at))
  )
)

function span(period: PeriodRow, from: number, to: number): TimelineSpan {
  return {
    id: rowKey(period, props.keyFields),
    from,
    to,
    // spelled out: '#' is no counter on this page, and one glyph for two different numbers
    // is read as one number
    label: `${t('period')} ${period.period_no}`,
    // what is left when the bar is a sliver: the number alone still identifies it
    shortLabel: String(period.period_no),
    tone: polarity(period.net_pnl),
    // one card for the bar and for the table's row (`booking_period_card.ts`)
    title: periodTitle(period),
    details: periodFigures(period),
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
      ...(canOpen ? { open: () => openRun(session.run_id) } : {}),
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
  // Two units CAN open at the same instant — measured 2026-09-29, one pair of a walk-forward set
  // to the millisecond — and then the order came from whatever sequence the response happened to
  // carry. The name settles it, so the same run draws the same chart twice. Only an exact tie:
  // a millisecond apart is a real difference, and a tolerance would be a rule we invented.
  return {
    ...current,
    lanes: [...current.lanes].sort((a, b) =>
      earliest(a) - earliest(b) || a.label.localeCompare(b.label)),
  }
})

/** The calendar day of an instant, `2025-10-13`. */
function utcDay(value: number): string {
  return new Date(value).toISOString().slice(0, 10)
}

/**
 * A scale inside ONE calendar day gets clock-only ticks and names its date ONCE, beneath the axis.
 * Five full timestamps do not fit the width and collide into each other, which is the one defect
 * the validator cannot see — it checks colour, not layout. The calendar day rather than 24 hours: a
 * scale from 23:00 to 01:00 is shorter than a day and still crosses midnight, and *All times on*
 * its first day was then wrong for every mark after it.
 */
const withinOneDay = computed(() => utcDay(scope.value.from) === utcDay(scope.value.to))

const scaleNote = computed(() => {
  const clock = props.sessions?.length
    ? t('Axis: the canonical clock, unscaled. Sessions that replayed one window therefore look alike — which is what makes them comparable. When they ran is in the table above.')
    : t("Axis: the canonical clock — the market time the run read, not the machine's.")
  if (!withinOneDay.value) return clock
  const day = utcInstant(new Date(scope.value.from).toISOString()).split(' ')[0] ?? ''
  return `${clock} ${t('All times on')} ${day}.`
})

/**
 * A mark says only what its NEIGHBOURS do not.
 *
 * `2025-10-13 00:00:00Z` on every mark is twenty characters of which sixteen repeat, and the axis
 * then reads as a wall of stamps rather than as a scale. The big charting tools all do the same
 * thing here: the date appears where the day turns over, the month where the month does and the
 * year where the year does, and everything inside a day is a time. The part every mark shares —
 * the month and the year, or the year — is stated ONCE beside the scale's name.
 *
 * An END is the exception: it is where the periods stop rather than a round moment, so on a scale
 * of several days it carries its day as well. `23:59Z` alone at the end of a year said nothing.
 *
 * Seconds are gone deliberately: at a step of an hour or a day they are always `00`, and the whole
 * instant is still on the row itself and in the table below.
 */
function formatOn(bounds: TimeWindow, oneDay: boolean, spansYears: boolean): (value: number) => string {
  return value => {
    const at = new Date(value)
    const midnight = at.getUTCHours() === 0 && at.getUTCMinutes() === 0
    const day = `${String(at.getUTCDate()).padStart(2, '0')} ${MONTHS[at.getUTCMonth()]}`
    const clock = `${String(at.getUTCHours()).padStart(2, '0')}:`
      + `${String(at.getUTCMinutes()).padStart(2, '0')}Z`
    if (oneDay) return clock
    if (!midnight) return value === bounds.from || value === bounds.to ? `${day} ${clock}` : clock
    if (at.getUTCDate() !== 1) return day
    // New Year names its year where the scale crosses one — the mark is where it turns over
    if (at.getUTCMonth() !== 0 || !spansYears) return MONTHS[at.getUTCMonth()]!
    return String(at.getUTCFullYear())
  }
}

const axisFormat = computed(() => formatOn(scope.value, withinOneDay.value, years.value.length > 1))

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * What the marks leave unsaid, said once beside the scale's name: the month and year where the
 * periods fall in one month, else the year, else the years from first to last — a scale that
 * started in April showed `Apr · Jul · Oct · 2022`, and which year the first three were in stood
 * nowhere (seen 2026-10-19).
 */
// the DRAWN periods' stamps: one that cannot be read is left off the chart, and read here it put
// `2025–NaN` beside the scale
const stamps = computed(() => usable.value.flatMap(period => [
  new Date(period.opened_at), new Date(period.closed_at),
]))

/** The calendar years the periods fall in, earliest first. */
const years = computed(() => [...new Set(stamps.value.map(at => at.getUTCFullYear()))].sort((a, b) => a - b))

const sharedPart = computed(() => {
  const first = stamps.value[0]
  if (!first) return null
  const month = (at: Date) => `${at.getUTCFullYear()}-${at.getUTCMonth()}`
  if (stamps.value.every(at => month(at) === month(first))) {
    return `${MONTHS[first.getUTCMonth()]} ${first.getUTCFullYear()}`
  }
  const [earliest, latest] = [years.value[0]!, years.value[years.value.length - 1]!]
  return earliest === latest ? String(earliest) : `${earliest}–${latest}`
})

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
  return `${plural(count, t('break'), t('breaks'))} · ${duration(total / HOUR_MS)} ${t('idle removed')}`
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

/**
 * A LONG timeline frames a stretch and draws it again beneath, apart (viewer#48): overview and
 * detail, the way a long trace is read. Only where the overview cannot set two periods apart — a
 * timeline that fits keeps its one chart, as before. The chart says when it is too dense, and how
 * wide its plot is, once the browser has measured it.
 */
const overviewDense = ref(false)
const plotWidth = ref(0)

const scale = computed<TimeWindow>(() => ({ from: scope.value.from, to: scope.value.to }))
const presets = computed(() => offeredPresets(scale.value))

/** The pixels a period needs beside its neighbour to stand apart: the chart's ring takes six. */
const APART_PX = 8

/**
 * The window kept for the run or deployment on show, and the one a drag is moving now: a drag
 * changes what is framed at once and what is kept after a pause, so a stored arrangement is not
 * rewritten for every pixel. Another scope starts from what is kept for it.
 */
const kept = useViewWindow(() => props.scopeId ?? null)
const moving = ref<TimeWindow | null>(null)
let keeping: ReturnType<typeof setTimeout> | undefined
onUnmounted(() => clearTimeout(keeping))

// another run or deployment: what a drag was moving belonged to the one before
watch(() => props.scopeId, () => {
  clearTimeout(keeping)
  moving.value = null
})

/** What is framed: the window asked for, kept inside the scale — else the longest preset whose periods stand apart. */
const framed = computed<TimeWindow | null>(() => {
  if (!overviewDense.value || !presets.value.length) return null
  const asked = moving.value ?? kept.value
  if (asked) return clampWindow(asked, scale.value)
  const preset = openingPreset(scope.value.lanes.map(lane => lane.spans), scale.value, plotWidth.value, APART_PX)
  return preset ? presetIn(preset, scale.value.from, scale.value) : null
})

function frameTo(next: TimeWindow): void {
  moving.value = next
  clearTimeout(keeping)
  // what a drag moves stays what is framed: without a scope nothing is kept, and the frame must not jump back
  keeping = setTimeout(() => { kept.value = next }, 400)
}

/** A preset around the middle of what is framed now. */
function choose(preset: WindowPreset): void {
  const now = framed.value
  if (now) frameTo(presetIn(preset, (now.from + now.to) / 2, scale.value))
}

const chosenPreset = computed(() => framed.value ? presetOf(framed.value, scale.value) : null)

const PRESET_WORDS: Record<WindowPreset, string> = {
  year: t('Year'),
  quarter: t('Quarter'),
  month: t('Month'),
  week: t('Week'),
}

/** Each lane's periods inside the frame — a lane with none stays, empty, so the lanes read alike above and below. */
const detailLanes = computed<TimelineLane[]>(() => {
  const at = framed.value
  if (!at) return []
  return scope.value.lanes.map(lane => ({
    ...lane,
    spans: lane.spans.filter(span => span.to > at.from && span.from < at.to),
  }))
})

/** The calendar years a stretch touches. */
function yearsIn(at: TimeWindow): number {
  return new Date(at.to).getUTCFullYear() - new Date(at.from).getUTCFullYear() + 1
}

const detailFormat = computed(() => {
  const at = framed.value ?? scale.value
  return formatOn(at, utcDay(at.from) === utcDay(at.to), yearsIn(at) > 1)
})

/** The frame's name above its marks: the preset it is, else its two ends. */
const detailName = computed(() => {
  const at = framed.value
  if (!at) return ''
  const first = new Date(at.from)
  const year = first.getUTCFullYear()
  const preset = chosenPreset.value
  if (preset === 'year') return String(year)
  if (preset === 'quarter') return `Q${Math.floor(first.getUTCMonth() / 3) + 1} ${year}`
  if (preset === 'month') return `${MONTHS[first.getUTCMonth()]} ${year}`
  return rangeLabel(at.from, at.to)
})
</script>

<template>
  <div v-if="scope.lanes.length" class="booking-timeline">
    <div v-if="scope.lanes.length > 1 || framed" class="timeline-controls">
      <!-- only where there is more than one lane to order -->
      <div v-if="scope.lanes.length > 1" class="order-control">
        <span class="order-label">{{ t('Order lanes by') }}</span>
        <AppButton
          :active="order === 'time'"
          @click="emit('update:order', 'time')"
        >{{ t('start time') }}</AppButton>
        <AppButton
          :active="order === 'name'"
          @click="emit('update:order', 'name')"
        >{{ t('name') }}</AppButton>
      </div>
      <!-- only where the overview frames a stretch: its length, by the calendar's own units -->
      <div v-if="framed" class="order-control window-control">
        <span class="order-label">{{ t('Drawn apart') }}</span>
        <AppButton
          v-for="preset in presets"
          :key="preset"
          :active="chosenPreset === preset"
          :data-preset="preset"
          @click="choose(preset)"
        >{{ PRESET_WORDS[preset] }}</AppButton>
      </div>
    </div>

    <TimelineChart
      :lanes="scope.lanes"
      :from="scope.from"
      :to="scope.to"
      :format="axisFormat"
      :scale-label="sharedPart ? `${t('canonical clock')} · ${sharedPart}` : t('canonical clock')"
      :scale-note="scaleNote"
      :dense-note="framed
        ? t('Too close to draw apart at this width — the stretch in the frame is drawn apart below.')
        : t('Too close to draw apart at this width — a sliver per period, named on its card.')"
      natural-time
      :collapse-gaps-longer-than="longestSpan"
      :format-gap="gapLabel"
      :format-range="rangeLabel"
      :format-breaks="breaksLabel"
      :ticks="4"
      :window="framed"
      :window-label="t('The stretch drawn apart below')"
      @update:window="frameTo"
      @dense="overviewDense = $event"
      @measured="plotWidth = $event"
    />

    <!-- the framed stretch again, its periods apart: the same lanes, the scale the frame's own -->
    <TimelineChart
      v-if="framed"
      class="detail"
      data-detail
      :lanes="detailLanes"
      :from="framed.from"
      :to="framed.to"
      :format="detailFormat"
      :scale-label="detailName"
      :scale-note="scaleNote"
      :dense-note="t('Still too close to draw apart — a shorter stretch above draws them apart.')"
      natural-time
      :collapse-gaps-longer-than="longestSpan"
      :format-gap="gapLabel"
      :format-range="rangeLabel"
      :format-breaks="breaksLabel"
      :ticks="6"
    />
  </div>
</template>

<style scoped>
.booking-timeline {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

/* the lane order and the frame's length on one line, the second giving way to a line of its own */
.timeline-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs) var(--space-lg);
}

.order-control {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.order-label { color: var(--color-text-secondary); }

/* the lane order is a toggle group — AppButton carries the chosen look */
.order-control .app-button.solid {
  padding: 1px var(--space-sm);
}
</style>
