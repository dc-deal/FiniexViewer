<script setup lang="ts">
import { computed } from 'vue'
import { duration } from '@/components/runs/report_format'
import type { DeploymentAdvisory } from '@/types/api/deployment_types'
import { t } from '@/translate'

/**
 * Says whether the sessions below may be read as one series. The backend sends counts, not
 * wording — the sentence is built here, which keeps the display strings reachable and lets the
 * phrasing change without touching the contract.
 */
const props = defineProps<{
  advisory: DeploymentAdvisory
}>()

/** True where more than one configuration produced the rows — the reason the notice exists. */
const moved = computed(() =>
  props.advisory.strategy_stands > 1 || props.advisory.operation_stands > 1
)

const idle = computed(() =>
  props.advisory.longest_gap_hours === null ? null : duration(props.advisory.longest_gap_hours)
)
</script>

<template>
  <p class="notice" :class="{ moved }">
    <!-- the glyph, not the colour, is what carries "warning": a dark yellow and a dark red are
         inseparable under red-green colour blindness in the light theme -->
    <span v-if="moved" class="mark">⚠</span>
    <template v-if="moved">
      {{ advisory.sessions }} {{ t('sessions span') }}
      {{ advisory.strategy_stands }} {{ t('strategy stands') }}
      {{ t('and') }}
      {{ advisory.operation_stands }} {{ t('operational stands') }} —
      {{ t('these rows are not one series, and a total over them answers no question') }}.
    </template>
    <template v-else>
      {{ advisory.sessions }} {{ t('sessions, all produced by one configuration') }}.
    </template>
    <template v-if="idle"> {{ t('Longest idle stretch') }}: {{ idle }}.</template>
  </p>
</template>

<style scoped>
.notice {
  margin: 0;
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-text-secondary);
  border-radius: 4px;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.notice.moved {
  border-left-color: var(--color-warning);
  color: var(--color-warning);
}

.mark {
  margin-right: var(--space-xs);
}
</style>
