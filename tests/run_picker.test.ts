import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h } from 'vue'
import RunPicker from '@/components/runs/RunPicker.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useContextStore } from '@/stores/context_store'
import { useRunsStore } from '@/stores/runs_store'
import type { RunInfo } from '@/types/api/report_types'
import type { Figure } from '@/types/figure_types'
import { searchFor } from './facet_harness'
import { provideTestOpenInContext } from './open_in_context_harness'
import type { TestOpenInContext } from './open_in_context_harness'

/**
 * A row on SHOW. The run list also draws the rows of its closed families, with no height and unseen,
 * so its columns hold still when one opens — those carry `record-unseen` and are not rows a reader has.
 */
const SHOWN = '.record-row:not(.record-unseen)'

// Choosing a run loads its summary, and the picker is what is tested here, not the server. Without
// this the click asked a real address from jsdom, and the refused connection was printed into the
// suite's output as an `AggregateError` under whichever test happened to be running.
vi.mock('@/api/api_client', () => ({
  getRuns: vi.fn(async () => []),
  getRunSummary: vi.fn(async () => ({ absent: true, cause: 'artifact_not_produced', detail: '' })),
}))

const BASE: RunInfo = {
  // contract 15 — what the run DID. null is the ledger holding nothing, distinct from []
  results: null,
  run_outcome: null,
  error_count: null,
  warning_count: null,
  log_warning_count: null,
  tick_timespan_seconds: null,
  run_id: '20260925_095227_d9b8d79d',
  group: 'simulation',
  name: 'ETHUSD_blocks',
  start_time: '2026-09-25T09:52:27.000000+00:00',
  has_reports: true,
  reporting: 'expected',
  config_snapshot: 'ETHUSD_blocks.json',
  config_id: 'abc',
  parent_kind: null,
  parent_id: null,
  // contract 26 — who started the run, the header's origin block flattened
  origin_channel: 'cli',
  origin_client: 'console',
  origin_principal: 'operator',
  origin_host: 'h_x29og8',
  app_version: '1.4.0',
  git_commit: '7faec171',
  // null on every run recorded before contract 12 — unknown, never guessed
  ticks_from: null,
  orders_to: null,
  data_windows: null,
  size_bytes: 1,
  artifacts: [],
  stream_files: [],
  recording: null,
  // contracts 24 and 25: what the run is FOR, under which contract its reports
  // were written, and whether it is still its catalog entry's current one
  run_purpose: 'regular',
  report_contract: 25,
  fixture_superseded: null,
}

function run(overrides: Partial<RunInfo> = {}): RunInfo {
  const made = { ...BASE, ...overrides }
  // ONE run per set unless a test says otherwise. The list groups by family and a family of
  // several opens CLOSED, so runs sharing `BASE.name` would draw a single heading and no rows at
  // all — which is the grouping working, not the fixture.
  return overrides.name === undefined ? { ...made, name: `set_${made.run_id}` } : made
}

/** Seeds the store the way a loaded index would. There is no cascade to descend any more. */
function mountPicker(rows: RunInfo[]) {
  useRunsStore().runs = rows
  return mount(RunPicker, {
    attachTo: document.body,
  })
}

function rowTexts(wrapper: VueWrapper): string[] {
  return wrapper.findAll(SHOWN).map(node => node.text())
}

/**
 * Addressed by the id cell's TITLE, which carries the whole id — the cell itself shows only the
 * timestamp part, since the eight hex characters after it separate two runs of the same second and
 * cost the set name nine characters in every row.
 */
function rowFor(wrapper: VueWrapper, id: string) {
  return wrapper.findAll(SHOWN)
    .find(node => node.find('.run-id').attributes('title') === id)!
}

/** The ids in the order they are drawn — read from their own cell, not out of the running text. */
function rowIds(wrapper: VueWrapper): string[] {
  return wrapper.findAll(`${SHOWN} .run-id`).map(node => node.text())
}

/** The figures a row's card carries, as the list handed them over. */
function cardDetails(wrapper: VueWrapper, index = 0): Figure[] {
  return wrapper.findAllComponents(HoverCard)[index]?.props('details') ?? []
}

/** The same, as label -> value, for the cases where only the value is the subject. */
function cardRows(wrapper: VueWrapper, index = 0): Record<string, string> {
  return Object.fromEntries(cardDetails(wrapper, index).map(row => [row.label, row.value]))
}

describe('RunPicker', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /**
   * The id encodes the same instant, but nobody reads `20260925_095227` as a date at a glance —
   * and the date is what an operator actually scans a run list by.
   *
   * Read from the stamp's OWN cell rather than out of the row's running text: the id beside it
   * begins with the year, so an assertion over the whole row passes whatever the stamp says.
   */
  it('puts when the run started beside its id', () => {
    const row = rowFor(mountPicker([run()]), '20260925_095227_d9b8d79d')
    const stamp = row.find('.run-when').text()
    expect(stamp).toMatch(/Sep/)
    expect(stamp).toMatch(/[0-9]{2}:[0-9]{2}/)
    // no seconds, and no meridiem: two runs of the same minute are told apart by the id
    expect(stamp).not.toMatch(/[0-9]{2}:[0-9]{2}:[0-9]{2}/)
    expect(stamp).not.toMatch(/AM|PM/)
  })

  /**
   * A label says only what its neighbours do not — the same rule the time axis follows. Inside the
   * current year the year is silent; outside it, it is the thing that distinguishes the row and it
   * comes back.
   */
  it('drops the year inside the current one and keeps it outside', () => {
    const now = new Date().getFullYear()
    const thisYear = mountPicker([run({ start_time: `${now}-09-25T09:52:27+00:00` })])
    expect(thisYear.find('.run-when').text()).not.toContain(String(now))

    const older = mountPicker([run({ start_time: `${now - 3}-09-25T09:52:27+00:00` })])
    expect(older.find('.run-when').text()).toContain(String(now - 3))
  })

  // an absent or damaged stamp must read as "no date", never as the string Invalid Date
  it.each([
    ['an empty stamp', ''],
    ['a stamp that is not a date', 'not-a-date'],
  ])('says there is no date for %s', (_label, start_time) => {
    const shown = rowFor(mountPicker([run({ start_time })]), '20260925_095227_d9b8d79d').text()
    expect(shown).toContain('no date')
    expect(shown).not.toContain('Invalid')
  })

  /**
   * A logs-only run is listed AND selectable. It used to be disabled; the run view now says what
   * such a run is and the store asks the backend for nothing, so a row that cannot be clicked
   * would only look broken.
   */
  it('marks a logs-only run without putting it out of reach', async () => {
    const wrapper = mountPicker([run({ run_id: 'only_logs', has_reports: false, reporting: 'none' })])
    const row = rowFor(wrapper, 'only_logs')
    expect(row.text()).toContain('logs only')

    await row.trigger('click')
    await flushPromises()
    expect(useRunsStore().selectedRunId).toBe('only_logs')
  })

  /**
   * No artifacts but `reporting: expected` is a run that never got to its report — still running,
   * or it died first (their runs document reads the two fields as a pair). It is not logs only.
   */
  it('marks a run that never got to its report apart from one kept as logs only', () => {
    const wrapper = mountPicker([run({ run_id: 'unreported', has_reports: false, reporting: 'expected' })])
    const mark = rowFor(wrapper, 'unreported').find('.run-mark.logs')
    expect(mark.text()).toBe('no report')
    expect(mark.attributes('title')).toContain('Still running, or it died before its report phase')
  })

  /**
   * The whole reason the cascade went. Measured over the real index: 40 runs in 29 (group, set)
   * pairs, so a set dropdown held 29 entries while the run dropdown below it held one to six.
   */
  it('reaches every run without descending anything, whatever group it belongs to', () => {
    const wrapper = mountPicker([
      run({ run_id: 'a', group: 'live', name: 'profile_one' }),
      run({ run_id: 'b', group: 'simulation', name: 'set_two' }),
      run({ run_id: 'c', group: 'simulation', name: 'set_three' }),
    ])
    // three sets of one, so three plain rows: no heading, no click, nothing to descend
    expect(rowTexts(wrapper)).toHaveLength(3)
    expect(wrapper.findAll('.record-group')).toHaveLength(0)
  })

  // Newest first by default: the run someone wants is nearly always the one they just made.
  it('puts the newest run first', () => {
    const wrapper = mountPicker([
      run({ run_id: 'older', start_time: '2026-09-20T10:00:00+00:00' }),
      run({ run_id: 'newest', start_time: '2026-09-25T10:00:00+00:00' }),
      run({ run_id: 'middle', start_time: '2026-09-22T10:00:00+00:00' }),
    ])
    expect(rowIds(wrapper)).toEqual(['newest', 'middle', 'older'])
  })

  /**
   * Parsed rather than compared as text: two ISO stamps with different offsets sort in the wrong
   * order as strings, and an unreadable one must not jump to the top of "newest".
   */
  it('sorts on the instant, not on the text of the stamp', () => {
    const wrapper = mountPicker([
      run({ run_id: 'broken', start_time: 'not-a-date' }),
      run({ run_id: 'shifted', start_time: '2026-09-25T11:00:00+02:00' }),
      run({ run_id: 'utc', start_time: '2026-09-25T10:00:00+00:00' }),
    ])
    // 11:00+02:00 is 09:00Z, so the UTC stamp is the later of the two; the broken one sorts last
    expect(rowIds(wrapper)).toEqual(['utc', 'shifted', 'broken'])
  })

  /**
   * **The families the list folds**, and what decides where each one stands.
   *
   * Measured 2026-10-09 over the 85 stored runs: 42 lines instead of 85, 14 of them a family and
   * 28 a run standing alone. The key is the PARENT where the backend states one and the set name
   * otherwise — measured, because the set name alone folds nothing on a sweep: its children each
   * carry their own (`..._c000` through `..._c008`).
   */
  describe('the families it folds', () => {
    // a sweep's and a deployment's runs are left to their own lists by default: these show the list
    // once `Parent` lets them in, as the reader does
    beforeEach(() => {
      useArrangementStore().setFacets('runs', {
        selection: { purpose: ['regular', 'certificate', 'unknown'] }, search: '', sort: 'newest', scope: null,
      })
    })

    it('folds a set into one line and gives its runs back on a click', async () => {
      const wrapper = mountPicker([
        run({ run_id: 'late', name: 'nightly', start_time: '2026-09-25T10:00:00+00:00' }),
        run({ run_id: 'early', name: 'nightly', start_time: '2026-09-24T10:00:00+00:00' }),
      ])
      const heading = wrapper.find('.record-group')
      expect(heading.exists()).toBe(true)
      // CLOSED to begin with: the fold is the point, and a list that opens expanded folded nothing
      expect(heading.attributes('aria-expanded')).toBe('false')
      expect(rowIds(wrapper)).toEqual([])

      await heading.trigger('click')
      expect(rowIds(wrapper)).toEqual(['late', 'early'])
      expect(wrapper.find('.record-group').attributes('aria-expanded')).toBe('true')
    })

    it('leaves a set of one a plain row, with nothing to open', () => {
      const wrapper = mountPicker([run({ run_id: 'alone', name: 'once' })])
      expect(wrapper.findAll('.record-group')).toHaveLength(0)
      expect(rowIds(wrapper)).toEqual(['alone'])
    })

    /**
     * The sweep case, and the one that refuted grouping by set name alone: nine runs with nine
     * different set names, bound by one `parent_id`.
     */
    it('binds runs by their parent even where every set name differs', async () => {
      const wrapper = mountPicker([
        run({ run_id: 'c1', name: 'base__sweep_1_c001', parent_id: 'sweep_1', parent_kind: 'sweep' }),
        run({ run_id: 'c2', name: 'base__sweep_1_c002', parent_id: 'sweep_1', parent_kind: 'sweep' }),
        run({ run_id: 'solo', name: 'unrelated' }),
      ])
      const headings = wrapper.findAll('.record-group')
      expect(headings).toHaveLength(1)
      // the heading is the parent itself, in their word for what it is
      expect(headings[0]!.text()).toContain('sweep_1')
      expect(headings[0]!.text()).toContain('sweep')
      // the run outside the sweep is untouched by it
      expect(rowIds(wrapper)).toEqual(['solo'])
      await headings[0]!.trigger('click')
      expect(rowIds(wrapper)).toEqual(['c1', 'c2', 'solo'])
    })

    /**
     * How many, and WHEN the run at the top of it ran. The stamp is that row's own `Started`, which
     * is what makes the family stand where it does: the list keeps families in the order their
     * first row appears, so the sort the reader chose orders the families too.
     */
    it('says how many runs a family holds and when its top one ran', () => {
      const wrapper = mountPicker([
        run({ run_id: 'b', name: 'nightly', start_time: '2026-09-24T10:00:00+00:00' }),
        run({ run_id: 'a', name: 'nightly', start_time: '2026-09-25T08:30:00+00:00' }),
      ])
      const heading = wrapper.find('.record-group').text()
      expect(heading).toContain('2 runs')
      // the newest of the two, since the list opens newest-first
      expect(heading).toContain('Sep 25')
      expect(heading).not.toContain('Sep 24')
    })

    /**
     * Where a family STANDS, which was the decision of 2026-10-09: at its top run, so that
     * "sort by time" keeps meaning time. The alternative was grouping only under the name sort,
     * which is two lists.
     */
    it('orders families by the run each one stands at', () => {
      const wrapper = mountPicker([
        run({ run_id: 'old_pair', name: 'older_set', start_time: '2026-09-20T10:00:00+00:00' }),
        run({ run_id: 'old_pair_2', name: 'older_set', start_time: '2026-09-19T10:00:00+00:00' }),
        run({ run_id: 'newest_alone', name: 'single', start_time: '2026-09-26T10:00:00+00:00' }),
        run({ run_id: 'new_pair', name: 'newer_set', start_time: '2026-09-25T10:00:00+00:00' }),
        run({ run_id: 'new_pair_2', name: 'newer_set', start_time: '2026-09-18T10:00:00+00:00' }),
      ])
      // the lines in the order they are drawn: a family stands at its top run, so `newer_set`
      // comes above `older_set` although it also holds the oldest run of all
      // read from the cell's own title, not out of the running text: the heading now carries
      // the list's disclosure glyph as its first token
      const lines = wrapper.findAll(`.record-group, ${SHOWN}`)
        .map(node => node.find('.family-name').exists()
          ? node.find('.family-name').attributes('title')
          : node.find('.run-id').attributes('title'))
      expect(lines).toEqual(['newest_alone', 'newer_set', 'older_set'])
    })

    /**
     * The kind is said ONCE. A family states it on its heading, so the rows beneath carried five
     * identical `deployment` badges until this — seen on screen 2026-10-09, not reasoned about.
     */
    it('marks the kind on a run that stands alone, and not under a heading that says it', async () => {
      const wrapper = mountPicker([
        run({ run_id: 'alone', name: 'solo', parent_id: 'deploy_9', parent_kind: 'deployment' }),
        run({ run_id: 'held_1', name: 'pair', parent_id: 'deploy_1', parent_kind: 'deployment' }),
        run({ run_id: 'held_2', name: 'pair', parent_id: 'deploy_1', parent_kind: 'deployment' }),
      ])
      // the lone run keeps its badge: nothing above it says what kind of run it is
      expect(wrapper.findAll(`${SHOWN} .run-marks`).map(node => node.text())).toEqual(['deployment'])

      await wrapper.find('.record-group').trigger('click')
      // opened, the family's two rows carry no badge at all — the heading carries it
      expect(wrapper.findAll(SHOWN)).toHaveLength(3)
      // the lone run is first (all three share a stamp, so the order is the one they arrived in)
      expect(wrapper.findAll(`${SHOWN} .run-marks`).map(node => node.text())).toEqual(['deployment', '', ''])
    })

    /**
     * **The list stays the list.** It folded to one line once a run was chosen, so forty rows did
     * not push every section off the screen; the run report is a panel of its own since
     * 2026-10-14, so nothing below the list needs its room any more.
     */
    it('keeps every row on show once a run is chosen, the chosen one marked', async () => {
      const wrapper = mountPicker([run({ run_id: 'a' }), run({ run_id: 'b' })])
      useContextStore().selectRun('a')
      await flushPromises()
      expect(rowIds(wrapper)).toEqual(['a', 'b'])
      expect(rowFor(wrapper, 'a').classes()).toContain('picked')
    })

    /** The run the reader left open is restored BEFORE the picker mounts — and is marked all the same. */
    it('marks a run that was chosen before it mounted', () => {
      useContextStore().selectRun('a')
      const wrapper = mountPicker([run({ run_id: 'a' }), run({ run_id: 'b' })])
      expect(rowFor(wrapper, 'a').classes()).toContain('picked')
    })

    /**
     * The `Set` facet is GONE, and the grouping is why: it offered the same partition a second
     * time, and on a sweep it offered thirteen values matching one run each.
     */
    it('offers no Set facet, because the grouping is one', () => {
      const wrapper = mountPicker([run({ run_id: 'a' }), run({ run_id: 'b' })])
      const offered = wrapper.findAll('.facet-trigger').map(node => node.text())
      expect(offered.some(text => text.includes('Set'))).toBe(false)
      // the ones that stayed, so this cannot pass by the bar being absent altogether
      expect(offered.some(text => text.includes('Pipeline'))).toBe(true)
      expect(offered.some(text => text.includes('Purpose'))).toBe(true)
    })

    /** A chosen run must never sit inside a fold nobody opened — it would be out of reach. */
    it('keeps the family of the chosen run open', async () => {
      const wrapper = mountPicker([
        run({ run_id: 'pickedone', name: 'nightly', start_time: '2026-09-25T10:00:00+00:00' }),
        run({ run_id: 'other', name: 'nightly', start_time: '2026-09-24T10:00:00+00:00' }),
      ])
      expect(rowIds(wrapper)).toEqual([])
      useContextStore().selectRun('pickedone')
      await flushPromises()
      expect(rowIds(wrapper)).toEqual(['pickedone', 'other'])
    })

    /**
     * Opened WITH the choice rather than held open: a heading that could not close the family was a
     * button that did nothing. *Show in list* opens it again where the reader closed it.
     */
    it('lets the reader close the family of the chosen run, and opens it again when the row is asked for', async () => {
      const wrapper = mountPicker([
        run({ run_id: 'pickedone', name: 'nightly', start_time: '2026-09-25T10:00:00+00:00' }),
        run({ run_id: 'other', name: 'nightly', start_time: '2026-09-24T10:00:00+00:00' }),
      ])
      useContextStore().selectRun('pickedone')
      await flushPromises()
      await wrapper.find('.record-group').trigger('click')
      expect(rowIds(wrapper)).toEqual([])

      useRunsStore().askForChosenRow()
      await flushPromises()
      expect(rowIds(wrapper)).toEqual(['pickedone', 'other'])
    })
  })

  /** A chosen run the filter hides is said where the list is, with the way to see it. */
  it('says where the filter hides the chosen run, and shows every run on request', async () => {
    const wrapper = mountPicker([run({ run_id: 'kept' }), run({ run_id: 'chosen' })])
    useContextStore().selectRun('chosen')
    await flushPromises()
    expect(wrapper.find('.chosen-hidden').exists()).toBe(false)

    await searchFor(wrapper, 'set_kept')
    expect(wrapper.find('.chosen-hidden').text()).toContain('The chosen run is not in this list')
    // below the rows, where its coming and going on a pick moves none of them
    const order = wrapper.find('.run-list').element.compareDocumentPosition(wrapper.find('.chosen-hidden').element)
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await wrapper.find('.chosen-hidden button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.chosen-hidden').exists()).toBe(false)
    expect(rowIds(wrapper)).toContain('chosen')
  })

  /**
   * Whether the chosen row stands in the list's own view is the browser's to measure: the list
   * hands the answer to the store, and takes it back when it goes.
   */
  it('reports whether the chosen row stands in its view, and takes it back on unmount', async () => {
    let report: ((entries: { isIntersecting: boolean }[]) => void) | null = null
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { report = callback }
      observe(): void {}
      disconnect(): void {}
    })
    try {
      const wrapper = mountPicker([run({ run_id: 'chosen' })])
      useContextStore().selectRun('chosen')
      await flushPromises()
      report!([{ isIntersecting: true }])
      expect(useRunsStore().chosenRowInView).toBe(true)

      wrapper.unmount()
      expect(useRunsStore().chosenRowInView).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  /**
   * Aimed anew — a quiet refresh of the index, a family opened — the observer answers for itself.
   * Written out of view first, the bundle's *Show in list* showed for a frame on every re-aim.
   */
  it('leaves the answer standing while the observer is aimed anew', async () => {
    let report: ((entries: { isIntersecting: boolean }[]) => void) | null = null
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { report = callback }
      observe(): void {}
      disconnect(): void {}
    })
    try {
      mountPicker([run({ run_id: 'chosen' }), run({ run_id: 'other' })])
      useContextStore().selectRun('chosen')
      await flushPromises()
      report!([{ isIntersecting: true }])

      useRunsStore().runs = [...useRunsStore().runs]
      await flushPromises()
      expect(useRunsStore().chosenRowInView).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('narrows the list by a facet, and says how many of how many are left', async () => {
    const wrapper = mountPicker([
      run({ run_id: 'a', group: 'live' }),
      run({ run_id: 'b', group: 'simulation' }),
    ])
    await searchFor(wrapper, 'a')
    await flushPromises()
    expect(rowTexts(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('1 of 2')
  })

  /** A pick chooses the run and says so, so the panel holding the list can bring the report forward. */
  it('chooses a run on a click and says which, the list staying as it is', async () => {
    const wrapper = mountPicker([run({ run_id: 'only_logs', has_reports: false })])
    await rowFor(wrapper, 'only_logs').trigger('click')
    await flushPromises()

    expect(useRunsStore().selectedRunId).toBe('only_logs')
    expect(wrapper.emitted('chosen')).toEqual([['only_logs']])
    expect(wrapper.find('.run-list').exists()).toBe(true)
  })

  /**
   * The id is shortened to the timestamp, because the eight hex characters after it separate two
   * runs of the same second and nothing else — and since the columns share one grid, their width
   * came straight off the set name. The whole id stays one hover away, the way the configuration
   * id already works.
   */
  it('shows the stamp of an id and keeps the whole of it reachable', () => {
    const wrapper = mountPicker([run({ run_id: '20260925_095227_d9b8d79d' })])
    const cell = wrapper.find('.run-id')
    expect(cell.text()).toBe('20260925_095227…')
    expect(cell.attributes('title')).toBe('20260925_095227_d9b8d79d')
  })

  it('says so plainly where the index is empty', () => {
    expect(mountPicker([]).find('.picker-hint').text()).toContain('run index is empty')
  })

  /**
   * What each run DID, from the index row itself (contract 15). This is the feature that replaced
   * one `run-summary` request per row — forty requests to fill a list of forty.
   */
  /**
   * A sweep's combinations and a deployment's sessions are held by panels of their own, each a click
   * from its run (operator, 2026-10-20). The list leaves them out by default — out, never removed:
   * `Parent` brings them back.
   */
  describe('what it leaves to the lists of their own', () => {
    it('lists the runs that stand alone, and those whose parent is of a kind not recorded', () => {
      const wrapper = mountPicker([
        run({ run_id: 'solo' }),
        run({ run_id: 'combination', name: 'base__sweep_1_c001', parent_id: 'sweep_1', parent_kind: 'sweep' }),
        run({ run_id: 'session', name: 'bot', parent_id: 'deploy_1', parent_kind: 'deployment' }),
        run({ run_id: 'early', name: 'old', parent_id: 'sweep_0', parent_kind: null }),
      ])
      expect([...rowIds(wrapper)].sort()).toEqual(['early', 'solo'])
    })

    function mountHosted(rows: RunInfo[]): { wrapper: VueWrapper, way: TestOpenInContext } {
      useRunsStore().runs = rows
      let way: TestOpenInContext = { opened: [] }
      const Host = defineComponent({
        setup() {
          way = provideTestOpenInContext()
          return () => h(RunPicker)
        },
      })
      return { wrapper: mount(Host, { attachTo: document.body }), way }
    }

    /** Chosen in the Sweeps panel, a combination is out of this list: the notice leads to the one that holds it. */
    it('leads from a chosen run that its own list holds to that list', async () => {
      const { wrapper, way } = mountHosted([
        run({ run_id: 'solo' }),
        run({ run_id: 'combination', name: 'base__sweep_1_c001', parent_id: 'sweep_1', parent_kind: 'sweep' }),
      ])
      useContextStore().selectRun('combination')
      await flushPromises()
      const notice = wrapper.find('.chosen-hidden')
      expect(notice.text()).toContain('The chosen run belongs to sweep sweep_1')
      await notice.find('button').trigger('click')
      expect(way.opened).toEqual([{ what: 'sweep', id: 'sweep_1' }])
      wrapper.unmount()
    })

    it('says a run that the search hides the way it did, offering every run', async () => {
      const { wrapper } = mountHosted([run({ run_id: 'solo' }), run({ run_id: 'other', name: 'other_set' })])
      useContextStore().selectRun('solo')
      await searchFor(wrapper, 'other_set')
      expect(wrapper.find('.chosen-hidden').text()).toContain('Show every run')
      wrapper.unmount()
    })
  })

  describe('what the row says the run did', () => {
    /** The four figure CELLS of a row, read together — each is a track of the list's own grid. */
    function figuresFor(wrapper: VueWrapper, id: string): string {
      const row = rowFor(wrapper, id)
      return ['.run-outcome', '.run-pnl', '.run-trades', '.run-counts']
        .map(selector => row.find(selector).text())
        .join(' ')
        .trim()
    }

    /**
     * How much MARKET the run read — the question an operator arrives with and the one no other
     * cell on the row answers. `null` on a run recorded before contract 17, which is an absence
     * rather than a run of no length.
     */
    it('says how much market time a run covered', () => {
      const wrapper = mountPicker([
        run({ run_id: 'big', tick_timespan_seconds: 464 * 3600 }),
        run({ run_id: 'small', tick_timespan_seconds: 5 * 3600 }),
        run({ run_id: 'unrecorded', tick_timespan_seconds: null }),
      ])
      expect(rowFor(wrapper, 'big').find('.run-span').text()).toBe('464.0 h (19.3 days)')
      expect(rowFor(wrapper, 'small').find('.run-span').text()).toBe('5.0 h')
      expect(rowFor(wrapper, 'unrecorded').find('.run-span').text()).toBe('n/a')
    })

    /**
     * The line this panel is drawn on. A run with two account currencies shows TWO figures — one
     * summed number would be a value the backend never stated, and wrong arithmetic besides, since
     * the two are different money.
     */
    it('shows one figure per account currency and never folds them', () => {
      const wrapper = mountPicker([run({
        run_id: 'two_currencies',
        run_outcome: 'success',
        results: [
          { currency: 'EUR', net_pnl: 42.93, total_trades: 11 },
          { currency: 'USD', net_pnl: -8.5, total_trades: 4 },
        ],
      })])
      const text = figuresFor(wrapper, 'two_currencies')
      expect(text).toContain('EUR')
      expect(text).toContain('USD')
      expect(text).toContain('11 trades')
      expect(text).toContain('4 trades')
      // one line per currency in BOTH cells, so an amount and its trade count stay together
      expect(wrapper.findAll('.run-pnl > span')).toHaveLength(2)
      expect(wrapper.findAll('.run-trades > span')).toHaveLength(2)
    })

    /**
     * The three states of `results`, which are three different statements. Measured over the 41
     * runs on this machine: 38 lists, 2 null, 1 empty — all three reach the screen.
     */
    it('tells a run the ledger knows nothing about from one that closed without figures', () => {
      const wrapper = mountPicker([
        run({ run_id: 'unrecorded', results: null, run_outcome: null }),
        run({ run_id: 'no_figures', results: [], run_outcome: 'success' }),
      ])
      expect(wrapper.findAll('.run-pnl > span')).toHaveLength(0)
      // an outcome the ledger did state is still shown for the second
      expect(figuresFor(wrapper, 'no_figures')).toContain('success')
      expect(figuresFor(wrapper, 'unrecorded')).not.toContain('success')
    })

    // null means nobody counted, which is not zero — neither may be rendered as a mark
    it('marks a count only where one was taken and is not zero', () => {
      const wrapper = mountPicker([
        run({ run_id: 'troubled', error_count: 2, warning_count: 3 }),
        run({ run_id: 'clean', error_count: 0, warning_count: 0 }),
        run({ run_id: 'uncounted', error_count: null, warning_count: null }),
      ])
      expect(figuresFor(wrapper, 'troubled')).toContain('2')
      expect(figuresFor(wrapper, 'troubled')).toContain('3')
      expect(figuresFor(wrapper, 'clean')).not.toMatch(/[0-9]/)
      expect(figuresFor(wrapper, 'uncounted')).not.toMatch(/[0-9]/)
    })

    // Tier 2 is ignorable by design — the backend says so, so it is not a mark on the row
    it('leaves the Tier-2 log count off the row', () => {
      const wrapper = mountPicker([run({ run_id: 'noisy', log_warning_count: 547 })])
      expect(figuresFor(wrapper, 'noisy')).not.toContain('547')
    })

    /**
     * What a run is FOR (contract 24), and the ONE facet that starts with values picked.
     *
     * Measured 2026-10-09 over 85 runs: 58 are `fixture`, whose numbers are built rather than
     * earned. They are not the operator's work and they are two thirds of the list.
     *
     * **Everything except `fixture`, never "only `regular`"** — testingide warned about exactly
     * that mistake, and it would hide the two real-money `certificate` runs along with every run
     * whose purpose could not be read.
     */
    /**
     * Did money move? The operator went looking for this filter and there was none: *"ich wollte
     * die field study suchen, indem ich einfach real money filtere — keinen filter gesehen."*
     *
     * `orders_to` answers it and nothing else does, which is their own instruction. Measured over
     * 85 runs: 83 `simulated`, and the two field studies at `venue`.
     */
    it('tells a run that moved money from one that did not, and never guesses', async () => {
      const wrapper = mountPicker([
        run({ run_id: 'study', orders_to: 'venue', run_purpose: 'certificate' }),
        run({ run_id: 'mock', orders_to: 'simulated', run_purpose: 'regular' }),
        run({ run_id: 'silent', orders_to: null, run_purpose: 'regular' }),
      ])
      await flushPromises()
      const trigger = wrapper.findAll('.facet-trigger').find(n => n.text().includes('Money'))!
      await trigger.trigger('click')
      await flushPromises()
      const offered = [...document.querySelectorAll<HTMLElement>('.facet-option')]
        .map(node => node.textContent ?? '')

      expect(offered.some(text => text.includes('real money'))).toBe(true)
      expect(offered.some(text => text.includes('simulated'))).toBe(true)
      // the run that states nothing is NOT claimed as simulated — reading an absence as
      // "no money moved" is the one mistake here that could actually matter
      expect(offered).toHaveLength(2)

      // the panel is TELEPORTED to the document and outlives the wrapper, so a later test that
      // counts `.facet-option` would count these too. Unmounting is what takes it back.
      wrapper.unmount()
    })

    it('opens without the fixtures, and keeps the certificates and the unknown', async () => {
      const wrapper = mountPicker([
        run({ run_id: 'mine', run_purpose: 'regular' }),
        run({ run_id: 'built', run_purpose: 'fixture' }),
        run({ run_id: 'gate', run_purpose: 'certificate' }),
        run({ run_id: 'nameless', run_purpose: null }),
      ])
      await flushPromises()

      const shown = rowTexts(wrapper).join(' ')
      expect(shown).toContain('mine')
      expect(shown).toContain('gate')
      expect(shown).toContain('nameless')
      expect(shown).not.toContain('built')
      // and the bar says what it left out rather than shortening in silence
      expect(wrapper.text()).toContain('3 of 4')
    })

    /** It is a starting value, not a floor: the reader can ask for the fixtures back. */
    it('gives the fixtures back when the facet is cleared', async () => {
      const wrapper = mountPicker([
        run({ run_id: 'mine', run_purpose: 'regular' }),
        run({ run_id: 'built', run_purpose: 'fixture' }),
      ])
      await flushPromises()
      expect(rowTexts(wrapper).join(' ')).not.toContain('built')

      await wrapper.find('.facet-clear').trigger('click')
      await flushPromises()
      expect(rowTexts(wrapper).join(' ')).toContain('built')
    })

    it('offers the outcome as a facet, and an unrecorded one is not a category', () => {
      const wrapper = mountPicker([
        run({ run_id: 'a', run_outcome: 'success' }),
        run({ run_id: 'b', run_outcome: 'failed' }),
        run({ run_id: 'c', run_outcome: null }),
      ])
      const labels = wrapper.findAll('.facet-trigger').map(node => node.text())
      expect(labels.some(label => label.includes('Outcome'))).toBe(true)
    })

    /**
     * ONE axis with three values, replacing an `Outcome` facet and a `Trouble` facet.
     *
     * The second could not do its job: it offered `error` from `error_count`, which is 0 on all 46
     * stored runs including the nine graded `failed` — one of them reporting four errors, because
     * `errors[]` holds scenarios that failed VALIDATION and never ran while `error_count` counts
     * runtime errors. A run with errors is a run graded `failed`, so the grade already is that
     * filter.
     *
     * Each value is a mechanical reading: a grade that is not `success` appears under the backend's
     * OWN word, and the two success states split on whether a warning was counted.
     */
    it('splits the outcome by warnings counted, and keeps the grade itself', async () => {
      const wrapper = mountPicker([
        run({ run_id: 'quiet', run_outcome: 'success', warning_count: 0 }),
        run({ run_id: 'noisy', run_outcome: 'success', warning_count: 3 }),
        run({ run_id: 'broken', run_outcome: 'failed', warning_count: 2 }),
        // a grade of theirs we have never seen keeps its own word rather than becoming `failed`
        run({ run_id: 'partial', run_outcome: 'finished_with_errors', warning_count: 0 }),
        // nobody graded it, so it answers no question about the outcome at all
        run({ run_id: 'ungraded', run_outcome: null, warning_count: 9 }),
      ])
      // the options are TELEPORTED to the document, so they are read there and not in the wrapper
      await wrapper.findAll('.facet-trigger')
        .find(node => node.text().includes('Outcome'))!
        .trigger('click')
      await flushPromises()
      const offered = [...document.querySelectorAll<HTMLElement>('.facet-option')]
        .map(node => node.textContent ?? '')

      // THEIR words since 2026-10-09, taken from the served field: `warning_count`
      expect(offered.some(text => text.includes('no warnings'))).toBe(true)
      expect(offered.some(text => text.includes('with warnings'))).toBe(true)
      expect(offered.some(text => text.includes('failed'))).toBe(true)
      expect(offered.some(text => text.includes('finished_with_errors'))).toBe(true)
      // `ungraded` states no outcome, so it is offered as nothing to pick
      expect(offered).toHaveLength(4)
      // the two values the old pair offered and this one must not: `warning` as an axis of its own,
      // and `error`, which no stored run could ever produce
      expect(offered.some(text => text.trim() === 'warning')).toBe(false)
      expect(offered.some(text => text.trim() === 'error')).toBe(false)
    })

    /**
     * Contract 38: a session the backend has not graded yet carries `recording`, the one field that
     * tells a running session from one that died before its report. Shown in the Outcome cell with
     * a glyph and a word, and offered by the facet; a grade, once there, is what the cell says.
     */
    it('says how a session without its grade records, and lets the facet pick it', async () => {
      const wrapper = mountPicker([
        run({ run_id: 'live', run_outcome: null, recording: 'current' }),
        run({ run_id: 'hung', run_outcome: null, recording: 'stopped' }),
        run({ run_id: 'closing', run_outcome: null, recording: 'ended' }),
        run({ run_id: 'graded', run_outcome: 'success', recording: 'ended' }),
      ])
      const outcomeOf = (id: string) => rowFor(wrapper, id).find('.run-outcome')

      expect(outcomeOf('live').text()).toBe('● recording')
      expect(outcomeOf('live').classes()).toContain('recording-current')
      expect(outcomeOf('hung').text()).toBe('⚠ recording stopped')
      expect(outcomeOf('hung').classes()).toContain('recording-stopped')
      expect(outcomeOf('hung').attributes('title')).toContain('Activities')
      expect(outcomeOf('closing').text()).toBe('■ ended')
      expect(outcomeOf('graded').text()).toBe('✓ success')

      await wrapper.findAll('.facet-trigger')
        .find(node => node.text().includes('Outcome'))!
        .trigger('click')
      await flushPromises()
      const offered = [...document.querySelectorAll<HTMLElement>('.facet-option')]
        .map(node => node.textContent ?? '')
      expect(offered.some(text => text.includes('recording stopped'))).toBe(true)
      expect(offered.some(text => text.includes('ended'))).toBe(true)
    })
  })
  /**
   * The columns a narrow list gives up, and the card that means nothing is lost by it.
   *
   * The two halves are one feature: a rank is only defensible because the figure it hides is still
   * reachable on the same row. Hiding a column with nowhere else to read it would be a loss.
   */
  describe('what a narrow list keeps, and what the card holds', () => {
    /**
     * The rank lives twice — on the column and on the cell — and it has to, because the list owns
     * the tracks while this component owns the cells. A track given up under a cell that stayed
     * would shift every later cell into the wrong column, and nothing on screen would say so.
     */
    it('gives every cell the rank its own column declares', () => {
      const wrapper = mountPicker([run()])
      const heads = wrapper.findAll('.record-head > span').map(node => node.attributes('data-rank'))
      const cells = wrapper.find(SHOWN).findAll(':scope > span')
        .map(node => node.attributes('data-rank'))

      expect(heads).not.toHaveLength(0)
      expect(cells).toEqual(heads)
      // WHICH run, whether it worked, what it earned: Started, Set, Outcome, Net P&L
      expect(heads.filter(rank => rank === '1')).toHaveLength(4)
    })

    /** Every row carries one: the index row has twenty-one fields and ten of them reach a column. */
    it('offers a card on every run', () => {
      const wrapper = mountPicker([run({ run_id: 'a' }), run({ run_id: 'b' })])
      expect(wrapper.findAllComponents(HoverCard)).toHaveLength(2)
      expect(wrapper.findAllComponents(HoverCard)[0]?.props('title')).toBe('a')
    })

    it('names the configuration, the provenance and the weight of the run', () => {
      const rows = cardRows(mountPicker([run({
        config_snapshot: 'ETHUSD_blocks.json',
        config_id: 'c'.repeat(64),
        app_version: '1.4.0',
        git_commit: '7faec171',
        size_bytes: 23878038,
      })]))
      expect(rows['Config file']).toBe('ETHUSD_blocks.json')
      expect(rows['Config id']).toBe(`${'c'.repeat(12)}…`)
      expect(rows['Version']).toBe('1.4.0 · 7faec171')
      expect(rows['Size']).toBe('23.9 MB')
    })

    /**
     * `ticks_from` and `orders_to` are null on a run recorded before contract 12 — unknown, never
     * guessed — so the card states them or says nothing. Measured over the stored runs: 18 of 46
     * carry them.
     */
    it('states where the ticks came from only where the run recorded it', () => {
      const stated = cardRows(mountPicker([run({ ticks_from: 'archive', orders_to: 'simulated' })]))
      expect(stated['Ticks from']).toBe('archive')
      expect(stated['Orders to']).toBe('simulated')

      const silent = cardRows(mountPicker([run({ ticks_from: null, orders_to: null })]))
      expect(silent['Ticks from']).toBeUndefined()
      expect(silent['Orders to']).toBeUndefined()
    })

    /** The sections the run WROTE — it says which panels can exist at all. */
    it('counts the artifacts and keeps their names reachable', () => {
      const rows = cardDetails(mountPicker([run({
        artifacts: ['run_summary.json', 'portfolio.json', 'broker.json'],
      })]))
      const artifacts = rows.find(row => row.label === 'Artifacts')
      expect(artifacts?.value).toBe('3 sections')
      expect(artifacts?.title).toContain('portfolio.json')
    })

    /** Logs only: the row already marks it, so an empty list gets no line of its own. */
    it('says nothing about artifacts on a run that wrote none', () => {
      const rows = cardRows(mountPicker([run({ artifacts: [], has_reports: false })]))
      expect(rows['Artifacts']).toBeUndefined()
    })

    /**
     * The one trouble count the ROW deliberately leaves off, because Tier 2 is ignorable by
     * design — and it reaches 547 on a stored run, which is worth a line where it is not zero.
     * A zero says nothing at all, so it gets nothing.
     */
    it('puts the Tier-2 log count in the card, where it is not zero', () => {
      expect(cardRows(mountPicker([run({ log_warning_count: 547 })]))['Log warnings']).toBe('547')
      expect(cardRows(mountPicker([run({ log_warning_count: 0 })]))['Log warnings']).toBeUndefined()
      expect(cardRows(mountPicker([run({ log_warning_count: null })]))['Log warnings'])
        .toBeUndefined()
    })

    /** The windows a run DECLARED, which is not the market time it went on to read. */
    it('counts the declared data windows and leaves an absence absent', () => {
      const declared = cardRows(mountPicker([run({
        data_windows: [
          { unit_name: 'unit_a', start_date: '2026-01-01', end_date: '2026-01-02' },
          { unit_name: 'unit_b', start_date: '2026-01-01', end_date: null },
        ],
      })]))
      expect(declared['Data windows']).toBe('2 windows')
      expect(cardRows(mountPicker([run({ data_windows: null })]))['Data windows']).toBeUndefined()
    })

    /** A damaged stamp is a hole in the card too, and it must not take the list down with it. */
    it('draws a run whose stamp is not a date', () => {
      const wrapper = mountPicker([run({ run_id: 'broken', start_time: 'not-a-date' })])
      expect(wrapper.findAll(SHOWN)).toHaveLength(1)
      expect(cardRows(wrapper)['Started (UTC)']).toBeUndefined()
    })
  })
})
