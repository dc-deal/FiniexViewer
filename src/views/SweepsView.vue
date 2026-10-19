<script setup lang="ts">
import { storeToRefs } from 'pinia'
import AppSpinner from '@/components/base/AppSpinner.vue'
import SweepPicker from '@/components/sweeps/SweepPicker.vue'
import SweepRanking from '@/components/sweeps/SweepRanking.vue'
import { useSweepBinding } from '@/composables/use_sweep_binding'
import { useSweepsStore } from '@/stores/sweeps_store'
import { t } from '@/translate'

/**
 * The parameter searches (viewer#32): the list of sweeps, then the chosen one's combinations in the
 * order the backend ranked them by the objective the sweep declared. Built as the deployments are —
 * one panel, the list folding to one line once a sweep is chosen, so the ranking has the room.
 */
const {
  sweeps, selectedSweepId, selectedSweep, detail,
  loadingList, loadingDetail, error, forbiddenSurface, unknownSweepId,
} = storeToRefs(useSweepsStore())

// loads the list and brings back the sweep the reader had open
useSweepBinding()
</script>

<template>
  <div class="sweeps-view">
    <header class="sweeps-header">
      <SweepPicker />
    </header>

    <div class="sweeps-body">
      <div v-if="loadingList || loadingDetail" class="state-overlay">
        <AppSpinner />
      </div>
      <!-- a surface the token does not carry is neither an absence nor an outage -->
      <div v-else-if="forbiddenSurface" class="state-overlay">
        <span class="hint">{{ t('This viewer has no access to sweep data') }} ({{ forbiddenSurface }})</span>
      </div>
      <div v-else-if="error" class="state-overlay">
        <span class="error-msg">{{ error }}</span>
      </div>
      <div v-else-if="unknownSweepId" class="state-overlay">
        <span class="hint">{{ t('The sweep you had open is no longer in the ledger') }}: {{ unknownSweepId }}</span>
      </div>
      <!-- an empty list says so in the picker above; here it would be the same sentence twice -->
      <div v-else-if="sweeps.length && !selectedSweepId" class="state-overlay">
        <span class="hint">{{ t('Pick a sweep to see its combinations, best first') }}</span>
      </div>
      <SweepRanking v-else-if="detail && selectedSweep" :sweep="selectedSweep" :detail="detail" />
    </div>
  </div>
</template>

<style scoped>
/* a SIZE container, as the deployments view is: the lists cap themselves against this panel */
.sweeps-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  container-type: size;
}

.sweeps-header {
  padding: var(--space-md);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.sweeps-body {
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
