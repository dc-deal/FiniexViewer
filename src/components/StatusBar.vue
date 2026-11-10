<script setup lang="ts">
import { ref } from 'vue'
import AccountStatus from '@/components/AccountStatus.vue'
import ContractStatus from '@/components/ContractStatus.vue'
import MachineStatus from '@/components/MachineStatus.vue'
import ServerSwitch from '@/components/ServerSwitch.vue'
import { useRankedBar } from '@/composables/use_ranked_bar'

/**
 * The frame below the dock: what this window works against — the server, whose access, under which
 * contract — and how full the machine is. It STATES; the menu bar above the dock chooses (operator,
 * 2026-11-10, after the status bars of VS Code and JetBrains). Frame rather than panel: never closed
 * or moved.
 *
 * Short of room its entries take their short forms by rank — the account's name first, then the
 * contract's words, then the machine's — while the server's name only shortens: which server this
 * window shows is the one word here that must stay.
 */
const bar = ref<HTMLElement | null>(null)
useRankedBar(bar)
</script>

<template>
  <footer ref="bar" class="status-bar">
    <div class="status-entry">
      <ServerSwitch />
    </div>
    <div class="status-entry" data-rank="1">
      <AccountStatus />
    </div>
    <div class="status-entry" data-rank="2">
      <ContractStatus />
    </div>
    <div class="status-bar-spacer" />
    <div class="status-entry" data-rank="3">
      <MachineStatus />
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 0 var(--space-sm);
  height: 1.5rem;
  background-color: var(--color-bg-surface);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.status-entry {
  display: flex;
  align-items: center;
  min-width: 0;
}

/* an entry with nothing to say — the contract where it agrees — takes no gap beside it either */
.status-entry:empty {
  display: none;
}

.status-bar-spacer {
  flex: 1;
}
</style>
