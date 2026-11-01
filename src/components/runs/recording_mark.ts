import { t } from '@/translate'

export interface RecordingMark {
  glyph: string
  word: string
  title: string
}

/**
 * The `recording` verdict as the Outcome cell says it, for a run the backend has not graded yet —
 * the one field that tells a running session from one that died before its report. The words come
 * from their state-frames document. A value they add later is shown as itself.
 */
const RECORDING: Record<string, RecordingMark> = {
  current: {
    glyph: '●',
    word: t('recording'),
    title: t('The session is recording its state frames: it is running'),
  },
  stopped: {
    glyph: '⚠',
    word: t('recording stopped'),
    title: t('Its state frames stopped without an end: the session hangs or its process died — the Activities panel tells which'),
  },
  ended: {
    glyph: '■',
    word: t('ended'),
    title: t('Its last state frame is the one written at its end; the outcome follows with its report, unless the process died in between'),
  },
}

export function recordingOf(verdict: string): RecordingMark {
  return RECORDING[verdict] ?? { glyph: '', word: verdict, title: '' }
}
