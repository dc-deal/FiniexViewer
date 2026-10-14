<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { VueDraggable } from 'vue-draggable-plus'
import { useLayoutStore, pinnedBoundary } from '@/stores/layout_store'
import { useSettingsStore } from '@/stores/settings_store'
import { provideDisplaySettings } from '@/composables/use_display_settings'
import { panelById } from '@/panel_registry'
import AccordionPanel from '@/components/panels/AccordionPanel.vue'
import type { PanelState } from '@/types/panel_types'
import type { IconName } from '@/types/icon_types'
import { t } from '@/translate'

const props = defineProps<{
  /** Models keyed by the `source` a panel descriptor declares — panels never fetch their own. */
  sources: Record<string, unknown>
  /** Sections on their way for the run on screen, keyed the same way. */
  pending?: Record<string, boolean>
}>()

const layoutStore = useLayoutStore()
const { visiblePanels } = storeToRefs(layoutStore)

// The host supplies the preferences for every panel it renders. A panel that reached into the store
// itself would stop being renderable from a different source, which the panel contract forbids.
provideDisplaySettings(storeToRefs(useSettingsStore()).display)

interface RenderedPanel {
  state: PanelState
  title: string
  icon: IconName
  component: unknown
  model: unknown
  /** Its section is on its way: the panel keeps its place and says so. */
  loading: boolean
}

const rendered = computed<RenderedPanel[]>(() =>
  visiblePanels.value.flatMap(state => {
    const descriptor = panelById(state.id)
    if (!descriptor) return []
    // a section whose model this run does not carry is skipped, never shown empty — and one still
    // on its way is neither: it keeps its place, so a run change does not collapse the column
    const model = props.sources[descriptor.source]
    const loading = (model === null || model === undefined) && Boolean(props.pending?.[descriptor.source])
    if ((model === null || model === undefined) && !loading) return []
    return [{
      state,
      title: descriptor.title,
      icon: descriptor.icon,
      component: descriptor.component,
      model,
      loading,
    }]
  })
)

/*
 * Where the pinned group ends, over what this column actually DRAWS — not over the arrangement.
 * The bar shows every panel and the column leaves out what is switched off and what this run does
 * not carry, so the same rule lands on a different index in each. That is the only way the two
 * orientations differ.
 */
const boundary = computed(() => pinnedBoundary(rendered.value.map(panel => panel.state)))

/**
 * The height each panel's content last had, so a panel whose section is loading for a new run keeps
 * the room it took — measured, never guessed, and only read when a panel starts to wait.
 */
const lastHeights = new Map<string, number>()

// made at setup, not on mount: the panels' refs are handed over while the column is still mounting
const observer = new ResizeObserver(entries => {
  for (const entry of entries) {
    const id = (entry.target as HTMLElement).dataset['heightOf']
    if (id && entry.contentRect.height > 0) lastHeights.set(id, entry.contentRect.height)
  }
})

onUnmounted(() => observer.disconnect())

function observe(element: unknown): void {
  if (element instanceof Element) observer.observe(element)
}

function heightOf(id: string): string | undefined {
  const height = lastHeights.get(id)
  return height ? `${height}px` : undefined
}

// Drag writes back the dropped order; pinned panels are re-sorted to the top on read, so a drag
// across that boundary settles at it.
const order = computed({
  get: () => rendered.value,
  set: (items: RenderedPanel[]) => layoutStore.reorder(items.map(item => item.state.id)),
})
</script>

<template>
  <VueDraggable v-model="order" handle=".panel-trigger" :animation="120" class="panel-column">
    <AccordionPanel
      v-for="(panel, index) in rendered"
      :key="panel.state.id"
      :class="{ 'group-start': index === boundary }"
      :data-panel="panel.state.id"
      :title="panel.title"
      :icon="panel.icon"
      :open="panel.state.open"
      :pinned="panel.state.pinned"
      :locked="panel.state.locked"
      :reset-on="panel.model"
      @update:open="value => layoutStore.setOpen(panel.state.id, value)"
      @toggle-pin="layoutStore.togglePin(panel.state.id)"
      @toggle-lock="layoutStore.toggleLock(panel.state.id)"
      @hide="layoutStore.hide(panel.state.id)"
    >
      <div :ref="observe" class="panel-body" :data-height-of="panel.state.id">
        <!-- on its way for the run on screen: the room it had, and a line saying it is coming -->
        <div
          v-if="panel.loading"
          class="panel-loading"
          :style="{ minHeight: heightOf(panel.state.id) }"
          aria-busy="true"
        >
          <span class="loading-line" aria-hidden="true" />
          <span class="loading-text">{{ t('Loading…') }}</span>
        </div>
        <component :is="panel.component" v-else :model="panel.model" />
      </div>
    </AccordionPanel>
  </VueDraggable>
</template>

<style scoped>
.panel-column {
  display: flex;
  flex-direction: column;
}

.panel-loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm) 0;
}

.loading-text {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* a line that moves, so the waiting is visibly WORK and not an empty panel; still for a reader who
   asked the system for less motion, where the word alone says it */
.loading-line {
  display: block;
  height: 2px;
  width: 100%;
  background: linear-gradient(90deg, transparent, var(--color-accent), transparent) 0 0 / 40% 100% no-repeat;
  animation: loading-sweep 1.2s ease-in-out infinite;
}

@keyframes loading-sweep {
  from { background-position: -40% 0; }
  to { background-position: 140% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .loading-line {
    animation: none;
    background: var(--color-border);
  }
}

/*
 * The boundary of the pinned group, drawn in the GAP above the first panel after it rather than on
 * that panel's own frame — a dashed border on `.panel` would read as the panel's edge being dashed,
 * which says something about the panel instead of about the division.
 *
 * The `annotation` role and dashed: it marks a division, not a warning. The dash is the second
 * channel the role carries so the line reads where the hue does not.
 */
.group-start {
  position: relative;
  margin-top: var(--space-md);
}

.group-start::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: calc(var(--space-sm) * -1);
  border-top: 1px dashed var(--color-annotation);
}
</style>
