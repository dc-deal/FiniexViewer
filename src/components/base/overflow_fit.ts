/**
 * How many of a row's items fit, in their order, before the rest go behind a "more" control.
 *
 * `widths` are the items' own widths, `gap` the space between two neighbours, `available` the
 * row's width and `more` the width of the control that holds the rest. The control costs room only
 * where something is left over, so a row in which everything fits never shows it — the wider the
 * row, the less there is to unfold.
 */
export function fittingCount(widths: number[], gap: number, available: number, more: number): number {
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(widths.length - 1, 0)
  if (total <= available) return widths.length

  // the control stands last, so every item that stays needs its own width and one gap before it
  let used = more
  for (let index = 0; index < widths.length; index++) {
    const next = used + gap + widths[index]!
    if (next > available) return index
    used = next
  }
  return widths.length
}
