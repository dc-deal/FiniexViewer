<script setup lang="ts">
import { t } from '@/translate'
</script>

<template>
  <div class="app-spinner" role="status" :aria-label="t('Loading')" />
</template>

<style scoped>
.app-spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* without motion the ring stands still; its role and its label still say that something loads */
@media (prefers-reduced-motion: reduce) {
  .app-spinner {
    animation: none;
  }
}
</style>
