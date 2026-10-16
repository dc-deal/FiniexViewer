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

/**
 * The figures that do not fit where a thing is drawn, for the card beside it — a row of a list, a
 * group heading, a mark on a chart.
 *
 * `Figure` is the same pair a `FigureBlock` places — one shape for "a label and an already-rendered
 * value", whether it sits in a block or in a card. Two names for it was the beginning of two
 * vocabularies. The value arrives FORMATTED, because a currency, a magnitude and an `n/a` stop
 * being interchangeable at the formatter, which lives at the rendering edge.
 */
export interface FigureCard {
  title: string
  details: Figure[]
}
