<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { VueDraggable } from 'vue-draggable-plus'
import { useLayoutStore } from '@/stores/layout_store'
import { panelById } from '@/panel_registry'
import AccordionPanel from '@/components/panels/AccordionPanel.vue'
import type { PanelState } from '@/types/panel_types'

const props = defineProps<{
  /** Models keyed by the `source` a panel descriptor declares — panels never fetch their own. */
  sources: Record<string, unknown>
}>()

const layoutStore = useLayoutStore()
const { visiblePanels } = storeToRefs(layoutStore)

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
      v-for="panel in rendered"
      :key="panel.state.id"
      :title="panel.title"
      :icon="panel.icon"
      :open="panel.state.open"
      :pinned="panel.state.pinned"
      :locked="panel.state.locked"
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
</style>
