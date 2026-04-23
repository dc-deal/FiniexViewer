<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useSelectionStore } from '@/stores/selection_store'
import { useBarsStore } from '@/stores/bars_store'
import CandleChart from '@/components/CandleChart.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'

const { isReady } = storeToRefs(useSelectionStore())
const { chartData, loading, error } = storeToRefs(useBarsStore())
</script>

<template>
  <div class="chart-view">
    <div v-if="!isReady" class="state-overlay">
      <span class="hint">Select broker, symbol and timeframe to continue</span>
    </div>
    <div v-else-if="loading" class="state-overlay">
      <AppSpinner />
    </div>
    <div v-else-if="error" class="state-overlay">
      <span class="error-msg">{{ error }}</span>
    </div>
    <CandleChart v-else-if="chartData.length" :data="chartData" />
    <div v-else class="state-overlay">
      <span class="hint">No data available for this range</span>
    </div>
  </div>
</template>

<style scoped>
.chart-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.state-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: monospace;
}

.hint {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.error-msg {
  color: var(--color-error);
  font-size: var(--font-size-sm);
}
</style>
