<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { PortfolioReport, PortfolioUnitRow } from '@/types/api/report_types'
import { amount, numberOrNa, percentOrNa, signClass } from '@/components/runs/report_format'
import { t } from '@/translate'

defineProps<{
  model: PortfolioReport
}>()

/**
 * Chart target for a unit. `data_source` carries the broker keys the chart addresses, so the
 * link exists only where the field is filled — live runs leave it empty and get plain text
 * rather than a link that lands nowhere. The timeframe is left out on purpose: the chart keeps
 * the one the user last chose.
 */
function chartTarget(unit: PortfolioUnitRow): RouteLocationRaw {
  return { name: 'viewer', query: { broker: unit.data_source, symbol: unit.symbol } }
}
</script>

<template>
  <div v-if="!model.units.length" class="hint">{{ t('No units in this run') }}</div>
  <div v-else class="table-scroll">
    <table class="kpi-table">
      <thead>
        <tr>
          <th>{{ t('Unit') }}</th>
          <th>{{ t('Symbol') }}</th>
          <th>{{ t('Net P&L') }}</th>
          <th>{{ t('PF') }}</th>
          <th>{{ t('Win Rate') }}</th>
          <th>{{ t('Trades') }}</th>
          <th>{{ t('Max DD') }}</th>
          <th>{{ t('Fees') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="unit in model.units" :key="unit.name">
          <td class="unit-cell">
            <span v-if="unit.has_error" class="unit-error" :title="t('This unit reported an error')">✖</span>
            {{ unit.name }}
            <span v-if="unit.spot_mode" class="badge">{{ t('spot') }}</span>
          </td>
          <td>
            <RouterLink
              v-if="unit.data_source"
              class="symbol-link"
              :to="chartTarget(unit)"
              :title="t('Open in chart')"
            >{{ unit.symbol }} ↗</RouterLink>
            <span v-else :title="unit.broker_name">{{ unit.symbol }}</span>
          </td>
          <td :class="signClass(unit.net_profit)">{{ amount(unit.net_profit, unit.currency) }}</td>
          <td>{{ numberOrNa(unit.profit_factor, unit.total_trades) }}</td>
          <td>{{ percentOrNa(unit.win_rate, unit.total_trades) }}</td>
          <td>{{ unit.total_trades }} ({{ unit.winning_trades }}W/{{ unit.losing_trades }}L)</td>
          <td>{{ amount(unit.max_drawdown, unit.currency) }}</td>
          <td>{{ amount(unit.total_fees, unit.currency) }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr v-for="total in model.aggregates" :key="total.currency">
          <td colspan="2">{{ t('All units') }} ({{ total.unit_count }}) · {{ total.currency }}</td>
          <td :class="signClass(total.net_profit)">{{ amount(total.net_profit, total.currency) }}</td>
          <td>{{ numberOrNa(total.profit_factor, total.total_trades) }}</td>
          <td>{{ percentOrNa(total.win_rate, total.total_trades) }}</td>
          <td>{{ total.total_trades }} ({{ total.winning_trades }}W/{{ total.losing_trades }}L)</td>
          <td>{{ amount(total.max_drawdown, total.currency) }}</td>
          <td>{{ amount(total.total_fees, total.currency) }}</td>
        </tr>
      </tfoot>
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
.kpi-table td:first-child,
.kpi-table td:nth-child(2) {
  text-align: left;
}

.kpi-table tfoot td {
  border-top: 1px solid var(--color-border);
  border-bottom: none;
  font-weight: bold;
}

.unit-cell {
  max-width: 24ch;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unit-error {
  color: var(--color-negative);
}

.badge {
  color: var(--color-text-secondary);
  font-size: 0.85em;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 0 var(--space-xs);
  margin-left: var(--space-xs);
}

.symbol-link {
  color: var(--color-accent);
  text-decoration: none;
}

.symbol-link:hover {
  text-decoration: underline;
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
