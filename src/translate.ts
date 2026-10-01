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

/**
 * A count with the noun that agrees with it: `1 trade`, `2 trades`.
 *
 * Both words are passed in already marked — `plural(n, t('trade'), t('trades'))` — so every display
 * string stays literally inside a `t()` at its call site, which is the whole mechanism by which
 * they can be found later. A helper that marked them itself would hide them from exactly the search
 * `t()` exists to serve.
 *
 * English only, deliberately, and it lives beside `t()` because that is where a real translation
 * module takes pluralisation over: languages with more than two forms need a rule this cannot
 * express, and inventing one now for two words would be wrong for the twentieth.
 *
 * Not every count needs it. `3 of 40`, `1 rejected` and `2/5 executed` read correctly as they are;
 * a sentence whose VERB also agrees needs rewriting rather than a joined word.
 */
export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}
