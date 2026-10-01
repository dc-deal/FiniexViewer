/**
 * The backend does not know a run our own index just named. Distinct from a missing SECTION: that
 * is an absence within a run we agree exists, while this means the two indexes disagree about what
 * exists at all — the same class of defect as a report body naming a different run.
 */
export class RunNotFoundError extends Error {
  readonly runId: string

  constructor(runId: string) {
    super(`The backend does not know run ${runId}, which our index lists`)
    this.name = 'RunNotFoundError'
    this.runId = runId
  }
}
