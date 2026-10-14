<script setup lang="ts">
import { onMounted, onUnmounted, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useCallerStore } from '@/stores/caller_store'
import { useMachineStore } from '@/stores/machine_store'
import { useSettingsStore } from '@/stores/settings_store'
import { provideOpenInContext } from '@/composables/use_open_in_context'
import AppMenuBar from '@/components/AppMenuBar.vue'
import PanelDock from '@/components/dock/PanelDock.vue'
import { openInDock } from '@/components/dock/open_in_dock'

const { settings } = storeToRefs(useSettingsStore())
const callerStore = useCallerStore()

// created here, at the root, so every view mounts onto the selection the reader left behind
useArrangementStore()

// the way out of a panel: what it names is chosen and loaded, and its panel comes to the front
provideOpenInContext(openInDock())

// The one place the theme reaches the document. Panels never receive it — they read the tokens the
// attribute selects, which is why a theme change needs no re-render anywhere else. The exception is
// a canvas, painted with values: `CandleChart.vue` observes the attribute and repaints itself.
watchEffect(() => {
  document.documentElement.dataset.theme = settings.value.theme
})

/**
 * Re-read who we are whenever the tab comes back.
 *
 * An account or a grant takes effect on the backend only across a restart of its process, and
 * nothing on a response marks that restart — no boot id, no start time, and the build version does
 * not move (confirmed by the backend 2026-09-25). So this is an approximation, and a deliberate
 * one: it is safe only because the answer decides nothing. Grants are shown, never obeyed, so a
 * stale answer costs a line of text.
 */
function readCallerWhenVisible(): void {
  if (document.visibilityState === 'visible') callerStore.load()
}

// how full the machine is, asked every few seconds while the page is in view — the menu bar shows it
const machineStore = useMachineStore()

onMounted(() => {
  callerStore.load()
  machineStore.start()
  document.addEventListener('visibilitychange', readCallerWhenVisible)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', readCallerWhenVisible)
  machineStore.stop()
})
</script>

<template>
  <div class="app">
    <AppMenuBar />
    <PanelDock class="app-dock" />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-bg-base);
}

.app-dock {
  flex: 1;
  min-height: 0;
}
</style>
