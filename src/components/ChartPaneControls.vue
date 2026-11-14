<script setup lang="ts">
import AppButton from '@/components/base/AppButton.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import { t } from '@/translate'

/**
 * A pane's controls at the top right of its plot, beside the price scale, while the pointer is over
 * the pane (viewer#57): the lever of what the pane draws, and the whole height and back. They stand
 * at the right edge rather than behind the legend, whose figures change width with every bar — a
 * control that moves under the pointer is one the reader misses (operator, on screen 2026-11-12).
 * Present for a keyboard all the while — focused, they show — and taking the pointer only where they
 * show, so the chart under them keeps every move.
 *
 * @param shown Whether what the pane draws is on show; null where the pane has no lever here.
 * @param whole Whether a pane has the whole height — this one or another: the control gives the heights back.
 * @param canMaximize Whether there is a pane to give the whole height to — one beside another.
 * @param visible Whether the pointer is over the pane.
 * @param top Where the pane begins inside the chart's frame, in pixels.
 */
defineProps<{ shown: boolean | null, whole: boolean, canMaximize: boolean, visible: boolean, top: number }>()

const emit = defineEmits<{
  /** The lever of what the pane draws. */
  toggleShown: []
  /** The whole height for this pane, or the heights back. */
  toggleWhole: []
}>()
</script>

<template>
  <span class="pane-controls" :class="{ visible }" :style="{ top: `${top}px` }">
    <AppButton
      v-if="shown !== null"
      variant="quiet"
      size="compact"
      glyph
      data-action="pane-shown"
      :aria-label="shown ? t('Hide what this pane draws') : t('Show what this pane draws')"
      @click="emit('toggleShown')"
    ><AppIcon :name="shown ? 'status-shown' : 'status-hidden'" /></AppButton>
    <AppButton
      v-if="canMaximize"
      variant="quiet"
      size="compact"
      glyph
      data-action="pane-whole"
      :aria-label="whole ? t('Give the panes their heights back') : t('Give this pane the whole height')"
      @click="emit('toggleWhole')"
    ><AppIcon :name="whole ? 'action-restore' : 'action-maximize'" /></AppButton>
  </span>
</template>

<style scoped>
/* at the plot's right edge, which the chart states; out of sight and out of the pointer's way until
   the pointer is over the pane — or a keyboard is on one of them */
.pane-controls {
  position: absolute;
  right: calc(100% - var(--chart-plot-width, calc(100% - 5rem)) + var(--space-xs));
  /* behind the pane's legend while only the pane is pointed at: a long line of figures stands over
     them and stays readable (operator, on screen 2026-11-14) */
  z-index: calc(var(--z-chart) - 1);
  margin-top: 2px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border-radius: 4px;
  opacity: 0;
  pointer-events: none;
}

/* two steps, as the operator drew them on 2026-11-14: the pointer over the pane shows them faint —
   forty per cent see-through — behind the figures; the pointer over them, or a keyboard on one,
   brings them in front of the figures, whole, on the chart's own surface */
.pane-controls.visible {
  opacity: 0.6;
  pointer-events: auto;
}

.pane-controls:hover,
.pane-controls:focus-within {
  z-index: calc(var(--z-chart) + 1);
  opacity: 1;
  pointer-events: auto;
  background-color: var(--color-bg-base);
}
</style>
