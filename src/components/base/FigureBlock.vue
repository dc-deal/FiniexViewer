<script setup lang="ts">
import type { Figure } from '@/types/figure_types'

/**
 * A titled block of label/value pairs — the shape this app shows figures in.
 *
 * Extracted from the configuration panel rather than invented: that panel's *Decision logic* and
 * *Workers* blocks were the arrangement the operator recognised, and a second thing that looked
 * almost like it would be the beginning of the problem — many views that do not look like one app.
 *
 * **Why not a table.** A table earns its headers when there are rows to compare down a column. The
 * executive summary has ONE row per currency, so its ten headers were as much ink as its data and
 * the eye had to travel sideways to pair each label with its value. Where there are rows a table is
 * still right: the trade list, the booking periods and the portfolio stay tables.
 *
 * **Responsiveness is the point of the grid, not a bonus.** `auto-fill` over a minimum width means
 * the pairs fill whatever room the block is given and reflow to one column when they are not — and
 * a panel's width here is the reader's own arrangement, not the viewport's, so a media query would
 * measure the wrong thing.
 */
withDefaults(defineProps<{
  title?: string
  figures?: Figure[]
  /**
   * The narrowest a pair may get before the grid drops a column. Raise it where the values are
   * long, lower it where they are short — a block of two-character numbers should not reserve the
   * width of a currency amount.
   */
  minWidth?: string
}>(), {
  title: '',
  figures: () => [],
  minWidth: '13rem',
})
</script>

<template>
  <section class="figure-block">
    <h3 v-if="title" class="figure-title">{{ title }}</h3>

    <dl
      v-if="figures.length"
      class="figures"
      :style="{ '--figure-min': minWidth }"
    >
      <div v-for="figure in figures" :key="figure.label" class="figure" :title="figure.title">
        <dt>{{ figure.label }}</dt>
        <dd :class="figure.tone">{{ figure.value }}</dd>
      </div>
    </dl>

    <!-- anything a pair cannot carry: a table, a chart, a sentence -->
    <slot />
  </section>
</template>

<style scoped>
.figure-block {
  min-width: 0;
}

/* the heading recedes: it says which block this is, it is not one of the figures */
.figure-title {
  margin: var(--space-md) 0 var(--space-xs);
  font-family: monospace;
  font-size: var(--font-size-sm);
  font-weight: normal;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.figures {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--figure-min), 1fr));
  gap: 0 var(--space-lg);
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

/* label left, value right, so a column of values lines up even when the labels differ in length */
.figure {
  display: flex;
  justify-content: space-between;
  gap: var(--space-md);
  min-width: 0;
}

.figure dt {
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.figure dd {
  margin: 0;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
}

.figure dd.positive { color: var(--color-positive); }
.figure dd.negative { color: var(--color-negative); }
.figure dd.warning { color: var(--color-warning); }
.figure dd.annotation { color: var(--color-annotation); }
</style>
