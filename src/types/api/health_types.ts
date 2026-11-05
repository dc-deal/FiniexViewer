/**
 * What a server says about itself, on an open route: `GET /api/v1/health`, contract 48.
 *
 * The two identity fields are optional on purpose, and it is not a shim for an old capture: servers are
 * deployed apart, and FiniexTestingIDE names `/activities` as the way to identify one that does not
 * answer 48 yet.
 */
export interface ServerHealth {
  status: string
  version: string
  started_at: string
  uptime_s: number
  // the installation's own identity, the same value as `origin_host` on the rows. It survives a restart,
  // a redeploy and a new address, so a server is kept under it. Null means not identified yet, where the
  // server cannot read its identity file, and is never a value to key on
  host_id?: string | null
  // for display only: two installations may carry the same one. Null where none is configured
  host_name?: string | null
}
