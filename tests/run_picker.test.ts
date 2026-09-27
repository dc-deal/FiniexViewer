import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
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

/** Seeds the store the way a loaded index would, then picks the cascade down to the run level. */
function mountPicker(rows: RunInfo[]) {
  const store = useRunsStore()
  store.runs = rows
  store.setGroup('simulation')
  store.setName('ETHUSD_blocks')
  return mount(RunPicker)
}

function runLabels(wrapper: ReturnType<typeof mountPicker>): string[] {
  // three selects in the cascade; the run one is last
  const select = wrapper.findAll('select').at(-1)
  return select!.findAll('option').map(node => node.text())
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
    const labels = runLabels(mountPicker([run()]))
    const shown = labels.find(label => label.includes('20260925_095227_d9b8d79d'))!
    expect(shown).not.toBe('20260925_095227_d9b8d79d')
    expect(shown).toMatch(/2026/)
  })

  // an absent or damaged stamp must read as "no date", never as the string Invalid Date
  it.each([
    ['an empty stamp', ''],
    ['a stamp that is not a date', 'not-a-date'],
  ])('shows the id alone for %s', (_label, start_time) => {
    const labels = runLabels(mountPicker([run({ start_time })]))
    const shown = labels.find(label => label.includes('20260925_095227_d9b8d79d'))!
    expect(shown).toBe('20260925_095227_d9b8d79d')
    expect(shown).not.toContain('Invalid')
  })

  /**
   * A logs-only run stays listed and unselectable: hiding it would raise the question where it
   * went, and picking it would only produce 404s. The date rides along either way.
   */
  it('keeps the logs-only marking beside the date', () => {
    const rows = [run({ run_id: 'only_logs', has_reports: false, reporting: 'none' })]
    const shown = runLabels(mountPicker(rows)).find(label => label.includes('only_logs'))!
    expect(shown).toContain('logs only')
    expect(shown).toMatch(/2026/)
  })
})
