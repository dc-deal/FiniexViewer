<script setup lang="ts">
import type { PaneLegend } from '@/types/chart_pane_types'

/**
 * The lines at a pane's top left (viewer#57), as TradingView and Kraken Pro set them: each figure's
 * label quiet, its value in plain ink. It shows what it is handed and takes no pointer, so the chart
 * under it keeps every move.
 *
 * @param legend What the pane's legend says.
 * @param top Where the pane begins inside the chart's frame, in pixels.
 * @param folded Whether its pane is folded beside one at the whole height: its lines are stacked
 *   by count there, so each stays one line, cut at the plot's edge rather than wrapped onto the next.
 */
defineProps<{ legend: PaneLegend, top: number, folded?: boolean }>()
</script>

<template>
  <div
    class="pane-legend"
    :class="{ folded }"
    :style="{ top: `${top}px` }"
    :data-legend="legend.pane"
  >
    <div v-if="legend.entries.length" class="legend-line">
      <span v-for="entry in legend.entries" :key="entry.label" class="legend-entry">
        <span class="legend-label">{{ entry.label }}</span>
        <span v-if="entry.value !== null" class="legend-value">{{ entry.value }}</span>
      </span>
    </div>
    <!-- a worker's series, a line each: its name quiet, its plots' values plain (contract 55) -->
    <div v-for="line in legend.series" :key="line.layer" class="legend-line" :data-series="line.layer">
      <span class="legend-label">{{ line.title }}</span>
      <span v-for="(entry, index) in line.entries" :key="index" class="legend-entry">
        <span v-if="entry.label" class="legend-label">{{ entry.label }}</span>
        <span v-if="entry.value !== null" class="legend-value">{{ entry.value }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
/* over the plot, under every card and menu that floats over the page; never in the pointer's way */
.pane-legend {
  position: absolute;
  left: var(--space-xs);
  z-index: var(--z-chart);
  display: flex;
  flex-direction: column;
  /* the plot's width, which the chart states: at 60 % of a narrow chart the close went to a line of
     its own (on screen 2026-11-12) */
  max-width: calc(var(--chart-plot-width, 100%) - 2 * var(--space-xs));
  margin-top: 2px;
  font-family: monospace;
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.legend-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-sm);
}
/* a series' name is one word to the reader: it moves to the next row whole, never broken in two */
.legend-line > .legend-label {
  white-space: nowrap;
}
/* stacked line by line in the pane at the whole height: a line that took two rows stood on the
   next legend (on a narrow chart 2026-11-13) — so it stays one, cut at the plot's edge */
.folded .legend-line {
  flex-wrap: nowrap;
  overflow: hidden;
}
.folded .legend-line > * {
  flex-shrink: 0;
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
