/**
 * One explanation from the registry: the name of the control or the area it is about, and what it
 * does. Shown as a help card (the name and the first sentence), behind an ⓘ (the whole text), or as
 * the fixed sentence of an empty area — never as a line in the layout.
 */
export interface HintDefinition {
  /** Stable across releases: the panels and the tests name an explanation by it. */
  id: string
  /** What the explanation is about, as a help card's title says it. User-facing, so through the marker. */
  name: string
  /** The explanation itself; its first sentence stands on the help card. User-facing, so through the marker. */
  text: string
}
