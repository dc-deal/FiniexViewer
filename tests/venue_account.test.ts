import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import VenueAccountPanel from '@/components/runs/VenueAccountPanel.vue'
import {
  balanceOf, divergenceWords, missingReads, partOf, readSummary, reconciliationNotices, sidesOf, unitNames,
} from '@/components/runs/venue_account'
import type { VenueModel } from '@/components/runs/venue_account'
import { venueFigure } from '@/components/runs/report_format'
import type {
  BrokerTruthRow, OrderEventsReport, ReconcileDivergence, VenueAccountReport, VenueAccountUnit,
} from '@/types/api/report_types'
import accountFixture from './fixtures/venue_account.json'
import streamFixture from './fixtures/order_events_live.json'

/**
 * The captured live run, both halves: its venue account and the venue's reads on its stream. The
 * capture neutralises every balance, so the cases the stored runs do not hold — a part not read, an
 * asset gone, the books apart — are built from these answers without changing their shape.
 */
const ACCOUNT = accountFixture as unknown as VenueAccountReport
const STREAM = streamFixture as unknown as OrderEventsReport
const READS = STREAM.broker_truth
const UNIT = ACCOUNT.units[0]!

function model(over: Partial<VenueModel> = {}): VenueModel {
  return {
    reads: { reads: structuredClone(READS), key: ['scenario_name', 'seq'], truncated_tail: false },
    account: structuredClone(ACCOUNT),
    recording: null,
    ...over,
  }
}

function unit(over: Partial<VenueAccountUnit> = {}): VenueAccountUnit {
  return { ...structuredClone(UNIT), ...over }
}

const NO_DIVERGENCE: ReconcileDivergence = {
  ghost_orders: [], abandoned_orders: [], foreign_session_orders: [], unconfirmed_orders: [], orphan_orders: [],
  stale_orders: [], ghost_positions: 0, orphan_positions: 0, stale_positions: 0,
}

describe('venue account, the reads', () => {
  it('names the session the account and the stream name', () => {
    expect(unitNames(model())).toEqual([UNIT.name])
    expect(unitNames(model({ account: null }))).toEqual([READS[0]!.scenario_name])
  })

  /** Once ended the account states both reads; while the session runs the stream's first line is the start. */
  it('takes the start and the end from the account, and the start alone from the stream while it runs', () => {
    const ended = sidesOf(model(), UNIT.name)
    expect(ended.start?.seq).toBe(UNIT.at_start!.seq)
    expect(ended.end?.seq).toBe(UNIT.at_end!.seq)

    const running = model({ account: null, recording: 'current' })
    running.reads!.reads = running.reads!.reads.filter(read => read.read_reason === 'session_start')
    const sides = sidesOf(running, UNIT.name)
    expect(sides.start?.seq).toBe(1)
    expect(sides.end).toBeNull()
    expect(missingReads(sides.start, sides.end, 'current')).toEqual(['End is read when the session ends'])
    expect(missingReads(sides.start, sides.end, 'ended')).toEqual(['The session took no read of the venue at its end'])
  })

  /** Their three states, none of them a zero. */
  it('says a part the venue could not be read for as not read, an unlisted asset as not listed, never 0', () => {
    const { start } = sidesOf(model(), UNIT.name)
    expect(balanceOf(start, 'XETH', venueFigure)).toBe(venueFigure(UNIT.at_start!.venue_balances!['XETH']!))
    expect(balanceOf(start, 'XXBT', venueFigure)).toBe('not listed')

    const failed = { ...start!, balances: null, orders: null, unread: ['venue_balances', 'venue_orders'] }
    expect(balanceOf(failed, 'XETH', venueFigure)).toBe('not read')
    expect(partOf(failed, 'venue_orders', failed.orders, venueFigure)).toBe('not read')
    // null without the part named: this read does not take it, which is no zero either
    expect(partOf({ ...start!, positions: null }, 'venue_positions', null, venueFigure)).toBe('—')
  })

  it('shows a figure with every decimal the venue wrote', () => {
    expect(venueFigure(0.00012345678901)).toBe('0.00012345678901')
    expect(venueFigure(812.4)).toBe('812.4')
  })
})

describe('venue account, the comparison', () => {
  /** A check that passes says nothing. */
  it('says nothing where the comparison ran and the books agreed', () => {
    const clean = unit({
      reconciliation: { enabled: true, cycles_compared: 2877, cycles_skipped: 0, divergences_seen: 0 },
      last_reconcile_state: null,
    })
    expect(reconciliationNotices(clean)).toEqual([])
    // a record from before the counts existed says nothing either way
    expect(reconciliationNotices(unit({ reconciliation: null }))).toEqual([])
  })

  it('speaks where it was off, never came due, or could not reach the venue', () => {
    const off = reconciliationNotices(unit({ reconciliation: { enabled: false, cycles_compared: null, cycles_skipped: null, divergences_seen: null } }))
    expect(off[0]).toMatchObject({ tone: 'warning' })
    expect(off[0]!.text).toContain('switched off')

    const due = reconciliationNotices(unit({ reconciliation: { enabled: true, cycles_compared: 0, cycles_skipped: 0, divergences_seen: 0 } }))
    expect(due[0]).toMatchObject({ tone: 'plain' })
    expect(due[0]!.text).toContain('never came due')

    // compared nothing beside skipped cycles: the session that only looks clean
    const unreached = reconciliationNotices(unit({ reconciliation: { enabled: true, cycles_compared: 0, cycles_skipped: 3, divergences_seen: 0 } }))
    expect(unreached[0]).toMatchObject({ tone: 'warning' })
    expect(unreached[0]!.text).toContain('never reached the venue: 3')

    const partly = reconciliationNotices(unit({ reconciliation: { enabled: true, cycles_compared: 2877, cycles_skipped: 3, divergences_seen: 0 } }))
    expect(partly[0]!.text).toBe('3 cycles could not reach the venue · 2877 compared')
  })

  it('names who was apart where the books were apart at the last comparison', () => {
    const divergence = { ...NO_DIVERGENCE, orphan_orders: ['pos_ethusd_15'], ghost_positions: 1 }
    const apart = reconciliationNotices(unit({
      reconciliation: { enabled: true, cycles_compared: 40, cycles_skipped: 0, divergences_seen: 2 },
      last_reconcile_state: 'divergent',
      divergent_lines: 1,
      last_divergence: divergence,
    }))
    expect(apart).toHaveLength(1)
    expect(apart[0]!.text).toContain('orphan orders pos_ethusd_15 · ghost positions 1')
    expect(divergenceWords(NO_DIVERGENCE)).toBe('')
  })
})

describe('venue account, every read', () => {
  it('says a start or an end by its size, and a comparison by its verdict and who was apart', () => {
    expect(readSummary(READS[0]!)).toMatch(/^\d+ open orders · \d+ assets$/)
    const divergent: BrokerTruthRow = {
      ...READS[0]!, read_reason: 'reconcile', reconcile_state: 'divergent',
      divergence: { ...NO_DIVERGENCE, ghost_orders: ['O00001-00000-000000'] }, venue_balances: null,
    }
    expect(readSummary(divergent)).toBe('⚠ divergent · ghost orders O00001-00000-000000')
    expect(readSummary({ ...READS[0]!, venue_balances: null, unread_parts: ['venue_balances'] })).toContain('balances not read')
  })
})

describe('VenueAccountPanel', () => {
  // the hint above the section remembers its dismissal in a store
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('draws the start and the end side by side, and every read on a fold', () => {
    const wrapper = mount(VenueAccountPanel, { props: { model: model() } })
    const table = wrapper.find('.venue-table').text()
    expect(table).toContain('Open orders at the venue')
    for (const asset of Object.keys(UNIT.at_start!.venue_balances!)) expect(table).toContain(asset)
    expect(wrapper.find('details.reads summary').text()).toBe(`Every read of the venue (${READS.length})`)
  })

  it('says why the end is empty while the session runs, and never fills it with zeros', () => {
    const running = model({ account: null, recording: 'current' })
    running.reads!.reads = running.reads!.reads.filter(read => read.read_reason === 'session_start')
    const wrapper = mount(VenueAccountPanel, { props: { model: running } })
    expect(wrapper.text()).toContain('End is read when the session ends')
    expect(wrapper.findAll('[data-side="end"]').every(cell => cell.text() === '—')).toBe(true)
  })

  it('speaks of the comparison only where it is off', () => {
    const clean = model()
    clean.account!.units[0]!.reconciliation = { enabled: true, cycles_compared: 12, cycles_skipped: 0, divergences_seen: 0 }
    expect(mount(VenueAccountPanel, { props: { model: clean } }).findAll('.notice')).toHaveLength(0)

    const off = model()
    off.account!.units[0]!.reconciliation = { enabled: false, cycles_compared: null, cycles_skipped: null, divergences_seen: null }
    const notice = mount(VenueAccountPanel, { props: { model: off } }).find('.notice.warning')
    expect(notice.text()).toContain('⚠')
    expect(notice.text()).toContain('switched off')
  })
})
