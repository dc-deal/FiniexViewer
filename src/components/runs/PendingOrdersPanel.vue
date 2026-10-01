<script setup lang="ts">
import RecordList from '@/components/base/RecordList.vue'
import type { ListColumn } from '@/types/list_types'
import type {
  PendingOrderRow,
  PendingOrderUnit,
  PendingOrdersReport,
} from '@/types/api/report_types'
import { plural, t } from '@/translate'

/**
 * What became of the orders that did not execute at once — and what is still open.
 *
 * Every other panel answers what a run DID. This one answers why an order did not become what it
 * was meant to be, which is the question nothing else on the page can reach: measured 2026-10-01
 * over 202 units, one of them resolved **527 orders and filled none of them**, and every other
 * section of that run showed a normal-looking result.
 *
 * The five counts are a FUNNEL the backend states in full —
 * `resolved = filled + rejected + timed_out + force_closed`, which held on all 202 units. Nothing
 * is computed from it; the parts are shown beside their total so a reader sees the shape.
 */
defineProps<{
  model: PendingOrdersReport
}>()

/**
 * Nine columns, ranked 9 → 7 → 6 → 5 → 4. What a narrow panel keeps is WHICH scenario, how many
 * orders it resolved, how many were REJECTED and what is still open — the four that make a
 * rejection traceable.
 *
 * `Timed out` and `Force closed` go first and that is measured rather than guessed: both read zero
 * on all 202 units across 20 runs. They are part of the funnel's vocabulary and not of this
 * archive's data, so a wide panel states the whole funnel and a narrow one drops the two halves
 * that have never fired.
 */
const columns: ListColumn[] = [
  { label: t('Scenario'), width: 'minmax(9rem, 16fr)', rank: 1 },
  { label: t('Symbol'), width: 'minmax(0, 8fr)', rank: 4 },
  { label: t('Resolved'), width: 'minmax(0, 8fr)', figure: true, rank: 1 },
  { label: t('Filled'), width: 'minmax(0, 7fr)', figure: true, rank: 2 },
  { label: t('Rejected'), width: 'minmax(0, 8fr)', figure: true, rank: 1 },
  { label: t('Timed out'), width: 'minmax(0, 8fr)', figure: true, rank: 5 },
  { label: t('Force closed'), width: 'minmax(0, 10fr)', figure: true, rank: 5 },
  { label: t('Latency'), width: 'minmax(0, 10fr)', figure: true, rank: 3 },
  { label: t('Open at end'), width: 'minmax(0, 9fr)', figure: true, rank: 1 },
]

/**
 * The orders still waiting, both kinds together. The two lists the response splits them into are a
 * GROUPING and nothing more: the word comes from the row's own `order_type`, never from which array
 * held it. Measured 2026-10-01 — `active_stop_orders` carried an order of type `stop_limit`, which
 * this panel had been drawing as `stop`.
 */
interface OpenOrder {
  /** the backend's own word for the kind of order, straight off the row */
  kind: string
  /**
   * A drawing POSITION, not an identity, because the declared key is not on the wire yet.
   * testingide stated it 2026-10-01 — `order_id` keys these two lists WITHIN their unit — and
   * contract 18 serves no key at all. The position carries the unit name for the same reason the
   * declaration needs it: measured, `pos_gbpusd_1` rests in two different scenarios of one run.
   */
  at: string
  order: PendingOrderRow
}

function openOrders(unit: PendingOrderUnit): OpenOrder[] {
  return [
    ...unit.active_limit_orders.map(order => ({ kind: order.order_type, order })),
    ...unit.active_stop_orders.map(order => ({ kind: order.order_type, order })),
  ].map((row, index) => ({ ...row, at: `${unit.name}-${index}` }))
}

/** The columns of the open orders beneath a row. No headings: each cell labels itself inline. */
const orderColumns: ListColumn[] = [
  { label: '', width: 'minmax(0, 10fr)' },
  { label: '', width: 'minmax(0, 16fr)' },
  { label: '', width: 'minmax(0, 12fr)' },
  { label: '', width: 'minmax(0, 14fr)' },
  { label: '', width: 'minmax(0, 14fr)' },
  { label: '', width: 'minmax(0, 14fr)' },
]

/**
 * The latency of a unit's resolutions. The average alone says little where one order was resolved
 * and the spread is the whole story, so the count rides in the title with the two ends.
 */
function latency(unit: PendingOrderUnit): string {
  if (!unit.latency_count) return t('n/a')
  return `${unit.avg_latency_ms.toFixed(0)} ms`
}

function latencySpread(unit: PendingOrderUnit): string {
  if (!unit.latency_count) return t('No resolution was timed.')
  return `${unit.min_latency_ms.toFixed(0)}–${unit.max_latency_ms.toFixed(0)} ms `
    + `${t('over')} ${plural(unit.latency_count, t('resolution'), t('resolutions'))}`
}

/**
 * How many of this unit's orders were still OPEN when the scenario's data ended.
 *
 * It was called *resting* until testingide corrected it on 2026-10-01, and the correction matters:
 * in a backtest the simulation records every such order as `expired` (reason `scenario_end`) in the
 * same step, because the data has ended and it can never fill — but it deliberately does NOT clear
 * these two lists, so the snapshot still shows them. The `order-history` row and this entry are the
 * SAME order at the same instant, seen twice. *Resting* claims it is still waiting for a price, and
 * in a backtest nothing is.
 *
 * It is NOT the orders the unit had pending. An order that left the queue — filled, rejected, timed
 * out or force-closed — is counted in the funnel and is gone from here. The two are separate
 * populations, which is why a unit can read `resolved 1 · filled 1 · open at end 1` and have had
 * two orders.
 *
 * In an AutoTrader session the answer differs: an order left standing at the venue gets no expired
 * row and IS still live. Nothing on screen can show that yet — `units` is empty on such a run.
 */
function openAtEnd(unit: PendingOrderUnit): number {
  return unit.active_limit_orders.length + unit.active_stop_orders.length
}

/**
 * A rejection is the finding this panel exists for, so it wears the error role — and only where
 * there is one. A column of zeroes in the warning colour would make every ordinary run look wrong.
 */
function rejectedTone(unit: PendingOrderUnit): string {
  return unit.total_rejected ? 'negative' : ''
}
</script>

<template>
  <div class="pending-panel">
    <div v-if="!model.units.length" class="hint">
      {{ t('No pending-order statistics for this run') }}
    </div>
    <RecordList
      v-else
      class="pending-list"
      :rows="model.units"
      :columns="columns"
      :row-key="unit => unit.name"
      :shows-children="unit => openAtEnd(unit) > 0"
      inert
    >
      <template #default="{ row: unit }">
        <span :data-rank="1" class="unit-name" :title="unit.name">{{ unit.name }}</span>
        <span :data-rank="4">{{ unit.symbol }}</span>
        <span :data-rank="1" class="figure-cell">{{ unit.total_resolved }}</span>
        <span :data-rank="2" class="figure-cell">{{ unit.total_filled }}</span>
        <span :data-rank="1" class="figure-cell" :class="rejectedTone(unit)">
          {{ unit.total_rejected }}
        </span>
        <span :data-rank="5" class="figure-cell">{{ unit.total_timed_out }}</span>
        <span :data-rank="5" class="figure-cell">{{ unit.total_force_closed }}</span>
        <span :data-rank="3" class="figure-cell" :title="latencySpread(unit)">
          {{ latency(unit) }}
        </span>
        <span
          :data-rank="1"
          class="figure-cell"
          :title="t('Still open when the data of its scenario ended. In a backtest it is recorded as expired at that same moment — the data stopped, so it could never fill. An order that filled, was rejected, timed out or was force-closed left the queue earlier and is counted to the left of this.')"
        >{{ openAtEnd(unit) }}</span>
      </template>

      <!--
        The orders still OPEN at data end, beneath the unit that placed them. Drawn only where there
        are any — an empty block under every row would treble the list to say nothing.

        The row key is NOT the order id — see `OpenOrder.at` for why.
      -->
      <template #children="{ row: unit }">
        <RecordList
          class="order-list"
          :rows="openOrders(unit)"
          :columns="orderColumns"
          :row-key="open => open.at"
          hide-head
          inert
        >
          <template #default="{ row: open }">
            <span class="order-kind">└─ {{ open.kind }}</span>
            <span :title="open.order.order_id">{{ open.order.order_id }}</span>
            <span>{{ open.order.direction }} {{ open.order.lots }}</span>
            <span>{{ t('at') }} {{ open.order.limit_price }}</span>
            <span>{{ t('stop') }} {{ open.order.stop_loss }}</span>
            <span>{{ t('target') }} {{ open.order.take_profit }}</span>
          </template>
        </RecordList>
      </template>
    </RecordList>
  </div>
</template>

<style scoped>
.pending-list :deep(.record-row) > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* A FIGURE CELL is right-aligned under its right-aligned heading: `figure: true` on a column aligns
   the HEADING, and the cells are this component's. Asserted in `e2e/list_ranks.spec.ts`. */
.pending-list :deep(.figure-cell) {
  text-align: right;
}

.unit-name {
  color: var(--color-text-primary);
}

/* the rejection is the finding, so it carries the polarity of a figure that went the wrong way */
.negative { color: var(--color-negative); }

/* the open orders are a level BELOW the unit — the indent and the muted ink say so without a frame,
   the same treatment a trade's fills get */
.order-list :deep(.record-row) {
  border-bottom: none;
  color: var(--color-text-secondary);
}

.order-kind { color: var(--color-text-secondary); }

.hint {
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
