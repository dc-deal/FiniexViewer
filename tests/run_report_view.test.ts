import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RunReportView from '@/views/RunReportView.vue'
import PanelColumn from '@/components/panels/PanelColumn.vue'
import HintLine from '@/components/base/HintLine.vue'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useLayoutStore } from '@/stores/layout_store'
import { allPanels } from '@/panel_registry'
import { useRunsStore } from '@/stores/runs_store'
import type { RunInfo } from '@/types/api/report_types'

/** The run the reader chose, as the index states it. */
function chooseRun(overrides: Partial<RunInfo> = {}): void {
  useRunsStore().runs = [{
    run_id: '20261012_205715_c3b41fff',
    group: 'simulation',
    name: 'set_x',
    start_time: '',
    has_reports: true,
    ...overrides,
  } as RunInfo]
  useContextStore().selectRun('20261012_205715_c3b41fff')
}

describe('RunReportView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /** A narrow panel ends the line in an ellipsis instead of wrapping it over three; the whole is on hover. */
  it('names the chosen run in one line, with the whole of it on hover', () => {
    chooseRun()
    const wrapper = mount(RunReportView)
    expect(wrapper.find('.chosen-id').text()).toBe('20261012_205715_c3b41fff')
    const meta = wrapper.find('.chosen-meta')
    expect(meta.text()).toBe('simulation · set_x')
    expect(meta.attributes('title')).toBe('simulation · set_x')
  })

  /**
   * A run without reports is said by the pair their runs document reads: `reporting: expected` is a
   * run that never got to its report — still running, or it died first — and only `none` is a run
   * kept as logs only.
   */
  it('tells a run that never got to its report from one kept as logs only', () => {
    chooseRun({ has_reports: false, reporting: 'expected' })
    expect(mount(RunReportView).find('.notice').text()).toContain('still running, or it died before its report phase')
    setActivePinia(createPinia())
    chooseRun({ has_reports: false, reporting: 'none' })
    expect(mount(RunReportView).find('.notice').text()).toContain('never meant to write a report')
  })

  /** The list is a panel of its own: *Show in list* brings it to the front, nothing unfolds here. */
  it('shows the chosen run in the run list', async () => {
    chooseRun()
    const opened: string[] = []
    useDockStore().reveal = (kind: string, reason: string) => { opened.push(`${kind} ${reason}`); return true }
    const wrapper = mount(RunReportView)
    await wrapper.find('.show-in-list').trigger('click')
    expect(wrapper.find('.show-in-list').text()).toBe('Show in list')
    expect(opened).toEqual(['runs command'])
  })

  /**
   * Where the list is on show with the chosen row in view, the way to it would do nothing a glance
   * does not. Hidden rather than removed, so the line keeps its length while the reader scrolls.
   */
  it('offers the way to the list only where the list does not show the run already', async () => {
    chooseRun()
    const wrapper = mount(RunReportView)
    const button = () => wrapper.find('.show-in-list')
    expect(button().classes()).not.toContain('needless')

    useRunsStore().chosenRowInView = true
    await flushPromises()
    // the row in view in a list behind another tab is not in view
    expect(button().classes()).not.toContain('needless')

    useDockStore().noteShown('runs', true)
    await flushPromises()
    expect(button().classes()).toContain('needless')
  })

  it('says that no run is chosen, and offers the run list', async () => {
    const opened: string[] = []
    useDockStore().reveal = (kind: string, reason: string) => { opened.push(`${kind} ${reason}`); return true }
    const wrapper = mount(RunReportView)
    expect(wrapper.text()).toContain('No run is chosen')
    expect(wrapper.findComponent(PanelColumn).exists()).toBe(false)
    await wrapper.findAll('button').find(node => node.text().includes('Show the run list'))!.trigger('click')
    expect(opened).toEqual(['runs command'])
  })

  it('says which stored run is gone from the index', () => {
    useRunsStore().unknownRunId = 'gone_run'
    const wrapper = mount(RunReportView)
    expect(wrapper.text()).toContain('gone_run')
  })

  /** An index that could not be read says nothing about the run: never "no run", never "gone". */
  it('says an index that could not be read, with a run chosen', () => {
    useContextStore().selectRun('r1')
    useRunsStore().indexError = 'Could not load the run index: down'
    const wrapper = mount(RunReportView)
    expect(wrapper.find('.notice.failed').text()).toBe('Could not load the run index: down')
    expect(wrapper.text()).not.toContain('No run is chosen')
  })

  /**
   * Every member taken out: the bundle says why it is empty instead of standing as an empty frame,
   * and the hint that says the same stands down (#42).
   */
  it('says why it is empty where every section stands as a panel of its own or is hidden', () => {
    chooseRun()
    const layout = useLayoutStore()
    for (const section of allPanels()) layout.hide(section.id)
    const wrapper = mount(RunReportView)
    expect(wrapper.find('.empty-bundle').text())
      .toBe("Every section stands as a panel of its own or is hidden — “Back into the bundle” on a panel's tab brings it back here, the Panels menu shows a hidden one.")
    expect(wrapper.findComponent(PanelColumn).exists()).toBe(false)
    expect(wrapper.findAllComponents(HintLine).flatMap(hint => [hint.props('id')].flat())).not.toContain('open-as-panel')
  })

  /**
   * ⋯ on the bundle's tab is a control nothing else on screen explains (#42), and how a section
   * comes out and goes back is said while there are sections to take out — the emptied bundle's
   * test holds that the second hint stands down, this one that it is there to stand down.
   */
  it('explains what ⋯ on its tab offers, and how a section comes out', () => {
    chooseRun()
    const wrapper = mount(RunReportView)
    const hints = wrapper.findAllComponents(HintLine).flatMap(hint => [hint.props('id')].flat())
    expect(hints).toContain('bundle-commands')
    expect(hints).toContain('open-as-panel')
  })

  /** Its hints stand in ONE box with one pair of dismissals, rather than a box for each. */
  it('says its hints in one box', () => {
    chooseRun()
    const wrapper = mount(RunReportView)
    expect(wrapper.findAllComponents(HintLine)).toHaveLength(1)
    expect(wrapper.findAll('.hint-line')).toHaveLength(1)
  })

  /** What stays in the column the run does not carry, so the sentence speaks of what it carries. */
  it('speaks of the sections the run carries where the rest it does not', () => {
    chooseRun()
    // the run header is the one section a chosen run always carries; the others this run lacks
    useLayoutStore().hide('run-header')
    const wrapper = mount(RunReportView)
    expect(wrapper.find('.empty-bundle').text()).toContain('Every section this run carries stands as a panel of its own')
  })

  /** A run that carries nothing has nothing taken out of it: the lines above say why, not this. */
  it('says nothing of an empty bundle where the reader took nothing out', () => {
    chooseRun()
    const wrapper = mount(RunReportView)
    expect(wrapper.find('.empty-bundle').exists()).toBe(false)
  })

  /** The summary failing is a section failing: it says so, and the sections that did load stay. */
  it('says a summary that failed above the column, and keeps the column', async () => {
    chooseRun()
    useRunsStore().summaryError = 'Could not load the run summary: boom'
    const wrapper = mount(RunReportView)
    await flushPromises()
    expect(wrapper.find('.notice.failed').text()).toContain('boom')
    expect(wrapper.findComponent(PanelColumn).exists()).toBe(true)
  })
})

