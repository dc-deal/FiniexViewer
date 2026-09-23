<script setup lang="ts">
import { rowKey } from '@/api/list_key'
import { amount, drawdown, duration, signClass, utcInstant } from '@/components/runs/report_format'
import type { DeploymentSessionRow } from '@/types/api/deployment_types'
import { t } from '@/translate'

/**
 * The sessions of one deployment in one account currency, oldest first — a life reads forwards.
 * The order arrives from the ledger and is not re-sorted here: the change marks name a boundary
 * BETWEEN two rows, so reversing the rows without moving the marks would misplace them.
 *
 * No ordinal column. `index` rides on the row but is NOT part of the identity the response
 * declares — `key` is (run_id, currency) — so presenting it as "the session number" invents a
 * counter the ledger does not keep, and it repeats once a deployment books in two currencies.
 * The run is the identity; the order is the sequence.
 */
defineProps<{
  sessions: DeploymentSessionRow[]
  keyFields: string[]
}>()

/** What changed at the boundary before a session, or null where nothing did. */
function boundary(session: DeploymentSessionRow): string | null {
  if (session.strategy_changed && session.operation_changed) {
    return t('Strategy and operation changed from here')
  }
  if (session.strategy_changed) return t('Strategy changed from here')
  if (session.operation_changed) return t('Operation changed from here')
  return null
}

/**
 * The idle stretch before a session. Null on the first one — an absence, never a zero. Where it
 * could only be measured start-to-start it contains the predecessor's whole runtime, so it is
 * labelled as the upper bound it is rather than shown as the same measure.
 */
function gap(session: DeploymentSessionRow): string {
  if (session.gap_hours === null) return '—'
  return session.gap_between_starts ? `≤ ${duration(session.gap_hours)}` : duration(session.gap_hours)
}
</script>

<template>
  <div class="table-scroll">
    <table class="kpi-table">
      <thead>
        <tr>
          <th>{{ t('Run') }}</th>
          <th>{{ t('Started') }}</th>
          <th>{{ t('Ran') }}</th>
          <th>{{ t('Idle before') }}</th>
          <th>{{ t('Net P&L') }}</th>
          <th>{{ t('Max DD') }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="session in sessions" :key="rowKey(session, keyFields)">
          <!-- the mark sits BETWEEN two sessions: everything above it was produced by a
               different configuration from everything below, which a badge on one row would
               misreport as a property of that row -->
          <tr v-if="boundary(session)" class="boundary">
            <td colspan="6">{{ boundary(session) }}</td>
          </tr>
          <tr>
            <td class="text-cell">
              <RouterLink
                class="run-link"
                :to="{ name: 'runs', query: { run: session.run_id } }"
                :title="t('Open this run')"
              >{{ session.run_id }} ↗</RouterLink>
            </td>
            <td>{{ utcInstant(session.started) }}</td>
            <td>{{ duration(session.ran_hours) }}</td>
            <td>{{ gap(session) }}</td>
            <td :class="signClass(session.net_pnl)">
              {{ amount(session.net_pnl, session.currency) }}
            </td>
            <td>{{ drawdown(session.max_drawdown, session.currency) }}</td>
          </tr>
        </template>
      </tbody>
      <!-- no totals row: net_pnl would sum, max_drawdown is a MAXIMUM and adding it counts one
           decline once per session that was still inside it. The figures above the table are the
           ledger's own, already reduced correctly. -->
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

.boundary td {
  text-align: center;
  color: var(--color-annotation);
  /* dashed on purpose: a configuration boundary is not a warning, and the dash is the second
     channel that separates it from both where hue cannot */
  border-top: 2px dashed var(--color-annotation);
  border-bottom: none;
  padding-top: var(--space-sm);
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
