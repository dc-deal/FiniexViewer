import type { PositionRef } from '@/types/context_types'

/**
 * A link to a selection (viewer#60): what a reader opens to see what another view showed — the
 * server, the run, the scenarios in focus, the position marked, and the run chart's timeframe and
 * moment. Its keys are the link keys of the context store, the old query keys. Never the layout:
 * that is where things stand, and it stays the reader's own.
 *
 *   ?server=default&run=<run id>&units=<unit>&position=<scenario>~<position id>&chart=M1@2026-10-07T15:30:00Z
 */
export interface AddressLink {
  /** The server the run belongs to — a run id means something only on its own server. */
  server: string | null
  run: string
  /** The scenarios in focus; the run chart shows the one in focus. */
  units: string[]
  position: PositionRef | null
  /** The run chart's timeframe and the moment it centres on, in UTC seconds. */
  chart: { timeframe: string, at: number } | null
}

/** Every key a link writes into an address — what is taken out of it once the link is applied. */
const LINK_KEYS = ['server', 'run', 'units', 'position', 'chart'] as const

/** Between a position's scenario and its id: neither carries one. */
const POSITION_JOIN = '~'

/** A timeframe as the API names one: `M1`, `M15`, `H4`, `D1`. */
const TIMEFRAME = /^[A-Z][A-Z0-9]{0,5}$/

function readPosition(value: string | null): PositionRef | null {
  const at = value?.indexOf(POSITION_JOIN) ?? -1
  if (!value || at <= 0 || at === value.length - 1) return null
  return { scenario: value.slice(0, at), position: value.slice(at + 1) }
}

function readChart(value: string | null): AddressLink['chart'] {
  const at = value?.indexOf('@') ?? -1
  if (!value || at <= 0) return null
  const timeframe = value.slice(0, at)
  const instant = Date.parse(value.slice(at + 1))
  if (!TIMEFRAME.test(timeframe) || Number.isNaN(instant)) return null
  return { timeframe, at: Math.floor(instant / 1000) }
}

/**
 * The link an address's query carries, or null where it names no run. A value that does not read is
 * left out rather than guessed, and nothing in an address can stop the app from starting.
 */
export function readLink(search: string): AddressLink | null {
  const params = new URLSearchParams(search)
  const run = params.get('run')?.trim()
  if (!run) return null
  const units = [...new Set(params.getAll('units').map(unit => unit.trim()).filter(Boolean))]
  return {
    server: params.get('server')?.trim() || null,
    run,
    units,
    position: readPosition(params.get('position')),
    chart: readChart(params.get('chart')),
  }
}

/** The query of an address once the link is taken out of it — anything else it carries stays. */
export function withoutLink(search: string): string {
  const params = new URLSearchParams(search)
  for (const key of LINK_KEYS) params.delete(key)
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

/** The address of a link: `base` is where the app is served, its origin and path. */
export function writeLink(base: string, link: AddressLink): string {
  const params = new URLSearchParams()
  if (link.server) params.set('server', link.server)
  params.set('run', link.run)
  for (const unit of link.units) params.append('units', unit)
  if (link.position) params.set('position', `${link.position.scenario}${POSITION_JOIN}${link.position.position}`)
  if (link.chart) {
    const moment = new Date(link.chart.at * 1000).toISOString().replace('.000Z', 'Z')
    params.set('chart', `${link.chart.timeframe}@${moment}`)
  }
  return `${base}?${params.toString()}`
}
