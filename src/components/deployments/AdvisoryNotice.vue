<script setup lang="ts">
import { computed } from 'vue'
import type { DeploymentAdvisory } from '@/types/api/deployment_types'
import { plural, t } from '@/translate'

/**
 * Says that the sessions below may NOT be read as one series. The backend sends counts, not
 * wording — the words are built here, which keeps the display strings reachable and lets the
 * phrasing change without touching the contract.
 *
 * Only ever a warning: a null advisory is the backend's answer that there is nothing to report
 * (their `deployments` document: one strategy stand, one operational stand, one place the orders
 * went), and the caller then shows none. So a non-null one ALWAYS has something to say — and where
 * the stands held, it is the orders: a history that mixed real money and simulated orders is the
 * one case the advisory fires on by itself. A calm "one configuration" sentence used to stand
 * exactly there.
 *
 * One line, the sentence on hover (operator, 2026-10-20): the head of the panel competes for room
 * with the history it introduces.
 */
const props = defineProps<{
  advisory: DeploymentAdvisory
}>()

/** Where the sessions' orders went differs between them: real money and a rehearsal in one history. */
const mixed = computed(() => props.advisory.orders_to.length > 1)

const stands = computed(() => [
  plural(props.advisory.strategy_stands, t('strategy stand'), t('strategy stands')),
  plural(props.advisory.operation_stands, t('operational stand'), t('operational stands')),
])

const sentence = computed(() => [
  `${props.advisory.sessions} ${t('sessions span')} ${stands.value.join(` ${t('and')} `)}`,
  mixed.value ? `, ${t('and their orders went to real money and to simulation')}` : '',
  ` — ${t('these rows are not one series, and a total over them answers no question')}.`,
].join(''))
</script>

<template>
  <span class="advisory" :title="sentence">
    <!-- the glyph, not the colour, is what carries "warning": a dark yellow and a dark red are
         inseparable under red-green colour blindness in the light theme -->
    <span class="mark">⚠</span>
    {{ stands.join(' · ') }}<template v-if="mixed"> · {{ t('real money and simulated orders') }}</template>
    — {{ t('not one series') }}
  </span>
</template>

<style scoped>
.advisory {
  color: var(--color-warning);
}

.mark {
  margin-right: var(--space-xs);
}
</style>
