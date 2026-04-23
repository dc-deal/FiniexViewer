<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from '@/composables/use_theme'
import AppShell from '@/components/AppShell.vue'

const { theme } = useTheme()

onMounted(() => {
  document.documentElement.dataset.theme = theme.value
})
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
</template>
