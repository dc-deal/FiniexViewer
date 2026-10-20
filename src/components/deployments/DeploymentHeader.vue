<script setup lang="ts">
import {
  amount, magnitude, duration, percentFigure, signClass, utcSpan,
} from '@/components/runs/report_format'
import type { DeploymentRow } from '@/types/api/deployment_types'
import { t } from '@/translate'

/**
 * The ledger's own figures for one deployment in one account currency. One line per currency,
 * because a P&L added over two currencies is not a number — and these are shown rather than
 * recomputed from the sessions, where `max_drawdown` is a maximum that must never be summed.
 *
 * Each figure once (operator, 2026-10-20): the sessions are counted in the line above, for the
 * whole deployment; the bot id is on the chosen line's card; and whether the configuration moved
 * is the advisory's to say, above the table.
 */
defineProps<{
  row: DeploymentRow
}>()
</script>

<template>
  <p class="deployment-header">
    <!-- the amount carries its currency, which is what tells two currency lines apart -->
    <span class="figure" :class="signClass(row.net_pnl)">
      {{ amount(row.net_pnl, row.currency) }}
    </span>
    <span>
      {{ t('max DD') }}
      <span class="figure">
        {{ magnitude(row.max_drawdown, row.currency) }} ({{ percentFigure(row.max_drawdown_pct) }})
      </span>
    </span>
    <span>{{ utcSpan(row.first_started, row.last_started) }}</span>
    <span v-if="row.longest_gap_hours !== null">
      {{ t('longest idle') }} <span class="figure">{{ duration(row.longest_gap_hours) }}</span>
    </span>
  </p>
</template>

<style scoped>
.deployment-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-xs) var(--space-md);
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.figure {
  color: var(--color-text-primary);
}

.positive { color: var(--color-positive); }
.negative { color: var(--color-negative); }
</style>
