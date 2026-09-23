<script setup lang="ts">
import {
  amount, magnitude, duration, percentFigure, signClass, utcInstant,
} from '@/components/runs/report_format'
import type { DeploymentRow } from '@/types/api/deployment_types'
import { t } from '@/translate'

/**
 * The ledger's own figures for one deployment in one account currency. One block per currency,
 * because a P&L added over two currencies is not a number — and these are shown rather than
 * recomputed from the sessions, where `max_drawdown` is a maximum that must never be summed.
 */
defineProps<{
  row: DeploymentRow
}>()
</script>

<template>
  <div class="deployment-header">
    <div class="header-line">
      <span class="currency">{{ row.currency }}</span>
      <span class="figure" :class="signClass(row.net_pnl)">
        {{ amount(row.net_pnl, row.currency) }}
      </span>
      <span class="label">{{ t('max drawdown') }}</span>
      <span class="figure">
        {{ magnitude(row.max_drawdown, row.currency) }} ({{ percentFigure(row.max_drawdown_pct) }})
      </span>
      <span class="label">{{ row.sessions }} {{ t('sessions') }}</span>
    </div>
    <div class="header-line secondary">
      <span>{{ utcInstant(row.first_started) }} → {{ utcInstant(row.last_started) }}</span>
      <span v-if="row.longest_gap_hours !== null">
        {{ t('longest idle') }}: {{ duration(row.longest_gap_hours) }}
      </span>
      <!-- bot_id is the only identity that does not move: the name above it is a label an
           operator improves, and a deliberate restart mints a fresh deployment_id -->
      <span v-if="row.bot_id">{{ t('bot') }}: {{ row.bot_id }}</span>
      <span v-if="row.changed" class="changed" :title="t('The sessions were not all produced by one configuration')">
        ⚠ {{ t('configuration moved') }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.deployment-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-bg-elevated);
}

.header-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-md);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.header-line.secondary {
  color: var(--color-text-secondary);
}

.currency {
  color: var(--color-text-secondary);
}

.figure {
  color: var(--color-text-primary);
}

.label {
  color: var(--color-text-secondary);
}

.changed {
  color: var(--color-warning);
}

.positive { color: var(--color-positive); }
.negative { color: var(--color-negative); }
</style>
