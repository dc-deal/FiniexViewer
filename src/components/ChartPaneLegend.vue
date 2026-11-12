<script setup lang="ts">
import type { PaneLegend } from '@/types/chart_pane_types'

/**
 * The line at a pane's top left (viewer#57), as TradingView and Kraken Pro set it: each figure's
 * label quiet, its value in plain ink. It shows what it is handed and takes no pointer, so the chart
 * under it keeps every move.
 *
 * @param legend What the pane's legend says.
 * @param top Where the pane begins inside the chart's frame, in pixels.
 */
defineProps<{ legend: PaneLegend, top: number }>()
</script>

<template>
  <div
    class="pane-legend"
    :class="{ quiet: legend.quiet }"
    :style="{ top: `${top}px` }"
    :data-legend="legend.pane"
  >
    <span v-for="entry in legend.entries" :key="entry.label" class="legend-entry">
      <span class="legend-label">{{ entry.label }}</span>
      <span v-if="entry.value !== null" class="legend-value">{{ entry.value }}</span>
    </span>
  </div>
</template>

<style scoped>
/* over the plot, under every card and menu that floats over the page; never in the pointer's way */
.pane-legend {
  position: absolute;
  left: var(--space-xs);
  z-index: var(--z-chart);
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-sm);
  /* the plot's width, which the chart states: at 60 % of a narrow chart the close went to a line of
     its own (on screen 2026-11-12) */
  max-width: calc(var(--chart-plot-width, 100%) - 2 * var(--space-xs));
  margin-top: 2px;
  font-family: monospace;
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.legend-entry {
  display: flex;
  gap: var(--space-xs);
  white-space: nowrap;
}

.legend-label {
  color: var(--color-text-secondary);
}

.legend-value {
  color: var(--color-text-primary);
}
</style>
