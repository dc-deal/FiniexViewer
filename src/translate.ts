/**
 * Marks a user-facing string.
 *
 * Returns its input unchanged — the marking is the point, not a lookup. The expensive half of
 * adding a language later is FINDING every display string, not translating it. The English text
 * is the key, so swapping in a real translation module replaces this implementation and adds a
 * catalogue; no call site changes.
 */
export function t(text: string): string {
  return text
}
