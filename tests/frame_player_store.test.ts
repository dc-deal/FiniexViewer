import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { useFramePlayerStore, PAGE } from '@/stores/frame_player_store'
import * as apiClient from '@/api/api_client'
import type { RecordedStateFrame, RecordedStreams, RecordedWindow } from '@/types/api/state_frame_types'
import windowFixture from './fixtures/recorded_window.json'
import streamsFixture from './fixtures/recorded_streams.json'

vi.mock('@/api/api_client', () => ({
  getRecordedStreams: vi.fn(),
  getRecordedWindow: vi.fn(),
}))

/**
 * A session's frames, played. The route is replaced by one that cuts its pages the way its document
 * says — [from, to), oldest first, at most `limit`, `next_from` where it cut — over a stream of
 * frames a minute apart, built from a captured frame so the shape stays the server's.
 */
const BASE = (windowFixture as RecordedWindow).state_frames[0]!
const START = Date.parse('2026-01-25T00:00:00Z')
const RUN = 'run_a'
const UNIT = 'state_frames_test'

let stream: RecordedStateFrame[] = []
let recording: string | null = 'ended'

function streamOf(count: number): RecordedStateFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    ...BASE, record_no: index + 1, frame_time: new Date(START + index * 60_000).toISOString(),
  }))
}

function timeline(): RecordedStreams {
  const base = streamsFixture as RecordedStreams
  return {
    ...base,
    recording,
    streams: [{
      ...base.streams[0]!,
      record_count: stream.length,
      first_record_time: stream[0]?.frame_time ?? null,
      last_record_time: stream.at(-1)?.frame_time ?? null,
      cadence_s: 60,
    }],
  }
}

function windowOf(ask: { from?: string, to?: string, limit?: number }): RecordedWindow {
  const from = ask.from ? Date.parse(ask.from) : -Infinity
  const to = ask.to ? Date.parse(ask.to) : Infinity
  const matched = stream.filter(frame => Date.parse(frame.frame_time) >= from && Date.parse(frame.frame_time) < to)
  const limit = ask.limit ?? 2000
  const page = matched.slice(0, limit)
  const truncated = matched.length > page.length
  return {
    ...(windowFixture as RecordedWindow),
    window: { from: ask.from ?? null, to: ask.to ?? null },
    matched: matched.length, returned: page.length, limit, truncated,
    next_from: truncated ? matched[limit]!.frame_time : null,
    state_frames: page,
  }
}

async function opened(count: number) {
  stream = streamOf(count)
  const store = useFramePlayerStore()
  await store.open(RUN, UNIT)
  return { store, player: store.playerOf(UNIT)! }
}

describe('useFramePlayerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    recording = 'ended'
    vi.mocked(apiClient.getRecordedStreams).mockImplementation(async () => timeline())
    vi.mocked(apiClient.getRecordedWindow).mockImplementation(async (_run, _unit, ask) => windowOf(ask))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** It opens where the latest frame is, and holds the stretch that ends there — never the whole stream. */
  it('opens on the newest frame, holding the stretch that ends with it', async () => {
    const { store, player } = await opened(2500)
    expect(player.stream?.record_count).toBe(2500)
    expect(player.cursor).toBeNull()
    expect(store.frameOf(player)?.record_no).toBe(2500)
    expect(player.frames.length).toBeLessThanOrEqual(2 * PAGE)
    expect(player.frames[0]!.record_no).toBeGreaterThan(1)
  })

  /** A backtest records nothing over time: an absence in the backend's words, and no frames. */
  it('says why a unit has no frames over time', async () => {
    vi.mocked(apiClient.getRecordedStreams).mockResolvedValue(
      { absent: true, cause: 'streams_not_recorded', detail: 'This run records no stream over time' })
    const store = useFramePlayerStore()
    await store.open(RUN, UNIT)
    const player = store.playerOf(UNIT)!
    expect(player.absence?.cause).toBe('streams_not_recorded')
    expect(player.frames).toEqual([])
    expect(store.frameOf(player)).toBeNull()
  })

  /** An instant shows the frame in force then — the last at or before it — read in where it is not held. */
  it('moves to the frame in force at an instant, held or not', async () => {
    const { store, player } = await opened(2500)
    await store.seek(UNIT, START + 2400 * 60_000 + 30_000)
    expect(store.frameOf(player)?.record_no).toBe(2401)
    const asked = vi.mocked(apiClient.getRecordedWindow).mock.calls.length
    await store.seek(UNIT, START + 10 * 60_000)
    expect(vi.mocked(apiClient.getRecordedWindow).mock.calls.length).toBeGreaterThan(asked)
    expect(store.frameOf(player)?.record_no).toBe(11)
  })

  /** A step past the held stretch reads the next one in; at either end of the stream it stays. */
  it('steps a frame at a time across what is held, and no further than either end', async () => {
    const { store, player } = await opened(2500)
    const firstHeld = player.frames[0]!.record_no
    await store.seek(UNIT, Date.parse(player.frames[0]!.frame_time))
    expect(await store.step(UNIT, -1)).toBe(true)
    expect(store.frameOf(player)?.record_no).toBe(firstHeld - 1)
    await store.first(UNIT)
    expect(store.frameOf(player)?.record_no).toBe(1)
    expect(await store.step(UNIT, -1)).toBe(false)
    await store.latest(UNIT)
    expect(await store.step(UNIT, 1)).toBe(false)
  })

  /** Played, it moves a frame per tick at its speed and stops at the end of an ended session. */
  it('plays on from the frame on show and stops at the stream\'s end', async () => {
    vi.useFakeTimers()
    const { store, player } = await opened(50)
    await store.seek(UNIT, START + 46 * 60_000)
    store.setSpeed(UNIT, 10)
    store.play(UNIT)
    expect(player.playing).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(store.frameOf(player)?.record_no).toBe(50)
    expect(player.playing).toBe(false)
  })

  /** Reaching the newest frame of a session that still records follows it. */
  it('follows the newest frame once a step reaches it while the session records', async () => {
    recording = 'current'
    const { store, player } = await opened(30)
    await store.seek(UNIT, START + 28 * 60_000)
    expect(player.cursor).toBe(29)
    await store.step(UNIT, 1)
    expect(player.cursor).toBeNull()
  })

  /** Another run chosen: every unit forgotten, nothing left playing. */
  it('forgets every unit and stops what plays', async () => {
    vi.useFakeTimers()
    const { store } = await opened(30)
    await store.seek(UNIT, START)
    store.play(UNIT)
    store.reset()
    expect(store.playerOf(UNIT)).toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()
    expect(store.playerOf(UNIT)).toBeNull()
  })
})
