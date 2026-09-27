<script setup lang="ts">
import { computed } from 'vue'
import { rowKey } from '@/api/list_key'
import {
  amount, figure, numberOrNa, percentOrNa, signClass, utcInstant,
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
 *
 * It carries EVERY field a period has — the same fifteen the hover card shows. The two serve
 * different questions: the card answers *what about this one*, the table answers *how do they
 * compare*, and comparison is why it stays a table. One column is one field, so the eye runs down
 * it; in a card-per-period layout the same field sits at a different height in every card.
 */
const props = defineProps<{
  periods: PeriodRow[]
  keyFields: string[]
  /** Set where the rows span several runs — off inside one run, where the column is constant. */
  showRun?: boolean
}>()

/**
 * The currency for the whole table, or null where the rows disagree.
 *
 * Stated once in the headers it costs one line; repeated in every cell it is four codes per row,
 * which is what pushed this table past the width of its panel. A response is one currency by
 * construction — the route serves them one at a time and names the others in `currencies` — but
 * that is the BACKEND's guarantee, not ours to assume, so a disagreement falls back to per-cell.
 */
const sharedCurrency = computed(() => {
  const first = props.periods[0]?.currency ?? null
  if (first === null) return null
  return props.periods.every(period => period.currency === first) ? first : null
})

/** The amount as the header allows: bare where the code is stated above, complete where it is not. */
function money(value: number, period: PeriodRow): string {
  return sharedCurrency.value === null ? amount(value, period.currency) : figure(value)
}

/** A drawdown is a MAGNITUDE — the stored sign is not reliable across the archive. */
function drawdown(period: PeriodRow): string {
  return money(Math.abs(period.max_drawdown), period)
}

/**
 * The equity band, as one column. Two columns for `min_equity` and `max_equity` would be two
 * headers for one fact, and the band is only ever read as a pair.
 */
function band(period: PeriodRow): string {
  return `${money(period.min_equity, period)} … ${money(period.max_equity, period)}`
}

/** Columns under the identity group, which has no heading of its own. */
const identitySpan = computed(() => (props.showRun ? 3 : 2))
</script>

<template>
  <!-- Closed by default, and a native <details> rather than a custom toggle: the chart above is
       what a reader comes for, the rows are the backup. `details` brings the keyboard and
       screen-reader semantics with it instead of us re-implementing them. -->
  <details class="periods">
    <summary class="periods-summary">
      {{ periods.length }} {{ t('booking periods') }}
      <!-- the currency, stated ONCE for the whole table instead of in every amount -->
      <template v-if="sharedCurrency"> · {{ t('figures in') }} {{ sharedCurrency }}</template>
    </summary>
    <div class="table-scroll">
    <table class="kpi-table">
      <thead>
        <!-- the columns grouped by the question they answer, so fifteen fields read as three
             things rather than as one undifferentiated row -->
        <tr class="group-row">
          <th :colspan="identitySpan" />
          <th colspan="3">{{ t('Period') }}</th>
          <th colspan="5">{{ t('Result') }}</th>
          <th colspan="3">{{ t('Account') }}</th>
        </tr>
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
          <th>{{ t('Fees') }}</th>
          <th>{{ t('Max DD') }}</th>
          <th>{{ t('Equity band') }}</th>
          <th>{{ t('Final equity') }}</th>
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
          <td :class="signClass(period.net_pnl)">{{ money(period.net_pnl, period) }}</td>
          <td>{{ percentOrNa(period.win_rate, period.trade_count) }}</td>
          <td>{{ numberOrNa(period.profit_factor, period.trade_count) }}</td>
          <td>{{ money(period.total_fees, period) }}</td>
          <td>{{ drawdown(period) }}</td>
          <td class="band-cell">{{ band(period) }}</td>
          <td>{{ money(period.final_equity, period) }}</td>
        </tr>
      </tbody>
      </table>
    </div>
  </details>
</template>

<style scoped>
.periods-summary {
  cursor: pointer;
  padding: var(--space-xs) 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
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
  font-family: monospace;
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.kpi-table th {
  color: var(--color-text-secondary);
  font-weight: normal;
}

/* the group names recede: they say what a block of columns is about, they are not headers to read
   row by row. A rule between the blocks carries the grouping, so the words can stay quiet. */
.group-row th {
  text-align: center;
  padding-bottom: 0;
  border-bottom: none;
  color: var(--color-text-secondary);
  opacity: 0.7;
  font-size: calc(var(--font-size-sm) * 0.9);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.group-row th + th {
  border-left: 1px solid var(--color-border);
}

.band-cell {
  color: var(--color-text-secondary);
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
