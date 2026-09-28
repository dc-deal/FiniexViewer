import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RunPicker from '@/components/runs/RunPicker.vue'
import { useRunsStore } from '@/stores/runs_store'
import type { RunInfo } from '@/types/api/report_types'

const BASE: RunInfo = {
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
  app_version: '1.4.0',
  git_commit: '7faec171',
  size_bytes: 1,
  artifacts: [],
}

function run(overrides: Partial<RunInfo> = {}): RunInfo {
  return { ...BASE, ...overrides }
}

/** Seeds the store the way a loaded index would. There is no cascade to descend any more. */
function mountPicker(rows: RunInfo[]) {
  useRunsStore().runs = rows
  return mount(RunPicker, { attachTo: document.body })
}

function rowTexts(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.run-row').map(node => node.text())
}

function rowFor(wrapper: VueWrapper, id: string) {
  return wrapper.findAll('.run-row').find(node => node.text().includes(id))!
}

/** The ids in the order they are drawn — read from their own cell, not out of the running text. */
function rowIds(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.run-id').map(node => node.text())
}

describe('RunPicker', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /**
   * The id encodes the same instant, but nobody reads `20260925_095227` as a date at a glance —
   * and the date is what an operator actually scans a run list by.
   */
  it('puts when the run started beside its id', () => {
    const shown = rowFor(mountPicker([run()]), '20260925_095227_d9b8d79d').text()
    expect(shown).toMatch(/2026/)
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
   * The whole reason the cascade went. Measured over the real index: 40 runs in 29 (group, set)
   * pairs, so a set dropdown held 29 entries while the run dropdown below it held one to six.
   */
  it('lists every run flat, whatever group or set it belongs to', () => {
    const wrapper = mountPicker([
      run({ run_id: 'a', group: 'live', name: 'profile_one' }),
      run({ run_id: 'b', group: 'simulation', name: 'set_two' }),
      run({ run_id: 'c', group: 'simulation', name: 'set_three' }),
    ])
    expect(rowTexts(wrapper)).toHaveLength(3)
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

  it('narrows the list by a facet, and says how many of how many are left', async () => {
    const wrapper = mountPicker([
      run({ run_id: 'a', group: 'live' }),
      run({ run_id: 'b', group: 'simulation' }),
    ])
    await wrapper.find('.facet-search').setValue('a')
    await flushPromises()
    expect(rowTexts(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('1 of 2')
  })

  /**
   * The list is the way in, so it is open until there is something to look at — forty rows above
   * the panels would otherwise push every one of them off the screen.
   */
  it('collapses to one line once a run is chosen, and reopens on request', async () => {
    const wrapper = mountPicker([run({ run_id: 'only_logs', has_reports: false })])
    await rowFor(wrapper, 'only_logs').trigger('click')
    await flushPromises()

    expect(wrapper.find('.run-list').exists()).toBe(false)
    expect(wrapper.find('.picker-chosen').text()).toContain('only_logs')

    await wrapper.find('.picker-chosen .app-button').trigger('click')
    expect(wrapper.find('.run-list').exists()).toBe(true)
  })

  it('says so plainly where the index is empty', () => {
    expect(mountPicker([]).find('.picker-hint').text()).toContain('run index is empty')
  })
})
