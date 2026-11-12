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
    <!-- what the app does today, in the backend's own words; the README says the same at length -->
    <div class="about-body">
      <p>{{ t('Web companion for FiniexTestingIDE.') }}</p>
      <p>{{ t('Reads what a backtest or an AutoTrader session left behind — its orders and what became of them, its trades, its booking periods, its warnings and its configuration — and the sessions of a deployment across its restarts, beside a candle chart of the market data.') }}</p>
      <p>{{ t('Read-only: every figure is a field the API served. Nothing is traded from here.') }}</p>
    </div>
    <div class="about-meta">
      <!-- the chart library's licence asks for a link to tradingview.com on a page the reader can
           open: here, in place of the logo it would otherwise draw on every chart -->
      <span>
        {{ t('Charts:') }}
        <a class="about-link" href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView Lightweight Charts</a>
        (Apache 2.0)
      </span>
      <span>{{ t('Docked panels: dockview (MIT)') }}</span>
      <span>{{ t('Icons: Tabler Icons (MIT)') }}</span>
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

/* a link wears the accent, as the app's link-shaped buttons do: underlined under the pointer and
   for a keyboard, with the ring every control shows */
.about-link {
  color: var(--color-accent);
  text-decoration: none;
}

.about-link:hover,
.about-link:focus-visible {
  text-decoration: underline;
}

.about-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
