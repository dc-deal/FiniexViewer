<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import CandleChart from '@/components/CandleChart.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import HintLine from '@/components/base/HintLine.vue'
import ChartNotices from '@/components/runs/ChartNotices.vue'
import { useChartLayers } from '@/composables/use_chart_layers'
import { paneGroup } from '@/layer_groups'
import { useRunChartStore } from '@/stores/run_chart_store'
import { useRunsStore } from '@/stores/runs_store'
import { t } from '@/translate'

/**
 * The run-bound chart: one unit of the chosen run on its candles, its positions marked where they
 * opened and its trades where they closed. Which unit and which timeframe is the chart's own choice, in its quick bar.
 *
 * Every state says what it is — no run, the run's units on their way, a unit nothing can be drawn
 * for, a market the archive holds nothing for, a window without bars — because an empty chart says
 * nothing about why it is empty.
 */
const chart = useRunChartStore()
const {
  units, unit, waiting, unitCoverage, coverageError, timeframe, bars, loading, error, layers, offer, focusAt,
  priceFormat, volume, candles, loadingEdges, edgeError, paneWeights, maximizedPane, indicators, seriesOffer, seriesCutAt,
  seriesError, paneLooks, closedLegends,
} = storeToRefs(chart)

/**
 * The eye and the ✕ on a pane are its group's in the Layers panel: one state, above its layers' own
 * switches (`layer_groups.ts`). A pane of its own hidden gives its room up; shown again, every layer
 * in it stands as it was set.
 */
const chartLayers = useChartLayers(() => 'run-chart')
function showPane(pane: string, shown: boolean): void {
  chartLayers.showGroup(paneGroup(pane), shown)
}

/** The panes whose group is hidden, by name. */
const hiddenPanes = computed(() => [...chartLayers.groupsHidden.value]
  .filter(key => key.startsWith('pane:')).map(key => key.slice('pane:'.length)))
const { selectedRunId, selectedRun, awaitingRun, unknownRunId, indexError } = storeToRefs(useRunsStore())

// the archive is asked only while a run chart is on show
onMounted(() => chart.attach())
onUnmounted(() => chart.detach())
</script>

<template>
  <div class="run-chart-view">
    <!-- what the shapes mean, once: above the states, so it pushes the chart at mount and never again -->
    <HintLine id="chart-marks" />
    <HintLine id="chart-panes" />
    <div v-if="!selectedRunId" class="state-overlay">
      <span class="hint">{{ t('Choose a run to see its trades on the candles') }}</span>
    </div>
    <!-- the run's index row comes before anything about its units: without it the chart said
         "names no market" through every first load of the index — the run report's own order -->
    <div v-else-if="awaitingRun" class="state-overlay">
      <AppSpinner />
    </div>
    <div v-else-if="unknownRunId" class="state-overlay">
      <span class="hint">{{ t('The run you had open is no longer in the index') }}: {{ unknownRunId }}</span>
    </div>
    <div v-else-if="!selectedRun && indexError" class="state-overlay">
      <span class="error-msg"><AppIcon name="status-error" class="error-mark" />{{ indexError }}</span>
    </div>
    <div v-else-if="waiting" class="state-overlay">
      <AppSpinner />
    </div>
    <div v-else-if="!units" class="state-overlay">
      <span class="hint">{{ t('This run names no market for its units') }}</span>
    </div>
    <div v-else-if="!unit" class="state-overlay">
      <span class="hint">{{ t('No unit of this run processed a tick in a market it names') }}</span>
    </div>
    <div v-else-if="coverageError" class="state-overlay">
      <span class="error-msg"><AppIcon name="status-error" class="error-mark" />{{ coverageError }}</span>
    </div>
    <div v-else-if="unitCoverage === 'none'" class="state-overlay">
      <span class="hint">{{ t('The archive holds no bars for') }} {{ unit.symbol }} · {{ unit.broker }}</span>
    </div>
    <div v-else-if="loading || !unitCoverage" class="state-overlay">
      <AppSpinner />
    </div>
    <div v-else-if="error" class="state-overlay">
      <span class="error-msg"><AppIcon name="status-error" class="error-mark" />{{ error }}</span>
    </div>
    <div v-else-if="!bars.length" class="state-overlay">
      <!-- one sentence, the values after it: pieces of a sentence around values cannot be reordered
           by a later translation -->
      <span class="hint">
        {{ t('The archive holds no bars in the window this unit covered') }}: {{ unit.name }} · {{ unit.symbol }} · {{ timeframe }}
      </span>
    </div>
    <CandleChart
      v-else
      :data="bars"
      :layers="layers"
      :volume="volume"
      :candles="candles"
      :focus="focusAt"
      :price-format="priceFormat"
      :loading-edges="loadingEdges"
      :edge-error="edgeError"
      :pane-weights="paneWeights"
      :maximized-pane="maximizedPane"
      :indicators="indicators"
      :pane-looks="paneLooks"
      :hidden-panes="hiddenPanes"
      :closed-legends="closedLegends"
      @spacing="chart.setSpacing"
      @edge="chart.extendBars"
      @pane-weights="chart.setPaneWeights"
      @pane-shown="showPane"
      @legend-closed="chart.closeLegend"
      @maximize="chart.setMaximizedPane"
      @reset-panes="chart.resetPanes"
    >
      <ChartNotices
        :offer="offer"
        :series-offer="seriesOffer"
        :series-cut-at="seriesCutAt"
        :series-error="seriesError"
        @accept="chart.acceptOffer"
        @accept-series="chart.chooseTimeframe"
      />
    </CandleChart>
  </div>
</template>

<style scoped>
.run-chart-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.state-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-md);
  font-family: monospace;
  text-align: center;
}

.hint {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

/* the data or the request is wrong: the error role, and its mark beside it — a colour never travels
   alone */
.error-msg {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--color-error);
  font-size: var(--font-size-sm);
}

.error-mark {
  flex-shrink: 0;
}

</style>
