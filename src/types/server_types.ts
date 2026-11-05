/**
 * A server this viewer can read: one installation of the API, as an address and a token that come as
 * a pair. The word is FiniexTestingIDE's: its document `server` means exactly this, and `installation`
 * stays its word for what stands behind one. Our own record, not a mirror of a response.
 */

/** The server from the environment, which every checkout has. */
export const DEFAULT_SERVER_ID = 'default'

/** How a server is reached through an SSH tunnel; file names are relative to the secrets folder. */
export interface ServerTunnel {
  account: string
  host: string
  localPort: number
  remotePort: number
  keyFile: string
  knownHostsFile: string
}

/**
 * How a tunnel stands, as far as the dev server can know. `running` says ssh is up and nothing about
 * what stands behind it.
 */
export type TunnelState = 'none' | 'missing_files' | 'no_ssh' | 'connecting' | 'running' | 'retrying'

/** What the browser may know about a server. It holds no token, only whether there is one. */
export interface ServerEntry {
  id: string
  // null until the reader names it: the default name is built where it is shown
  name: string | null
  url: string
  isDefault: boolean
  hasToken: boolean
  tunnel: ServerTunnel | null
  tunnelState: TunnelState
  // the last thing ssh said
  tunnelMessage: string | null
  // `origin_host` of the installation, null until it was read: what the saved state is kept under
  hostId: string | null
}

/** Response of `GET /__viewer/servers`. */
export interface ServerList {
  servers: ServerEntry[]
  // what lies in the secrets folder to choose a tunnel's key from, names only
  secretFiles: string[]
}

/** A change to a server; what is absent stays. A token can be set here and never read back. */
export interface ServerEdit {
  name?: string | null
  url?: string
  token?: string
  tunnel?: ServerTunnel | null
  hostId?: string | null
}
