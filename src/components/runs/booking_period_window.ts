import type { TimeWindow } from '@/types/timeline_types'

/**
 * The detail window of a long booking-period timeline (viewer#48): which calendar stretch a preset
 * names, how a window stays inside its scale, and which preset a timeline opens on. Pure, in UTC —
 * the periods' stamps are the canonical clock, and a calendar here is that clock's calendar.
 */

export type WindowPreset = 'year' | 'quarter' | 'month' | 'week'

/** Longest first: the order the presets are offered in, and tried in for a timeline's first window. */
export const WINDOW_PRESETS: readonly WindowPreset[] = ['year', 'quarter', 'month', 'week']

const DAY = 24 * 60 * 60 * 1000

/** What a preset spans at its shortest — a scale shorter than that is offered no such preset. */
const SHORTEST: Record<WindowPreset, number> = {
  year: 365 * DAY,
  quarter: 90 * DAY,
  month: 28 * DAY,
  week: 7 * DAY,
}

/**
 * The calendar stretch of a preset an instant falls in: its year, its quarter (from January, April,
 * July or October), its month, or its week from Monday — the units a planning tool's timescale
 * zooms through, so a window reads as `Q2 2021` rather than as ninety days from somewhere.
 *
 * @param preset Which calendar unit.
 * @param at An instant inside it, in milliseconds.
 */
export function presetWindow(preset: WindowPreset, at: number): TimeWindow {
  const day = new Date(at)
  const year = day.getUTCFullYear()
  const month = day.getUTCMonth()
  if (preset === 'year') return { from: Date.UTC(year, 0, 1), to: Date.UTC(year + 1, 0, 1) }
  if (preset === 'quarter') {
    const first = month - (month % 3)
    return { from: Date.UTC(year, first, 1), to: Date.UTC(year, first + 3, 1) }
  }
  if (preset === 'month') return { from: Date.UTC(year, month, 1), to: Date.UTC(year, month + 1, 1) }
  const midnight = Date.UTC(year, month, day.getUTCDate())
  // Sunday is 0: Monday starts the week, as the ISO calendar counts it
  const monday = midnight - ((day.getUTCDay() + 6) % 7) * DAY
  return { from: monday, to: monday + 7 * DAY }
}

/**
 * A preset's stretch around an instant, cut at the scale's edges: the fourth quarter of a run that
 * ends on the 31st at noon is that quarter up to noon, and still the fourth quarter.
 *
 * @param preset Which calendar unit.
 * @param at An instant inside the scale.
 * @param scale The stretch the timeline covers.
 */
export function presetIn(preset: WindowPreset, at: number, scale: TimeWindow): TimeWindow {
  const named = presetWindow(preset, at)
  return { from: Math.max(named.from, scale.from), to: Math.min(named.to, scale.to) }
}

/**
 * A window moved inside the scale without changing its length; one as long as the scale or longer is
 * the scale itself. A window the reader set is kept as long as it was, so it slides back at an edge
 * rather than shrinking.
 *
 * @param window The window as asked for.
 * @param scale The stretch the timeline covers.
 */
export function clampWindow(window: TimeWindow, scale: TimeWindow): TimeWindow {
  const length = window.to - window.from
  if (length >= scale.to - scale.from) return { ...scale }
  if (window.from < scale.from) return { from: scale.from, to: scale.from + length }
  if (window.to > scale.to) return { from: scale.to - length, to: scale.to }
  return { ...window }
}

/**
 * The preset a window is exactly, inside the scale — the one its control then shows as chosen. A
 * window dragged free is none. Only an OFFERED preset counts: cut at the scale's edges, a year can
 * be the very stretch of a quarter (a run from October to the year's end), and naming the year then
 * marked no control and titled the detail with a year nobody chose (seen 2026-11-19).
 *
 * @param window The window on show.
 * @param scale The stretch the timeline covers.
 */
export function presetOf(window: TimeWindow, scale: TimeWindow): WindowPreset | null {
  return offeredPresets(scale).find(preset => {
    const named = presetIn(preset, window.from, scale)
    return named.from === window.from && named.to === window.to
  }) ?? null
}

/**
 * The presets worth offering: those shorter than the scale. A window as long as the whole would draw
 * the overview a second time.
 *
 * @param scale The stretch the timeline covers.
 */
export function offeredPresets(scale: TimeWindow): WindowPreset[] {
  return WINDOW_PRESETS.filter(preset => SHORTEST[preset] < scale.to - scale.from)
}

/**
 * The longest offered preset whose busiest lane, from the scale's start, draws its spans apart at
 * this width: each span given `apart` pixels, the room a bar needs beside its neighbour's ring. Where
 * none fits, the shortest offered.
 *
 * @param lanes The spans of each lane.
 * @param scale The stretch the timeline covers.
 * @param width The plot's width in pixels; 0 before it was measured.
 * @param apart The pixels a span needs to stand apart.
 */
export function openingPreset(lanes: TimeWindow[][], scale: TimeWindow, width: number, apart: number): WindowPreset | null {
  const offered = offeredPresets(scale)
  if (!offered.length) return null
  const fits = (preset: WindowPreset): boolean => {
    const window = presetIn(preset, scale.from, scale)
    const busiest = Math.max(0, ...lanes.map(spans =>
      spans.filter(span => span.to > window.from && span.from < window.to).length))
    return busiest * apart <= width
  }
  return offered.find(fits) ?? offered[offered.length - 1]!
}
