/**
 * Who the server takes this client to be — `GET /api/v1/caller`, contract 4.
 *
 * A token says which CLIENT is calling; an account says on whose BEHALF. The two are separate
 * principals and a token is bound to exactly one account.
 *
 * `enforced` names the server's gating state, and it is the field to read first: while it is false
 * nothing verifies a presented token, so every identity field below is null **even for a caller
 * that sent a valid one**. A 200 is therefore not evidence that the token was accepted.
 *
 * Measured only under `enforced: true`; the unenforced shape is mirrored from the backend's own
 * statement of it rather than from a response.
 */
export interface CallerIdentity {
  enforced: boolean
  /** The consumer the token authenticates as. */
  client: string | null
  account: string | null
  account_kind: AccountKind | null
  display_name: string | null
  /**
   * What the token holds, as INFORMATION for the reader — never a capability list. Settled with the
   * backend 2026-09-25: every surface stays reachable and a refusal is the 403, which names the
   * surface and what the token holds. A client that hid a view because this list lacked an entry
   * would be a second, weaker copy of a model it does not own, and it would fail silently.
   */
  grants: string[] | null
  /** Free text the operator attached to the token. */
  note: string | null
}

export type AccountKind = 'person' | 'service'
