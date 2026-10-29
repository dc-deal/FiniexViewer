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
 * Which API contract the server serves, in the menu bar — drawn only where it is not the one this
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
 * Which way they differ says who has to move: a newer server waits for the viewer to follow, an
 * older one serves fields this viewer reads without them.
 */
const sentence = computed(() => (served.value ?? 0) > EXPECTED_CONTRACT
  ? t('This server serves a newer contract than this viewer was built for — a field that moved since may read wrong or be missing until the viewer follows')
  : t('This server serves an older contract than this viewer was built for — a field added since is missing, and a panel may show less'))

const details = computed<Figure[]>(() => [
  { label: t('Server'), value: `${t('contract')} ${served.value}` },
  { label: t('This viewer'), value: `${t('contract')} ${EXPECTED_CONTRACT}` },
  // the server says only what moved into ITS version; every step between is in their log
  { label: t('Steps between'), value: t("the server's contract log · /api/v1/docs/contract-log") },
])
</script>

<template>
  <HoverCard v-if="differs" :title="sentence" :details="details">
    <span class="contract-status" tabindex="0">
      <AppIcon name="status-warning" />
      <span>{{ t('API contract') }} {{ served }} · {{ t('viewer') }} {{ EXPECTED_CONTRACT }}</span>
    </span>
  </HoverCard>
</template>

<style scoped>
.contract-status {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
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
