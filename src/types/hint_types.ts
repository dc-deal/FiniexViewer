/** One short explanation shown beside the control it is about. */
export interface HintDefinition {
  /** Stable across releases — it is what a ban is remembered by. */
  id: string
  /** The sentence itself. User-facing, so it goes through the marker at the registry. */
  text: string
}

/** What is remembered between visits. A dismissal is not: it lasts the session and no longer. */
export interface StoredHints {
  version: number
  banned: string[]
}
