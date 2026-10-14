<script setup lang="ts">
import { computed } from 'vue'
import AppButton from '@/components/base/AppButton.vue'
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
    <AppButton
      variant="quiet"
      :title="t('Do not show this hint again')"
      @click="hints.ban(id)"
    >{{ t('Never again') }}</AppButton>
    <AppButton
      variant="quiet"
      :aria-label="t('Dismiss this hint')"
      :title="t('Dismiss — it returns next visit')"
      @click="hints.dismiss(id)"
    >✕</AppButton>
  </p>
</template>

<style scoped>
/* A NOTICE that merely informs — the plain-structure ink on a surface of its own, framed solid.
   Not the annotation role it wore until 2026-10-13: that colour and its dashed edge mean "the
   thing changed here", the scenario narrowing, and a hint in the same pink read as a second
   selection (operator, on screen). */
.hint-line {
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
  margin: 0 0 var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.hint-mark {
  flex-shrink: 0;
}

.hint-text {
  flex: 1;
}

/* the two dismissals are CONTROLS, so they keep the link ink AppButton gives them — muted ink is
   what this app reserves for a control that cannot be used, and `Never again` in it was read twice
   before it was read as a button (operator, 2026-10-13) */
.hint-line .app-button.quiet {
  flex-shrink: 0;
}
</style>
