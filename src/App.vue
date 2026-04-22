<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useTheme } from '@/composables/use_theme'

const { theme } = useTheme()

onMounted(() => {
  document.documentElement.dataset.theme = theme.value
})
</script>

<template>
  <RouterView />
</template>
