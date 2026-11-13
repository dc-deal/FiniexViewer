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
 * How many pages one read takes at most. The window counts a unit's state frames and every series'
 * bars together (contract 55) and cannot be asked for the series alone, so 8,000 records may be
 * mostly frames: about 11 MB at 1.4 KB a frame.
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
  const error = ref<string | null>(null)
  const loading = ref(false)
  /** Where the last read stopped at its pages, in UTC ms: the series reach no further. Null where none did. */
  const cutAt = ref<number | null>(null)

  let target: SeriesTarget | null = null
  /** Whether the unit's timeline lists a drawing worker at all — asked once per unit. */
  let drawing = false
  /** What has been read, in UTC ms. */
  let read: SeriesSpan | null = null
  /** The stretch last asked for — read once the read on its way is done, where it grew meanwhile. */
  let wanted: SeriesSpan | null = null
  /** Counts the units followed, so a read that answers after the reader moved on is dropped. */
  let generation = 0

  function clear(): void {
    generation++
    target = null
    drawing = false
    read = null
    wanted = null
    series.value = []
    absence.value = null
    error.value = null
    cutAt.value = null
    loading.value = false
  }

  /** Every series of [from, to), page by page; false where the reader moved on meanwhile. */
  async function readSpan(span: SeriesSpan, own: number): Promise<boolean> {
    let from = span.from
    for (let page = 0; page < PAGES; page++) {
      const answer = await getRecordedWindow(target!.runId, target!.unit, {
        from: new Date(from).toISOString(), to: new Date(span.to).toISOString(), limit: PAGE,
      })
      if (own !== generation) return false
      if (isAbsent(answer)) {
        absence.value = answer
        return true
      }
      const held = new Map(series.value.map(entry => [entry.layer, entry]))
      for (const entry of answer.indicator_series) {
        const known = held.get(entry.layer)
        held.set(entry.layer, known ? merged(known, entry) : entry)
      }
      series.value = [...held.values()]
      if (!answer.truncated || !answer.next_from) return true
      from = Date.parse(answer.next_from)
    }
    cutAt.value = from
    return true
  }

  /**
   * Follows the unit on the run chart and the stretch its bars cover. A new unit reads its timeline,
   * and its series where one is listed; the same unit reads only what the stretch gained at either
   * edge. Null for either clears what is held.
   */
  async function follow(next: SeriesTarget | null, span: SeriesSpan | null): Promise<void> {
    if (!next || !span) {
      clear()
      return
    }
    wanted = { ...span }
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
        if (!drawing) return
        if (await readSpan(span, own)) read = { ...span }
      } catch (failure) {
        if (own === generation) error.value = describeFailure(failure, 'The indicator series could not be read')
      } finally {
        if (own === generation) loading.value = false
      }
      if (own === generation) await readWanted(own)
      return
    }
    if (!loading.value) await readWanted(generation)
  }

  /** What the stretch asked for gained at either edge beyond what is read — read until nothing is missing. */
  async function readWanted(own: number): Promise<void> {
    while (drawing && read && wanted && own === generation) {
      const goal: SeriesSpan = { ...wanted }
      const missing: SeriesSpan[] = []
      if (goal.from < read.from) missing.push({ from: goal.from, to: read.from })
      if (goal.to > read.to) missing.push({ from: read.to, to: goal.to })
      if (!missing.length) return
      loading.value = true
      cutAt.value = null
      try {
        for (const stretch of missing) {
          if (!await readSpan(stretch, own)) return
        }
        read = { from: Math.min(read.from, goal.from), to: Math.max(read.to, goal.to) }
      } catch (failure) {
        if (own === generation) error.value = describeFailure(failure, 'The indicator series could not be read')
        return
      } finally {
        if (own === generation) loading.value = false
      }
    }
  }

  return { series, absence, error, loading, cutAt, follow, clear }
})
