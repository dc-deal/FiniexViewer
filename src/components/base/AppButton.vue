<script setup lang="ts">
/**
 * Every button in the app, in three shapes.
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
   * it has no surface until pointed at, so it does not stamp a box into a sentence. `link` is a
   * jump to another place, worn as a link: no padding and the font of the line it sits in, so its
   * text stays exactly where text would stand in a table cell (`JumpLink` is its one user).
   */
  variant?: 'solid' | 'quiet' | 'link'
  /**
   * How much room the control takes. `compact` is for a row of them — a facet bar carries six or
   * more side by side, and density is a requirement of these views rather than a preference. It
   * changes the padding and nothing else, so every state still reads the same.
   */
  size?: 'normal' | 'compact'
  /** A toggle currently holding the selection. Distinct from being pressed right now. */
  active?: boolean
  /**
   * The chosen LOOK without the toggle's announcement. For a control that carries a state but is
   * not a toggle — a popover trigger whose facet has values picked is a disclosure, and `active`
   * would give it `aria-pressed` beside the `aria-expanded` the primitive already sets, claiming
   * two roles at once. What such a control states in words (a count, a badge) is what a screen
   * reader should hear; the border is for the eye.
   */
  marked?: boolean
  /**
   * The button is a symbol alone — ◐, ▶, ⏭. A `quiet` button underlines its text under the pointer,
   * which is the sign of a text action; under a lone symbol the line reads as a stray rule (operator,
   * on screen 2026-10-27). Such a button keeps its surface and its border and drops the line.
   */
  glyph?: boolean
  disabled?: boolean
}>(), {
  variant: 'solid',
  size: 'normal',
  active: false,
  marked: false,
  glyph: false,
  disabled: false,
})
</script>

<template>
  <button
    type="button"
    class="app-button"
    :class="[variant, size, { active: active || marked, glyph }]"
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

/* no padding and no border, so nothing moves its text off the column it belongs to — the hover
   surface hugs the text instead of standing around it */
.app-button.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--color-accent);
  font: inherit;
}

/* after both variants, because it has to win their padding on source order */
.app-button.solid.compact,
.app-button.quiet.compact {
  padding: 2px var(--space-sm);
}

.app-button:hover:not(:disabled) {
  background-color: var(--color-bg-hover);
  border-color: var(--color-accent);
}

.app-button.quiet:hover:not(:disabled),
.app-button.link:hover:not(:disabled) {
  text-decoration: underline;
}

.app-button.quiet.glyph:hover:not(:disabled) {
  text-decoration: none;
}

/* a table cell that cuts its text off also cuts a ring drawn outside the link, so the link shows
   focus INSIDE its own box as well, where no clip reaches: the underline and the surface */
.app-button.link:focus-visible {
  text-decoration: underline;
  background-color: var(--color-bg-hover);
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
