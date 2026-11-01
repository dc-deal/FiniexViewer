import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ServerTunnel, TunnelState } from './src/types/server_types'

/**
 * Keeps an SSH tunnel up for every server that declares one, for as long as the dev server runs. The
 * browser cannot open one and the proxy that needs it runs here, so `localhost:<port>` is right where
 * it is needed. A tunnel that ends is started again: it can fall independently of the host.
 */

const RETRY_MS = 5000

export interface TunnelStatus {
  state: TunnelState
  // the last thing ssh said, for the settings page: it can say why a tunnel does not come up
  message: string | null
}

export type Spawn = (command: string, args: string[]) => ChildProcess

/** The command line. No shell is involved, and the words reaching it were validated at the write. */
export function sshArguments(tunnel: ServerTunnel, secretsDir: string): string[] {
  return [
    '-N',
    '-i', resolve(secretsDir, tunnel.keyFile),
    '-o', `UserKnownHostsFile=${resolve(secretsDir, tunnel.knownHostsFile)}`,
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    // nobody is there to answer a prompt: the account has a key and needs neither agent nor password
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-L', `${tunnel.localPort}:127.0.0.1:${tunnel.remotePort}`,
    `${tunnel.account}@${tunnel.host}`,
  ]
}

/**
 * `ssh` for this process, added where it is missing and the system can add it: the dev container is a
 * plain Node image. A failure here costs the tunnel and never the viewer.
 */
function ensureSsh(): boolean {
  if (spawnSync('ssh', ['-V'], { stdio: 'ignore' }).status === 0) return true
  if (!existsSync('/etc/alpine-release')) return false
  spawnSync('apk', ['add', '--no-cache', 'openssh-client'], { stdio: 'ignore', timeout: 120_000 })
  return spawnSync('ssh', ['-V'], { stdio: 'ignore' }).status === 0
}

interface Kept {
  signature: string
  tunnel: ServerTunnel
  status: TunnelStatus
  child: ChildProcess | null
  retry: ReturnType<typeof setTimeout> | null
}

export class ServerTunnels {
  private _kept = new Map<string, Kept>()
  private _sshAvailable: boolean | null = null
  private _secretsDir: string
  private _spawn: Spawn
  private _hasSsh: () => boolean

  constructor(secretsDir: string, spawnProcess: Spawn = (command, args) => spawn(command, args), hasSsh: () => boolean = ensureSsh) {
    this._secretsDir = secretsDir
    this._spawn = spawnProcess
    this._hasSsh = hasSsh
  }

  /** Brings the running tunnels in line with the list: one unchanged keeps running, untouched. */
  sync(tunnels: Map<string, ServerTunnel>): void {
    for (const [id, kept] of this._kept) {
      const wanted = tunnels.get(id)
      if (!wanted || JSON.stringify(wanted) !== kept.signature) this._end(id, kept)
    }
    for (const [id, tunnel] of tunnels) {
      if (!this._kept.has(id)) this._begin(id, tunnel)
    }
  }

  statusOf(id: string): TunnelStatus {
    return this._kept.get(id)?.status ?? { state: 'none', message: null }
  }

  stop(): void {
    for (const [id, kept] of this._kept) this._end(id, kept)
  }

  private _begin(id: string, tunnel: ServerTunnel): void {
    const kept: Kept = { signature: JSON.stringify(tunnel), tunnel, status: { state: 'connecting', message: null }, child: null, retry: null }
    this._kept.set(id, kept)
    const key = resolve(this._secretsDir, tunnel.keyFile)
    if (!existsSync(key) || !existsSync(resolve(this._secretsDir, tunnel.knownHostsFile))) {
      kept.status = { state: 'missing_files', message: null }
      return
    }
    this._sshAvailable ??= this._hasSsh()
    if (!this._sshAvailable) {
      kept.status = { state: 'no_ssh', message: null }
      return
    }
    try {
      // ssh refuses a key others could read, and a file brought over from elsewhere may be one
      chmodSync(key, 0o600)
    } catch {
      // ssh says so itself, and the settings page shows it
    }
    this._run(id, kept)
  }

  private _run(id: string, kept: Kept): void {
    const child = this._spawn('ssh', sshArguments(kept.tunnel, this._secretsDir))
    kept.child = child
    kept.status = { state: 'running', message: kept.status.message }
    child.stderr?.on('data', (part: Buffer) => {
      const line = part.toString().trim().split('\n').pop()
      if (line) kept.status = { ...kept.status, message: line }
    })
    const ended = (): void => {
      if (this._kept.get(id) !== kept || kept.child !== child) return
      kept.child = null
      kept.status = { ...kept.status, state: 'retrying' }
      kept.retry = setTimeout(() => {
        if (this._kept.get(id) === kept) this._run(id, kept)
      }, RETRY_MS)
    }
    child.on('exit', ended)
    child.on('error', ended)
  }

  private _end(id: string, kept: Kept): void {
    this._kept.delete(id)
    if (kept.retry) clearTimeout(kept.retry)
    kept.child?.kill()
  }
}
