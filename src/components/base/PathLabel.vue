<script setup lang="ts">
import { computed } from 'vue'

/**
 * A path-shaped identifier — a worker type, a decision logic module — rendered so that a column can
 * hold it.
 *
 * Two things happen here, and neither of them changes the string. The last segment is the NAME and
 * carries the reading weight; everything before it says where the file lives and recedes into the
 * secondary ink. And every separator becomes a legal line break, so the label wraps at `/` instead
 * of pushing its table sideways.
 *
 * Measured 2026-09-29: `user_algos/touch_and_turn/touch_and_turn_range_worker.py` is 56 characters,
 * and the configuration panel gives its Workers table 537 px while the table wanted 773 — so the
 * type column was clipped mid-word, the parameters column was off-screen entirely, and the row grew
 * tall enough that its visible cells floated in the middle of empty space.
 *
 * The full value stays in the `title`, because a wrapped path and a complete one are not the same
 * thing to somebody copying it.
 *
 * The template carries no whitespace and no comment between its spans: whitespace would render as a
 * space inside one string, and a comment above the root would make this a fragment with no element
 * to hold the `title`.
 */
const props = defineProps<{
  value: string
}>()

/** Every segment but the last keeps its separator; the last one is the name. */
const parts = computed(() => {
  const pieces = props.value.split('/')
  const name = pieces.pop() ?? ''
  return { folders: pieces.map(piece => `${piece}/`), name }
})
</script>

<template>
  <span class="path" :title="value"><span
    v-for="(folder, index) in parts.folders"
    :key="index"
    class="folder"
  >{{ folder }}<wbr></span><span class="name">{{ parts.name }}</span></span>
</template>

<style scoped>
.path {
  font-family: monospace;
  /* the last resort, after the separators: better a broken word than a column nobody can read */
  overflow-wrap: anywhere;
}

.folder { color: var(--color-text-secondary); }
.name { color: var(--color-text-primary); }
</style>
