<script setup lang="ts">
import pkg from '../../package.json'
import AppDialog from '@/components/base/AppDialog.vue'
import { t } from '@/translate'

/**
 * What the application is, read and closed — a dialog, not a panel: nobody keeps it open beside
 * the work.
 *
 * @param open Whether it is shown — `v-model:open`.
 */
defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()
</script>

<template>
  <AppDialog
    :open="open"
    :title="`ℹ️ ${t('About FiniexViewer')}`"
    name="about"
    @update:open="value => emit('update:open', value)"
  >
    <p class="about-version">v{{ pkg.version }}</p>
    <div class="about-body">
      <p>{{ t('Web companion for FiniexTestingIDE.') }}</p>
      <p>{{ t('Connects to the FiniexTestingIDE API server and renders market data as interactive candle charts. Read-only — no trade execution.') }}</p>
    </div>
    <div class="about-meta">
      <span>{{ t('Charts: TradingView Lightweight Charts (Apache 2.0)') }}</span>
      <span>{{ t('License:') }} {{ pkg.license }}</span>
    </div>
  </AppDialog>
</template>

<style scoped>
.about-version {
  margin: 0 0 var(--space-md);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-accent);
}

.about-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
  font-family: monospace;
  font-size: var(--font-size-sm);
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.about-body p {
  margin: 0;
}

.about-meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-border);
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-tree-connector);
}
</style>
