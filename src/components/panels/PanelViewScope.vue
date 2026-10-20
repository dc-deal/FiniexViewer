<script setup lang="ts">
import { providePanelView } from '@/composables/use_panel_view'

/**
 * Names the panel a section of the bundle's column is drawn for — its dock id — so the section keeps
 * ONE view, in the column and as a panel of its own.
 *
 * @param panel The section's dock id, `report-<section>`.
 */
const props = defineProps<{ panel: string }>()
providePanelView(props.panel)
</script>

<template>
  <slot />
</template>
