<script setup lang="ts">
import pkg from '../../package.json'
</script>

<template>
  <div class="about-view">
    <h2 class="about-title">{{ pkg.name }}</h2>
    <p class="about-version">v{{ pkg.version }}</p>
    <div class="about-body">
      <p>Web companion for FiniexTestingIDE.</p>
      <p>Connects to the FiniexTestingIDE API server and renders market data as interactive candle charts. Read-only — no trade execution.</p>
    </div>
    <div class="about-meta">
      <span>Charts: TradingView Lightweight Charts (Apache 2.0)</span>
      <span>License: {{ pkg.license }}</span>
    </div>
  </div>
</template>

<style scoped>
.about-view {
  padding: var(--space-xl);
  font-family: monospace;
  max-width: 480px;
}

.about-title {
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
  margin-bottom: var(--space-xs);
}

.about-version {
  color: var(--color-accent);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-lg);
}

.about-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-lg);
  line-height: 1.7;
}

.about-meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  color: var(--color-tree-connector);
  font-size: var(--font-size-sm);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-md);
}
</style>
