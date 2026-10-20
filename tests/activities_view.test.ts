import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h } from 'vue'
import ActivitiesView from '@/views/ActivitiesView.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { useDockStore } from '@/stores/dock_store'
import { useMachineStore } from '@/stores/machine_store'
import type { ActivityList, ActivityRow } from '@/types/api/machine_types'
import type { FigureCard } from '@/types/figure_types'
import { provideTestOpenInContext } from './open_in_context_harness'
import type { TestOpenInContext } from './open_in_context_harness'
import activityFixture from './fixtures/activities.json'

/**
 * The machine's activity list as a panel: one row per activity, each beneath the one it runs inside,
 * its memory as the answer states it, the rest in its card, and a notice only where something is off.
 * The captured list holds the server alone, so the other rows are built from its row.
 */
const CAPTURED = activityFixture as unknown as ActivityList
const SERVER_ROW = CAPTURED.activities.find(row => row.activity_id === CAPTURED.server_activity_id)!

function activity(fields: Partial<ActivityRow>): ActivityRow {
  return { ...SERVER_ROW, ...fields }
}

const SERVER = activity({ started_at: '2026-10-19T09:12:00+00:00' })
const SWEEP = activity({
  activity_id: 'act_sweep', activity_kind: 'sweep', activity_label: 'my_sweep', started_at: '2026-10-19T14:02:11+00:00',
  sweep_id: 'sweep_20261019_140200_ab12cd34', rss_bytes: 7_623_566_950, process_count: 7, working_tree: 'release-v1.5.1',
})
const CHILD = activity({
  activity_id: 'act_child', activity_kind: 'backtest', activity_label: 'my_set__sweep_c003', started_at: '2026-10-19T14:31:02+00:00',
  parent_activity_id: 'act_sweep', run_id: '20261019_143102_e1f2a3b4', rss_bytes: 0, process_count: 0, origin_channel: 'sweep',
})
const SUITE = activity({
  activity_id: 'act_suite', activity_kind: 'test_suite', activity_label: 'test suite', started_at: '2026-10-19T14:40:00+00:00',
  rss_bytes: null, process_count: 3,
})

const LIST: ActivityList = { ...CAPTURED, activities: [SERVER, SWEEP, CHILD, SUITE] }

let mounted: VueWrapper | null = null

function mountWith(list: ActivityList | null, onShow = true): VueWrapper {
  const machine = useMachineStore()
  machine.activities = list
  vi.spyOn(machine, 'watchActivities').mockReturnValue(() => {})
  if (onShow) useDockStore().noteShown('activities', true)
  mounted = mount(ActivitiesView)
  return mounted
}

function cells(wrapper: VueWrapper, selector: string): string[] {
  return wrapper.findAll(`.record-row:not(.record-unseen) ${selector}`).map(cell => cell.text())
}

describe('ActivitiesView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  /** A panel behind another tab stays mounted: on show is read off the dock, and only then is the list asked. */
  it('asks for the list only while it is on show', async () => {
    const machine = useMachineStore()
    const stopReading = vi.fn()
    const watch = vi.spyOn(machine, 'watchActivities').mockReturnValue(stopReading)
    const dock = useDockStore()
    mounted = mount(ActivitiesView)
    expect(watch).not.toHaveBeenCalled()
    dock.noteShown('activities', true)
    await mounted.vm.$nextTick()
    expect(watch).toHaveBeenCalledTimes(1)
    dock.noteShown('activities', false)
    await mounted.vm.$nextTick()
    expect(stopReading).toHaveBeenCalledTimes(1)
  })

  it('lists every activity, newest first, each beneath the one it runs inside, the server marked', () => {
    const wrapper = mountWith(LIST)
    const labels = cells(wrapper, '.activity-label')
    // the suite, the sweep with its backtest beneath it, the server last
    expect(labels).toHaveLength(4)
    expect(labels[0]).toContain(SUITE.activity_label)
    expect(labels[1]).toContain(SWEEP.activity_label)
    expect(labels[2]!.startsWith('↳')).toBe(true)
    expect(labels[2]).toContain(CHILD.activity_label)
    expect(labels[3]).toContain(SERVER.activity_label)
    expect(wrapper.findAll('.record-row:not(.record-unseen) .activity-label.nested')).toHaveLength(1)
    expect(labels.at(-1)).toContain('this server')
  })

  /** Their rules: a row inside another holds its parent's memory, and one that could not be read is never a zero. */
  it('says each row\'s memory the way the answer states it', () => {
    const wrapper = mountWith(LIST)
    const memory = cells(wrapper, '.figure-cell:nth-child(5)')
    expect(memory).toEqual(['unreadable', '7.62 GB', 'in its parent', expect.stringMatching(/MB$/)])
  })

  it('gives every field of a row in its card, the activity it runs inside among them', () => {
    const wrapper = mountWith(LIST)
    const cardOf = wrapper.findAllComponents(HoverCard).find(found => found.props('title') === 'backtest · my_set__sweep_c003')!
    const card = { details: cardOf.props('details') as FigureCard['details'] }
    const labels = card.details.map(row => row.label)
    expect(labels).toEqual(expect.arrayContaining(['Run', 'Runs inside', 'Code', 'Origin', 'Process id', 'Command line']))
    expect(card.details.find(row => row.label === 'Runs inside')?.value).toBe('sweep · my_sweep')
  })

  /** Where everything is fine nothing is printed; each notice speaks only for what is off. */
  it('says only what is off: a list missing its server, entries that cannot be read, a list that failed', () => {
    expect(mountWith(LIST).findAll('.notice')).toHaveLength(0)
    mounted!.unmount()
    const wrapper = mountWith({ ...LIST, server_activity_id: null, unreadable_activity_ids: ['act_x', 'act_y'] })
    const notices = wrapper.findAll('.notice').map(notice => notice.text())
    expect(notices).toHaveLength(2)
    expect(notices[0]).toContain('not in its own list')
    expect(notices[1]).toContain('2 activities run')
    mounted!.unmount()
    const machine = useMachineStore()
    machine.activitiesError = 'Could not read what runs on the machine: the list could not be read'
    const failed = mountWith(null)
    expect(failed.find('.notice.error-msg').text()).toContain('could not be read')
    expect(failed.find('.activity-list').exists()).toBe(false)
  })

  /** An activity leads to what it runs: its run, else its sweep — a link, as a session's run is. */
  describe('the way to what an activity runs', () => {
    function mountHosted(canOpen = true): { wrapper: VueWrapper, way: TestOpenInContext } {
      const machine = useMachineStore()
      machine.activities = LIST
      vi.spyOn(machine, 'watchActivities').mockReturnValue(() => {})
      useDockStore().noteShown('activities', true)
      let way: TestOpenInContext = { opened: [] }
      const Host = defineComponent({
        setup() {
          way = provideTestOpenInContext(canOpen)
          return () => h(ActivitiesView)
        },
      })
      mounted = mount(Host)
      return { wrapper: mounted, way }
    }

    it('opens a run from its label, and a sweep where the activity names no run', async () => {
      const { wrapper, way } = mountHosted()
      const links = wrapper.findAll('.activity-label .jump-link')
      // the server and the test suite run nothing there is to open
      expect(links).toHaveLength(2)
      await links.find(link => link.text().includes(CHILD.activity_label))!.trigger('click')
      await links.find(link => link.text().includes(SWEEP.activity_label))!.trigger('click')
      expect(way.opened).toEqual([{ what: 'run', id: CHILD.run_id }, { what: 'sweep', id: SWEEP.sweep_id }])
    })

    it('names every activity as plain text where nothing can open it', () => {
      const { wrapper } = mountHosted(false)
      expect(wrapper.findAll('.activity-label .jump-link')).toHaveLength(0)
      expect(cells(wrapper, '.activity-label').join(' ')).toContain(CHILD.activity_label)
    })
  })
})
