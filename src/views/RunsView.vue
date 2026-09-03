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
const {
  runs, selectedRunId, selectedRun, summary, summaryMissing, unknownRunId,
  loadingRuns, loadingSummary, error,
} = storeToRefs(runsStore)
const { warningsErrors, portfolio, unreadable } = storeToRefs(reportsStore)

// loads the run index and restores the cascade from the URL
useRunQuerySync()

// One request per section per run. Lazy loading on first expand is deferred until there are
// enough sections to justify the plumbing — see viewer#21.
watch(selectedRunId, runId => {
  reportsStore.clear()
  // a logs-only run is skipped here for the same reason the store skips the summary
  if (!runId || !selectedRun.value?.has_reports) return
  reportsStore.loadWarningsErrors(runId)
  reportsStore.loadPortfolio(runId)
}, { immediate: true })

// the models the panels render, keyed by the source each descriptor declares
const sources = computed(() => ({
  runInfo: selectedRun.value,
  runSummary: summary.value,
  warningsErrors: warningsErrors.value,
  portfolio: portfolio.value,
}))

// Once a run is chosen there is always something to show: the header panel reads the index row.
// PanelColumn drops every panel whose model is absent, so a run without artifacts simply renders
// fewer sections rather than nothing at all.
const showPanels = computed(() =>
  !loadingRuns.value && !loadingSummary.value && !error.value
  && !unknownRunId.value && selectedRun.value !== null
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
      <div v-else-if="!runs.length" class="state-overlay">
        <span class="hint">{{ t('The backend reports no runs — its run index is empty') }}</span>
      </div>
      <div v-else-if="unknownRunId" class="state-overlay">
        <span class="hint">
          {{ t('This link names a run that is no longer in the index') }}: {{ unknownRunId }}
        </span>
      </div>
      <div v-else-if="!selectedRun" class="state-overlay">
        <span class="hint">{{ t('Select group, scenario and run to continue') }}</span>
      </div>
      <template v-else>
        <!-- a missing or unreadable section does not hide the ones that are there -->
        <p v-if="!selectedRun.has_reports" class="notice">
          {{ t('This run exists as logs only — it carries no report artifacts') }}
        </p>
        <p v-else-if="summaryMissing" class="notice">
          {{ t('This run carries no run-summary artifact') }}
        </p>
        <p v-if="unreadable" class="notice">{{ unreadable }}</p>
        <PanelColumn :sources="sources" />
      </template>
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

.notice {
  margin: 0 0 var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-accent);
  border-radius: 4px;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
