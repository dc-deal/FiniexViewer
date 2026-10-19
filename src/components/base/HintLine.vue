<script setup lang="ts">
import { computed } from 'vue'
import AppButton from '@/components/base/AppButton.vue'
import { useHintsStore } from '@/stores/hints_store'
import { hintById } from '@/hint_registry'
import { t } from '@/translate'
import type { HintDefinition } from '@/types/hint_types'

/**
 * One short explanation, beside the control it is about — or the several explanations of one
 * place, in ONE box with one pair of dismissals.
 *
 * Deliberately a line in the flow rather than a tooltip: a reader who does not know a control is
 * interactive has no reason to hover it, which is exactly how the scenario rows went unnoticed.
 * The text lives in the registry, not here — see `hint_registry.ts` for why.
 *
 * Several share a box because three boxes stacked over the run bundle took nine lines and six
 * clicks to clear. Each hint keeps its own id in the store all the same, so one banned on its own
 * stays away in the box too, and a hint added to a place later shows there by itself.
 *
 * Renders nothing at all for unknown ids, so removing a hint from the registry cannot leave an
 * empty box behind.
 */
const props = defineProps<{
  id: string | string[]
}>()

const hints = useHintsStore()
const shown = computed(() => [props.id].flat()
  .map(id => hintById(id))
  .filter((hint): hint is HintDefinition => hint !== null && hints.isVisible(hint.id)))
const several = computed(() => shown.value.length > 1)

function ban(): void {
  for (const hint of shown.value) hints.ban(hint.id)
}

function dismiss(): void {
  for (const hint of shown.value) hints.dismiss(hint.id)
}
</script>

<template>
  <p v-if="shown.length" class="hint-line">
    <span class="hint-mark" aria-hidden="true">💡</span>
    <span class="hint-text">
      <span v-for="hint in shown" :key="hint.id" class="hint-part">{{ hint.text }}</span>
    </span>
    <span class="hint-actions">
      <AppButton
        variant="quiet"
        :title="several ? t('Do not show these hints again') : t('Do not show this hint again')"
        @click="ban"
      >{{ t('Never again') }}</AppButton>
      <AppButton
        variant="quiet"
        :aria-label="several ? t('Dismiss these hints') : t('Dismiss this hint')"
        :title="several ? t('Dismiss — they return next visit') : t('Dismiss — it returns next visit')"
        @click="dismiss"
      >✕</AppButton>
    </span>
  </p>
</template>

<style scoped>
/* A NOTICE that merely informs — the plain-structure ink on a surface of its own, framed solid.
   Not the annotation role it wore until 2026-10-13: that colour and its dashed edge mean "the
   thing changed here", the scenario narrowing, and a hint in the same pink read as a second
   selection (operator, on screen). */
/* The dismissals wrap BELOW the text where the panel is too narrow for both side by side: beside it
   they left a 240 px panel's text one word wide, a column that filled the panel (operator, on
   screen, 2026-10-19). The text's basis is the width it must keep before they make way. */
.hint-line {
  display: flex;
  flex-wrap: wrap;
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
  flex: 1 1 24ch;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

/* the two dismissals are CONTROLS, so they keep the link ink AppButton gives them — muted ink is
   what this app reserves for a control that cannot be used, and `Never again` in it was read twice
   before it was read as a button (operator, 2026-10-13). They move as one, to the right edge. */
.hint-actions {
  display: inline-flex;
  flex-shrink: 0;
  gap: var(--space-xs);
  margin-left: auto;
}
</style>
