import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import SessionsTable from '@/components/deployments/SessionsTable.vue'
import DeploymentHeader from '@/components/deployments/DeploymentHeader.vue'
import AdvisoryNotice from '@/components/deployments/AdvisoryNotice.vue'
import type {
  DeploymentAdvisory,
  DeploymentRow,
  DeploymentSessionRow,
} from '@/types/api/deployment_types'

import detailFixture from './fixtures/deployment_detail.json'
import listFixture from './fixtures/deployments_list.json'

const BASE_SESSION = detailFixture.sessions[0] as DeploymentSessionRow
const BASE_ROW = listFixture.deployments.find(
  row => row.deployment_id === detailFixture.deployment_id
) as DeploymentRow
const ADVISORY = detailFixture.advisory as DeploymentAdvisory

function session(overrides: Partial<DeploymentSessionRow> = {}): DeploymentSessionRow {
  return { ...BASE_SESSION, ...overrides }
}

function mountSessions(sessions: DeploymentSessionRow[]) {
  return mount(SessionsTable, {
    props: { sessions, keyFields: ['run_id', 'currency'] },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('SessionsTable', () => {
  it('opens a session through the run it is', () => {
    const wrapper = mountSessions([session()])
    expect(wrapper.findComponent(RouterLinkStub).props('to')).toEqual({
      name: 'runs',
      query: { run: BASE_SESSION.run_id },
    })
  })

  /**
   * The mark names a boundary between two configurations, not a property of one session. A badge
   * at the end of a row reads as the latter, which is why it renders as a line ABOVE the first
   * session produced by the new stand.
   */
  it('places the change mark before the session that starts the new stand', () => {
    const wrapper = mountSessions([
      session({ index: 1, run_id: 'run_a' }),
      session({ index: 2, run_id: 'run_b', strategy_changed: true }),
    ])
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[1]?.classes()).toContain('boundary')
    expect(rows[1]?.text()).toContain('Strategy changed')
    // and the row after it is the session that carried the flag
    expect(rows[2]?.text()).toContain('run_b')
  })

  it('names both when strategy and operation moved together', () => {
    const wrapper = mountSessions([
      session({ strategy_changed: true, operation_changed: true }),
    ])
    expect(wrapper.find('.boundary').text()).toContain('Strategy and operation changed')
  })

  it('draws no line where nothing moved', () => {
    expect(mountSessions([session(), session({ run_id: 'run_b' })]).find('.boundary').exists())
      .toBe(false)
  })

  // null is an absence — the first session has nothing before it. Rendering 0.0 would claim a
  // predecessor that ended exactly as this one began.
  it('leaves the idle stretch empty on the first session rather than showing zero', () => {
    const wrapper = mountSessions([session({ gap_hours: null })])
    // the fourth column is the idle stretch; checking it by position keeps the assertion from
    // passing on a '—' that happens to sit somewhere else in the row
    const gapCell = wrapper.findAll('tbody td')[3]
    expect(gapCell?.text()).toBe('—')
  })

  // A session that ran 22 seconds rounds to "0 min" in a minutes-first formatter, which reads as
  // one that never ran. Every session in the only deployment we can measure is that short.
  it('does not round a short session down to nothing', () => {
    const wrapper = mountSessions([session({ ran_hours: 0.0062 })])
    const ranCell = wrapper.findAll('tbody td')[2]
    expect(ranCell?.text()).toBe('22 s')
  })

  /**
   * Measured start-to-start, the figure contains the predecessor's whole runtime. It is an upper
   * bound and is labelled as one, because shown plainly it reads as the same measure.
   */
  it('marks a start-to-start gap as the upper bound it is', () => {
    const bounded = mountSessions([session({ gap_hours: 3.2, gap_between_starts: true })])
    const exact = mountSessions([session({ gap_hours: 3.2, gap_between_starts: false })])
    expect(bounded.text()).toContain('≤')
    expect(exact.text()).not.toContain('≤')
  })

  /**
   * net_pnl would sum, max_drawdown would not: it is the MAXIMUM of the running declines, so
   * adding the column counts one decline once per session that was still inside it. A footer with
   * one honest column beside one dishonest one is worse than none.
   */
  it('carries no totals row at all', () => {
    const wrapper = mountSessions([session(), session({ run_id: 'run_b' })])
    expect(wrapper.find('tfoot').exists()).toBe(false)
  })

  /**
   * `index` rides on the row and is NOT in the declared key, which is (run_id, currency). A field
   * outside the key is not an identity, so presenting it as "the session number" invents a counter
   * the ledger does not keep — and it repeats as soon as a deployment books in two currencies.
   */
  it('keeps no ordinal of its own — the run is the identity, the order is the sequence', () => {
    const wrapper = mountSessions([session({ index: 7 })])
    expect(wrapper.find('thead').text()).not.toContain('Session')
    // the first cell of the row is the run, not a number
    expect(wrapper.findAll('tbody td')[0]?.text()).toContain(BASE_SESSION.run_id)
  })

  it('renders a decline as a magnitude, like every other drawdown', () => {
    const wrapper = mountSessions([session({ max_drawdown: -212.75 })])
    expect(wrapper.text()).toContain('212.75')
    expect(wrapper.text()).not.toContain('-212.75')
  })
})

describe('DeploymentHeader', () => {
  it('shows the ledger figures for one account currency', () => {
    const wrapper = mount(DeploymentHeader, { props: { row: BASE_ROW } })
    expect(wrapper.text()).toContain(BASE_ROW.currency)
    expect(wrapper.text()).toContain(BASE_ROW.sessions.toString())
  })

  // bot_id is the only identity that does not move: the name is a label an operator improves and
  // a deliberate restart mints a fresh deployment_id.
  it('names the identity that survives a rename', () => {
    const wrapper = mount(DeploymentHeader, { props: { row: BASE_ROW } })
    expect(wrapper.text()).toContain(BASE_ROW.bot_id)
  })

  it('stays silent about it where the profile declares none', () => {
    const wrapper = mount(DeploymentHeader, { props: { row: { ...BASE_ROW, bot_id: '' } } })
    expect(wrapper.text()).not.toContain('bot:')
  })

  it('warns where the sessions were not all produced by one configuration', () => {
    const steady = mount(DeploymentHeader, { props: { row: { ...BASE_ROW, changed: false } } })
    const moved = mount(DeploymentHeader, { props: { row: { ...BASE_ROW, changed: true } } })
    expect(steady.find('.changed').exists()).toBe(false)
    expect(moved.find('.changed').exists()).toBe(true)
  })
})

// The produced history: four sessions, nothing moved into session 2, a strategy change into
// session 3 and an operational change into session 4.
describe('SessionsTable against the produced history', () => {
  it('draws exactly the two boundaries the ledger reports, each above its session', () => {
    const wrapper = mountSessions(detailFixture.sessions as DeploymentSessionRow[])
    const boundaries = wrapper.findAll('.boundary')
    expect(boundaries).toHaveLength(2)
    expect(boundaries[0]?.text()).toContain('Strategy changed')
    expect(boundaries[1]?.text()).toContain('Operation changed')

    const rows = wrapper.findAll('tbody tr')
    // session 1, session 2, MARK, session 3, MARK, session 4
    expect(rows[2]?.classes()).toContain('boundary')
    expect(rows[3]?.text()).toContain(detailFixture.sessions[2]?.run_id)
  })
})

describe('AdvisoryNotice', () => {
  function mountAdvisory(overrides: Partial<DeploymentAdvisory> = {}) {
    return mount(AdvisoryNotice, { props: { advisory: { ...ADVISORY, ...overrides } } })
  }

  it('says plainly that the rows are not one series where stands moved', () => {
    const wrapper = mountAdvisory({ strategy_stands: 2, operation_stands: 2 })
    expect(wrapper.text()).toContain('not one series')
    expect(wrapper.find('.notice').classes()).toContain('moved')
  })

  /**
   * A status colour never travels alone. In the light theme a dark yellow and a dark red separate
   * by CVD ΔE 5.5, so a reader with red-green colour blindness tells a warning from an error by
   * the glyph and the sentence — never by hue. This holds the glyph.
   */
  it('carries a glyph, not only a colour, when it warns', () => {
    expect(mountAdvisory({ strategy_stands: 2 }).find('.mark').text()).toBe('⚠')
  })

  it('stays calm where one configuration produced everything', () => {
    const wrapper = mountAdvisory({ strategy_stands: 1, operation_stands: 1 })
    expect(wrapper.text()).not.toContain('not one series')
    expect(wrapper.find('.notice').classes()).not.toContain('moved')
    // and no warning glyph, because there is nothing to warn about
    expect(wrapper.find('.mark').exists()).toBe(false)
  })

  it('treats a moved operation alone as enough to warn', () => {
    expect(mountAdvisory({ strategy_stands: 1, operation_stands: 2 }).find('.notice').classes())
      .toContain('moved')
  })

  it('says nothing about an idle stretch that was never measured', () => {
    expect(mountAdvisory({ longest_gap_hours: null }).text()).not.toContain('Longest idle')
  })

  it('names the longest idle stretch where there is one', () => {
    expect(mountAdvisory({ longest_gap_hours: 4.5 }).text()).toContain('4.5 h')
  })
})
