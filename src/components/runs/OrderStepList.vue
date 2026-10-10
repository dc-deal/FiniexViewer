<script setup lang="ts">
import { ref, watch } from 'vue'
import RecordList from '@/components/base/RecordList.vue'
import { orderKeyOf } from '@/composables/use_order_steps'
import { utcInstant } from '@/components/runs/report_format'
import type { ListColumn } from '@/types/list_types'
import type { OrderEvent } from '@/types/api/report_types'
import { plural, t } from '@/translate'

/**
 * What the orders of ONE position went through, step by step.
 *
 * `order-history` keeps a row for the submission and one for each way an order ended; their own
 * words for what lies between them are *"what happened in between is missing there"*. This is that
 * — the venue taking the order, a stop triggering, every cancel asked for and how it was answered.
 *
 * **Its own component rather than a second list inside the Orders panel, and that is not only
 * tidiness.** `scripts/check_terms.py` pairs ONE `ListColumn` array per file against that file's
 * row template, positionally, and drops the pairing where the two disagree — so a second array
 * beside the first silently cost the panel's eight labels their field mapping. Measured 2026-10-08:
 * `Lots` fell back to the trade history's reading and the check reported it as moved. One column
 * array per file is a property the instrument depends on.
 */
const props = defineProps<{
  steps: OrderEvent[]
}>()

/**
 * Four columns and NO rank ladder. The list sits inside a row of another grid that has already
 * given up whatever its width required, so a second ladder underneath it would narrow against a
 * width nobody measured.
 */
const columns: ListColumn[] = [
  { label: t('Step'), width: 'minmax(0, 6fr)' },
  { label: t('What happened'), width: 'minmax(0, 12fr)' },
  { label: t('When'), width: 'minmax(0, 12fr)' },
  { label: t('Detail'), width: 'minmax(0, 18fr)' },
]

/**
 * Which orders of this position are folded away.
 *
 * Worth having rather than tidy: the capture's partial close is four orders of three steps, and
 * the field study has one position of five — sixteen lines to read past when only one of them is
 * the question. The heading was a button that emitted into nothing until 2026-10-09, which is
 * what made this necessary rather than optional.
 */
const folded = ref(new Set<string>())

watch(() => props.steps, () => folded.value = new Set())

function isOrderOpen(key: string): boolean {
  return !folded.value.has(key)
}

function toggleOrder(key: string): void {
  const next = new Set(folded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  folded.value = next
}

/** A value the stream never held reads as absent, never as a zero nobody recorded. */
function figure(value: number | null, digits = 2): string {
  return value === null ? '—' : value.toFixed(digits)
}

function at(value: string | null): string {
  return value === null ? '—' : utcInstant(value)
}

/** A denied order was never submitted, so it has no submission number to be named by. */
function orderName(step: OrderEvent | undefined): string {
  if (!step) return ''
  return step.submitted_seq === null
    ? t('never submitted')
    : `${t('order')} ${step.submitted_seq}`
}

/**
 * What the order WAS, read off its first step — the kind, the side and the size sit on every line,
 * so the heading states them once instead of repeating them down the group.
 */
function orderShape(step: OrderEvent | undefined): string {
  if (!step) return ''
  const parts = [step.order_type, step.action, step.direction].filter(Boolean)
  const size = step.lots === null ? '' : ` ${step.lots}`
  return `${parts.join(' ')}${size}`.trim()
}

/**
 * The one thing this step says that the others do not, in their order of weight: why it was
 * refused, who ended it and why, how long the venue took to answer, and the price where one was
 * reached. Never all four — a step carries at most one of them.
 *
 * **Every figure here carries its WORD, and the price is why that is written down.** One column
 * holds four unrelated kinds of thing, so a bare number in it says only that something was
 * measured. `in flight 60 ms` was added on 2026-10-08 after the scenario heading printed a bare
 * `1438 ms`; the fill price was found standing bare the same evening, by looking at the rendered
 * list rather than at the code. Second instance of one defect, so it is a rule now and not a fix.
 */
function noteOf(step: OrderEvent): string {
  const refusal = [step.rejection_reason, step.venue_reason, step.message].filter(Boolean)
  if (refusal.length) return refusal.join(' · ')
  const ended = [step.initiator, step.end_reason].filter(Boolean)
  if (ended.length) return ended.join(' · ')
  if (step.in_flight_ms !== null) return `${t('in flight')} ${step.in_flight_ms.toFixed(0)} ms`
  if (step.fill_price !== null) return `${t('at')} ${figure(step.fill_price, 5)}`
  return ''
}

/**
 * The four refusals the rows above wear, plus the two failures only a live venue produces: an
 * answer that was lost, and a cancel asked for before the venue had answered at all.
 */
function stepTone(step: OrderEvent): string {
  if (REFUSED.has(step.event_type)) return 'negative'
  if (DEFERRED.has(step.event_type)) return 'warned'
  return ''
}

const REFUSED = new Set(['rejected', 'denied', 'undelivered', 'unaccounted', 'unresolved'])
const DEFERRED = new Set(['expired', 'cancel_deferred'])
</script>

<template>
  <!--
    Grouped by `submitted_seq`, which is their instruction and not our arrangement: `order_id` is
    the POSITION and repeats across its open and its closes, so grouping by it would read four
    orders of the capture's partial close as one. The list groups by key rather than by runs of
    one, which is what survives two orders of a position overlapping.
  -->
  <RecordList
    class="step-list"
    :rows="steps"
    :columns="columns"
    :row-key="step => String(step.seq)"
    :group-by="orderKeyOf"
    :is-open="isOrderOpen"
    hide-head
    inert
    @toggle="toggleOrder"
  >
    <template #group="{ group, marker }">
      <span class="step-group">
        <span v-if="marker" class="record-marker" aria-hidden="true">{{ marker }}</span>
        {{ orderName(group.rows[0]) }}
        <span class="step-shape">{{ orderShape(group.rows[0]) }}</span>
      </span>
      <span class="step-tally">{{ plural(group.rows.length, t('step'), t('steps')) }}</span>
    </template>

    <template #default="{ row: step }">
      <span class="step-seq">└─ {{ step.seq }}</span>
      <span :class="stepTone(step)">{{ step.event_type }}</span>
      <span>{{ at(step.event_time) }}</span>
      <span class="step-detail">{{ noteOf(step) }}</span>
    </template>
  </RecordList>
</template>

<style scoped>
.step-list { margin: var(--space-xs) 0; }

.step-group {
  grid-column: 1 / -2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-primary);
}

.step-shape {
  margin-left: var(--space-sm);
  color: var(--color-text-secondary);
}

.step-tally {
  grid-column: -2 / -1;
  text-align: right;
  color: var(--color-text-secondary);
}

.step-seq,
.step-detail {
  color: var(--color-text-secondary);
}

.negative { color: var(--color-negative); }
.warned { color: var(--color-warning); }
</style>
