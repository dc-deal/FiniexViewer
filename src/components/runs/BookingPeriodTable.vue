<script setup lang="ts">
import { rowKey } from '@/api/list_key'
import {
  amount, magnitude, numberOrNa, percentOrNa, signClass, utcInstant,
} from '@/components/runs/report_format'
import type { BookingPeriodRow } from '@/types/api/report_types'
import { t } from '@/translate'

/**
 * A period row from either scope. The run-scoped route omits `run_id` because the whole response
 * is one run; the deployment-scoped route carries it, and there it is part of the row's identity.
 */
type PeriodRow = BookingPeriodRow & { run_id?: string }

/**
 * The booking periods as rows. Shared by the run panel and the deployment view, so it takes the
 * periods and the key tuple the response declared rather than reaching for either itself.
 */
defineProps<{
  periods: PeriodRow[]
  keyFields: string[]
  /** Set where the rows span several runs — off inside one run, where the column is constant. */
  showRun?: boolean
}>()
</script>

<template>
  <div class="table-scroll">
    <table class="kpi-table">
      <thead>
        <tr>
          <th>{{ t('Unit') }}</th>
          <th v-if="showRun">{{ t('Run') }}</th>
          <th>{{ t('Seg') }}</th>
          <th>{{ t('Opened') }}</th>
          <th>{{ t('Closed') }}</th>
          <th>{{ t('Reason') }}</th>
          <th>{{ t('Trades') }}</th>
          <th>{{ t('Net P&L') }}</th>
          <th>{{ t('Win Rate') }}</th>
          <th>{{ t('PF') }}</th>
          <th>{{ t('Max DD') }}</th>
          <th>{{ t('Fees') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="period in periods" :key="rowKey(period, keyFields)">
          <td class="text-cell">{{ period.unit_name }}</td>
          <td v-if="showRun" class="text-cell">
            <RouterLink
              v-if="period.run_id"
              class="run-link"
              :to="{ name: 'runs', query: { run: period.run_id } }"
              :title="t('Open this run')"
            >{{ period.run_id }} ↗</RouterLink>
          </td>
          <td>{{ period.segment_no }}</td>
          <td>{{ utcInstant(period.opened_at) }}</td>
          <td>{{ utcInstant(period.closed_at) }}</td>
          <td class="text-cell">{{ period.reason }}</td>
          <td>{{ period.trade_count }}</td>
          <td :class="signClass(period.net_pnl)">{{ amount(period.net_pnl, period.currency) }}</td>
          <td>{{ percentOrNa(period.win_rate, period.trade_count) }}</td>
          <td>{{ numberOrNa(period.profit_factor, period.trade_count) }}</td>
          <td>{{ magnitude(period.max_drawdown, period.currency) }}</td>
          <td>{{ amount(period.total_fees, period.currency) }}</td>
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
  font-family: monospace;
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.kpi-table th {
  color: var(--color-text-secondary);
  font-weight: normal;
}

.text-cell {
  text-align: left;
}

.run-link {
  color: var(--color-accent);
  text-decoration: none;
}

.run-link:hover {
  text-decoration: underline;
}

.positive { color: var(--color-positive); }
.negative { color: var(--color-negative); }
</style>
