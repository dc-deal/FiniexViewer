<script setup lang="ts">
import { computed } from 'vue'
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { firstSentence, hintById } from '@/hint_registry'

/**
 * The help card of ONE control, on the control itself (viewer#24): while the pointer rests on it or
 * the keyboard is on it, its name and the first sentence of what it does. No mark of its own, so a
 * row of controls in a narrow panel keeps its width — measured 2026-11-19 in the Layers panel, an ⓘ
 * on every row cut the layers' names to four letters. The whole text stands behind the panel's ⓘ.
 *
 * @param id The explanation of `hint_registry.ts`; an unknown id leaves the control as it is.
 */
const props = defineProps<{
  id: string
}>()

const entry = computed(() => hintById(props.id))
</script>

<template>
  <TooltipProvider v-if="entry" :delay-duration="500" :skip-delay-duration="200">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent class="help-card" side="bottom" :side-offset="6" :collision-padding="12" data-help-card :data-help-tip="entry.id">
          <span class="help-name">{{ entry.name }}</span>
          <span class="help-sentence">{{ firstSentence(entry.text) }}</span>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
  <slot v-else />
</template>
