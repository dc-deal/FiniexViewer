import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { getRecordedStreams, getRecordedWindow } from '@/api/api_client'
import { describeFailure } from '@/stores/describe_failure'
import { isAbsent } from '@/types/api/absence_types'
import type { SectionAbsence } from '@/types/api/absence_types'
import type { IndicatorSeriesEntry } from '@/types/api/indicator_series_types'

/** The most records one page asks for — the route serves up to 2,000. */
const PAGE = 2000
/**
 * How many pages one follow reads at most. The window counts a unit's state frames and every series'
 * bars together (contract 55) and cannot be asked for the series alone, so 8,000 records may be
 * mostly frames: about 11 MB at 1.4 KB a frame. The rest is read at the next follow.
 */
const PAGES = 4

/** The unit whose series are read: a session's, the only runs that serve them today. */
export interface SeriesTarget {
  runId: string
  unit: string
}

/** A stretch of time in UTC milliseconds: every record from `from` up to, not including, `to`. */
export interface SeriesSpan {
  from: number
  to: number
}

/**
 * One series grown by a later page of the same stream: the bars of both, each instant once and in
 * order of time. A page never repeats a record of another, but a read along the chart's edges can
 * meet one already held. What the series means — its title, its plots — is the run's recorded copy
 * and the same on every page, so the first one held keeps it.
 */
function merged(held: IndicatorSeriesEntry, more: IndicatorSeriesEntry): IndicatorSeriesEntry {
  const values = new Map<string, (number | null)[]>()
  for (const entry of [held, more]) {
    entry.times.forEach((time, index) => {
      values.set(time, held.plots.map(plot => entry.data[plot.id]?.[index] ?? null))
    })
  }
  const times = [...values.keys()].sort((a, b) => Date.parse(a) - Date.parse(b))
  const data = Object.fromEntries(held.plots.map((plot, at) => [plot.id, times.map(time => values.get(time)![at]!)]))
  return { ...held, times, data }
}

/**
 * What a session's drawing workers recorded for the unit on the run chart (contract 55): one entry
 * per series, merged across the pages read, the state frames that come with them dropped.
 *
 * Only the series the unit's timeline lists are drawn — their document: *"Draw only the series the
 * run's timeline lists."* They are read for the stretch whose bars the chart holds and grow with
 * it, never for the whole session: the window serves the frames beside them, some 43,000 for a
 * thirty-day session at a minute's cadence.
 */
export const useIndicatorSeriesStore = defineStore('indicator_series', () => {
  const series = shallowRef<IndicatorSeriesEntry[]>([])
  const absence = shallowRef<SectionAbsence | null>(null)
  /** Why a read failed, in words; null once a later one succeeds. */
  const error = ref<string | null>(null)
  const loading = ref(false)
  /**
   * The first instant of the stretch asked for that is not read yet, in UTC ms, where the pages of a
   * follow ran out before it: the series stand up to it. Null where everything asked for is read.
   */
  const cutAt = ref<number | null>(null)

  let target: SeriesTarget | null = null
  /** Whether the unit's timeline lists a drawing worker at all — asked once per unit. */
  let drawing = false
  /**
   * The stretches read, in UTC ms, in order and apart: only what a page actually covered. A read cut
   * at its pages, or failed, leaves its rest out, so a later follow reads it then — never a stretch
   * counted as read that was not.
   */
  let read: SeriesSpan[] = []
  /** The stretch last asked for. */
  let wanted: SeriesSpan | null = null
  /** Whether a read is on its way: a follow meanwhile only moves `wanted`, and the read picks it up. */
  let reading = false
  /** Counts the units followed, so a read that answers after the reader moved on is dropped. */
  let generation = 0

  function clear(): void {
    generation++
    target = null
    drawing = false
    read = []
    wanted = null
    reading = false
    series.value = []
    absence.value = null
    error.value = null
    cutAt.value = null
    loading.value = false
  }

  /** The stretches held in order, two that meet or overlap made one. */
  function hold(span: SeriesSpan): void {
    const all = [...read, span].filter(stretch => stretch.to > stretch.from).sort((a, b) => a.from - b.from)
    const joined: SeriesSpan[] = []
    for (const stretch of all) {
      const last = joined.at(-1)
      if (last && stretch.from <= last.to) last.to = Math.max(last.to, stretch.to)
      else joined.push({ ...stretch })
    }
    read = joined
  }

  /** The first part of the stretch asked for that no read has covered, or none. */
  function firstGap(goal: SeriesSpan): SeriesSpan | null {
    let from = goal.from
    for (const stretch of read) {
      if (stretch.to <= from) continue
      if (stretch.from > from) return { from, to: Math.min(stretch.from, goal.to) }
      from = stretch.to
      if (from >= goal.to) return null
    }
    return from < goal.to ? { from, to: goal.to } : null
  }

  /**
   * The series of a stretch, page by page up to the pages left: the instant reached — the stretch's
   * end, or where the last page left records out — and the pages it took. Null where the reader moved
   * on meanwhile.
   */
  async function readSpan(span: SeriesSpan, own: number, pages: number): Promise<{ reached: number, used: number } | null> {
    let from = span.from
    let used = 0
    while (used < pages) {
      const answer = await getRecordedWindow(target!.runId, target!.unit, {
        from: new Date(from).toISOString(), to: new Date(span.to).toISOString(), limit: PAGE,
      })
      used++
      if (own !== generation) return null
      if (isAbsent(answer)) {
        // the stream is gone or not written: nothing more to read in this stretch
        absence.value = answer
        return { reached: span.to, used }
      }
      const held = new Map(series.value.map(entry => [entry.layer, entry]))
      for (const entry of answer.indicator_series) {
        const known = held.get(entry.layer)
        held.set(entry.layer, known ? merged(known, entry) : entry)
      }
      series.value = [...held.values()]
      if (!answer.truncated || !answer.next_from) return { reached: span.to, used }
      from = Date.parse(answer.next_from)
    }
    return { reached: from, used }
  }

  /**
   * What the stretch asked for holds that no read has covered — gap by gap, oldest first, up to
   * `PAGES` pages a follow. Where the pages run out, `cutAt` says where the series stop; the next
   * follow reads on from there. A stretch that failed stays unread, to be asked again.
   */
  async function readWanted(own: number): Promise<void> {
    if (!drawing || reading || own !== generation) return
    reading = true
    loading.value = true
    let pages = PAGES
    try {
      while (own === generation && wanted) {
        const gap = firstGap(wanted)
        if (!gap) {
          cutAt.value = null
          return
        }
        if (!pages) {
          cutAt.value = gap.from
          return
        }
        const done = await readSpan(gap, own, pages)
        if (!done) return
        pages -= done.used
        hold({ from: gap.from, to: done.reached })
        error.value = null
      }
    } catch (failure) {
      if (own === generation) error.value = describeFailure(failure, 'The indicator series could not be read')
    } finally {
      if (own === generation) {
        reading = false
        loading.value = false
      }
    }
  }

  /**
   * Follows the unit on the run chart and the stretch its bars cover. A new unit reads its timeline,
   * and its series where one is listed; the same unit reads what the stretch holds that is not read
   * yet — what it gained at either edge, and what an earlier read left. Null for either clears what
   * is held.
   */
  async function follow(next: SeriesTarget | null, span: SeriesSpan | null): Promise<void> {
    if (!next || !span) {
      clear()
      return
    }
    if (!target || target.runId !== next.runId || target.unit !== next.unit) {
      clear()
      target = next
      wanted = { ...span }
      const own = generation
      loading.value = true
      try {
        const timeline = await getRecordedStreams(next.runId, next.unit)
        if (own !== generation) return
        if (isAbsent(timeline)) {
          absence.value = timeline
          return
        }
        drawing = timeline.streams.some(stream => stream.stream_kind === 'indicator_series')
      } catch (failure) {
        if (own === generation) error.value = describeFailure(failure, 'The indicator series could not be read')
        return
      } finally {
        if (own === generation) loading.value = false
      }
      await readWanted(own)
      return
    }
    wanted = { ...span }
    await readWanted(generation)
  }

  return { series, absence, error, loading, cutAt, follow, clear }
})
