<script setup lang="ts">
import { watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@/stores/settings_store'
import AppShell from '@/components/AppShell.vue'

const { settings } = storeToRefs(useSettingsStore())

// The one place the theme reaches the document. Panels never receive it — they read the tokens the
// attribute selects, which is why a theme change needs no re-render anywhere else.
watchEffect(() => {
  document.documentElement.dataset.theme = settings.value.theme
})
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
</template>
