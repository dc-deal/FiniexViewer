<script setup lang="ts">
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
defineProps<{
  /** One line naming the thing — the card's heading. Left out where the rows say it all. */
  title?: string
  /** Already-rendered figures — the same pair a `FigureBlock` places. */
  details?: Figure[]
  /** Where it prefers to sit; it flips on its own when that side has no room. */
  side?: 'top' | 'right' | 'bottom' | 'left'
}>()
</script>

<template>
  <TooltipProvider :delay-duration="80" :skip-delay-duration="200">
    <TooltipRoot>
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

