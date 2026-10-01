/**
 * The run exists and carries the artifact, but the backend cannot parse it — it was written by an
 * older schema and the run has to be repeated to regenerate it. Distinct from a 404, which means
 * the artifact is not there at all, and from a transport failure, which is an outage.
 */
export class ArtifactUnreadableError extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'ArtifactUnreadableError'
  }
}
