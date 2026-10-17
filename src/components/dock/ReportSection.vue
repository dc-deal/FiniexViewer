<script setup lang="ts">
import { computed, onErrorCaptured, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import AppIcon from '@/components/base/AppIcon.vue'
import LoadingLine from '@/components/base/LoadingLine.vue'
import { panelById } from '@/panel_registry'
import { useRunsStore } from '@/stores/runs_store'
import { useRunSectionsStore } from '@/stores/run_sections_store'
import { t } from '@/translate'

/**
 * One section of the run report as a panel of its own: the same component the column draws, with
 * the same model, beside the column rather than in it. Closing the panel puts the section back in
 * its place in the column — a section is in one place at a time.
 *
 * Where the section has nothing to draw, the panel STANDS and says why, rather than closing or
 * collapsing: a selection never moves the layout. The reason is the backend's own sentence where
 * it gave one, and otherwise a neutral one — which pipeline writes which sections is the backend's
 * rule, and this side reads only the run's own list of artifacts.
 *
 * @param sectionId The section's id in the panel registry.
 */
const props = defineProps<{ sectionId: string }>()

const descriptor = panelById(props.sectionId)
const sections = useRunSectionsStore()
const { sources, pending } = storeToRefs(sections)
const { selectedRunId, selectedRun, selectedUnits, loadingRuns, unknownRunId, indexError } = storeToRefs(useRunsStore())

const model = computed(() => descriptor ? sources.value[descriptor.source] ?? null : null)

/** Framed only where the narrowing FILTERS what is drawn — a list that still shows every row is whole. */
const framed = computed(() => descriptor?.narrowing === 'filters' && selectedUnits.value.length > 0)
// the index first: a restored run has no index row until the index has arrived
const loading = computed(() => loadingRuns.value
  || (model.value === null && Boolean(descriptor && pending.value[descriptor.source])))

// every failure and every older-schema state among the slots this section reads, said above it —
// the column says them above itself, and leaves out what an opened section says here
const failures = computed(() => descriptor ? sections.failuresOf(descriptor.source) : [])
const unreadables = computed(() => descriptor ? sections.unreadablesOf(descriptor.source) : [])

/** Why the section has nothing to draw, where it has nothing — and nothing said above already. */
const emptyReason = computed<string | null>(() => {
  if (!descriptor) return t('This panel could not be drawn')
  // a run id without its index row is not "no run": the index is loading, failed, or lost the run
  // — the run report's own order, which said "No run is chosen" here through every first load
  if (!selectedRunId.value) return t('No run is chosen — the Runs panel lists them')
  if (loading.value) return null
  if (unknownRunId.value) return `${t('The run you had open is no longer in the index')}: ${unknownRunId.value}`
  if (!selectedRun.value) return indexError.value ?? t('No run is chosen — the Runs panel lists them')
  if (model.value !== null) return null
  if (failures.value.length || unreadables.value.length) return null
  return sections.absenceOf(descriptor.source)?.detail || t('This run carries no such section')
})

/**
 * The boundary, as in the column: a section that throws while drawing stops HERE, and gets another
 * go when its model changes, so a defect on one run does not follow the reader to the next.
 */
const failed = ref(false)
onErrorCaptured(error => {
  failed.value = true
  console.error(`[panel] ${descriptor?.title ?? props.sectionId} could not be rendered`, error)
  return false
})
watch(model, () => {
  failed.value = false
})
</script>

<template>
  <div class="report-section" :class="{ narrowed: framed }" :data-panel="sectionId">
    <!-- `data-panel` is the address the column gives a section, so a jump and a test find it in
         either place; the comment stands inside, since one before the root makes it a fragment -->
    <p v-for="message in failures" :key="message" class="notice failed">
      <AppIcon name="status-error" class="mark" />
      <span>{{ message }}</span>
    </p>
    <p v-for="message in unreadables" :key="message" class="notice">{{ message }}</p>
    <LoadingLine v-if="loading" class="panel-loading" />
    <p v-else-if="emptyReason" class="notice absent">{{ emptyReason }}</p>
    <p v-else-if="failed" class="notice failed">
      <AppIcon name="status-error" class="mark" />
      <span>{{ t('This section could not be drawn. The rest of the report is unaffected.') }}</span>
    </p>
    <!-- drawn only with a model: a section that failed has none, and says so above -->
    <component :is="descriptor.component" v-else-if="descriptor && model !== null" :model="model" />
  </div>
</template>

<style scoped>
/*
 * A SIZE container, like the run view: the lists inside measure their caps against THIS panel. And
 * the frame's room is always there, transparent until a narrowing that filters this section colours
 * it — the annotation role, dashed, the same edge the column draws — so a narrowing indents nothing.
 */
.report-section {
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  container-type: size;
  padding: var(--space-md);
  border: 1px dashed transparent;
  border-radius: 4px;
}

.report-section.narrowed {
  border-color: var(--color-annotation);
}

.notice {
  display: flex;
  gap: var(--space-xs);
  margin: 0 0 var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-text-secondary);
  border-radius: 4px;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.notice.failed {
  border-left-color: var(--color-error);
  color: var(--color-error);
}

.notice .mark {
  flex-shrink: 0;
}
</style>
