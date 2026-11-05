<script setup lang="ts">
import PathLabel from '@/components/base/PathLabel.vue'
import type { Figure } from '@/types/figure_types'

/**
 * What a card of figures says: its heading and its pairs. The two cards place it differently — one
 * beside the element it wraps, one at the pointer on a chart — and say it the same way.
 */
defineProps<{
  /** One line naming the thing — the card's heading. Left out where the rows say it all. */
  title?: string
  /** Already-rendered figures — the same pair a `FigureBlock` places. */
  details?: Figure[]
  /** Paths, one per row: a path is not a pair, and wraps at its separators where a value breaks mid-word. */
  paths?: string[]
}>()
</script>

<template>
  <p v-if="title" class="card-title">{{ title }}</p>
  <dl v-if="details?.length" class="card-rows">
    <!-- a figure's caveat rides on the pair, as it does in a FigureBlock. The card beside an
         element stays open under the pointer, so the pair can be hovered there; without this
         every caveat handed to a card was dropped in silence -->
    <template v-for="row in details" :key="row.label">
      <dt :title="row.title">{{ row.label }}</dt>
      <dd :class="row.tone" :title="row.title">{{ row.value }}</dd>
    </template>
  </dl>
  <!-- the card shows each whole, so no browser tooltip is to repeat it: this overrides the label's own -->
  <ul v-if="paths?.length" class="card-paths">
    <li v-for="path in paths" :key="path"><PathLabel :value="path" :title="undefined" /></li>
  </ul>
</template>
