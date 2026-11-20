<script setup lang="ts">
import { computed } from 'vue'
import { hintById } from '@/hint_registry'
import type { HintDefinition } from '@/types/hint_types'

/**
 * Why an area shows nothing, said IN that area (viewer#24; operator, 2026-11-19): a fixed sentence
 * from the registry, never to be put away, gone once there is something to show. The caller draws it
 * only while the area is empty. Unknown ids say nothing.
 *
 * @param id One explanation of `hint_registry.ts`, or the several of one empty place.
 */
const props = defineProps<{
  id: string | string[]
}>()

const entries = computed(() => [props.id].flat()
  .map(id => hintById(id))
  .filter((entry): entry is HintDefinition => entry !== null))
</script>

<template>
  <p v-for="entry in entries" :key="entry.id" class="empty-note" :data-empty-note="entry.id">{{ entry.text }}</p>
</template>

<style scoped>
/* plain structure ink: it informs, it does not warn */
.empty-note {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>
