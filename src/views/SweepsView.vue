<script setup lang="ts">
import { storeToRefs } from 'pinia'
import AppSpinner from '@/components/base/AppSpinner.vue'
import SweepList from '@/components/sweeps/SweepList.vue'
import { useSweepBinding } from '@/composables/use_sweep_binding'
import { RUN_BUNDLE } from '@/panel_kinds'
import { useDockStore } from '@/stores/dock_store'
import { useSweepsStore } from '@/stores/sweeps_store'
import { t } from '@/translate'

/**
 * The parameter searches (viewer#32): ONE list of sweeps, each opening to its combinations in the
 * order the backend ranked them by the objective the sweep declared. A combination is a run, chosen
 * as the run list chooses one — so the run's report comes forward the same way.
 */
const { loadingList, error, forbiddenSurface, unknownSweepId } = storeToRefs(useSweepsStore())
const dock = useDockStore()

// loads the list and brings back the sweep the reader had open
useSweepBinding()
</script>

<template>
  <div class="sweeps-view">
    <div v-if="loadingList" class="state-overlay">
      <AppSpinner />
    </div>
    <!-- a surface the token does not carry is neither an absence nor an outage -->
    <div v-else-if="forbiddenSurface" class="state-overlay">
      <span class="hint">{{ t('This viewer has no access to sweep data') }} ({{ forbiddenSurface }})</span>
    </div>
    <div v-else-if="error" class="state-overlay">
      <span class="error-msg">{{ error }}</span>
    </div>
    <template v-else>
      <p v-if="unknownSweepId" class="hint">
        {{ t('The sweep you had open is no longer in the ledger') }}: {{ unknownSweepId }}
      </p>
      <SweepList @chosen="dock.reveal(RUN_BUNDLE, 'selection')" />
    </template>
  </div>
</template>

<style scoped>
/* a SIZE container: the list caps itself against this panel, not against the browser window */
.sweeps-view {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  overflow: hidden;
  container-type: size;
}

.state-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: monospace;
}

.hint {
  margin: 0;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.error-msg {
  color: var(--color-error);
  font-size: var(--font-size-sm);
}
</style>
