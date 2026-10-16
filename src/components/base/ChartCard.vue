<script setup lang="ts">
import { computed } from 'vue'
import FigureCardBody from '@/components/base/FigureCardBody.vue'
import type { FigureCard } from '@/types/figure_types'

/**
 * The card of a thing drawn on a chart, at the pointer resting on it.
 *
 * Not a `HoverCard`: that one wraps an element, and a mark on a chart is no element — it is paint
 * on a canvas, known by the id the chart library reports under the pointer. So this card is placed
 * from the pointer itself, inside the chart's own frame: beside the pointer on the side with more
 * room, so it never covers what it describes and never leaves the frame. It takes no pointer events
 * — the chart keeps them, and the card follows the pointer from mark to mark.
 */
const props = defineProps<{
  card: FigureCard
  /** The pointer, in pixels from the frame's top left. */
  x: number
  y: number
  /** The frame the card has to stay inside. */
  width: number
  height: number
}>()

/** How far the card stands off the pointer. */
const GAP = 14

const placement = computed(() => {
  const leftOfPointer = props.x > props.width / 2
  const abovePointer = props.y > props.height / 2
  const across = leftOfPointer ? props.x : props.width - props.x
  const down = abovePointer ? props.y : props.height - props.y
  return {
    ...(leftOfPointer ? { right: `${props.width - props.x + GAP}px` } : { left: `${props.x + GAP}px` }),
    ...(abovePointer ? { bottom: `${props.height - props.y + GAP}px` } : { top: `${props.y + GAP}px` }),
    maxWidth: `${Math.max(across - 2 * GAP, 0)}px`,
    maxHeight: `${Math.max(down - 2 * GAP, 0)}px`,
  }
})
</script>

<template>
  <div class="hover-card chart-card" :style="placement" role="tooltip">
    <FigureCardBody :title="card.title" :details="card.details" />
  </div>
</template>

<style scoped>
.chart-card {
  position: absolute;
  pointer-events: none;
}
</style>
