<script setup lang="ts">
import { onMounted, onUnmounted, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { useCallerStore } from '@/stores/caller_store'
import { useSettingsStore } from '@/stores/settings_store'
import AppShell from '@/components/AppShell.vue'

const { settings } = storeToRefs(useSettingsStore())
const callerStore = useCallerStore()

// The one place the theme reaches the document. Panels never receive it — they read the tokens the
// attribute selects, which is why a theme change needs no re-render anywhere else.
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

onMounted(() => {
  callerStore.load()
  document.addEventListener('visibilitychange', readCallerWhenVisible)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', readCallerWhenVisible)
})
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
</template>
