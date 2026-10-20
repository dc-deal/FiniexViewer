<script setup lang="ts">
import AppButton from '@/components/base/AppButton.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import type { TimeframeOffer } from '@/types/run_chart_types'
import { t } from '@/translate'

/**
 * What the run chart has to say about what it draws, in the top-left corner of the plot: the window
 * the route cut, and a finer timeframe where one draws apart the marks some candles hold together.
 *
 * Over the plot rather than above it: a line above moved the chart each time one appeared, and a
 * selection never moves the layout. Where there is nothing to say, nothing stands here.
 */
defineProps<{
  /** The route served fewer bars than the window holds. */
  truncated: boolean
  offer: TimeframeOffer | null
}>()

const emit = defineEmits<{
  /** The offered timeframe taken. */
  accept: []
}>()
</script>

<template>
  <div v-if="truncated || offer" class="chart-notices">
    <!-- the route never cuts quietly, and neither does the chart: said where it shows -->
    <p v-if="truncated" class="chart-notice truncated">
      <AppIcon name="status-warning" class="notice-mark" />
      {{ t('The window holds more bars than the archive serves at once — a longer timeframe shows all of it') }}
    </p>
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
  </div>
</template>

<style scoped>
/* the chart's own level: over its canvas, under every card and menu that floats over the page —
   and clear of the price scale on the right */
.chart-notices {
  position: absolute;
  top: var(--space-xs);
  left: var(--space-xs);
  z-index: var(--z-chart);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-xs);
  max-width: calc(100% - 5rem);
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

/* something to weigh before trusting what is beside it: the warning role, with its word */
.notice-mark {
  flex-shrink: 0;
  color: var(--color-warning);
}

.notice-glyph {
  flex-shrink: 0;
}
</style>
