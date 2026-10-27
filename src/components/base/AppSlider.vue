<script setup lang="ts">
import {
  PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger, SliderRange, SliderRoot, SliderThumb, SliderTrack,
} from 'reka-ui'
import AppButton from '@/components/base/AppButton.vue'

/**
 * A share in percent along a scale — a layer's opacity — set by a lever that opens from its handle
 * (operator, 2026-10-19). The handle stands where the thing is, in its row, and shows the value
 * where it is below the top of the scale; a click opens a VERTICAL lever beside it, and what it
 * moves is drawn while it moves. Vertical, because a row in a narrow panel has height to spare and
 * no width; the top is the most, as on any fader. The arrows step, Home and End go to the ends,
 * Escape closes.
 *
 * The handle keeps one width whatever it shows, so a value appearing on it moves nothing. What the
 * caller sets on it (`data-action`, `title`) lands on the handle, not on the popover's root.
 */
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  /** What it sets — the lever's caption, and its name for a screen reader. */
  label: string
}>(), { min: 0, max: 100, step: 10 })

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

function moved(values: number[] | undefined): void {
  const value = values?.[0]
  if (value !== undefined) emit('update:modelValue', value)
}
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger as-child>
      <AppButton class="slider-handle" size="compact" variant="quiet" glyph :aria-label="`${label}: ${modelValue} %`" v-bind="$attrs">
        <span aria-hidden="true">◐</span>
        <span class="slider-handle-value">{{ modelValue < max ? `${modelValue}%` : '' }}</span>
      </AppButton>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="slider-panel" :side-offset="4" align="center">
        <span class="slider-caption">{{ label }}</span>
        <span class="slider-reading">{{ modelValue }} %</span>
        <SliderRoot
          class="slider-root"
          orientation="vertical"
          :min="min"
          :max="max"
          :step="step"
          :model-value="[modelValue]"
          @update:model-value="moved"
        >
          <SliderTrack class="slider-track">
            <SliderRange class="slider-range" />
          </SliderTrack>
          <SliderThumb class="slider-thumb" :aria-label="label" />
        </SliderRoot>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
/* room for `◐ 100%` at all times: a value that appears does not push the row */
.slider-handle {
  min-width: 6ch;
  justify-content: flex-start;
}

.slider-handle-value {
  font-variant-numeric: tabular-nums;
}
</style>

<style>
/* portalled out of the component, so a scoped rule cannot reach it — the facet bar's panel, narrow */
.slider-panel {
  z-index: var(--z-popover);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-sm) var(--space-md);
  background-color: var(--color-bg-overlay);
  border: 1px solid var(--color-border-overlay);
  border-radius: 4px;
  box-shadow: var(--shadow-overlay);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.slider-caption {
  color: var(--color-text-secondary);
}

.slider-reading {
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.slider-root {
  position: relative;
  display: flex;
  justify-content: center;
  width: 20px;
  height: 120px;
  touch-action: none;
  user-select: none;
}

.slider-track {
  position: relative;
  flex-grow: 1;
  width: 4px;
  border-radius: 2px;
  background-color: var(--color-border-overlay);
}

.slider-range {
  position: absolute;
  width: 100%;
  border-radius: 2px;
  background-color: var(--color-accent);
}

/* the grip: a knob of the switch's kind, ringed in the link colour under the pointer */
.slider-thumb {
  display: block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-accent);
  border-radius: 50%;
  background-color: var(--color-bg-surface);
  cursor: grab;
}

.slider-thumb:hover {
  box-shadow: 0 0 0 2px var(--color-accent);
}

.slider-thumb:active {
  cursor: grabbing;
}

.slider-thumb:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
