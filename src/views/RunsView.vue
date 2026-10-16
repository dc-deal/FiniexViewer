<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useDockStore } from '@/stores/dock_store'
import { useRunsStore } from '@/stores/runs_store'
import { onPanelShownAgain } from '@/composables/use_panel_visibility'
import RunPicker from '@/components/runs/RunPicker.vue'

/*
 * The run list, a panel of its own since 2026-10-14 (viewer#31): the facet bar over the stored runs,
 * and the runs. A pick chooses the run and brings its report — the bundle `RunReportView` — to the
 * front, so the list never has to fold away to make room for the sections.
 */
const runsStore = useRunsStore()
const { indexError } = storeToRefs(runsStore)
const dock = useDockStore()

// a docked panel stays mounted, so the index is fetched again whenever the panel comes back
onPanelShownAgain(() => { void runsStore.loadRuns(true) })
</script>

<template>
  <div class="runs-view">
    <!-- the INDEX failing is this panel's to say; the summary failing is the run report's -->
    <p v-if="indexError" class="error-msg">{{ indexError }}</p>
    <!-- a pick is a selection: the run's report comes to the front where it is open, and a report
         the reader closed stays closed — every other panel shows the run all the same -->
    <RunPicker v-else @chosen="dock.reveal('run', 'selection')" />
  </div>
</template>

<style scoped>
/* A SIZE container, so the list inside measures its cap against this view and not against the
   browser window. With `vh` a view given half the screen still sized its run list for the whole
   of it, and the rows past the view's own hidden overflow could not be reached. The view is sized
   by what holds it and never by its content, which is what size containment requires. */
.runs-view {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--space-md);
  container-type: size;
}

.error-msg {
  margin: 0;
  color: var(--color-error);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
