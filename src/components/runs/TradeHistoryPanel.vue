<script setup lang="ts">
import { computed } from 'vue'
import HoverCard from '@/components/base/HoverCard.vue'
import {
  amount, magnitude, numberOrNa, signClass, utcInstant,
} from '@/components/runs/report_format'
import type { TradeHistoryReport, TradeRow } from '@/types/api/report_types'
import { t } from '@/translate'

const props = defineProps<{
  model: TradeHistoryReport
}>()

/**
 * Rows drawn without virtualisation. A backtest of a few hours produces a handful; a thirty-day
 * session produces thousands, and drawing all of them would stall the page. So there is a cap —
 * and it is VISIBLE: a silent truncation reads as "that was all", which is the one thing a trade
 * list must never say. Virtualisation replaces this the day a run actually exceeds it.
 */
const ROW_CAP = 500

const shown = computed(() => props.model.trades.slice(0, ROW_CAP))
const hidden = computed(() => Math.max(0, props.model.trades.length - ROW_CAP))

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
    <section v-for="stats in model.analytics" :key="stats.currency" class="analytics">
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
      {{ t('Showing the first') }} {{ ROW_CAP }} {{ t('of') }} {{ model.count }}
      {{ t('trades — the remainder are not drawn, which is not the same as not there') }}
    </p>

    <div v-if="!model.trades.length" class="hint">{{ t('This run closed no positions') }}</div>
    <div v-else class="table-scroll">
      <table class="kpi-table">
        <thead>
          <tr>
            <th>{{ t('Unit') }}</th>
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
          <HoverCard
            v-for="trade in shown"
            :key="trade.position_id"
            :title="`${trade.scenario_name} · ${trade.direction} ${trade.lots}`"
            :details="details(trade)"
            side="top"
          >
            <tr tabindex="0">
              <td class="text-cell">{{ trade.scenario_name }}</td>
              <td class="text-cell">{{ trade.symbol }}</td>
              <td class="text-cell">{{ trade.direction }}</td>
              <td>{{ trade.lots }}</td>
              <td>{{ utcInstant(trade.entry_time) }}</td>
              <td>{{ held(trade.duration_s) }}</td>
              <td :class="signClass(trade.net_pnl)">{{ amount(trade.net_pnl, trade.currency) }}</td>
              <td>{{ magnitude(trade.mae_pnl, trade.currency) }}</td>
              <td>{{ amount(trade.mfe_pnl, trade.currency) }}</td>
            </tr>
          </HoverCard>
        </tbody>
        <!-- only where there is more than one unit: with one, it would repeat the row above it -->
        <tfoot v-if="model.scenario_totals.length > 1">
          <tr v-for="total in model.scenario_totals" :key="total.scenario_name">
            <td class="text-cell" colspan="5">{{ total.scenario_name }}</td>
            <td>{{ total.trade_count }}</td>
            <td :class="signClass(total.net_pnl)">{{ amount(total.net_pnl, total.currency) }}</td>
            <td colspan="2">{{ t('fees') }} {{ amount(total.total_fees, total.currency) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped>
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

.hint {
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.positive { color: var(--color-positive); }
.negative { color: var(--color-negative); }
</style>
