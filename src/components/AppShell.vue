<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { Splitpanes, Pane } from 'splitpanes'
import { useBrokerStore } from '@/stores/broker_store'
import { useSymbolStore } from '@/stores/symbol_store'
import { useSelectionStore } from '@/stores/selection_store'
import AppSelect from '@/components/base/AppSelect.vue'

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1']

const brokerStore = useBrokerStore()
const symbolStore = useSymbolStore()
const selectionStore = useSelectionStore()

const { brokers, loading: brokersLoading } = storeToRefs(brokerStore)
const { symbolsByBroker, loading: symbolsLoading } = storeToRefs(symbolStore)
const { broker, symbol, timeframe } = storeToRefs(selectionStore)

const currentSymbols = computed(() =>
  broker.value ? (symbolsByBroker.value[broker.value] ?? []) : []
)

onMounted(async () => {
  await brokerStore.loadBrokers()
})

function onBrokerChange(b: string): void {
  selectionStore.setBroker(b)
  symbolStore.loadSymbols(b)
}
</script>

<template>
  <div class="shell">
    <header class="shell-header">
      <span class="shell-title">FiniexViewer</span>
    </header>
    <div class="shell-body">
      <Splitpanes class="shell-splitpanes">
        <Pane :min-size="12" :max-size="30" :size="16" class="sidebar">
          <nav class="sidebar-nav">
            <RouterLink to="/viewer" class="nav-link">Viewer</RouterLink>
            <RouterLink to="/about" class="nav-link">About</RouterLink>
          </nav>
          <div class="sidebar-selectors">
            <label class="selector-label">Broker</label>
            <AppSelect
              :model-value="broker"
              :options="brokers.map(b => ({ value: b, label: b }))"
              placeholder="Select broker"
              :disabled="brokersLoading"
              @update:model-value="onBrokerChange"
            />
            <label class="selector-label">Symbol</label>
            <AppSelect
              :model-value="symbol"
              :options="currentSymbols.map(s => ({ value: s.symbol, label: s.symbol }))"
              placeholder="Select symbol"
              :disabled="broker === null || symbolsLoading"
              @update:model-value="selectionStore.setSymbol"
            />
            <label class="selector-label">Timeframe</label>
            <AppSelect
              :model-value="timeframe"
              :options="TIMEFRAMES.map(tf => ({ value: tf, label: tf }))"
              placeholder="Select timeframe"
              :disabled="symbol === null"
              @update:model-value="selectionStore.setTimeframe"
            />
          </div>
        </Pane>
        <Pane class="main-pane">
          <slot />
        </Pane>
      </Splitpanes>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-bg-base);
}

.shell-header {
  display: flex;
  align-items: center;
  padding: 0 var(--space-lg);
  height: 2.5rem;
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.shell-title {
  font-family: monospace;
  font-weight: bold;
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
}

.shell-body {
  flex: 1;
  overflow: hidden;
}

.shell-splitpanes {
  height: 100%;
}

.sidebar {
  background-color: var(--color-bg-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: var(--space-md);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--color-border);
}

.nav-link {
  display: block;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-family: monospace;
  font-size: var(--font-size-sm);
  padding: var(--space-xs) 0;
}

.nav-link.router-link-active {
  color: var(--color-accent);
}

.sidebar-selectors {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.selector-label {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-top: var(--space-sm);
}

.selector-label:first-child {
  margin-top: 0;
}

.main-pane {
  background-color: var(--color-bg-base);
  overflow: hidden;
}
</style>
