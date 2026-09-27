<script setup lang="ts">
import { computed } from 'vue'
import { useHintsStore } from '@/stores/hints_store'
import { hintById } from '@/hint_registry'
import { t } from '@/translate'

/**
 * One short explanation, beside the control it is about.
 *
 * Deliberately a line in the flow rather than a tooltip: a reader who does not know a control is
 * interactive has no reason to hover it, which is exactly how the scenario rows went unnoticed.
 * The text lives in the registry, not here — see `hint_registry.ts` for why.
 *
 * Renders nothing at all for an unknown id, so removing a hint from the registry cannot leave an
 * empty box behind.
 */
const props = defineProps<{
  id: string
}>()

const hints = useHintsStore()
const hint = computed(() => hintById(props.id))
const shown = computed(() => hint.value !== null && hints.isVisible(props.id))
</script>

<template>
  <p v-if="shown && hint" class="hint-line">
    <span class="hint-mark" aria-hidden="true">💡</span>
    <span class="hint-text">{{ hint.text }}</span>
    <button
      type="button"
      class="hint-action"
      :title="t('Do not show this hint again')"
      @click="hints.ban(id)"
    >{{ t('Never again') }}</button>
    <button
      type="button"
      class="hint-close"
      :aria-label="t('Dismiss this hint')"
      :title="t('Dismiss — it returns next visit')"
      @click="hints.dismiss(id)"
    >✕</button>
  </p>
</template>

<style scoped>
/* the annotation role: a hint marks something about a control, it is not a warning and not an
   error — and the dashed edge is the same second channel every annotation here carries */
.hint-line {
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
  margin: 0 0 var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px dashed var(--color-annotation);
  border-radius: 4px;
  color: var(--color-annotation);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.hint-mark {
  flex-shrink: 0;
}

.hint-text {
  flex: 1;
}

.hint-action,
.hint-close {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.hint-action:hover,
.hint-close:hover {
  color: var(--color-text-primary);
  text-decoration: underline;
}

.hint-close:hover {
  text-decoration: none;
}
</style>
