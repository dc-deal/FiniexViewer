<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import HintLine from '@/components/base/HintLine.vue'
import RecordList from '@/components/base/RecordList.vue'
import { useScenarioSelection, showsUnit } from '@/composables/use_scenario_selection'
import { marksPosition, usePositionLink } from '@/composables/use_position_link'
import { utcInstant } from '@/components/runs/report_format'
import type { ListColumn } from '@/types/list_types'
import type {
  OrderHistoryRow,
  OrderHistoryReport,
  PendingOrderUnit,
  PendingOrdersReport,
  TradeHistoryReport,
} from '@/types/api/report_types'
import { plural, t } from '@/translate'

/**
 * Every order a run placed, under the scenario that placed it, with that scenario's pending funnel
 * as the heading above them.
 *
 * It replaces the Pending Orders panel rather than joining it. That panel could say *527 rejected*
 * and reach not one of the 527; the sentence explaining each was already on the wire, in a route
 * nothing consumed. The two describe one thing from two sides — `pending-orders` what BECAME of a
 * scenario's orders, `order-history` the orders themselves — and the join is the scenario name,
 * which both sides write from the same run unit.
 *
 * A row is a LIFECYCLE RECORD, not an order: one order appears as several rows. That is why the
 * list is two levels and not three — there is no field identifying an order until testingide#557.
 */
const props = defineProps<{
  model: {
    pending: PendingOrdersReport | null
    history: OrderHistoryReport
    /**
     * Only so a link can be ABSENT where it would lead nowhere. Measured: 55 positions opened and
     * never closed, which produced no trade at all, and 10 runs serve order-history without
     * trade-history — then there is nothing to link to and nothing is drawn.
     */
    trades: TradeHistoryReport | null
  }
}>()

const link = usePositionLink()

/**
 * The positions that produced a trade, as `scenario~position`.
 *
 * The join is `(scenario_name, position_id)` and it is DECLARED — *"an executed order-history row's
 * `(scenario_name, position_id)` names the same position as a trade-history row's, by
 * construction"* (testingide, 2026-10-02). Never the position id alone: every scenario counts from
 * `pos_<symbol>_1`, so two scenarios of one symbol both have a `pos_gbpusd_1`.
 */
const traded = computed(() => new Set(
  (props.model.trades?.trades ?? []).map(trade => `${trade.scenario_name}~${trade.position_id}`)
))

/**
 * The position a row belongs to — read from `order_id`, which IS the position id (their glossary:
 * *"Not an order's own id: the id of the POSITION the order belongs to"*). `position_id` is null
 * until the fill, so it cannot carry the link on the row that OPENS a position.
 */
function positionOf(order: OrderHistoryRow): string {
  return order.order_id
}

/**
 * Does this position have trades to jump to, and is there a panel to jump INTO? Both, because a
 * position that produced nothing and a run that serves no trade history are different absences
 * with the same answer: draw no link.
 */
function hasTrades(order: OrderHistoryRow): boolean {
  if (!link.canJumpTo('trade-history')) return false
  return traded.value.has(`${order.scenario_name}~${positionOf(order)}`)
}

function jumpToTrades(order: OrderHistoryRow): void {
  link.jumpTo('trade-history', {
    scenario: order.scenario_name,
    position: positionOf(order),
  })
}

const narrowing = useScenarioSelection()

/**
 * The rows the reader asked for. Ambient, like every other scenario-shaped panel: a narrowing that
 * reached Trade History and not this one would put two different populations side by side under one
 * heading that says the view is narrowed.
 *
 * It narrows the ORDERS. A scenario the narrowing drops takes its funnel with it, because the
 * heading belongs to the group and the group is gone.
 */
const shown = computed(() =>
  props.model.history.orders.filter(order => showsUnit(narrowing.units.value, order.scenario_name))
)

const narrowed = computed(() => narrowing.units.value.length > 0)

/**
 * Seven columns, ranked 7 → 6 → 5 → 3. What a narrow panel keeps is WHICH order, what happened to
 * it and when — the three that make an outcome traceable. The scenario is not a column: it is the
 * group heading.
 */
const columns: ListColumn[] = [
  {
    /*
     * THEIR term, and the hint is not decoration: their glossary opens the entry with
     * "Not an order's own id: the id of the POSITION the order belongs to", which is why the value
     * repeats down a group and why `Order` alone would have been a false heading.
     */
    label: t('Order id'),
    hint: t('Not an order id of its own: the id of the POSITION this order belongs to, minted when the position opened and carried by every later order of it — which is why it repeats.'),
    width: 'minmax(8rem, 14fr)',
    rank: 1,
  },
  { label: t('Action'), width: 'minmax(0, 7fr)', rank: 3 },
  { label: t('Status'), width: 'minmax(0, 9fr)', rank: 1 },
  { label: t('Direction'), width: 'minmax(0, 8fr)', rank: 4 },
  { label: t('Lots'), width: 'minmax(0, 8fr)', figure: true, rank: 2 },
  { label: t('Price'), width: 'minmax(0, 10fr)', figure: true, rank: 2 },
  { label: t('Event'), width: 'minmax(9rem, 14fr)', rank: 1 },
]

/**
 * The funnel of the scenario a group belongs to, or null.
 *
 * Null is ORDINARY and has two causes the backend named: a scenario whose every order was refused
 * before the queue never enters the pending pipeline at all, and an AutoTrader run serves no units
 * because that section is filled by the simulation only. The heading says so rather than drawing a
 * funnel of zeroes, which would claim a measurement nobody made.
 */
function funnelOf(scenario: string): PendingOrderUnit | null {
  return props.model.pending?.units.find(unit => unit.name === scenario) ?? null
}

/**
 * How many of a scenario's orders were still OPEN when its data ended.
 *
 * NOT added to the funnel: in a backtest the simulation records every such order as `expired` in
 * the same step and deliberately leaves it in these lists, so the order is already counted in the
 * rows below. It is shown because the heading is about the SCENARIO, and "one order never resolved"
 * is a property of the scenario that no single row states.
 */
function openAtEnd(unit: PendingOrderUnit): number {
  return unit.active_limit_orders.length + unit.active_stop_orders.length
}

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
 * A drawing POSITION, not an identity. `order_id` is a per-unit position counter — 167 rows under
 * one id on a measured run — and the backend asked us not to adopt the content key that happens to
 * be unique, because two partial closes on one tick would collide. A row's identity is its place in
 * the scenario's append order, and the field for it is planned in testingide#557.
 */
function rowKey(order: OrderHistoryRow, index: number): string {
  return `${order.scenario_name}-${index}`
}

/**
 * Per row: its drawing key, and whether it CONTINUES the position the row above it belongs to.
 *
 * The continuation is read from the row above rather than from a block of its own, and that is
 * measured rather than tidy: 2 of 246 scenario groups interleave two positions — both are a
 * scenario named `partial_close_lifecycle`, where two positions run at once and their records
 * alternate. Where that happens the id simply appears again, which is correct and needs no case
 * of its own.
 *
 * Built over `shown`, so the predecessor is the row the reader actually sees under a narrowing.
 */
interface RowMark {
  key: string
  continues: boolean
}

const marks = ref(new Map<OrderHistoryRow, RowMark>())

watch(shown, (orders) => {
  const seen = new Map<string, number>()
  const last = new Map<string, string>()
  const next = new Map<OrderHistoryRow, RowMark>()
  for (const order of orders) {
    const at = seen.get(order.scenario_name) ?? 0
    seen.set(order.scenario_name, at + 1)
    next.set(order, {
      key: rowKey(order, at),
      continues: last.get(order.scenario_name) === order.order_id,
    })
    last.set(order.scenario_name, order.order_id)
  }
  marks.value = next
}, { immediate: true })

/** The id on the row that STARTS a position, a continuation mark on the rows that carry it on. */
function startsPosition(order: OrderHistoryRow): boolean {
  return !marks.value.get(order)?.continues
}

/**
 * The boundary, and the mark. `marked` is every row of the position a reader asked to look at —
 * the whole lifecycle, not one row, because the link is to the POSITION.
 */
function rowClass(order: OrderHistoryRow): string | undefined {
  const classes = []
  if (startsPosition(order)) classes.push('starts-position')
  if (marksPosition(link.marked.value, order.scenario_name, positionOf(order))) classes.push('marked')
  return classes.length ? classes.join(' ') : undefined
}

/** A value the record never held reads as absent — never as a zero nobody reported. */
function figure(value: number | null, digits = 2): string {
  return value === null ? '—' : value.toFixed(digits)
}

function word(value: string | null): string {
  return value ?? '—'
}

function at(value: string | null): string {
  return value === null ? '—' : utcInstant(value)
}

/**
 * The rejection sentence, and it is the reason this panel exists. It is the backend's own prose and
 * sits on a rejected row and nowhere else — 548 of 4,660 rows measured 2026-10-02.
 */
function hasReason(order: OrderHistoryRow): boolean {
  return Boolean(order.rejection_reason ?? order.rejection_message)
}

function reasonOf(order: OrderHistoryRow): string {
  const reason = order.rejection_reason
  const message = order.rejection_message
  if (reason && message) return `${reason} · ${message}`
  return message ?? reason ?? ''
}

/** A status that went the wrong way wears the polarity of one, and only where it did. */
function statusTone(order: OrderHistoryRow): string {
  if (order.status === 'rejected') return 'negative'
  if (order.status === 'expired') return 'warned'
  return ''
}

const collapsed = ref(new Set<string>())

watch(() => props.model.history.run_id, () => collapsed.value = new Set())

function isExpanded(scenario: string): boolean {
  return !collapsed.value.has(scenario)
}

function toggleGroup(scenario: string): void {
  const next = new Set(collapsed.value)
  if (next.has(scenario)) next.delete(scenario)
  else next.add(scenario)
  collapsed.value = next
}
</script>

<template>
  <div class="orders-panel">
    <div v-if="!shown.length" class="hint">
      {{ narrowed
        ? t('The chosen scenarios placed no order')
        : t('This run placed no order') }}
    </div>
    <template v-else>
    <!-- said where there is something to explain: a run with no trade history draws no link -->
    <HintLine v-if="link.canJumpTo('trade-history')" id="position-link" />
    <RecordList
      class="order-list"
      :rows="shown"
      :columns="columns"
      :row-key="order => marks.get(order)?.key ?? order.order_id"
      :row-class="rowClass"
      :group-by="order => order.scenario_name"
      :is-open="isExpanded"
      :has-detail="hasReason"
      @toggle="toggleGroup"
      inert
    >
      <!--
        The scenario, and what became of its orders — the served funnel, not a count of the rows
        beneath it. Two cells counted from the END of the tracks, so a rank that gives a column up
        cannot leave the heading spanning tracks the grid no longer has.
      -->
      <template #group="{ group }">
        <span class="group-name" :title="group.key">
          <span class="group-marker">{{ group.open ? '▾' : '▸' }}</span>
          {{ group.key }}
          <span class="group-meta">
            <template v-if="funnelOf(group.key)">
              {{ t('resolved') }} {{ funnelOf(group.key)!.total_resolved }}
              · {{ t('filled') }} {{ funnelOf(group.key)!.total_filled }}
              · <span :class="{ negative: funnelOf(group.key)!.total_rejected > 0 }"
                >{{ t('rejected') }} {{ funnelOf(group.key)!.total_rejected }}</span>
              <template v-if="funnelOf(group.key)!.total_timed_out">
                · {{ t('timed out') }} {{ funnelOf(group.key)!.total_timed_out }}
              </template>
              <template v-if="funnelOf(group.key)!.total_force_closed">
                · {{ t('force closed') }} {{ funnelOf(group.key)!.total_force_closed }}
              </template>
              · <span :title="latencySpread(funnelOf(group.key)!)">{{ latency(funnelOf(group.key)!) }}</span>
              <template v-if="openAtEnd(funnelOf(group.key)!)">
                · {{ t('open at data end') }} {{ openAtEnd(funnelOf(group.key)!) }}
              </template>
            </template>
            <!-- not a funnel of zeroes: this scenario never entered the pending pipeline -->
            <template v-else>{{ t('no pending statistics — nothing reached the queue') }}</template>
          </span>
        </span>
        <span class="group-count">{{ plural(group.rows.length, t('record'), t('records')) }}</span>
      </template>

      <!-- the rank on every cell is the one its own column declares: the list owns the tracks and
           this template owns the cells -->
      <template #default="{ row: order }">
        <span :data-rank="1" class="order-id" :title="order.order_id">
          <template v-if="startsPosition(order)">
            <!-- a LINK only where there is somewhere to go: a position that produced no trade, and
                 a run that serves no trade history, both draw the id as the plain text it is -->
            <button
              v-if="hasTrades(order)"
              type="button"
              class="to-trades"
              :title="t('Show this position in the trade history')"
              @click="jumpToTrades(order)"
            >{{ order.order_id }} ↗</button>
            <template v-else>{{ order.order_id }}</template>
          </template>
          <span v-else class="carries-on" aria-hidden="true">└─</span>
        </span>
        <span :data-rank="3">{{ word(order.action) }}</span>
        <span :data-rank="1" :class="statusTone(order)">{{ order.status }}</span>
        <span :data-rank="4">{{ word(order.direction) }}</span>
        <span :data-rank="2" class="figure-cell">{{ figure(order.executed_lots ?? order.requested_lots) }}</span>
        <span :data-rank="2" class="figure-cell">{{ figure(order.executed_price, 5) }}</span>
        <span :data-rank="1">{{ at(order.event_time) }}</span>
      </template>

      <!-- the backend's own sentence, spanning every track beneath the row it belongs to -->
      <template #detail="{ row: order }">
        <span class="reason-mark" aria-hidden="true">└─</span>
        {{ reasonOf(order) }}
      </template>
    </RecordList>
    </template>
  </div>
</template>

<style scoped>
.order-list :deep(.record-row) > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* a FIGURE CELL is right-aligned under its right-aligned heading: `figure: true` aligns the
   HEADING, the cells are this component's */
.order-list :deep(.figure-cell) {
  text-align: right;
}

.order-id {
  color: var(--color-text-primary);
}

/* a row that carries a position on says so by NOT repeating its id — the mark takes the place the
   id had, so the column still reads as one thing down the group */
/* interactive text wears the link role; the four states come from the one button style */
.to-trades {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--color-accent);
  cursor: pointer;
}

.to-trades:hover,
.to-trades:focus-visible {
  text-decoration: underline;
}

/* the whole lifecycle of the position a reader jumped to, not one row of it */
.order-list :deep(.record-row.marked) {
  background-color: var(--color-bg-raised);
}

.carries-on {
  color: var(--color-text-secondary);
  padding-left: var(--space-sm);
}

/* the boundary between two positions, on the row that opens one. The first row of a group needs
   none: the heading above it is the boundary. */
.order-list :deep(.record-row.starts-position) {
  border-top: 1px solid var(--color-border);
}

.order-list :deep(.record-group + li .record-row.starts-position),
.order-list :deep(li:first-of-type .record-row.starts-position) {
  border-top: none;
}

.negative { color: var(--color-negative); }
.warned { color: var(--color-warning); }

/* the heading is a boundary and a summary in one row, never a control over the figures */
.group-name {
  grid-column: 1 / -2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-primary);
}

.group-marker {
  color: var(--color-text-secondary);
  margin-right: var(--space-xs);
}

.group-meta {
  color: var(--color-text-secondary);
  margin-left: var(--space-sm);
}

.group-count {
  grid-column: -2 / -1;
  text-align: right;
  color: var(--color-text-secondary);
}

.order-list :deep(.record-detail) {
  color: var(--color-text-secondary);
}

.reason-mark {
  margin-right: var(--space-xs);
}

.hint {
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
