<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useRunsStore } from '@/stores/runs_store'
import { useRunQuerySync } from '@/composables/use_run_query_sync'
import RunPicker from '@/components/runs/RunPicker.vue'
import RunSummaryPanel from '@/components/runs/RunSummaryPanel.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'

const { selectedRun, summary, summaryMissing, loadingRuns, loadingSummary, error } =
  storeToRefs(useRunsStore())

// loads the run index and restores the cascade from the URL
useRunQuerySync()
</script>

<template>
  <div class="runs-view">
    <header class="runs-header">
      <RunPicker />
    </header>

    <div class="runs-body">
      <div v-if="loadingRuns || loadingSummary" class="state-overlay">
        <AppSpinner />
      </div>
      <div v-else-if="error" class="state-overlay">
        <span class="error-msg">{{ error }}</span>
      </div>
      <div v-else-if="!selectedRun" class="state-overlay">
        <span class="hint">Select group, scenario and run to continue</span>
      </div>
      <div v-else-if="summaryMissing" class="state-overlay">
        <span class="hint">This run carries no run-summary artifact</span>
      </div>
      <RunSummaryPanel v-else-if="summary" :summary="summary" />
    </div>
  </div>
</template>

<style scoped>
.runs-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.runs-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.runs-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md);
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
