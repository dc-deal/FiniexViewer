<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import HoverCard from '@/components/base/HoverCard.vue'
import {
  amount, magnitude, numberOrNa, percent, signClass, utcInstant,
} from '@/components/runs/report_format'
import { useDisplaySettings } from '@/composables/use_display_settings'
import type { TradeRow, TradeView } from '@/types/api/report_types'
import { t } from '@/translate'

const props = defineProps<{
  model: TradeView
}>()

const history = computed(() => props.model.history)

/**
 * The order funnel, which belongs here rather than in a panel of its own: this view is about
 * execution, and what was ATTEMPTED is the other half of what was closed. Measured on a real run:
 * 566 orders sent, 22 executed, 544 rejected — the trade list below shows eleven positions and
 * says nothing about the 96 % that never became one.
 */
const funnel = computed(() => {
  const summary = props.model.summary
  if (!summary) return null
  const rate = summary.orders_sent > 0
    ? summary.orders_executed / summary.orders_sent
    : null
  return {
    sent: summary.orders_sent,
    executed: summary.orders_executed,
    rejected: summary.orders_rejected,
    slTp: summary.sl_tp_triggered,
    rate,
  }
})

const display = useDisplaySettings()

/**
 * Rows drawn without virtualisation. A backtest of a few hours produces a handful; a thirty-day
 * session produces thousands, and drawing all of them would stall the page. So there is a cap —
 * and it is VISIBLE: a silent truncation reads as "that was all", which is the one thing a trade
 * list must never say. Virtualisation replaces this the day a run actually exceeds it.
 */
const rowCap = computed(() => display.value.tradeRowCap)

const shown = computed(() => history.value.trades.slice(0, rowCap.value))
const hidden = computed(() => Math.max(0, history.value.trades.length - rowCap.value))

/**
 * The trades grouped under the unit that produced them, each group carrying its own totals.
 *
 * A flat list with the totals in a footer put six units' rows one after another with nothing
 * saying where one ended — and the footer then read as more trades rather than as a summary. A
 * group header answers both at once: it shows the boundary AND puts the figures beside the rows
 * they are about. The unit order follows the trade order the backend returned; nothing is re-sorted.
 */
const groups = computed(() => {
  const totals = new Map(history.value.scenario_totals.map(total => [total.scenario_name, total]))
  const order: string[] = []
  const byUnit = new Map<string, TradeRow[]>()
  for (const trade of shown.value) {
    if (!byUnit.has(trade.scenario_name)) {
      byUnit.set(trade.scenario_name, [])
      order.push(trade.scenario_name)
    }
    byUnit.get(trade.scenario_name)!.push(trade)
  }
  return order.map(name => ({
    name,
    trades: byUnit.get(name) ?? [],
    // absent where a unit traded but reports no total — shown as a count rather than invented
    total: totals.get(name) ?? null,
  }))
})

/**
 * Past the scenario threshold the individual unit recedes and its summary becomes the primary
 * thing: the group header still states the name, the net, the fees and the count, and the rows
 * under it wait to be asked for. A forty-scenario run is otherwise a list nobody reads.
 *
 * Nothing is hidden silently — the header says how many trades are behind it, and it is one click.
 */
const summarised = computed(() => groups.value.length >= display.value.scenarioThreshold)

/** A unit the reader has opened or closed by hand, which outranks the threshold for that unit. */
const overrides = ref(new Map<string, boolean>())

// a different run is a different set of units, so a choice made about the old one means nothing
watch(() => props.model, () => overrides.value.clear())

function isExpanded(name: string): boolean {
  return overrides.value.get(name) ?? !summarised.value
}

function toggleGroup(name: string): void {
  overrides.value.set(name, !isExpanded(name))
}

/** Seconds as the operator reads a holding period. */
function held(seconds: number): string {
  if (seconds < 90) return `${seconds.toFixed(0)} s`
  if (seconds < 5400) return `${(seconds / 60).toFixed(0)} min`
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)} h`
  return `${(seconds / 86400).toFixed(1)} d`
}

/**
 * Everything the row has no width for. The excursions are given three ways by the backend — as a
 * price, as the unrealised P&L at that price, and as a distance — and all three are here, because
 * which one answers a question depends on the question.
 */
function details(trade: TradeRow): { label: string, value: string, tone?: string }[] {
  const rows = [
    { label: t('Opened'), value: `${utcInstant(trade.entry_time)} @ ${trade.entry_price}` },
    { label: t('Closed'), value: `${utcInstant(trade.exit_time)} @ ${trade.exit_price}` },
    { label: t('Ticks'), value: `${trade.entry_tick_index} to ${trade.exit_tick_index}` },
    { label: t('Entry'), value: `${trade.entry_type} · ${trade.entry_side}` },
    {
      label: t('Gross'),
      value: amount(trade.gross_pnl, trade.currency),
      tone: signClass(trade.gross_pnl),
    },
    {
      label: t('Net'),
      value: amount(trade.net_pnl, trade.currency),
      tone: signClass(trade.net_pnl),
    },
    {
      label: t('Fees'),
      value: `${amount(trade.total_fees, trade.currency)} · ${t('spread')} `
        + `${trade.spread_cost.toFixed(2)} · ${t('commission')} `
        + `${trade.commission_cost.toFixed(2)} · ${t('swap')} ${trade.swap_cost.toFixed(2)}`,
    },
    {
      label: t('Slippage'),
      value: `${t('in')} ${trade.entry_slippage.toFixed(4)} · `
        + `${t('out')} ${trade.exit_slippage.toFixed(4)}`,
    },
    {
      label: t('Worst against'),
      value: `${magnitude(trade.mae_pnl, trade.currency)} @ ${trade.mae_price} · `
        + `${trade.mae_distance.toFixed(2)} ${trade.price_unit}`,
    },
    {
      label: t('Best in favour'),
      value: `${amount(trade.mfe_pnl, trade.currency)} @ ${trade.mfe_price} · `
        + `${trade.mfe_distance.toFixed(2)} ${trade.price_unit}`,
    },
    // null where no stop was set: the trade has no R to be a multiple of, which is an absence
    { label: t('R multiple'), value: numberOrNa(trade.r_multiple) },
    {
      label: t('Fills'),
      value: `${trade.entry_executions.length} / ${trade.exit_executions.length}`,
    },
  ]
  // '' means the close was not attributed — shown only where it says something
  if (trade.close_reason) rows.splice(3, 0, { label: t('Closed by'), value: trade.close_reason })
  if (trade.stop_loss !== null) rows.push({ label: t('Stop loss'), value: String(trade.stop_loss) })
  if (trade.take_profit !== null) {
    rows.push({ label: t('Take profit'), value: String(trade.take_profit) })
  }
  return rows
}
</script>

<template>
  <div class="trade-history">
    <!-- what was ATTEMPTED, before what was closed: a low execution rate changes how every figure
         below it reads, so it comes first rather than sitting in a panel of its own -->
    <p v-if="funnel" class="funnel">
      <span class="funnel-label">{{ t('Orders') }}</span>
      <span class="funnel-value">
        {{ funnel.executed }}/{{ funnel.sent }} {{ t('executed') }}
        <template v-if="funnel.rate !== null">({{ percent(funnel.rate) }})</template>
      </span>
      <span v-if="funnel.rejected" class="funnel-rejected">
        {{ funnel.rejected }} {{ t('rejected') }}
      </span>
      <span v-if="funnel.slTp" class="funnel-label">
        {{ funnel.slTp }} {{ t('closed by SL/TP') }}
      </span>
    </p>

    <section v-for="stats in history.analytics" :key="stats.currency" class="analytics">
      <div class="figure">
        <span class="label">{{ t('Trades') }}</span>
        <span class="value">{{ stats.trade_count }} · {{ stats.currency }}</span>
      </div>
      <div class="figure">
        <span class="label">{{ t('Net') }}</span>
        <span class="value" :class="signClass(stats.net_pnl)">
          {{ amount(stats.net_pnl, stats.currency) }}
        </span>
      </div>
      <div class="figure">
        <span class="label">{{ t('Expectancy') }}</span>
        <!-- R-denominated, so it means nothing without a trade that carried a stop -->
        <span class="value">{{ numberOrNa(stats.expectancy, stats.r_trade_count) }}</span>
      </div>
      <div class="figure">
        <span class="label">{{ t('Mean hold') }}</span>
        <span class="value">{{ held(stats.avg_trade_duration_s) }}</span>
      </div>
      <div class="figure">
        <span class="label">{{ t('Worst against') }}</span>
        <span class="value">{{ magnitude(stats.largest_mae, stats.currency) }}</span>
      </div>
      <div class="figure">
        <span class="label">{{ t('Best in favour') }}</span>
        <span class="value">{{ amount(stats.largest_mfe, stats.currency) }}</span>
      </div>
      <div class="figure">
        <span class="label">{{ t('Longest streak') }}</span>
        <span class="value">
          {{ stats.max_consecutive_wins }}W / {{ stats.max_consecutive_losses }}L
        </span>
      </div>
    </section>

    <p v-if="hidden" class="notice">
      <span class="mark">⚠</span>
      {{ t('Showing the first') }} {{ rowCap }} {{ t('of') }} {{ history.count }}
      {{ t('trades — the remainder are not drawn, which is not the same as not there') }}
    </p>

    <div v-if="!history.trades.length" class="hint">{{ t('This run closed no positions') }}</div>
    <div v-else class="table-scroll">
      <table class="kpi-table">
        <thead>
          <tr>
            <th>{{ t('Symbol') }}</th>
            <th>{{ t('Dir') }}</th>
            <th>{{ t('Lots') }}</th>
            <th>{{ t('Opened') }}</th>
            <th>{{ t('Held') }}</th>
            <th>{{ t('Net P&L') }}</th>
            <th>{{ t('Worst against') }}</th>
            <th>{{ t('Best in favour') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="group in groups" :key="group.name">
            <!-- the boundary and the summary in one row: it says where a unit's trades begin AND
                 what they came to, instead of leaving the second half in a detached footer -->
            <tr
              class="group"
              tabindex="0"
              @click="toggleGroup(group.name)"
              @keydown.enter.prevent="toggleGroup(group.name)"
              @keydown.space.prevent="toggleGroup(group.name)"
            >
              <td class="text-cell" colspan="6">
                <span class="group-marker">{{ isExpanded(group.name) ? '▾' : '▸' }}</span>
                {{ group.name }}
              </td>
              <td v-if="group.total" :class="signClass(group.total.net_pnl)">
                {{ amount(group.total.net_pnl, group.total.currency) }}
              </td>
              <td v-else />
              <td colspan="2" class="group-meta">
                {{ group.trades.length }} {{ t('trades') }}
                <template v-if="group.total">
                  · {{ t('fees') }} {{ amount(group.total.total_fees, group.total.currency) }}
                </template>
              </td>
            </tr>
            <HoverCard
              v-for="trade in (isExpanded(group.name) ? group.trades : [])"
              :key="trade.position_id"
              :title="`${trade.scenario_name} · ${trade.direction} ${trade.lots}`"
              :details="details(trade)"
              side="top"
            >
              <tr tabindex="0">
                <td class="text-cell indent">{{ trade.symbol }}</td>
                <td class="text-cell">{{ trade.direction }}</td>
                <td>{{ trade.lots }}</td>
                <td>{{ utcInstant(trade.entry_time) }}</td>
                <td>{{ held(trade.duration_s) }}</td>
                <td :class="signClass(trade.net_pnl)">
                  {{ amount(trade.net_pnl, trade.currency) }}
                </td>
                <td>{{ magnitude(trade.mae_pnl, trade.currency) }}</td>
                <td colspan="2">{{ amount(trade.mfe_pnl, trade.currency) }}</td>
              </tr>
            </HoverCard>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.funnel {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-md);
  margin: 0 0 var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.funnel-label { color: var(--color-text-secondary); }
.funnel-value { color: var(--color-text-primary); }

/* a rejection is not an error of ours — it is a fact about the run that must not be overlooked */
.funnel-rejected { color: var(--color-warning); }

.analytics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.figure {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-xs) var(--space-sm);
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.figure .label { color: var(--color-text-secondary); }
.figure .value { color: var(--color-text-primary); }

.notice {
  margin: 0 0 var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-warning);
  border-radius: 4px;
  color: var(--color-warning);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.mark { margin-right: var(--space-xs); }

.table-scroll { overflow-x: auto; }

.kpi-table {
  border-collapse: collapse;
  width: 100%;
}

.kpi-table th,
.kpi-table td {
  text-align: right;
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 1px solid var(--color-border);
  font-family: monospace;
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.kpi-table th {
  color: var(--color-text-secondary);
  font-weight: normal;
}

.text-cell { text-align: left; }

/* the group row carries a unit's name and its totals — separated from the trades under it so it
   cannot be read as one of them, which is exactly how the old footer went wrong */
.group td {
  border-top: 2px solid var(--color-border);
  padding-top: var(--space-sm);
  color: var(--color-text-primary);
  background-color: var(--color-bg-elevated);
}

/* the whole row opens and closes the unit, so it carries the cursor that says so */
.group {
  cursor: pointer;
}

.group:focus-visible {
  outline: 1px solid var(--color-accent);
  outline-offset: -1px;
}

.group-marker {
  display: inline-block;
  width: 1em;
  color: var(--color-text-secondary);
}

.group-meta { color: var(--color-text-secondary); }

/* the trades sit under their group rather than beside it */
.indent { padding-left: var(--space-lg); }

.hint {
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.positive { color: var(--color-positive); }
.negative { color: var(--color-negative); }
</style>
