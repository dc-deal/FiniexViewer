<script setup lang="ts">
import { onMounted } from 'vue'
import { useBrokerStore } from '@/stores/broker_store'

const brokerStore = useBrokerStore()

onMounted(() => {
  brokerStore.loadBrokers()
})
</script>

<template>
  <div>
    <h1>FiniexViewer</h1>
    <div v-if="brokerStore.loading">Loading brokers…</div>
    <div v-else-if="brokerStore.error">Error: {{ brokerStore.error }}</div>
    <ul v-else>
      <li v-for="broker in brokerStore.brokers" :key="broker">{{ broker }}</li>
    </ul>
  </div>
</template>
