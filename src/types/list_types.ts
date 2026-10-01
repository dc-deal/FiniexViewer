import type { Figure } from '@/types/figure_types'

/**
 * What a column of a `RecordList` declares about itself.
 *
 * The list owns the grid tracks and every row adopts them, so a column is defined once and holds
 * for every row — which is the whole reason the figures line up down the page.
 */
export interface ListColumn {
  /** The heading. Empty for a track that carries marks rather than a measured field. */
  label: string
  /**
   * A grid track: `11rem`, `auto`, `minmax(0, 1fr)`. One column takes the slack, usually the name.
   * Every other one is sized by its own content, which is what keeps the list narrow.
   */
  width: string
  /** Right-aligned and read downwards. A figure column's heading sits over its digits. */
  figure?: boolean
  /**
   * How early this column is given up when the list is narrow. 1 survives everything; 5 goes
   * first. Absent means 1 — a list that declares no ranks keeps every column at every width.
   *
   * Twelve columns in a 620 px panel is 40 px each, five monospace characters, and every cell
   * unreadable — measured on the scenario roster at a 900 px window. The columns are not equal
   * though: `market`, `currency` and `broker` carried the SAME value on all ten rows of that
   * measurement, so they are the first to go when there is no room and a useful cross-check when
   * there is.
   *
   * The width that matters is the LIST's, never the viewport's: a panel's width is the reader's
   * own arrangement, since they drag the seams. Hence a container query rather than a media query.
   *
   * **There are FIVE ranks because a wide list needs a rung above the panel width it usually has.**
   * The ladder ran 34 / 48 / 62 rem, which left the top tier unbounded: measured 2026-09-30, the
   * booking periods drew all fourteen columns at 69 rem in tracks of **22 px** — three monospace
   * characters — and overflowed by 18 px, while the run list squeezed the SET name that names the
   * run into 112 px for 157 px of text. Neither is narrow; both are the ordinary width of a maximised
   * window. So rank 5 goes at 80 rem, and the rungs below it are unchanged.
   *
   * **Declare a rank at every rung the list needs, and no more.** A rank the list does not use makes
   * a breakpoint that changes nothing, which reads as a broken one — a six-column list wants three
   * rungs and a fifteen-column list wants five.
   */
  rank?: 1 | 2 | 3 | 4 | 5
}

/**
 * A band over several columns, above the headings — the device that makes fifteen fields read as
 * three things rather than as one undifferentiated row.
 *
 * `span` is a number of COLUMNS, and the spans must add up to how many there are: a band whose
 * arithmetic is off sits over the wrong column, silently. That was a real defect in the table this
 * replaced — `colspan 6 + 1 + 2` in an eight-column table stretched it past its own heading.
 *
 * It is the span at the WIDEST tier. Where the columns declare ranks, the list narrows each band
 * by however many of its own columns that tier gives up — so a caller states the arrangement once
 * and never per width. A band that would keep no column at all is a contradiction the list reports
 * rather than resolves, because the ranks are what need changing.
 */
export interface ListBand {
  /** Empty for a band that groups columns without naming them, such as a row's identity. */
  label: string
  span: number
}

/**
 * The figures of one row that do not fit a column, for the card beside it.
 *
 * `Figure` is the same pair a `FigureBlock` places — one shape for "a label and an already-rendered
 * value", whether it sits in a block or in a card. Two names for it was the beginning of two
 * vocabularies. The value arrives FORMATTED, because a currency, a magnitude and an `n/a` stop
 * being interchangeable at the formatter, which lives at the rendering edge.
 */
export interface ListCard {
  title: string
  details: Figure[]
}

/**
 * One partition of a list, produced by the caller's `groupBy`.
 *
 * It deliberately carries NO totals. A group's figures are the ones the API SERVED for that group —
 * `scenario_totals` on the trade history, `unit_totals` on the booking periods — and the caller
 * looks them up by `key`. Folding them here would put the arithmetic in the one place that knows
 * nothing about where the rows came from, and three of those columns cannot be folded correctly at
 * all: a drawdown must come from the row that won it, a rate is rebuilt from summed components
 * rather than averaged, and a streak can cross a group boundary.
 */
export interface ListGroup<T> {
  /** The value that defines the group, and what the caller looks its served total up by. */
  key: string
  rows: T[]
  open: boolean
}
