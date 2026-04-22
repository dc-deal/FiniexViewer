<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useBrokerStore } from '@/stores/broker_store'
import { useSymbolStore } from '@/stores/symbol_store'

const brokerStore = useBrokerStore()
const symbolStore = useSymbolStore()
const { brokers, loading: brokersLoading, error: brokersError } = storeToRefs(brokerStore)
const { symbolsByBroker, loading: symbolsLoading, error: symbolsError } = storeToRefs(symbolStore)

onMounted(async () => {
  await brokerStore.loadBrokers()
  for (const broker of brokers.value) {
    symbolStore.loadSymbols(broker)
  }
})
</script>

<template>
  <div class="viewer">
    <h1>FiniexViewer</h1>

    <div v-if="brokersLoading || symbolsLoading" class="status">
      Loading…
    </div>
    <div v-else-if="brokersError || symbolsError" class="status error">
      {{ brokersError ?? symbolsError }}
    </div>

    <ul v-else class="broker-tree">
      <li v-for="broker in brokers" :key="broker" class="broker-node">
        <span class="broker-label">{{ broker }}</span>
        <ul class="symbol-list">
          <li
            v-for="(entry, i) in symbolsByBroker[broker]"
            :key="entry.symbol"
            class="symbol-node"
          >
            <span class="tree-char">{{ i === (symbolsByBroker[broker]?.length ?? 0) - 1 ? '└──' : '├──' }}</span>
            <span class="symbol-name">{{ entry.symbol }}</span>
            <span class="market-type">{{ entry.market_type }}</span>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.viewer {
  font-family: monospace;
  padding: var(--space-xl);
}

h1 {
  margin-bottom: var(--space-lg);
}

.status {
  color: var(--color-text-secondary);
}

.status.error {
  color: var(--color-error);
}

.broker-tree {
  list-style: none;
  padding: 0;
}

.broker-node {
  margin-bottom: var(--space-md);
}

.broker-label {
  font-weight: bold;
  font-size: var(--font-size-md);
  color: var(--color-accent);
}

.symbol-list {
  list-style: none;
  padding-left: 1.2rem;
  margin-top: var(--space-xs);
}

.symbol-node {
  display: flex;
  gap: var(--space-sm);
  line-height: 1.6;
}

.tree-char {
  color: var(--color-tree-connector);
  user-select: none;
}

.symbol-name {
  color: var(--color-text-primary);
}

.market-type {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}
</style>
