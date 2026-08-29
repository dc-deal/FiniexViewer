<script setup lang="ts">
import type { RunSummary } from '@/types/api/report_types'
import { t } from '@/translate'

defineProps<{
  model: RunSummary
}>()
</script>

<template>
  <div class="counts">
    <div class="count">
      <span class="count-label">{{ t('Sent') }}</span>
      <span class="count-value">{{ model.orders_sent }}</span>
    </div>
    <div class="count">
      <span class="count-label">{{ t('Executed') }}</span>
      <span class="count-value">{{ model.orders_executed }}</span>
    </div>
    <div class="count">
      <span class="count-label">{{ t('Rejected') }}</span>
      <span class="count-value">{{ model.orders_rejected }}</span>
    </div>
    <div class="count">
      <span class="count-label">{{ t('SL/TP') }}</span>
      <span class="count-value">{{ model.sl_tp_triggered }}</span>
    </div>
    <div class="count">
      <span class="count-label">{{ t('Units') }}</span>
      <span class="count-value">{{ model.unit_count }}</span>
    </div>
  </div>
</template>

<style scoped>
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
</style>
