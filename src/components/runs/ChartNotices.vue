<script setup lang="ts">
import AppButton from '@/components/base/AppButton.vue'
import { utcInstant } from '@/components/runs/report_format'
import type { TimeframeOffer } from '@/types/run_chart_types'
import { t } from '@/translate'

/**
 * What the run chart has to say about what it draws, in the top-right corner of the plot, beside the
 * price scale — the top left is the legend's: a finer timeframe where one draws apart the marks some
 * candles hold together; the timeframe that draws a worker's series the one on show cannot; and where
 * the series stop because the stream is read a stretch at a time (contract 55).
 *
 * Over the plot rather than above it: a line above moved the chart each time one appeared, and a
 * selection never moves the layout. Where there is nothing to say, nothing stands here.
 */
defineProps<{
  offer: TimeframeOffer | null
  /** The timeframe that draws every series shown, and how many the one on show cannot draw. */
  seriesOffer?: { timeframe: string, apart: number } | null
  /** Where the series stop, in UTC seconds, where a read took its pages. */
  seriesCutAt?: number | null
  /** Why the series could not be read, in words. */
  seriesError?: string | null
}>()

const emit = defineEmits<{
  /** The offered timeframe taken. */
  accept: []
  /** The timeframe that draws every series shown, taken. */
  acceptSeries: [timeframe: string]
}>()
</script>

<template>
  <div v-if="offer || seriesOffer || seriesCutAt || seriesError" class="chart-notices">
    <!-- one sentence, the value after it: pieces of a sentence around a value cannot be reordered
         by a later translation -->
    <p v-if="offer" class="chart-notice offer">
      <span class="notice-glyph" aria-hidden="true">▦</span>
      {{ t('Candles whose marks a finer timeframe draws apart') }}: {{ offer.apart }}
      <AppButton
        variant="quiet"
        size="compact"
        class="offer-timeframe"
        :title="t('Draw the chart in this timeframe, centred on the first of them')"
        @click="emit('accept')"
      >{{ offer.timeframe }}</AppButton>
    </p>
    <p v-if="seriesOffer" class="chart-notice series-offer">
      <span class="notice-glyph" aria-hidden="true">∿</span>
      {{ t('Series this timeframe cannot draw') }}: {{ seriesOffer.apart }}
      <AppButton
        variant="quiet"
        size="compact"
        class="offer-timeframe"
        data-action="series-timeframe"
        @click="emit('acceptSeries', seriesOffer.timeframe)"
      >{{ seriesOffer.timeframe }}</AppButton>
    </p>
    <!-- a limit to weigh before trusting what is drawn: the glyph and the word, the colour only beside them -->
    <p v-if="seriesCutAt" class="chart-notice series-cut">
      <span class="notice-glyph" aria-hidden="true">⚠</span>
      {{ t('Series read up to') }} {{ utcInstant(new Date(seriesCutAt * 1000).toISOString()) }}
    </p>
    <!-- the data or the request is wrong: the error's glyph and its words -->
    <p v-if="seriesError" class="chart-notice series-error">
      <span class="notice-glyph" aria-hidden="true">✖</span>
      {{ seriesError }}
    </p>
  </div>
</template>

<style scoped>
/* the chart's own level: over its canvas, under every card and menu that floats over the page —
   at the plot's top right, beside the price scale, since the top left is the legend's (viewer#57),
   one row down: the row above is the controls' of the pane. The chart states the plot's width;
   before it has, the notices keep clear of the scale's room */
.chart-notices {
  position: absolute;
  top: calc(var(--space-xs) + 1.5rem);
  right: calc(100% - var(--chart-plot-width, calc(100% - 5rem)) + var(--space-xs));
  z-index: var(--z-chart);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-xs);
  max-width: 55%;
  /* the plot keeps its pointer everywhere but on a notice */
  pointer-events: none;
}

.chart-notice {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  padding: 2px var(--space-sm);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-bg-overlay);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  pointer-events: auto;
}

.notice-glyph {
  flex-shrink: 0;
}

.series-cut .notice-glyph {
  color: var(--color-warning);
}

.series-error .notice-glyph {
  color: var(--color-error);
}
</style>
