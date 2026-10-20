<script setup lang="ts">
import { computed } from 'vue'
import {
  TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger,
} from 'reka-ui'
import FigureCardBody from '@/components/base/FigureCardBody.vue'
import type { Figure } from '@/types/figure_types'

/**
 * A data card that appears beside whatever it wraps.
 *
 * Built on reka-ui's tooltip primitive rather than on a positioned div, for three reasons that a
 * hand-rolled one gets wrong: it is PORTALLED out of the page, so a scrolling ancestor cannot clip
 * it — which is exactly what happened when this lived inside the timeline; it FLIPS and SHIFTS to
 * stay on screen, through Floating UI, which reka-ui already depends on; and it opens on FOCUS as
 * well as on hover, so it exists for a keyboard at all. No package was added — reka-ui already
 * carries the accordion panel.
 */
const props = withDefaults(defineProps<{
  /** One line naming the thing — the card's heading. Left out where the rows say it all. */
  title?: string
  /** Already-rendered figures — the same pair a `FigureBlock` places. */
  details?: Figure[]
  /** Where it prefers to sit; it flips on its own when that side has no room. */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /**
   * Open or closed as the CALLER says, for a trigger whose focus the card cannot see — a dock tab,
   * whose keyboard focus sits on an element around it. Left out, the card follows its trigger alone.
   */
  open?: boolean
}>(), {
  // a Boolean prop left out reads as false, which would close every card for good: undefined is
  // what says "not controlled"
  open: undefined,
})

const emit = defineEmits<{ 'update:open': [open: boolean] }>()

/** Handed to the primitive only where the caller controls it: an `open` of undefined still binds. */
const controlled = computed(() => props.open === undefined ? {} : { open: props.open })
</script>

<template>
  <TooltipProvider :delay-duration="80" :skip-delay-duration="200">
    <TooltipRoot v-bind="controlled" @update:open="value => emit('update:open', value)">
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          class="hover-card"
          :side="side ?? 'bottom'"
          :side-offset="6"
          :collision-padding="12"
        >
          <FigureCardBody :title="title" :details="details" />
          <TooltipArrow class="card-arrow" :width="10" :height="5" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

