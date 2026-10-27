import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { getRecordedStreams, getRecordedWindow } from '@/api/api_client'
import { describeFailure } from '@/stores/describe_failure'
import { isAbsent } from '@/types/api/absence_types'
import type { SectionAbsence } from '@/types/api/absence_types'
import type { RecordedStateFrame, RecordedStream } from '@/types/api/state_frame_types'

/** How many frames one window asks for — about 1.4 MB of JSON; the route serves up to 2,000. */
export const PAGE = 1000
/** How many frames are held at most: two pages, the one being read and the one beside it. */
const HELD = 2 * PAGE
/** The speeds a session's frames are played at, in frames per second. */
export const SPEEDS = [1, 2, 5, 10, 25] as const

/** One unit's frames over time, as far as they are held. */
export interface UnitPlayer {
  runId: string
  unit: string
  /** The unit's state-frame stream on its timeline; null until asked, or where none is recorded. */
  stream: RecordedStream | null
  /** `current` · `stopped` · `ended`, or null — the timeline's own verdict. */
  recording: string | null
  absence: SectionAbsence | null
  error: string | null
  loading: boolean
  /** A contiguous stretch of the stream, oldest first, by `record_no`. */
  frames: RecordedStateFrame[]
  /** The frame on show by its `record_no`; null follows the newest. */
  cursor: number | null
  playing: boolean
  speed: number
}

/**
 * A session's recorded frames, played: a timeline per unit, a stretch of its frames held around
 * the one on show, and the frame on show itself (viewer half of testingide#580).
 *
 * A thirty-day session at a minute's cadence records some 43,000 frames — about 60 MB — so they are
 * read a window at a time and never all at once. Frames are told apart by `record_no`, the key the
 * route declares: two frames can share an instant. Times are `frame_time`, the session's own clock.
 */
export const useFramePlayerStore = defineStore('frame_player', () => {
  const players = reactive(new Map<string, UnitPlayer>())
  const timers = new Map<string, ReturnType<typeof setInterval>>()

  function playerOf(unit: string): UnitPlayer | null {
    return players.get(unit) ?? null
  }

  /** Forgets every unit, and stops what plays — another run was chosen. */
  function reset(): void {
    for (const unit of [...timers.keys()]) stop(unit)
    players.clear()
  }

  function ms(instant: string): number {
    return Date.parse(instant)
  }

  /** The frames of [from, to), every page of it — a page never ends inside a millisecond. */
  async function readWindow(player: UnitPlayer, from: string | undefined, to: string | undefined): Promise<RecordedStateFrame[] | null> {
    const frames: RecordedStateFrame[] = []
    let next = from
    for (let page = 0; page < 4; page++) {
      const answer = await getRecordedWindow(player.runId, player.unit, {
        ...(next ? { from: next } : {}), ...(to ? { to } : {}), limit: PAGE,
      })
      if (isAbsent(answer)) {
        player.absence = answer
        return null
      }
      frames.push(...answer.state_frames)
      if (!answer.truncated || !answer.next_from || frames.length >= HELD) break
      next = answer.next_from
    }
    return frames
  }

  /** Holds `frames`, merged with what is held where they touch, and keeps no more than two pages. */
  function hold(player: UnitPlayer, frames: RecordedStateFrame[], keepNear: number | null): void {
    const byNo = new Map(player.frames.map(frame => [frame.record_no, frame]))
    const touching = player.frames.length && frames.length
      && frames[0]!.record_no <= player.frames.at(-1)!.record_no + 1
      && frames.at(-1)!.record_no >= player.frames[0]!.record_no - 1
    if (!touching) byNo.clear()
    for (const frame of frames) byNo.set(frame.record_no, frame)
    let held = [...byNo.values()].sort((a, b) => a.record_no - b.record_no)
    if (held.length > HELD) {
      const at = keepNear === null ? held.length - 1 : Math.max(0, held.findIndex(frame => frame.record_no >= keepNear))
      const start = Math.min(Math.max(0, at - PAGE), held.length - HELD)
      held = held.slice(start, start + HELD)
    }
    player.frames = held
  }

  /** The stretch that ends with the newest frame — where a player opens, and follows from. */
  async function readNewest(player: UnitPlayer): Promise<void> {
    const stream = player.stream
    if (!stream?.last_record_time) return
    const from = new Date(ms(stream.last_record_time) - PAGE * stream.cadence_s * 1000).toISOString()
    const frames = await readWindow(player, from, undefined)
    if (frames) hold(player, frames, null)
  }

  /** Opens a unit's player: its timeline, and the frames that end with the newest. Once per unit and run. */
  async function open(runId: string, unit: string): Promise<void> {
    const known = players.get(unit)
    if (known && known.runId === runId) return
    const player: UnitPlayer = reactive({
      runId, unit, stream: null, recording: null, absence: null, error: null, loading: true,
      frames: [], cursor: null, playing: false, speed: SPEEDS[2],
    })
    players.set(unit, player)
    try {
      const timeline = await getRecordedStreams(runId, unit)
      if (isAbsent(timeline)) {
        player.absence = timeline
        return
      }
      player.recording = timeline.recording
      player.stream = timeline.streams.find(stream => stream.stream_kind === 'state_frames') ?? null
      await readNewest(player)
    } catch (failure) {
      player.error = describeFailure(failure, 'The recorded frames could not be read')
    } finally {
      player.loading = false
    }
  }

  /** The frame on show: the one under the cursor, or the newest held where the player follows. */
  function frameOf(player: UnitPlayer): RecordedStateFrame | null {
    if (player.cursor === null) return player.frames.at(-1) ?? null
    return player.frames.find(frame => frame.record_no === player.cursor) ?? null
  }

  /** Moves to the frame in force at an instant — the last one at or before it — reading it in where it is not held. */
  async function seek(unit: string, at: number): Promise<void> {
    const player = playerOf(unit)
    const stream = player?.stream
    if (!player || !stream?.first_record_time) return
    const first = player.frames[0]
    const last = player.frames.at(-1)
    if (!first || !last || at < ms(first.frame_time) || at > ms(last.frame_time)) {
      const from = new Date(Math.max(ms(stream.first_record_time), at - (PAGE / 2) * stream.cadence_s * 1000)).toISOString()
      player.loading = true
      try {
        const frames = await readWindow(player, from, undefined)
        // what is trimmed to two pages is trimmed around the frame sought, not the newest
        if (frames) hold(player, frames, inForce(frames, at)?.record_no ?? null)
      } finally {
        player.loading = false
      }
    }
    player.cursor = inForce(player.frames, at)?.record_no ?? null
  }

  /** The frame in force at an instant: the last at or before it, or the first where all lie after it. */
  function inForce(frames: RecordedStateFrame[], at: number): RecordedStateFrame | undefined {
    return frames.filter(frame => ms(frame.frame_time) <= at).at(-1) ?? frames[0]
  }

  /** One frame on or back, reading the next stretch in where the held one ends. False at either end of the stream. */
  async function step(unit: string, by: 1 | -1): Promise<boolean> {
    const player = playerOf(unit)
    const stream = player?.stream
    if (!player || !stream) return false
    const current = frameOf(player)
    if (!current) return false
    const target = current.record_no + by
    if (target < 1 || target > stream.record_count) return false
    if (!player.frames.some(frame => frame.record_no === target)) {
      const edge = by > 0 ? player.frames.at(-1)! : player.frames[0]!
      const frames = by > 0
        ? await readWindow(player, new Date(ms(edge.frame_time) + 1).toISOString(), undefined)
        : await readWindow(player, new Date(ms(edge.frame_time) - PAGE * stream.cadence_s * 1000).toISOString(), edge.frame_time)
      if (frames) hold(player, frames, target)
      if (!player.frames.some(frame => frame.record_no === target)) return false
    }
    player.cursor = target === stream.record_count && player.recording === 'current' ? null : target
    return true
  }

  /** To the first frame of the stream. */
  async function first(unit: string): Promise<void> {
    const stream = playerOf(unit)?.stream
    if (stream?.first_record_time) await seek(unit, ms(stream.first_record_time))
  }

  /** Back to the newest frame, following it from there. */
  async function latest(unit: string): Promise<void> {
    const player = playerOf(unit)
    if (!player) return
    stop(unit)
    const newest = player.frames.at(-1)
    if (!newest || newest.record_no < (player.stream?.record_count ?? 0)) await readNewest(player)
    player.cursor = null
  }

  /** Plays on from the frame on show, a frame at a time at the chosen speed, and stops at the stream's end. */
  function play(unit: string): void {
    const player = playerOf(unit)
    if (!player || player.playing) return
    if (player.cursor === null) player.cursor = frameOf(player)?.record_no ?? null
    player.playing = true
    let busy = false
    timers.set(unit, setInterval(() => {
      if (busy) return
      busy = true
      void step(unit, 1).then(moved => {
        busy = false
        if (!moved) stop(unit)
      })
    }, 1000 / player.speed))
  }

  function stop(unit: string): void {
    const timer = timers.get(unit)
    if (timer !== undefined) clearInterval(timer)
    timers.delete(unit)
    const player = playerOf(unit)
    if (player) player.playing = false
  }

  /** The speed, in frames per second; a player that plays goes on at the new one. */
  function setSpeed(unit: string, speed: number): void {
    const player = playerOf(unit)
    if (!player) return
    player.speed = speed
    if (player.playing) {
      stop(unit)
      play(unit)
    }
  }

  return { players, playerOf, frameOf, open, seek, step, first, latest, play, stop, setSpeed, reset }
})
