import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'
import type { SectionAbsence } from '@/types/api/absence_types'
import type { RecordedStateFrame, RecordedStream } from '@/types/api/state_frame_types'

/** One unit's player as a panel reads it. */
export interface FramePlayerView {
  /** The unit's state-frame stream on its timeline; null until read, or where none is recorded. */
  stream: RecordedStream | null
  absence: SectionAbsence | null
  error: string | null
  loading: boolean
  /** The frame on show; null until one is read. */
  frame: RecordedStateFrame | null
  /** On the newest frame, and staying there as newer ones arrive. */
  following: boolean
  playing: boolean
  /** Frames per second. */
  speed: number
}

/**
 * A session's frames over time, played a frame at a time — asked for one UNIT at a time.
 *
 * Ambient for the reason the order steps are: the panel stays ignorant of the workspace, and the
 * host owns when a window is read. A thirty-day session holds tens of thousands of frames, so the
 * request a reader causes is the stretch they look at.
 */
export interface FramePlayer {
  /** The player of a unit, or null where the host offers none. */
  view: (unit: string) => FramePlayerView | null
  /** Opens a unit's player on its newest frame. Idempotent for the run on show. */
  open: (unit: string) => void
  /** To the frame in force at an instant, in UTC milliseconds of the session's own clock. */
  seek: (unit: string, at: number) => void
  step: (unit: string, by: 1 | -1) => void
  first: (unit: string) => void
  latest: (unit: string) => void
  /** Plays from the frame on show, or stops where it plays. */
  toggle: (unit: string) => void
  setSpeed: (unit: string, speed: number) => void
}

const FRAME_PLAYER: InjectionKey<FramePlayer> = Symbol('frame-player')

export function provideFramePlayer(player: FramePlayer): void {
  provide(FRAME_PLAYER, player)
}

const NONE: FramePlayer = {
  view: () => null,
  open: () => {},
  seek: () => {},
  step: () => {},
  first: () => {},
  latest: () => {},
  toggle: () => {},
  setSpeed: () => {},
}

/** The player in force, or one that offers nothing where no host supplied it — the latest frame alone. */
export function useFramePlayer(): FramePlayer {
  return inject(FRAME_PLAYER, NONE)
}
