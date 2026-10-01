/**
 * The report body names a different run than the one that was requested. Every artifact model
 * carries the `run_id` it was built from, so this is checkable rather than merely hopeable — and
 * it is the only defence a client has against an ambiguous key: a duplicated id passes every
 * membership check, and the wrong artifacts then arrive under the right name.
 */
export class RunIdMismatchError extends Error {
  constructor(requested: string, received: string) {
    super(`Requested run ${requested} but the report belongs to ${received}`)
    this.name = 'RunIdMismatchError'
  }
}
