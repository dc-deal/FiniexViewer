<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import AppIcon from '@/components/base/AppIcon.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { EXPECTED_CONTRACT } from '@/api/expected_contract'
import { useServerContractStore } from '@/stores/server_contract_store'
import type { Figure } from '@/types/figure_types'
import { t } from '@/translate'

/**
 * Which API contract the server serves, in the status bar — drawn only where it is not the one this
 * viewer mirrors. Where the two agree nothing is drawn; before any answer nothing is either, and
 * the account beside it already says when the server does not answer.
 */
const { served } = storeToRefs(useServerContractStore())

/**
 * Compared here, beside the number it shows, rather than in the store: a store keeps what it
 * computed across a hot reload of the module that holds the mirrored contract, and showed the old
 * verdict beside the new number (on screen 2026-10-27: "API contract 43 · viewer 43").
 */
const differs = computed(() => served.value !== null && served.value !== EXPECTED_CONTRACT)

/**
 * The two numbers, and nothing else: a hover card holds information, never a help text, and the
 * contract log it once pointed at is a document the reader of this frontend cannot open
 * (operator, 2026-11-10). Which side is older reads off the numbers.
 */
const details = computed<Figure[]>(() => [
  { label: t('Server'), value: `${t('contract')} ${served.value}` },
  { label: t('This viewer'), value: `${t('contract')} ${EXPECTED_CONTRACT}` },
])
</script>

<template>
  <HoverCard v-if="differs" :details="details">
    <span class="contract-status" tabindex="0">
      <AppIcon name="status-warning" />
      <span class="bar-word">{{ t('API contract') }} {{ served }} · {{ t('viewer') }} {{ EXPECTED_CONTRACT }}</span>
    </span>
  </HoverCard>
</template>

<style scoped>
.contract-status {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  /* nothing above and below: the status bar is 1.5 rem high */
  padding: 0 var(--space-sm);
  border-radius: 4px;
  font-family: monospace;
  font-size: var(--font-size-sm);
  white-space: nowrap;
  color: var(--color-warning);
  cursor: default;
}

.contract-status:focus-visible {
  outline: 1px solid var(--color-accent);
}
</style>
