<script setup lang="ts">
import { t } from '@/translate'

/**
 * The mark that says a figure is the RUN's, beside one a narrowing cannot split. It stands in a
 * line that already exists — a selection never moves the layout — so it takes no room of its own:
 * the dash is an outline, not a border.
 *
 * @param title Why this figure is the run's, for the reader who points at the mark.
 */
defineProps<{
  title?: string
}>()
</script>

<template>
  <span class="scope" :title="title">{{ t('whole run') }}</span>
</template>

<style scoped>
.scope {
  flex-shrink: 0;
  padding: 0 var(--space-xs);
  /* an outline takes no room: drawn as a border, the mark grew taller than the line it stands in
     once its text reached the panels' size, and a narrowing moved the rows below it by a pixel */
  outline: 1px dashed var(--color-annotation);
  outline-offset: -1px;
  border-radius: 4px;
  color: var(--color-annotation);
  font-size: var(--font-size-sm);
  white-space: nowrap;
}
</style>
