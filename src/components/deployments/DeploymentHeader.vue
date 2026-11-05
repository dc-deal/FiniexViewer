<script setup lang="ts">
import {
  bookedAmount, drawdownFigure, duration, signClass, utcSpan,
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
  /**
   * The ledger row of this currency. Null for the sessions without booked figures of a deployment
   * that has booked: since contract 51 the list counts them on its booked rows and serves no row of
   * their own, so their block has a heading and nothing more.
   */
  row: DeploymentRow | null
}>()
</script>

<template>
  <p class="deployment-header">
    <!-- their word for it (contract 50): no currency and no figure, so no two dashes to puzzle over. It
         holds the sessions whose first seal has not come AND the ones that failed before they measured
         anything, which never will — so not *booked nothing yet* -->
    <span v-if="!row || row.currency === null" class="figure">{{ t('without booked figures') }}</span>
    <template v-else>
      <!-- the amount carries its currency, which is what tells two currency lines apart -->
      <span class="figure" :class="signClass(row.net_pnl)">
        {{ bookedAmount(row.net_pnl, row.currency) }}
      </span>
      <span>
        {{ t('max DD') }}
        <span class="figure">
          {{ drawdownFigure(row.max_drawdown, row.max_drawdown_pct, row.currency) }}
        </span>
      </span>
    </template>
    <template v-if="row">
      <span>{{ utcSpan(row.first_started, row.last_started) }}</span>
      <span v-if="row.longest_gap_hours !== null">
        {{ t('longest idle') }} <span class="figure">{{ duration(row.longest_gap_hours) }}</span>
      </span>
    </template>
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
