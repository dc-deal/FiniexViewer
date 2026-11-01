// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { ServerTunnels, sshArguments } from '../vite_server_tunnels'
import type { ServerTunnel } from '@/types/server_types'

const TUNNEL: ServerTunnel = {
  account: 'reader', host: 'example.org', localPort: 8010, remotePort: 8000, keyFile: 'run/key', knownHostsFile: 'run/known_hosts',
}

class FakeChild extends EventEmitter {
  stderr = new EventEmitter()
  killed = false
  kill(): boolean {
    this.killed = true
    return true
  }
}

let secretsDir: string
let children: FakeChild[]

function keeper(hasSsh = true) {
  return new ServerTunnels(secretsDir, () => {
    const child = new FakeChild()
    children.push(child)
    return child as unknown as ChildProcess
  }, () => hasSsh)
}

beforeEach(() => {
  vi.useFakeTimers()
  secretsDir = mkdtempSync(join(tmpdir(), 'tunnels-'))
  mkdirSync(join(secretsDir, 'run'))
  writeFileSync(join(secretsDir, 'run/key'), 'k')
  writeFileSync(join(secretsDir, 'run/known_hosts'), 'h')
  children = []
})

afterEach(() => {
  vi.useRealTimers()
  rmSync(secretsDir, { recursive: true, force: true })
})

describe('sshArguments', () => {
  it('builds the command FiniexTestingIDE names, pinned to the host key and with no prompt', () => {
    const args = sshArguments(TUNNEL, '/secrets')
    expect(args[0]).toBe('-N')
    expect(args).toContain(`${resolve('/secrets', 'run/key')}`)
    for (const option of ['StrictHostKeyChecking=yes', 'ExitOnForwardFailure=yes', 'ServerAliveInterval=30', 'BatchMode=yes']) {
      expect(args).toContain(option)
    }
    expect(args).toContain(`UserKnownHostsFile=${resolve('/secrets', 'run/known_hosts')}`)
    expect(args).toContain('8010:127.0.0.1:8000')
    expect(args.at(-1)).toBe('reader@example.org')
  })
})

describe('ServerTunnels', () => {
  it('does nothing without its files, and says which state it is in', () => {
    const tunnels = keeper()
    rmSync(join(secretsDir, 'run/key'))
    tunnels.sync(new Map([['second', TUNNEL]]))
    expect(children).toHaveLength(0)
    expect(tunnels.statusOf('second').state).toBe('missing_files')
  })

  it('costs the tunnel and not the viewer where ssh cannot be had', () => {
    const tunnels = keeper(false)
    tunnels.sync(new Map([['second', TUNNEL]]))
    expect(children).toHaveLength(0)
    expect(tunnels.statusOf('second').state).toBe('no_ssh')
  })

  it('starts a tunnel, and sets the key to what ssh accepts', () => {
    const tunnels = keeper()
    tunnels.sync(new Map([['second', TUNNEL]]))
    expect(children).toHaveLength(1)
    expect(tunnels.statusOf('second').state).toBe('running')
    if (process.platform !== 'win32') expect(statSync(join(secretsDir, 'run/key')).mode & 0o077).toBe(0)
  })

  it('starts one again after it ended, and says what ssh said', () => {
    const tunnels = keeper()
    tunnels.sync(new Map([['second', TUNNEL]]))
    children[0]!.stderr.emit('data', Buffer.from('ssh: connect to host example.org port 22: Connection refused\n'))
    children[0]!.emit('exit', 255)
    expect(tunnels.statusOf('second')).toEqual({ state: 'retrying', message: 'ssh: connect to host example.org port 22: Connection refused' })
    vi.advanceTimersByTime(5000)
    expect(children).toHaveLength(2)
    expect(tunnels.statusOf('second').state).toBe('running')
  })

  it('leaves one running that did not change', () => {
    const tunnels = keeper()
    tunnels.sync(new Map([['second', TUNNEL]]))
    tunnels.sync(new Map([['second', { ...TUNNEL }]]))
    expect(children).toHaveLength(1)
    expect(children[0]!.killed).toBe(false)
  })

  it('replaces one whose data changed, and ends one no longer wanted without starting it again', () => {
    const tunnels = keeper()
    tunnels.sync(new Map([['second', TUNNEL]]))
    tunnels.sync(new Map([['second', { ...TUNNEL, localPort: 8011 }]]))
    expect(children[0]!.killed).toBe(true)
    expect(children).toHaveLength(2)

    tunnels.sync(new Map())
    expect(children[1]!.killed).toBe(true)
    children[1]!.emit('exit', 0)
    vi.advanceTimersByTime(60_000)
    expect(children).toHaveLength(2)
    expect(tunnels.statusOf('second').state).toBe('none')
  })

  it('ends everything when the dev server closes', () => {
    const tunnels = keeper()
    tunnels.sync(new Map([['second', TUNNEL]]))
    tunnels.stop()
    expect(children[0]!.killed).toBe(true)
  })
})
