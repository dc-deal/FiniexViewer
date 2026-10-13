<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useBrokerStore } from '@/stores/broker_store'
import { useSymbolStore } from '@/stores/symbol_store'
import { useSelectionStore } from '@/stores/selection_store'
import { useTimeframeStore } from '@/stores/timeframe_store'
import AppSelect from '@/components/base/AppSelect.vue'
import { t } from '@/translate'

/**
 * What the free chart shows: broker, symbol, timeframe. A row inside the chart panel for now —
 * the sidebar that held it went with the docked panels, and the quick bar beside the tabs, where
 * it belongs, is the next step.
 */
const brokerStore = useBrokerStore()
const symbolStore = useSymbolStore()
const selectionStore = useSelectionStore()
const timeframeStore = useTimeframeStore()

const { brokers, loading: brokersLoading } = storeToRefs(brokerStore)
const { symbolsByBroker, loading: symbolsLoading } = storeToRefs(symbolStore)
const { broker, symbol, timeframe } = storeToRefs(selectionStore)
const { timeframes } = storeToRefs(timeframeStore)

const currentSymbols = computed(() =>
  broker.value ? (symbolsByBroker.value[broker.value] ?? []) : []
)

onMounted(async () => {
  await brokerStore.loadBrokers()
  timeframeStore.loadTimeframes()
  // the broker came back with the stored selection, so its symbols are needed for the selector
  if (broker.value) symbolStore.loadSymbols(broker.value)
})

function onBrokerChange(b: string): void {
  selectionStore.setBroker(b)
  symbolStore.loadSymbols(b)
}
</script>

<template>
  <div class="chart-selectors">
    <label class="selector-label">{{ t('Broker') }}</label>
    <AppSelect
      :model-value="broker"
      :options="brokers.map(b => ({ value: b, label: b }))"
      :placeholder="t('Select broker')"
      :disabled="brokersLoading"
      @update:model-value="onBrokerChange"
    />
    <label class="selector-label">{{ t('Symbol') }}</label>
    <AppSelect
      :model-value="symbol"
      :options="currentSymbols.map(s => ({ value: s.symbol, label: s.symbol }))"
      :placeholder="t('Select symbol')"
      :disabled="broker === null || symbolsLoading"
      @update:model-value="selectionStore.setSymbol"
    />
    <label class="selector-label">{{ t('Timeframe') }}</label>
    <AppSelect
      :model-value="timeframe"
      :options="timeframes.map(tf => ({ value: tf, label: tf }))"
      :placeholder="t('Select timeframe')"
      :disabled="symbol === null"
      @update:model-value="selectionStore.setTimeframe"
    />
  </div>
</template>

<style scoped>
.chart-selectors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

/* the select is built for a column and fills it — in a row it needs a width of its own */
.chart-selectors .app-select {
  width: 11rem;
}

.selector-label {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>
