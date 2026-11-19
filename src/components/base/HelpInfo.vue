<script setup lang="ts">
import { computed } from 'vue'
import {
  PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger,
  TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger,
} from 'reka-ui'
import AppButton from '@/components/base/AppButton.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import { firstSentence, hintById } from '@/hint_registry'
import type { HintDefinition } from '@/types/hint_types'
import { t } from '@/translate'

/**
 * What an area or a control does, behind a small ⓘ (viewer#24; operator, 2026-11-19): while the
 * pointer rests on it, or the keyboard is on it, a help card with the name and the first sentence; at
 * a click the whole text, every explanation of the place one below the other. Nothing stands in the
 * layout and nothing is to be put away — the line this replaced did both.
 *
 * The help card is not a data card: it carries a sentence, which a data card never does, and an edge
 * in the link role so it is not taken for figures. Unknown ids draw nothing, so an explanation removed
 * from the registry leaves no empty mark behind.
 *
 * @param id One explanation of `hint_registry.ts`, or the several of one place.
 */
const props = defineProps<{
  id: string | string[]
}>()

const entries = computed(() => [props.id].flat()
  .map(id => hintById(id))
  .filter((entry): entry is HintDefinition => entry !== null))

const first = computed(() => entries.value[0] ?? null)

/** Its name for a screen reader: what it explains. */
const aboutLabel = computed(() => {
  const about = first.value?.name ?? ''
  return `${t('About')}: ${about}`
})
</script>

<template>
  <PopoverRoot v-if="first">
    <TooltipProvider :delay-duration="500" :skip-delay-duration="200">
      <TooltipRoot>
        <TooltipTrigger as-child>
          <PopoverTrigger as-child>
            <AppButton
              class="help-info"
              variant="quiet"
              size="compact"
              glyph
              data-help
              :data-help-ids="entries.map(entry => entry.id).join(' ')"
              :aria-label="aboutLabel"
            >
              <AppIcon name="action-info" />
            </AppButton>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent class="help-card" side="bottom" :side-offset="6" :collision-padding="12" data-help-card>
            <span class="help-name">{{ first.name }}</span>
            <span class="help-sentence">{{ firstSentence(first.text) }}</span>
          </TooltipContent>
        </TooltipPortal>
      </TooltipRoot>
    </TooltipProvider>
    <PopoverPortal>
      <PopoverContent
        class="help-card help-popover"
        side="bottom"
        align="end"
        :side-offset="6"
        :collision-padding="12"
        data-help-popover
      >
        <section v-for="entry in entries" :key="entry.id" class="help-entry" :data-help-entry="entry.id">
          <span class="help-name">{{ entry.name }}</span>
          <p class="help-text">{{ entry.text }}</p>
        </section>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
/* a mark beside what it explains, never a control's size: it must not widen the bar it stands in */
.help-info {
  flex: none;
}
</style>
