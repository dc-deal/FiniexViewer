<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunQuerySync } from '@/composables/use_run_query_sync'
import RunPicker from '@/components/runs/RunPicker.vue'
import AppBar from '@/components/panels/AppBar.vue'
import PanelColumn from '@/components/panels/PanelColumn.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import { t } from '@/translate'

const runsStore = useRunsStore()
const reportsStore = useRunReportsStore()
const { selectedRunId, selectedRun, summary, summaryMissing, loadingRuns, loadingSummary, error } =
  storeToRefs(runsStore)
const { warningsErrors } = storeToRefs(reportsStore)

// loads the run index and restores the cascade from the URL
useRunQuerySync()

// One request per section per run. Lazy loading on first expand is deferred until there are
// enough sections to justify the plumbing — see viewer#21.
watch(selectedRunId, runId => {
  reportsStore.clear()
  if (runId) reportsStore.loadWarningsErrors(runId)
}, { immediate: true })

// the models the panels render, keyed by the source each descriptor declares
const sources = computed(() => ({
  runSummary: summary.value,
  warningsErrors: warningsErrors.value,
}))

const showPanels = computed(() =>
  !loadingRuns.value && !loadingSummary.value && !error.value && !summaryMissing.value
  && selectedRun.value !== null && summary.value !== null
)
</script>

<template>
  <div class="runs-view">
    <header class="runs-header">
      <RunPicker />
      <AppBar v-if="showPanels" />
    </header>

    <div class="runs-body">
      <div v-if="loadingRuns || loadingSummary" class="state-overlay">
        <AppSpinner />
      </div>
      <div v-else-if="error" class="state-overlay">
        <span class="error-msg">{{ error }}</span>
      </div>
      <div v-else-if="!selectedRun" class="state-overlay">
        <span class="hint">{{ t('Select group, scenario and run to continue') }}</span>
      </div>
      <div v-else-if="summaryMissing" class="state-overlay">
        <span class="hint">{{ t('This run carries no run-summary artifact') }}</span>
      </div>
      <PanelColumn v-else-if="showPanels" :sources="sources" />
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
  flex-direction: column;
  gap: var(--space-sm);
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
