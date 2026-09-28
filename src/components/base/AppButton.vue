<script setup lang="ts">
/**
 * Every button in the app, in two shapes.
 *
 * Built after a settings button was read as greyed out and unclickable although it worked. The
 * cause was not a missing state but a WRONG one: it wore `text-secondary` on a raised surface,
 * which is the vocabulary of a disabled control. It also had no hover and no pressed state at all,
 * so the only feedback a click produced was whatever happened elsewhere on the page.
 *
 * The four states are the whole point, and each carries TWO channels so none depends on one:
 *
 *   rest     ink on a raised surface with a border
 *   hover    the surface lifts AND the border takes the interactive colour
 *   active   the surface sinks AND the control moves down a pixel — surface alone is far too weak
 *            here (a luminance ratio of ~1.1), position is not
 *   disabled muted ink, a muted border and `not-allowed` — the look this component reclaims, so
 *            that grey finally MEANS something
 *
 * The toggle reuses `active` as a lasting state rather than inventing a fifth look: a button that
 * is the chosen one of a group looks the way a pressed button looks, which is what it is.
 */
withDefaults(defineProps<{
  /**
   * `solid` is a control with a surface of its own. `quiet` is an action inside a line of text —
   * it has no surface until pointed at, so it does not stamp a box into a sentence.
   */
  variant?: 'solid' | 'quiet'
  /** A toggle currently holding the selection. Distinct from being pressed right now. */
  active?: boolean
  disabled?: boolean
}>(), {
  variant: 'solid',
  active: false,
  disabled: false,
})
</script>

<template>
  <button
    type="button"
    class="app-button"
    :class="[variant, { active }]"
    :disabled="disabled"
    :aria-pressed="active ? 'true' : undefined"
  >
    <slot />
  </button>
</template>

<style scoped>
.app-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  border-radius: 4px;
  font-family: monospace;
  font-size: var(--font-size-sm);
  cursor: pointer;
  /* short enough to feel immediate; a press that fades in is a press that is not felt */
  transition: background-color 80ms ease, border-color 80ms ease, color 80ms ease;
}

.app-button.solid {
  padding: var(--space-xs) var(--space-md);
  border: 1px solid var(--color-border);
  background-color: var(--color-bg-elevated);
  /* ink, never text-secondary — that is what made this look disabled */
  color: var(--color-text-primary);
}

.app-button.quiet {
  padding: 0 var(--space-xs);
  border: 1px solid transparent;
  background: none;
  color: var(--color-accent);
}

.app-button:hover:not(:disabled) {
  background-color: var(--color-bg-hover);
  border-color: var(--color-accent);
}

.app-button.quiet:hover:not(:disabled) {
  text-decoration: underline;
}

/* the press: the surface sinks and the control goes with it */
.app-button:active:not(:disabled) {
  background-color: var(--color-bg-active);
  transform: translateY(1px);
}

/* a ring rather than a border swap — a border that only changes colour is invisible against a
   surface of similar lightness, and the keyboard reader is the one who needs this most */
.app-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* a toggle holding the selection: the pressed look, made to last */
.app-button.active {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.app-button.solid.active {
  background-color: var(--color-bg-active);
}

.app-button:disabled {
  color: var(--color-text-secondary);
  border-color: var(--color-border);
  background-color: var(--color-bg-elevated);
  cursor: not-allowed;
}

/* a pixel is not vestibular motion, but the fade beside it is the part worth dropping */
@media (prefers-reduced-motion: reduce) {
  .app-button {
    transition: none;
  }
}
</style>
