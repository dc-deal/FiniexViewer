<script setup lang="ts">
import type { RunSummary } from '@/types/api/report_types'
import { percent } from '@/components/runs/report_format'
import { t } from '@/translate'

defineProps<{
  model: RunSummary
}>()
</script>

<template>
  <div class="counts">
    <div class="count">
      <span class="count-label">{{ t('Signal freshness') }}</span>
      <!-- null means no SIGNAL worker was involved, never a perfect feed -->
      <span class="count-value">
        {{ model.signal_fresh_ratio === null ? t('no SIGNAL worker') : percent(model.signal_fresh_ratio) }}
      </span>
    </div>
    <div class="count">
      <span class="count-label">{{ t('Disturbance episodes') }}</span>
      <span class="count-value">{{ model.disturbance_episode_count }}</span>
    </div>
    <div class="count">
      <span class="count-label">{{ t('Stale seconds') }}</span>
      <span class="count-value">{{ model.disturbance_stale_seconds.toFixed(1) }}</span>
    </div>
    <div class="count">
      <span class="count-label">{{ t('Sources affected') }}</span>
      <span class="count-value">{{ model.disturbance_source_count }}</span>
    </div>
    <div class="count">
      <span class="count-label">{{ t('Stress injected') }}</span>
      <span class="count-value">{{ model.disturbance_stress_injected }}</span>
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
