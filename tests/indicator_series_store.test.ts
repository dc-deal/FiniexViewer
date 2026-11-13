import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { useIndicatorSeriesStore } from '@/stores/indicator_series_store'
import * as apiClient from '@/api/api_client'
import type { IndicatorSeriesEntry } from '@/types/api/indicator_series_types'
import type { RecordedStreams, RecordedWindow } from '@/types/api/state_frame_types'
import windowFixture from './fixtures/recorded_window_series.json'
import streamsFixture from './fixtures/recorded_streams_series.json'

vi.mock('@/api/api_client', () => ({
  getRecordedStreams: vi.fn(),
  getRecordedWindow: vi.fn(),
}))

/**
 * A session's drawing workers, read for the unit on the chart. The window route is replaced by one
 * that cuts its pages the way its document says since contract 55 — every stream of the unit merged
 * by time, at most `limit` records, `next_from` where it cut — over the captured page's frames and
 * series, so the shape stays the server's. It serves at most `pageSize` records, as a route may.
 */
const CAPTURED = windowFixture as RecordedWindow
const TIMELINE = streamsFixture as RecordedStreams
const RUN = CAPTURED.run_id
const UNIT = CAPTURED.unit_name
const FROM = Date.parse('2026-01-25T00:00:00Z')
const TO = Date.parse('2026-01-26T00:00:00Z')

interface Record { time: number, layer: string | null, index: number }

const RECORDS: Record[] = [
  ...CAPTURED.state_frames.map((frame, index) => ({ time: Date.parse(frame.frame_time), layer: null, index })),
  ...CAPTURED.indicator_series.flatMap(entry =>
    entry.times.map((time, index) => ({ time: Date.parse(time), layer: entry.layer, index }))),
].sort((a, b) => a.time - b.time)

let pageSize = 1000
let timeline: RecordedStreams = TIMELINE

function served(ask: { from?: string, to?: string, limit?: number }): RecordedWindow {
  const from = ask.from ? Date.parse(ask.from) : -Infinity
  const to = ask.to ? Date.parse(ask.to) : Infinity
  const matched = RECORDS.filter(record => record.time >= from && record.time < to)
  // a page never ends inside a millisecond: one that would is served to that millisecond's end
  let size = Math.min(ask.limit ?? 2000, pageSize)
  while (size < matched.length && matched[size]!.time === matched[size - 1]!.time) size++
  const page = matched.slice(0, size)
  const truncated = matched.length > page.length
  const entries: IndicatorSeriesEntry[] = CAPTURED.indicator_series.flatMap(entry => {
    const own = page.filter(record => record.layer === entry.layer)
    if (!own.length) return []
    return [{
      ...entry,
      times: own.map(record => entry.times[record.index]!),
      data: Object.fromEntries(entry.plots.map(plot => [plot.id, own.map(record => entry.data[plot.id]![record.index]!)])),
    }]
  })
  return {
    ...CAPTURED,
    matched: matched.length, returned: page.length, limit: size, truncated,
    next_from: truncated ? new Date(matched[size]!.time).toISOString() : null,
    state_frames: page.flatMap(record => record.layer === null ? [CAPTURED.state_frames[record.index]!] : []),
    indicator_series: entries,
  }
}

function asked(): { from: number, to: number }[] {
  return vi.mocked(apiClient.getRecordedWindow).mock.calls.map(([, , ask]) => ({
    from: Date.parse(ask.from!), to: Date.parse(ask.to!),
  }))
}

beforeEach(() => {
  setActivePinia(createPinia())
  pageSize = 1000
  timeline = TIMELINE
  vi.mocked(apiClient.getRecordedStreams).mockReset().mockImplementation(async () => timeline)
  vi.mocked(apiClient.getRecordedWindow).mockReset().mockImplementation(async (_run, _unit, ask) => served(ask))
})

describe('indicator series store', () => {
  it('reads every series of the stretch across its pages, and leaves the frames behind', async () => {
    pageSize = 12
    const store = useIndicatorSeriesStore()
    await store.follow({ runId: RUN, unit: UNIT }, { from: FROM, to: TO })
    expect(vi.mocked(apiClient.getRecordedWindow).mock.calls.length).toBeGreaterThan(1)
    expect(store.series.map(entry => entry.layer)).toEqual(CAPTURED.indicator_series.map(entry => entry.layer))
    for (const entry of store.series) {
      const own = CAPTURED.indicator_series.find(captured => captured.layer === entry.layer)!
      expect(entry.times).toEqual(own.times)
      expect(entry.data).toEqual(own.data)
    }
    expect(store.cutAt).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('stops at its pages and says where the series end', async () => {
    pageSize = 3
    const store = useIndicatorSeriesStore()
    await store.follow({ runId: RUN, unit: UNIT }, { from: FROM, to: TO })
    expect(vi.mocked(apiClient.getRecordedWindow)).toHaveBeenCalledTimes(4)
    expect(store.cutAt).not.toBeNull()
    const read = store.series.flatMap(entry => entry.times.map(time => Date.parse(time)))
    expect(read.length).toBeGreaterThan(0)
    expect(read.every(time => time < store.cutAt!)).toBe(true)
  })

  it('reads no window for a unit whose timeline lists no drawing worker', async () => {
    timeline = { ...TIMELINE, streams: TIMELINE.streams.filter(stream => stream.stream_kind !== 'indicator_series') }
    const store = useIndicatorSeriesStore()
    await store.follow({ runId: RUN, unit: UNIT }, { from: FROM, to: TO })
    expect(apiClient.getRecordedWindow).not.toHaveBeenCalled()
    expect(store.series).toEqual([])
  })

  it('holds an absent stream as an absence, never as an error', async () => {
    vi.mocked(apiClient.getRecordedStreams).mockResolvedValue({ absent: true, cause: 'streams_not_recorded', detail: '' })
    const store = useIndicatorSeriesStore()
    await store.follow({ runId: RUN, unit: UNIT }, { from: FROM, to: TO })
    expect(store.absence?.cause).toBe('streams_not_recorded')
    expect(store.error).toBeNull()
    expect(apiClient.getRecordedWindow).not.toHaveBeenCalled()
  })

  it('reads only what a wider stretch gained at its edges', async () => {
    const store = useIndicatorSeriesStore()
    const middle = Date.parse('2026-01-25T02:30:00Z')
    await store.follow({ runId: RUN, unit: UNIT }, { from: middle, to: TO })
    const before = store.series.reduce((count, entry) => count + entry.times.length, 0)
    await store.follow({ runId: RUN, unit: UNIT }, { from: FROM, to: TO })
    expect(asked()).toEqual([{ from: middle, to: TO }, { from: FROM, to: middle }])
    expect(store.series.reduce((count, entry) => count + entry.times.length, 0)).toBeGreaterThan(before)
    // the series stay in order of time, each instant once
    for (const entry of store.series) {
      const times = entry.times.map(time => Date.parse(time))
      expect(times).toEqual([...new Set(times)].sort((a, b) => a - b))
    }
    // the same stretch again reads nothing
    await store.follow({ runId: RUN, unit: UNIT }, { from: FROM, to: TO })
    expect(asked()).toHaveLength(2)
  })

  /** A wider stretch asked for while the timeline was on its way is read whole, once. */
  it('reads the stretch that grew while the first read was on its way', async () => {
    const store = useIndicatorSeriesStore()
    const middle = Date.parse('2026-01-25T02:30:00Z')
    const first = store.follow({ runId: RUN, unit: UNIT }, { from: middle, to: TO })
    void store.follow({ runId: RUN, unit: UNIT }, { from: FROM, to: TO })
    await first
    await flushPromises()
    expect(asked()).toEqual([{ from: FROM, to: TO }])
  })

  /**
   * A read cut at its pages counts only what its pages covered: the next follow reads on from where
   * it stopped, never past a stretch it did not read, and the notice stands until all is read.
   */
  it('reads on from where its pages ran out at the next follow, and says so until all is read', async () => {
    pageSize = 3
    const store = useIndicatorSeriesStore()
    await store.follow({ runId: RUN, unit: UNIT }, { from: FROM, to: TO })
    const cut = store.cutAt!
    expect(cut).not.toBeNull()
    vi.mocked(apiClient.getRecordedWindow).mockClear()
    await store.follow({ runId: RUN, unit: UNIT }, { from: FROM, to: TO })
    expect(asked()[0]!.from).toBe(cut)
    for (let round = 0; round < 10 && store.cutAt !== null; round++) {
      await store.follow({ runId: RUN, unit: UNIT }, { from: FROM, to: TO })
    }
    expect(store.cutAt).toBeNull()
    for (const entry of store.series) {
      const own = CAPTURED.indicator_series.find(captured => captured.layer === entry.layer)!
      expect(entry.times).toEqual(own.times)
    }
  })

  /** A stretch that failed is not counted as read: it is said, and read again at the next follow. */
  it('says why a read failed, and reads the stretch again at the next follow', async () => {
    const store = useIndicatorSeriesStore()
    vi.mocked(apiClient.getRecordedWindow).mockRejectedValueOnce(new Error('network down'))
    await store.follow({ runId: RUN, unit: UNIT }, { from: FROM, to: TO })
    expect(store.error).toContain('The indicator series could not be read')
    expect(store.series).toEqual([])
    await store.follow({ runId: RUN, unit: UNIT }, { from: FROM, to: TO })
    expect(store.error).toBeNull()
    expect(store.series.map(entry => entry.layer)).toEqual(CAPTURED.indicator_series.map(entry => entry.layer))
  })

  it('forgets a unit the reader left, and drops what it answered late', async () => {
    const store = useIndicatorSeriesStore()
    let release: (() => void) | null = null
    vi.mocked(apiClient.getRecordedStreams).mockImplementationOnce(() => new Promise(done => { release = () => done(timeline) }))
    const late = store.follow({ runId: RUN, unit: UNIT }, { from: FROM, to: TO })
    await store.follow(null, null)
    release!()
    await late
    expect(store.series).toEqual([])
    expect(apiClient.getRecordedWindow).not.toHaveBeenCalled()
  })
})
