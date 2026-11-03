import type {
  BrokerTruthRow, ReconcileDivergence, VenueAccountRead, VenueAccountReport, VenueAccountUnit, VenueReads,
} from '@/types/api/report_types'
import { t } from '@/translate'

/**
 * What the Venue account section draws: the venue's reads from the stream, which stand from a live
 * session's first read on, and `venue-account`, which is written when it ends. `recording` is the run
 * list's verdict, so the section can say why its End column is empty.
 */
export interface VenueModel {
  reads: VenueReads | null
  account: VenueAccountReport | null
  recording: string | null
}

/**
 * One read of the venue, whichever route stated it — the stream's line or the account's count of
 * it. Both name the same read by `seq`, so the account's figure and the line's are one figure.
 */
export interface VenueSide {
  seq: number
  orders: number | null
  balances: Record<string, number> | null
  positions: number | null
  unread: string[]
}

/** A sentence about the comparison, said only where it is off or did not run. */
export interface VenueNotice {
  tone: 'warning' | 'plain'
  text: string
}

/** The venue's own words for each kind of divergence, as their `venue-account` document lists them. */
const DIVERGENCE_LISTS: (keyof ReconcileDivergence)[] = [
  'ghost_orders', 'abandoned_orders', 'foreign_session_orders', 'unconfirmed_orders', 'orphan_orders', 'stale_orders',
]
const DIVERGENCE_COUNTS: (keyof ReconcileDivergence)[] = ['ghost_positions', 'orphan_positions', 'stale_positions']

/** `ghost_orders` → `ghost orders`: their field name, read aloud. */
function spoken(field: string): string {
  return field.replace(/_/g, ' ')
}

/** The sessions the section speaks of: those the account names, then any only the stream names. */
export function unitNames(model: VenueModel): string[] {
  const names = (model.account?.units ?? []).map(unit => unit.name)
  for (const read of model.reads?.reads ?? []) {
    if (!names.includes(read.scenario_name)) names.push(read.scenario_name)
  }
  return names
}

function fromAccount(read: VenueAccountRead): VenueSide {
  return {
    seq: read.seq,
    orders: read.venue_order_count,
    balances: read.venue_balances,
    positions: read.venue_position_count,
    unread: read.unread_parts,
  }
}

function fromLine(line: BrokerTruthRow): VenueSide {
  return {
    seq: line.seq,
    // a count of the list the venue served, where it served one
    orders: line.venue_orders?.length ?? null,
    balances: line.venue_balances,
    positions: line.venue_positions?.length ?? null,
    unread: line.unread_parts,
  }
}

/** The session's reads on the stream, in the order they were written. */
export function readsOf(model: VenueModel, name: string): BrokerTruthRow[] {
  return (model.reads?.reads ?? []).filter(read => read.scenario_name === name)
}

/** The account's row for a session, once the session has ended and written one. */
export function accountOf(model: VenueModel, name: string): VenueAccountUnit | null {
  return model.account?.units.find(unit => unit.name === name) ?? null
}

/**
 * The read at the session's start and at its end. The account states them once the session has
 * ended; until then the stream's `session_start` line is the start, and there is no end yet.
 */
export function sidesOf(model: VenueModel, name: string): { start: VenueSide | null, end: VenueSide | null } {
  const account = accountOf(model, name)
  const lines = readsOf(model, name)
  const line = (reason: string) => lines.find(read => read.read_reason === reason)
  const startLine = line('session_start')
  const endLine = line('session_end')
  if (account) {
    return {
      start: account.at_start ? fromAccount(account.at_start) : null,
      end: account.at_end ? fromAccount(account.at_end) : null,
    }
  }
  return { start: startLine ? fromLine(startLine) : null, end: endLine ? fromLine(endLine) : null }
}

/** Every asset either read names, in the order the venue listed them, the start's first. */
export function assetsOf(start: VenueSide | null, end: VenueSide | null): string[] {
  const assets = Object.keys(start?.balances ?? {})
  for (const asset of Object.keys(end?.balances ?? {})) {
    if (!assets.includes(asset)) assets.push(asset)
  }
  return assets
}

/**
 * A part of a read in words — the three states their document keeps apart, and none of them a zero:
 * a value is what the venue holds, `null` with the part named in `unread_parts` is a read that
 * failed, and `null` without it is a part this read does not take.
 */
export function partOf(side: VenueSide | null, part: string, value: number | null, format: (value: number) => string): string {
  if (!side) return '—'
  if (value !== null) return format(value)
  return side.unread.includes(part) ? t('not read') : '—'
}

/** One asset's balance in a read. An asset the read does not list is said so, never as a zero. */
export function balanceOf(side: VenueSide | null, asset: string, format: (value: number) => string): string {
  if (!side) return '—'
  if (side.balances === null) return side.unread.includes('venue_balances') ? t('not read') : '—'
  const value = side.balances[asset]
  return value === undefined ? t('not listed') : format(value)
}

/** Why a read is missing, said once beneath the table rather than in every empty cell. */
export function missingReads(start: VenueSide | null, end: VenueSide | null, recording: string | null): string[] {
  const said: string[] = []
  if (!start) said.push(t('The session took no read of the venue at its start'))
  if (!end) {
    said.push(recording === 'current'
      ? t('End is read when the session ends')
      : t('The session took no read of the venue at its end'))
  }
  return said
}

/** The members of a divergence, in their own words: the identities by kind, the positions counted. */
export function divergenceWords(divergence: ReconcileDivergence | null): string {
  if (!divergence) return ''
  const lists = DIVERGENCE_LISTS
    .filter(field => (divergence[field] as string[]).length)
    .map(field => `${spoken(field)} ${(divergence[field] as string[]).join(', ')}`)
  const counts = DIVERGENCE_COUNTS
    .filter(field => (divergence[field] as number) > 0)
    .map(field => `${spoken(field)} ${divergence[field] as number}`)
  return [...lists, ...counts].join(' · ')
}

/**
 * What the comparison over the whole session says — and only where it is off, because a check that
 * passes says nothing: switched off, never come due, the venue not reached, or the books apart at the
 * last line. A record from before the field existed says nothing either way.
 */
export function reconciliationNotices(unit: VenueAccountUnit): VenueNotice[] {
  const notices: VenueNotice[] = []
  const counts = unit.reconciliation
  if (counts && !counts.enabled) {
    notices.push({ tone: 'warning', text: t('The comparison with the venue was switched off for this session') })
  } else if (counts) {
    const compared = counts.cycles_compared ?? 0
    const skipped = counts.cycles_skipped ?? 0
    if (compared === 0 && skipped === 0) {
      notices.push({ tone: 'plain', text: t('The comparison with the venue never came due before the session ended') })
    } else if (compared === 0) {
      notices.push({ tone: 'warning', text: `${t('The comparison never reached the venue')}: ${skipped} ${t('cycles could not')}` })
    } else if (skipped > 0) {
      notices.push({ tone: 'warning', text: `${skipped} ${t('cycles could not reach the venue')} · ${compared} ${t('compared')}` })
    }
  }
  if (unit.last_reconcile_state === 'divergent') {
    notices.push({
      tone: 'warning',
      text: `${t('The books were apart at the last comparison')}: ${divergenceWords(unit.last_divergence)}`,
    })
  } else if (unit.divergent_lines > 0) {
    notices.push({ tone: 'plain', text: `${unit.divergent_lines} ${t('times apart, in agreement again at the last comparison')}` })
  }
  return notices
}

/** Why a read was taken, in words. */
export function reasonOf(read: BrokerTruthRow): string {
  if (read.read_reason === 'session_start') return t('session start')
  if (read.read_reason === 'session_end') return t('session end')
  if (read.read_reason === 'reconcile') return t('reconcile')
  return read.read_reason
}

/** What a read held, in a line: the account's size for a start or an end, the verdict for a comparison. */
export function readSummary(read: BrokerTruthRow): string {
  if (read.read_reason === 'reconcile') {
    if (read.reconcile_state === 'divergent') return `⚠ ${t('divergent')} · ${divergenceWords(read.divergence)}`
    return read.reconcile_state ?? ''
  }
  const orders = read.venue_orders === null
    ? (read.unread_parts.includes('venue_orders') ? t('orders not read') : '')
    : `${read.venue_orders.length} ${t('open orders')}`
  const balances = read.venue_balances === null
    ? (read.unread_parts.includes('venue_balances') ? t('balances not read') : '')
    : `${Object.keys(read.venue_balances).length} ${t('assets')}`
  return [orders, balances].filter(Boolean).join(' · ')
}
