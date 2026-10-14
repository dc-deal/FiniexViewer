<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { DockviewVue, themeDark, themeLight } from 'dockview-vue'
import type { DockviewReadyEvent } from 'dockview-vue'
import PanelHost from '@/components/dock/PanelHost.vue'
import PanelTab from '@/components/dock/PanelTab.vue'
import QuickBar from '@/components/dock/QuickBar.vue'
import { useDockStore } from '@/stores/dock_store'
import { useSettingsStore } from '@/stores/settings_store'
import { t } from '@/translate'

/**
 * The docked panels. It knows PLACEMENT only — tabs, groups and the seams between them; what a
 * panel shows is drawn by `PanelHost`, and where the layout is kept is the dock store's business.
 *
 * Floating groups are switched off: a panel never floats over another (a non-goal, confirmed
 * 2026-10-11). dockview supplies the metrics of its two themes, and `dock_theme.css` paints both
 * in this app's tokens, so a theme switch is one class and nothing else.
 */
const dock = useDockStore()
const { settings } = storeToRefs(useSettingsStore())
const theme = computed(() => settings.value.theme === 'light' ? themeLight : themeDark)

function onReady(event: DockviewReadyEvent): void {
  dock.attach(event.api)
}

/** A layout waiting on its timer is lost with the page unless it is written now. */
function flushWhenLeaving(): void {
  if (document.visibilityState === 'hidden') dock.flush()
}

onMounted(() => {
  window.addEventListener('pagehide', dock.flush)
  document.addEventListener('visibilitychange', flushWhenLeaving)
})

/**
 * BEFORE unmount, while dockview still holds the panels. Vue unmounts the children first and runs
 * `onUnmounted` after, so a layout written there was already empty — and every hot reload during
 * development, which remounts the dock, replaced the reader's arrangement with the suggested one.
 */
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', dock.flush)
  document.removeEventListener('visibilitychange', flushWhenLeaving)
  dock.detach()
})
</script>

<template>
  <div class="panel-dock">
    <DockviewVue class="panel-dock-view" :theme="theme" disable-floating-groups @ready="onReady">
      <template #panel-host="{ params, api }">
        <PanelHost :kind-id="params.kind" :api="api" />
      </template>
      <template #defaultTab="{ params, api }">
        <PanelTab :kind-id="params.kind" :api="api" />
      </template>
      <template #rightHeaderActions="{ activePanel }">
        <QuickBar :kind-id="activePanel?.params?.kind ?? null" />
      </template>
      <template #watermark>
        <div class="dock-empty">
          <span class="dock-empty-text">{{ t('No panel is open — the Panels menu opens one') }}</span>
        </div>
      </template>
    </DockviewVue>
  </div>
</template>

<style scoped>
.panel-dock {
  height: 100%;
}

/* dockview's root carries no scope id of ours, so its height is set from the frame around it */
.panel-dock :deep(.panel-dock-view) {
  height: 100%;
}

.dock-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.dock-empty-text {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>
