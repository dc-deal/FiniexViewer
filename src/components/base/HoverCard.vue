<script setup lang="ts">
import {
  TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger,
} from 'reka-ui'
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
          <p v-if="title" class="card-title">{{ title }}</p>
          <dl v-if="details?.length" class="card-rows">
            <template v-for="row in details" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd :class="row.tone">{{ row.value }}</dd>
            </template>
          </dl>
          <TooltipArrow class="card-arrow" :width="10" :height="5" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<style>
/* not scoped: the card is portalled out of this component's subtree, so a scoped rule cannot
   reach it. The class is specific enough to stay contained. */
.hover-card {
  z-index: var(--z-card);
  min-width: 15rem;
  /* a long value WRAPS rather than stretching the card across the screen — a token note did */
  max-width: min(28rem, calc(100vw - 2rem));
  /* it can be taller than the screen on a rich row — scroll inside rather than truncate, because
     a card that hides a figure is worse than one that asks for a scroll */
  max-height: min(70vh, 28rem);
  overflow-y: auto;
  padding: var(--space-sm);
  border: 1px solid var(--color-border-overlay);
  border-radius: 4px;
  background-color: var(--color-bg-overlay);
  box-shadow: var(--shadow-overlay);
}

.hover-card .card-title {
  margin: 0 0 var(--space-xs);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.hover-card .card-rows {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0 var(--space-md);
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.hover-card .card-rows dt {
  color: var(--color-text-secondary);
}

.hover-card .card-rows dd {
  margin: 0;
  text-align: right;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
}

.hover-card .card-rows dd.positive { color: var(--color-positive); }
.hover-card .card-rows dd.negative { color: var(--color-negative); }
.hover-card .card-rows dd.warning { color: var(--color-warning); }
.hover-card .card-rows dd.error { color: var(--color-error); }

.card-arrow {
  fill: var(--color-border-overlay);
}
</style>
