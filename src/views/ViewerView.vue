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
  padding: 2rem;
}

h1 {
  margin-bottom: 1.5rem;
}

.status {
  color: #888;
}

.status.error {
  color: #e05;
}

.broker-tree {
  list-style: none;
  padding: 0;
}

.broker-node {
  margin-bottom: 1rem;
}

.broker-label {
  font-weight: bold;
  font-size: 1rem;
  color: #4af;
}

.symbol-list {
  list-style: none;
  padding-left: 1.2rem;
  margin-top: 0.25rem;
}

.symbol-node {
  display: flex;
  gap: 0.5rem;
  line-height: 1.6;
}

.tree-char {
  color: #555;
  user-select: none;
}

.symbol-name {
  color: #eee;
}

.market-type {
  color: #777;
  font-size: 0.85em;
}
</style>
