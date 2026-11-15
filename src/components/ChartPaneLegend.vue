<script setup lang="ts">
import { computed } from 'vue'
import { legendFolds } from '@/components/chart_legend'
import { t } from '@/translate'
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
 * @param room How tall its pane stands, in pixels: the legend stays inside it, its last lines cut
 *   rather than laid over the panes below (a small window, 2026-11-13). None, no bound.
 * @param closed Whether its series stand folded away behind its fold, its first line alone.
 */
const props = defineProps<{ legend: PaneLegend, top: number, folded?: boolean, room?: number | null, closed?: boolean }>()

const emit = defineEmits<{
  /** The series folded away, or back. */
  toggle: []
}>()

/**
 * The series fold away behind the bar's figures, which always stand (operator, 2026-11-14: "ich sehe
 * mir die formen an, die koordinaten interessieren mich nur sekundär"), as TradingView folds the
 * legends of its studies: closed, the fold says how many lines it holds.
 */
const folds = computed(() => legendFolds(props.legend))
</script>

<template>
  <div
    class="pane-legend"
    :class="{ folded }"
    :style="{ top: `${top}px`, ...(room ? { maxHeight: `${Math.max(0, room - 2)}px` } : {}) }"
    :data-legend="legend.pane"
  >
    <div v-if="legend.entries.length" class="legend-line">
      <span v-for="entry in legend.entries" :key="entry.label" class="legend-entry">
        <span class="legend-label">{{ entry.label }}</span>
        <span v-if="entry.value !== null" class="legend-value">{{ entry.value }}</span>
      </span>
    </div>
    <!-- a worker's series, a line each: its name quiet, its plots' values plain (contract 55) -->
    <div v-for="line in folds && closed ? [] : legend.series" :key="line.layer" class="legend-line" :data-series="line.layer">
      <span class="legend-label">{{ line.title }}</span>
      <span v-for="(entry, index) in line.entries" :key="index" class="legend-entry">
        <span v-if="entry.label" class="legend-label">{{ entry.label }}</span>
        <span v-if="entry.value !== null" class="legend-value">{{ entry.value }}</span>
      </span>
    </div>
    <!-- the fold, at a place that never moves: the start of the line after the figures, or after the
         last series — a control at the end of a line of figures would move with their width -->
    <div v-if="folds" class="legend-line">
      <button
        type="button"
        class="legend-fold"
        :aria-expanded="!closed"
        :aria-label="closed ? t('Show the lines of the series') : t('Fold the lines of the series away')"
        data-action="legend-fold"
        @click="emit('toggle')"
      >{{ closed ? `▸ ${legend.series.length}` : '▾' }}</button>
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
  overflow: hidden;
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
/* a control in a legend that takes no pointer: it alone takes it, in the link's ink, as a control does */
.legend-fold {
  padding: 0 var(--space-xs);
  border: 1px solid transparent;
  border-radius: 3px;
  background: none;
  color: var(--color-accent);
  font: inherit;
  line-height: inherit;
  cursor: pointer;
  pointer-events: auto;
}

.legend-fold:hover {
  background-color: var(--color-bg-hover);
  border-color: var(--color-accent);
}

.legend-fold:active {
  background-color: var(--color-bg-active);
  transform: translateY(1px);
}

.legend-fold:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
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
