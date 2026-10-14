<script setup lang="ts">
import { onErrorCaptured, onUnmounted, ref } from 'vue'
import type { DockviewPanelApi } from 'dockview-vue'
import { panelKind } from '@/panel_kinds'
import { providePanelVisibility } from '@/composables/use_panel_visibility'
import { t } from '@/translate'

/**
 * What every docked panel is drawn inside: its kind's component, a boundary around it, and the
 * panel's visibility handed to whatever inside wants it.
 *
 * @param kindId The panel's kind — what it shows.
 * @param api The panel's own handle in the dock.
 */
const props = defineProps<{ kindId: string, api: DockviewPanelApi }>()

const kind = panelKind(props.kindId)

/**
 * Drawn the first time the panel is SHOWN, never before: a tab behind another costs nothing until
 * the reader picks it, so the run list does not wait for the chart's library. Kept afterwards, so
 * a panel returned to finds its scroll and its state where they were.
 */
const shown = ref(props.api.isVisible)
const visible = ref(props.api.isVisible)
const subscription = props.api.onDidVisibilityChange(event => {
  visible.value = event.isVisible
  if (event.isVisible) shown.value = true
})
onUnmounted(() => subscription.dispose())
providePanelVisibility(visible)

/**
 * A panel that throws stops HERE: the dock and every other panel stay standing, and the reader
 * gets a sentence where the panel was. The stack goes to the console, because a stack trace on
 * screen is not an explanation.
 */
const failed = ref(false)
onErrorCaptured(error => {
  failed.value = true
  console.error(error)
  return false
})
</script>

<template>
  <div class="panel-host" :data-panel-kind="kindId">
    <p v-if="failed || !kind" class="panel-host-failed">{{ t('This panel could not be drawn') }}</p>
    <component :is="kind.component" v-else-if="shown" />
  </div>
</template>

<style scoped>
.panel-host {
  height: 100%;
  overflow: hidden;
  background-color: var(--color-bg-base);
}

.panel-host-failed {
  margin: var(--space-lg);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-error);
}
</style>
