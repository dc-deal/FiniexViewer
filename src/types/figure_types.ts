/**
 * One label/value pair in a `FigureBlock`.
 *
 * The value arrives ALREADY FORMATTED. The block places figures; it never formats them, because
 * formatting is where a currency, a ratio and a percentage stop being interchangeable — and the
 * formatters that know the difference live in `report_format.ts`, at the rendering edge.
 */
export interface Figure {
  label: string
  value: string
  /** A colour ROLE, never a colour: 'positive' | 'negative' | 'warning' | 'annotation'. */
  tone?: string
  /** The caveat a reader wants once — on the pair, rather than as a sentence in the flow. */
  title?: string
}
