<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import AppSelect from '@/components/base/AppSelect.vue'
import { useRunChartStore } from '@/stores/run_chart_store'
import type { ChartUnitBlock } from '@/types/run_chart_types'
import { t } from '@/translate'

/**
 * What the run chart shows — which unit, in which timeframe — beside the tabs while it is the panel
 * in front: `EURGBP_refusals_01 · M1`. A unit nothing can be drawn for stays listed, disabled, with
 * the reason, so the list is the run's whole set of units rather than a shorter one.
 */
const chart = useRunChartStore()
const { units, unit, timeframe, coveredTimeframes } = storeToRefs(chart)

const BLOCKED: Record<ChartUnitBlock, string> = {
  'no-ticks': t('processed no tick'),
  'no-market': t('names no market'),
}

const unitOptions = computed(() => (units.value ?? []).map(entry => ({
  value: entry.name,
  label: entry.block ? `${entry.name} — ${BLOCKED[entry.block]}` : entry.name,
  disabled: entry.block !== null,
})))
</script>

<template>
  <div class="run-chart-quick-bar">
    <AppSelect
      compact
      :label="t('Unit')"
      :model-value="unit?.name ?? null"
      :options="unitOptions"
      :placeholder="t('Unit')"
      :disabled="!unitOptions.length"
      @update:model-value="chart.chooseUnit"
    />
    <span class="quick-separator" aria-hidden="true">·</span>
    <AppSelect
      compact
      :label="t('Timeframe')"
      :model-value="timeframe"
      :options="coveredTimeframes.map(tf => ({ value: tf, label: tf }))"
      :placeholder="t('Timeframe')"
      :disabled="!coveredTimeframes.length"
      @update:model-value="chart.chooseTimeframe"
    />
  </div>
</template>

<style scoped>
.run-chart-quick-bar {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  height: 100%;
  padding: 0 var(--space-sm);
}

.quick-separator {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>
