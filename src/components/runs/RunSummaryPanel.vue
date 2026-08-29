<script setup lang="ts">
import type { RunSummary } from '@/types/api/report_types'

defineProps<{
  summary: RunSummary
}>()

// Fixed locale on purpose: the rest of the panel formats with toFixed (dot decimals), and a
// browser-locale separator would put '-50,60 USD' next to a profit factor of '0.57'.
const decimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Currency amount. The code is appended as text — quote currencies are not all ISO-4217. */
function amount(value: number, currency: string): string {
  return `${decimal.format(value)} ${currency}`
}

/** Backend ratios are 0..1 — the percent conversion happens here, at the render edge. */
function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

/** Plain decimal, or n/a when the backend says the value is undefined rather than zero. */
function numberOrNa(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(2)
}

/**
 * R-denominated value, signed like the backend console, and gated on the count of ITS OWN
 * subset. A run can have R-defined trades with no winner among them, so r_trade_count alone
 * would still print a mean nobody measured.
 */
function rValue(value: number | null, count: number): string {
  if (count === 0 || value === null) return 'n/a'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}R`
}

/** Sign class for P&L-denominated cells. Empty for zero — no colour claim on a flat result. */
function signClass(value: number): string {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return ''
}
</script>

<template>
  <div class="summary-panel">
    <section class="block">
      <h2 class="block-title">Orders</h2>
      <div class="counts">
        <div class="count"><span class="count-label">Sent</span><span class="count-value">{{ summary.orders_sent }}</span></div>
        <div class="count"><span class="count-label">Executed</span><span class="count-value">{{ summary.orders_executed }}</span></div>
        <div class="count"><span class="count-label">Rejected</span><span class="count-value">{{ summary.orders_rejected }}</span></div>
        <div class="count"><span class="count-label">SL/TP</span><span class="count-value">{{ summary.sl_tp_triggered }}</span></div>
        <div class="count"><span class="count-label">Units</span><span class="count-value">{{ summary.unit_count }}</span></div>
      </div>
    </section>

    <section class="block">
      <h2 class="block-title">Per Currency</h2>
      <div v-if="!summary.currencies.length" class="hint">No currency KPIs in this run</div>
      <div v-else class="table-scroll">
        <table class="kpi-table">
          <thead>
            <tr>
              <th>Currency</th>
              <th>Net P&amp;L</th>
              <th>PF</th>
              <th>Win Rate</th>
              <th>Trades</th>
              <th>Expectancy</th>
              <th>Avg Win R</th>
              <th>Avg Loss R</th>
              <th>Max DD</th>
              <th>Fees</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in summary.currencies" :key="row.currency">
              <td>{{ row.currency }}</td>
              <td :class="signClass(row.net_pnl)">{{ amount(row.net_pnl, row.currency) }}</td>
              <td>{{ numberOrNa(row.profit_factor) }}</td>
              <td>{{ percent(row.win_rate) }}</td>
              <td>{{ row.total_trades }} ({{ row.winning_trades }}W/{{ row.losing_trades }}L)</td>
              <td>{{ rValue(row.expectancy, row.r_trade_count) }}</td>
              <td>{{ rValue(row.avg_win_r, row.r_win_count) }}</td>
              <td>{{ rValue(row.avg_loss_r, row.r_loss_count) }}</td>
              <td>{{ amount(row.max_drawdown, row.currency) }}</td>
              <td>{{ amount(row.total_fees, row.currency) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="block">
      <h2 class="block-title">Feed</h2>
      <div class="counts">
        <div class="count">
          <span class="count-label">Signal freshness</span>
          <span class="count-value">
            {{ summary.signal_fresh_ratio === null ? 'no SIGNAL worker' : percent(summary.signal_fresh_ratio) }}
          </span>
        </div>
        <div class="count"><span class="count-label">Disturbance episodes</span><span class="count-value">{{ summary.disturbance_episode_count }}</span></div>
        <div class="count"><span class="count-label">Stale seconds</span><span class="count-value">{{ summary.disturbance_stale_seconds.toFixed(1) }}</span></div>
        <div class="count"><span class="count-label">Sources affected</span><span class="count-value">{{ summary.disturbance_source_count }}</span></div>
        <div class="count"><span class="count-label">Stress injected</span><span class="count-value">{{ summary.disturbance_stress_injected }}</span></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.summary-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.block-title {
  font-size: var(--font-size-sm);
  font-weight: bold;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-sm);
}

.counts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.count {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: var(--space-sm) var(--space-md);
  min-width: 7rem;
}

.count-label {
  color: var(--color-text-secondary);
}

.count-value {
  font-size: var(--font-size-md);
}

.table-scroll {
  overflow-x: auto;
}

.kpi-table {
  border-collapse: collapse;
  width: 100%;
}

.kpi-table th,
.kpi-table td {
  text-align: right;
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.kpi-table th {
  color: var(--color-text-secondary);
  font-weight: normal;
}

.kpi-table th:first-child,
.kpi-table td:first-child {
  text-align: left;
}

.positive {
  color: var(--color-positive);
}

.negative {
  color: var(--color-negative);
}

.hint {
  color: var(--color-text-secondary);
}
</style>
