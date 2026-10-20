<script setup lang="ts">
/**
 * Every on/off choice outside a menu, as ONE control: a lever (operator, 2026-10-19). A menu keeps
 * its tick, because there the whole entry is the switch; everywhere else it is this, and never a
 * checkbox — one model, decided once for the app.
 *
 * The state is carried by FORM first: the knob stands left for off and right for on, which reads
 * in greyscale and to a reader who cannot tell the colours apart; the link colour of the track only
 * reinforces it. The four states are the buttons' — hover rings the track in the link colour, the
 * press sinks it a pixel — and the lever keeps its size whatever it shows, so switching moves nothing.
 *
 * `label` is the word beside it, part of the click; without one, the caller names the switch with
 * `aria-label`, or a `<label>` around it does.
 */
defineProps<{
  modelValue: boolean
  label?: string
  disabled?: boolean
}>()

defineEmits<{
  'update:modelValue': [on: boolean]
}>()
</script>

<template>
  <button
    type="button"
    role="switch"
    class="app-switch"
    :class="{ on: modelValue }"
    :aria-checked="modelValue"
    :disabled="disabled"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="switch-track" aria-hidden="true"><span class="switch-knob" /></span>
    <span v-if="label" class="switch-label">{{ label }}</span>
  </button>
</template>

<style scoped>
.app-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 0;
  border: none;
  border-radius: 3px;
  background: none;
  font: inherit;
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
}

.switch-track {
  position: relative;
  flex-shrink: 0;
  width: 26px;
  height: 14px;
  border: 1px solid var(--color-border-overlay);
  border-radius: 7px;
  background-color: var(--color-bg-base);
  transition: background-color 80ms ease, border-color 80ms ease;
}

.switch-knob {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--color-text-secondary);
  transition: transform 120ms ease, background-color 80ms ease;
}

.app-switch.on .switch-track {
  border-color: var(--color-accent);
  background-color: var(--color-accent);
}

.app-switch.on .switch-knob {
  transform: translateX(12px);
  background-color: var(--color-bg-surface);
}

/* hover: the track takes a ring in the link colour — in both positions, so it reads on the blue too */
.app-switch:hover:not(:disabled) .switch-track {
  box-shadow: 0 0 0 1px var(--color-accent);
}

/* the press: the track sinks a pixel, as a pressed button does */
.app-switch:active:not(:disabled) .switch-track {
  transform: translateY(1px);
}

.app-switch:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* disabled: the muted ink and the muted edge this app keeps for a control that cannot be used */
.app-switch:disabled {
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

.app-switch:disabled .switch-track {
  border-color: var(--color-border);
  background-color: var(--color-bg-surface);
}

.app-switch:disabled .switch-knob {
  background-color: var(--color-border-overlay);
}

.switch-label {
  min-width: 0;
}
</style>
