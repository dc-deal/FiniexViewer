<script setup lang="ts">
import RecordList from '@/components/base/RecordList.vue'
import { rowKey } from '@/api/list_key'
import { amount, magnitude, duration, signClass, utcInstant } from '@/components/runs/report_format'
import type { DeploymentSessionRow } from '@/types/api/deployment_types'
import type { ListColumn } from '@/types/list_types'
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

/**
 * Six columns on the shared list stem. Ranked, because a deployment panel is narrow more often
 * than a run panel is: what survives is WHICH session and what it earned.
 */
const columns: ListColumn[] = [
  { label: t('Run'), width: 'minmax(9rem, 22fr)', rank: 1 },
  { label: t('Started'), width: 'minmax(0, 18fr)', rank: 2 },
  { label: t('Ran'), width: 'minmax(0, 12fr)', figure: true, rank: 3 },
  { label: t('Idle before'), width: 'minmax(0, 14fr)', figure: true, rank: 3 },
  { label: t('Net P&L'), width: 'minmax(0, 18fr)', figure: true, rank: 1 },
  { label: t('Max DD'), width: 'minmax(0, 16fr)', figure: true, rank: 2 },
]

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
  <!-- no totals row: net_pnl would sum, max_drawdown is a MAXIMUM and adding it counts one decline
       once per session that was still inside it. The figures above the list are the ledger's own,
       already reduced correctly. -->
  <RecordList
    class="sessions-list"
    :rows="sessions"
    :columns="columns"
    :row-key="session => rowKey(session, keyFields)"
    :has-lead="session => Boolean(boundary(session))"
    inert
  >
    <!-- the mark sits BETWEEN two sessions: everything above it was produced by a different
         configuration from everything below, which a badge on one row would misreport as a
         property of that row -->
    <template #lead="{ row: session }">{{ boundary(session) }}</template>

    <template #default="{ row: session }">
      <span :data-rank="1" class="session-run">
        <RouterLink
          class="run-link"
          :to="{ name: 'runs', query: { run: session.run_id } }"
          :title="t('Open this run')"
        >{{ session.run_id }} ↗</RouterLink>
      </span>
      <span :data-rank="2">{{ utcInstant(session.started) }}</span>
      <span :data-rank="3">{{ duration(session.ran_hours) }}</span>
      <span :data-rank="3">{{ gap(session) }}</span>
      <span :data-rank="1" :class="signClass(session.net_pnl)">
        {{ amount(session.net_pnl, session.currency) }}
      </span>
      <span :data-rank="2">{{ magnitude(session.max_drawdown, session.currency) }}</span>
    </template>
  </RecordList>
</template>

<style scoped>
/* only what the shared list does not own: it carries the tracks, the headings, the read-only rows
   and the dashed boundary line */
.sessions-list :deep(.record-row) > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* the run is the identity, and the only thing on the row that is read rather than compared */
.session-run {
  text-align: left;
}

.sessions-list :deep(.record-lead) {
  text-align: center;
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
