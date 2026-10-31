import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, h } from 'vue'
import HoverCard from '@/components/base/HoverCard.vue'
import SessionsTable from '@/components/deployments/SessionsTable.vue'
import DeploymentHeader from '@/components/deployments/DeploymentHeader.vue'
import AdvisoryNotice from '@/components/deployments/AdvisoryNotice.vue'
import DeploymentSessionsPanel from '@/components/deployments/DeploymentSessionsPanel.vue'
import type {
  DeploymentAdvisory,
  DeploymentDetail,
  DeploymentRow,
  DeploymentSessionRow,
  SessionCodeChange,
} from '@/types/api/deployment_types'
import type { Figure } from '@/types/figure_types'
import { provideTestOpenInContext } from './open_in_context_harness'
import type { TestOpenInContext } from './open_in_context_harness'

import detailFixture from './fixtures/deployment_detail.json'
import listFixture from './fixtures/deployments_list.json'

const BASE_SESSION = detailFixture.sessions[0] as DeploymentSessionRow
const BASE_ROW = listFixture.deployments.find(
  row => row.deployment_id === detailFixture.deployment_id
) as DeploymentRow
/**
 * Built rather than read off the fixture: no deployment on the backend currently carries an
 * advisory, so the captured response has `advisory: null`. The fixture still proves the FIELD
 * exists and may be null — the assignment in `api_contract.test.ts` does that — and this constant
 * supplies the case the panel exists for.
 */
const ADVISORY: DeploymentAdvisory = {
  sessions: 4,
  strategy_stands: 2,
  operation_stands: 1,
  longest_gap_hours: 93.4,
  // a rehearsal throughout: the advisory fires on a MIX and this is not one
  orders_to: ['simulated'],
}

function session(overrides: Partial<DeploymentSessionRow> = {}): DeploymentSessionRow {
  return { ...BASE_SESSION, ...overrides }
}

/** Where the last mounted table tried to send the reader. */
let way!: TestOpenInContext

function mountSessions(sessions: DeploymentSessionRow[], canOpen = true) {
  const Host = defineComponent({
    setup() {
      way = provideTestOpenInContext(canOpen)
      return () => h(SessionsTable, { sessions, keyFields: ['run_id', 'currency'] })
    },
  })
  return mount(Host)
}

/** The head of the sessions: a code change is a plain fact there, and the advisory stays null for it. */
describe('DeploymentSessionsPanel', () => {
  function counts(codeSummary: DeploymentDetail['code_summary']) {
    const detail = { ...(detailFixture as unknown as DeploymentDetail), advisory: null, code_summary: codeSummary }
    return mount(DeploymentSessionsPanel, {
      props: { model: { detail, rows: [] } },
      global: { plugins: [createPinia()] },
    }).find('.counts').text()
  }

  it('says how far the code moved and how long ago, where it moved at all', () => {
    expect(counts({ code_stands: 3, sessions: 12, last_change_at: '2026-10-26T08:00:00+00:00', age_days: 5 }))
      .toContain('3 code stands · last moved 5 days ago')
    expect(counts(null)).not.toContain('code stand')
  })
})

describe('SessionsTable', () => {
  it('opens a session through the run it is', async () => {
    const wrapper = mountSessions([session()])
    await wrapper.find('.session-run .jump-link').trigger('click')
    expect(way.opened).toEqual([{ what: 'run', id: BASE_SESSION.run_id }])
  })

  /** With nowhere to send the reader the run is named as the text it is, never a dead way in. */
  it('names the run as plain text where nothing can open it', () => {
    const wrapper = mountSessions([session()], false)
    expect(wrapper.find('.session-run .jump-link').exists()).toBe(false)
    expect(wrapper.find('.session-run').text()).toBe(BASE_SESSION.run_id)
  })

  /**
   * The mark names a boundary between two configurations, not a property of one session. A badge
   * at the end of a row reads as the latter, which is why it renders as a line ABOVE the first
   * session produced by the new stand.
   */
  describe('where the code moved', () => {
    function change(overrides: Partial<SessionCodeChange> = {}): SessionCodeChange {
      return {
        repository_label: 'framework', old_commit: 'a1b2c3d4e5f6', new_commit: '0f9e8d7c6b5a', commits_between: 3,
        change_direction: 'forward', subject: 'Correct a sentence in a guide', ...overrides,
      }
    }

    /** Apart from the marks: a session can have a code change and no mark, and the other way round. */
    it('draws the line where only the code moved, with the repository, how far and the message', () => {
      const wrapper = mountSessions([session({ run_id: 'run_a' }), session({ run_id: 'run_b', code_changes: [change()] })])
      const leads = wrapper.findAll('.record-lead')
      expect(leads).toHaveLength(1)
      expect(leads[0]!.text()).toBe('framework: 3 commits newer — Correct a sentence in a guide')
    })

    /** Their six values, and one they may add later named as it came. */
    it('says how it moved for every direction', () => {
      const clause = (fields: Partial<SessionCodeChange>) =>
        mountSessions([session({ code_changes: [change(fields)] })]).find('.record-lead').text()
      expect(clause({ change_direction: 'back', commits_between: 1, subject: null })).toBe('framework: rolled back 1 commit')
      expect(clause({ change_direction: 'unknown', commits_between: null, subject: null })).toBe('framework: moved, how far is not known')
      expect(clause({ change_direction: 'uncommitted', commits_between: null, subject: null })).toBe('framework: uncommitted changes')
      expect(clause({ change_direction: 'added', commits_between: null, subject: null, old_commit: null })).toBe('framework: added')
      expect(clause({ change_direction: 'removed', commits_between: null, subject: null, new_commit: null })).toBe('framework: no longer used')
      expect(clause({ change_direction: 'sideways', commits_between: null, subject: null })).toBe('framework: sideways')
    })

    it('stands beside a mark on the one line, each repository on its own', () => {
      const wrapper = mountSessions([session({
        strategy_changed: true,
        code_changes: [change({ subject: null }), change({ repository_label: 'strategy touch_and_turn', commits_between: 1, subject: null })],
      })])
      expect(wrapper.find('.record-lead').findAll('.boundary-words').map(words => words.text())).toEqual([
        'Strategy changed from here', 'framework: 3 commits newer', 'strategy touch_and_turn: 1 commit newer',
      ])
    })

    /** The commits are data under the pointer. Read as they came: one commit can read at two lengths. */
    it('names the commits in its card, and nothing of a side nobody could read', () => {
      const card = (fields: Partial<SessionCodeChange>) =>
        mountSessions([session({ code_changes: [change(fields)] })]).find('.record-lead').findComponent(HoverCard).props('details')!
      expect(card({})).toEqual(expect.arrayContaining([
        { label: 'Repository', value: 'framework' },
        { label: 'Moved', value: '3 commits newer' },
        { label: 'Commit before', value: 'a1b2c3d4e5f6' },
        { label: 'Commit now', value: '0f9e8d7c6b5a' },
        { label: 'Commit message', value: 'Correct a sentence in a guide' },
      ]))
      const labels = card({ old_commit: null, change_direction: 'added', commits_between: null }).map(row => row.label)
      expect(labels).not.toContain('Commit before')
      expect(labels).toContain('Commit now')
    })

    it('draws no line where nothing moved, as on a session recorded before the contract', () => {
      expect(mountSessions([session({ code_changes: [] })]).find('.record-lead').exists()).toBe(false)
    })
  })

  it('places the change mark before the session that starts the new stand', () => {
    const wrapper = mountSessions([
      session({ index: 1, run_id: 'run_a' }),
      session({ index: 2, run_id: 'run_b', strategy_changed: true }),
    ])
    const lead = wrapper.find('.record-lead')
    expect(lead.exists()).toBe(true)
    expect(lead.text()).toContain('Strategy changed')
    // and the row it sits above is the session that carried the flag
    const rows = wrapper.findAll('.record-row')
    expect(rows).toHaveLength(2)
    expect(rows[1]?.text()).toContain('run_b')
    // a boundary is a statement about the GAP, so it is no row: nothing to choose and nothing to mark
    expect(lead.element.tagName).toBe('P')
  })

  it('names both when strategy and operation moved together', () => {
    const wrapper = mountSessions([
      session({ strategy_changed: true, operation_changed: true }),
    ])
    expect(wrapper.find('.record-lead').text()).toContain('Strategy and operation changed')
  })

  /** Where the orders went moving is a boundary too: a rehearsal followed by real money, or back. */
  it('names where the orders went from the session on, beside a configuration change', () => {
    const wrapper = mountSessions([
      session({ run_id: 'run_a' }),
      session({ run_id: 'run_b', strategy_changed: true, orders_to: 'venue', orders_to_changed: true }),
      session({ run_id: 'run_c', orders_to: 'simulated', orders_to_changed: true }),
    ])
    const leads = wrapper.findAll('.record-lead')
      .map(lead => lead.findAll('.boundary-words').map(words => words.text()))
    expect(leads).toEqual([
      ['Strategy changed from here', 'Orders to real money from here'],
      ['Orders simulated from here'],
    ])
  })

  /**
   * The mark says WHERE, and the card says what it means in the backend's words — which parameters
   * moved is not served yet, so the card says that too instead of leaving the reader to wonder.
   */
  it('explains a strategy mark on a card, and says which parameters moved is not served yet', () => {
    const wrapper = mountSessions([session({ run_id: 'run_a' }), session({ run_id: 'run_b', strategy_changed: true })])
    const details = wrapper.find('.record-lead').findComponent(HoverCard).props('details') as Figure[]
    expect(details.map(row => row.label)).toEqual(['Strategy', 'Which'])
    expect(details[0]?.value).toContain('its parameters differ from the session before')
    expect(details[1]?.value).toContain('Not served yet')
  })

  /** The operation mark also moves with what lies outside the file, which no route serves. */
  it('says on an operation mark that a change outside the file is not served', () => {
    const wrapper = mountSessions([session({ run_id: 'run_a' }), session({ run_id: 'run_b', operation_changed: true })])
    const details = wrapper.find('.record-lead').findComponent(HoverCard).props('details') as Figure[]
    expect(details.map(row => row.label)).toEqual(['Operation', 'Which', 'Not in a file'])
    expect(details[2]?.value).toContain('a default or a start option')
  })

  /**
   * The two halves of the comparison: the session before the mark and the one carrying it, each
   * opened COMPARED with the other — the values that differ are what a reader opens it for.
   */
  it('opens the configuration of the session before the mark and of the one after it, each compared with the other', async () => {
    const wrapper = mountSessions([session({ run_id: 'run_a' }), session({ run_id: 'run_b', strategy_changed: true })])
    const links = wrapper.findAll('.boundary-links .jump-link')
    await links[0]!.trigger('click')
    await links[1]!.trigger('click')
    expect(way.opened).toEqual([
      { what: 'comparison', id: 'run_a', other: 'run_b', side: 'after' },
      { what: 'comparison', id: 'run_b', other: 'run_a', side: 'before' },
    ])
  })

  it('offers no configuration where only the orders moved, nor a link where nothing can open it', () => {
    const ordersOnly = mountSessions([session({ run_id: 'run_a' }), session({ run_id: 'run_b', orders_to_changed: true })])
    expect(ordersOnly.find('.record-lead').findComponent(HoverCard).exists()).toBe(false)
    expect(ordersOnly.find('.boundary-links').exists()).toBe(false)

    const nowhere = mountSessions([session({ run_id: 'run_a' }), session({ run_id: 'run_b', strategy_changed: true })], false)
    expect(nowhere.find('.record-lead').findComponent(HoverCard).exists()).toBe(true)
    expect(nowhere.find('.boundary-links').exists()).toBe(false)
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
    const gapCell = wrapper.find('.record-row').findAll(':scope > span')[3]
    expect(gapCell?.text()).toBe('—')
  })

  // A session that ran 22 seconds rounds to "0 min" in a minutes-first formatter, which reads as
  // one that never ran. Every session in the only deployment we can measure is that short.
  it('does not round a short session down to nothing', () => {
    const wrapper = mountSessions([session({ ran_hours: 0.0062 })])
    const ranCell = wrapper.find('.record-row').findAll(':scope > span')[2]
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
    expect(wrapper.find('.record-head').text()).not.toContain('Session')
    // the first cell of the row is the run, not a number
    expect(wrapper.find('.record-row').findAll(':scope > span')[0]?.text())
      .toContain(BASE_SESSION.run_id)
  })

  it('renders a decline as a magnitude, like every other drawdown', () => {
    const wrapper = mountSessions([session({ max_drawdown: -212.75 })])
    expect(wrapper.text()).toContain('212.75')
    expect(wrapper.text()).not.toContain('-212.75')
  })
})

describe('DeploymentHeader', () => {
  it('shows the ledger figures for one account currency, the amounts carrying it', () => {
    const wrapper = mount(DeploymentHeader, { props: { row: BASE_ROW } })
    expect(wrapper.text()).toContain(`${BASE_ROW.currency}`)
    expect(wrapper.text()).toContain('max DD')
    expect(wrapper.text()).toContain('→')
  })

  /**
   * Each figure once (2026-10-20): the sessions are counted in the deployment line above, the bot
   * id is on the chosen line's card, and a moved configuration is the advisory's to say.
   */
  it('leaves out what the panel says elsewhere', () => {
    const wrapper = mount(DeploymentHeader, { props: { row: { ...BASE_ROW, changed: true } } })
    expect(wrapper.text()).not.toContain('session')
    expect(wrapper.text()).not.toContain('bot id')
    expect(wrapper.text()).not.toContain('configuration')
  })

  it('says nothing about an idle stretch that does not exist', () => {
    const wrapper = mount(DeploymentHeader, { props: { row: { ...BASE_ROW, longest_gap_hours: null } } })
    expect(wrapper.text()).not.toContain('longest idle')
    expect(mount(DeploymentHeader, { props: { row: { ...BASE_ROW, longest_gap_hours: 4.5 } } }).text())
      .toContain('longest idle 4.5 h')
  })
})

/**
 * A history of four sessions: nothing moved into session 2, a strategy change into session 3 and
 * an operational change into session 4.
 *
 * Built rather than captured. The backend currently holds one deployment of ONE session with no
 * change of either kind, so the capture cannot carry this shape — the contract test records that
 * gap separately rather than this render losing its cover.
 */
describe('SessionsTable across a history that moved', () => {
  const HISTORY: DeploymentSessionRow[] = [
    session({ run_id: 'r1', strategy_changed: false, operation_changed: false }),
    session({ run_id: 'r2', strategy_changed: false, operation_changed: false }),
    session({ run_id: 'r3', strategy_changed: true, operation_changed: false }),
    session({ run_id: 'r4', strategy_changed: false, operation_changed: true }),
  ]

  it('draws exactly the two boundaries the ledger reports, each above its session', () => {
    const wrapper = mountSessions(HISTORY)
    const boundaries = wrapper.findAll('.record-lead')
    expect(boundaries).toHaveLength(2)
    expect(boundaries[0]?.text()).toContain('Strategy changed')
    expect(boundaries[1]?.text()).toContain('Operation changed')

    // the rows themselves stay four: a boundary is a line of its own, not a row of the list
    const rows = wrapper.findAll('.record-row')
    expect(rows).toHaveLength(4)
    expect(rows[2]?.text()).toContain('r3')
  })
})

describe('AdvisoryNotice', () => {
  function mountAdvisory(overrides: Partial<DeploymentAdvisory> = {}) {
    return mount(AdvisoryNotice, { props: { advisory: { ...ADVISORY, ...overrides } } })
  }

  it('says in one line that the rows are not one series, and the sentence on hover', () => {
    const wrapper = mountAdvisory({ strategy_stands: 2, operation_stands: 2 })
    expect(wrapper.text()).toContain('2 strategy stands · 2 operational stands')
    expect(wrapper.text()).toContain('not one series')
    expect(wrapper.attributes('title')).toContain('4 sessions span 2 strategy stands and 2 operational stands')
    expect(wrapper.attributes('title')).toContain('a total over them answers no question')
  })

  /**
   * A status colour never travels alone. In the light theme a dark yellow and a dark red separate
   * by CVD ΔE 5.5, so a reader with red-green colour blindness tells a warning from an error by
   * the glyph and the sentence — never by hue. This holds the glyph.
   */
  it('carries a glyph, not only a colour, when it warns', () => {
    expect(mountAdvisory({ strategy_stands: 2 }).find('.mark').text()).toBe('⚠')
  })

  /**
   * The one case the advisory fires on by itself: the stands held, and the orders went to real
   * money in some sessions and to simulation in others. A calm "one configuration" sentence used
   * to stand exactly here, because the notice read the stands and never the orders.
   */
  it('names a history that mixed real money and simulated orders, where the stands held', () => {
    const wrapper = mountAdvisory({ strategy_stands: 1, operation_stands: 1, orders_to: ['simulated', 'venue'] })
    expect(wrapper.text()).toContain('real money and simulated orders')
    expect(wrapper.text()).toContain('not one series')
    expect(wrapper.find('.mark').exists()).toBe(true)
    expect(wrapper.attributes('title')).toContain('their orders went to real money and to simulation')
  })

  it('says nothing of the orders where they all went to one place', () => {
    expect(mountAdvisory({ orders_to: ['simulated'] }).text()).not.toContain('orders')
  })
})
