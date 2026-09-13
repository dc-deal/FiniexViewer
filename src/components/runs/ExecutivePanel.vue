<script setup lang="ts">
import type { RunSummary } from '@/types/api/report_types'
import { amount, percentOrNa, numberOrNa, rValue, signClass } from '@/components/runs/report_format'
import { t } from '@/translate'

defineProps<{
  model: RunSummary
}>()
</script>

<template>
  <div v-if="!model.currencies.length" class="hint">{{ t('No currency KPIs in this run') }}</div>
  <div v-else class="table-scroll">
    <table class="kpi-table">
      <thead>
        <tr>
          <th>{{ t('Currency') }}</th>
          <th>{{ t('Net P&L') }}</th>
          <th>{{ t('PF') }}</th>
          <th>{{ t('Win Rate') }}</th>
          <th>{{ t('Trades') }}</th>
          <th>{{ t('Expectancy') }}</th>
          <th>{{ t('Avg Win R') }}</th>
          <th>{{ t('Avg Loss R') }}</th>
          <th>{{ t('Max DD') }}</th>
          <th>{{ t('Fees') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in model.currencies" :key="row.currency">
          <td>{{ row.currency }}</td>
          <td :class="signClass(row.net_pnl)">{{ amount(row.net_pnl, row.currency) }}</td>
          <td>{{ numberOrNa(row.profit_factor, row.total_trades) }}</td>
          <td>{{ percentOrNa(row.win_rate, row.total_trades) }}</td>
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
</template>

<style scoped>
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
