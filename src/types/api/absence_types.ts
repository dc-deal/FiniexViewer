/**
 * A report section that is not there, and WHY.
 *
 * Until contract 5 every missing section answered `run_not_found`, so an absence carried no
 * information and this client threw it away: a 404 became `null` and a panel simply did not
 * appear. Four different situations rendered as one blank space, and the reader could not tell a
 * run that was still going from one that never writes that section.
 *
 * The backend now names the cause, and its `detail` is written for a PERSON — confirmed
 * 2026-09-27, and held on their side by a test that refuses developer punctuation in it. So the
 * sentence is rendered as it arrives rather than replaced by one of ours.
 */
export interface SectionAbsence {
  /** Discriminant. A report body never carries it, so a union of the two is safe to narrow. */
  absent: true
  /**
   * The machine code, for grouping: `run_not_found` · `reports_not_commissioned` ·
   * `run_not_completed` · `artifact_not_produced`, and `config_snapshot_missing` on the config
   * route. Typed as a plain string because the vocabulary is the backend's and a value we do not
   * know yet should arrive as itself rather than fail to type.
   */
  cause: string
  /** The backend's own sentence. Empty only where a response carried none. */
  detail: string
}

/** Narrows a section answer. Written here rather than at a call site so the discriminant has one owner. */
export function isAbsent<T>(answer: T | SectionAbsence): answer is SectionAbsence {
  return typeof answer === 'object' && answer !== null && 'absent' in answer
}
