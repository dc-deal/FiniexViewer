<script setup lang="ts">
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
</template>
