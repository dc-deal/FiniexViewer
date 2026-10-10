<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { VueDraggable } from 'vue-draggable-plus'
import { useLayoutStore, pinnedBoundary } from '@/stores/layout_store'
import { useSettingsStore } from '@/stores/settings_store'
import { provideDisplaySettings } from '@/composables/use_display_settings'
import { panelById } from '@/panel_registry'
import AccordionPanel from '@/components/panels/AccordionPanel.vue'
import type { PanelState } from '@/types/panel_types'

const props = defineProps<{
  /** Models keyed by the `source` a panel descriptor declares — panels never fetch their own. */
  sources: Record<string, unknown>
}>()

const layoutStore = useLayoutStore()
const { visiblePanels } = storeToRefs(layoutStore)

// The host supplies the preferences for every panel it renders. A panel that reached into the store
// itself would stop being renderable from a different source, which the panel contract forbids.
provideDisplaySettings(storeToRefs(useSettingsStore()).display)

interface RenderedPanel {
  state: PanelState
  title: string
  icon: string
  component: unknown
  model: unknown
}

const rendered = computed<RenderedPanel[]>(() =>
  visiblePanels.value.flatMap(state => {
    const descriptor = panelById(state.id)
    if (!descriptor) return []
    // a section whose model this run does not carry is skipped, never shown empty
    const model = props.sources[descriptor.source]
    if (model === null || model === undefined) return []
    return [{
      state,
      title: descriptor.title,
      icon: descriptor.icon,
      component: descriptor.component,
      model,
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
      <component :is="panel.component" :model="panel.model" />
    </AccordionPanel>
  </VueDraggable>
</template>

<style scoped>
.panel-column {
  display: flex;
  flex-direction: column;
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
