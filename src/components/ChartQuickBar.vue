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
 * What the free chart shows — broker, symbol, timeframe — in the quick bar beside the tabs, while
 * the chart is the panel in front. Each value is its own control, so the bar reads like the
 * selection it is: `mt5 · EURUSD · H1`, or the three names while nothing is chosen.
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
  <div class="chart-quick-bar">
    <AppSelect
      compact
      :label="t('Broker')"
      :model-value="broker"
      :options="brokers.map(b => ({ value: b, label: b }))"
      :placeholder="t('Broker')"
      :disabled="brokersLoading"
      @update:model-value="onBrokerChange"
    />
    <span class="quick-separator" aria-hidden="true">·</span>
    <AppSelect
      compact
      :label="t('Symbol')"
      :model-value="symbol"
      :options="currentSymbols.map(s => ({ value: s.symbol, label: s.symbol }))"
      :placeholder="t('Symbol')"
      :disabled="broker === null || symbolsLoading"
      @update:model-value="selectionStore.setSymbol"
    />
    <span class="quick-separator" aria-hidden="true">·</span>
    <AppSelect
      compact
      :label="t('Timeframe')"
      :model-value="timeframe"
      :options="timeframes.map(tf => ({ value: tf, label: tf }))"
      :placeholder="t('Timeframe')"
      :disabled="symbol === null"
      @update:model-value="selectionStore.setTimeframe"
    />
  </div>
</template>

<style scoped>
.chart-quick-bar {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  height: 100%;
  padding: 0 var(--space-sm);
}

.quick-separator {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>
