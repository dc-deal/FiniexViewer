import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useLinkFromAddress } from '@/composables/use_link_from_address'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useRunChartStore } from '@/stores/run_chart_store'
import { useRunsStore } from '@/stores/runs_store'
import { useServersStore } from '@/stores/servers_store'
import type { RunInfo } from '@/types/api/report_types'
import type { ServerEntry } from '@/types/server_types'

/**
 * A link the page was opened with (viewer#60): applied once the run index is there, as a pick, the
 * chart brought to its moment; taken out of the address at once; carried through the reload a switch
 * of server needs; applied nowhere where it names a server not set up here.
 */
const RUN = '20261007_152959_0275a107'
const LINK = `?run=${RUN}&units=unit_a&position=unit_a~pos_1&chart=M1@2026-10-07T15:30:00Z`

let mounted: VueWrapper | null = null
let picks = 0

function open(address: string): void {
  window.history.replaceState(null, '', `/${address}`)
  mounted = mount(defineComponent({
    setup() {
      useLinkFromAddress(() => { picks++ })
      return () => h('div')
    },
  }))
}

describe('useLinkFromAddress', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    picks = 0
    vi.spyOn(useRunsStore(), 'selectRun').mockImplementation(async id => { useContextStore().selectRun(id) })
    vi.spyOn(useDockStore(), 'reveal').mockReturnValue(true)
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
    window.history.replaceState(null, '', '/')
  })

  it('takes the link out of the address at once, and applies it once the run index is there', async () => {
    const chart = useRunChartStore()
    const timeframe = vi.spyOn(chart, 'chooseTimeframe')
    const centre = vi.spyOn(chart, 'centreOn')
    open(LINK)
    expect(window.location.search).toBe('')
    expect(useRunsStore().selectRun).not.toHaveBeenCalled()

    useRunsStore().runs = [{ run_id: RUN, group: 'autotrader', stream_files: [] } as unknown as RunInfo]
    await nextTick()
    const context = useContextStore()
    expect(context.main.run).toEqual({ id: RUN, units: ['unit_a'], position: { scenario: 'unit_a', position: 'pos_1' } })
    expect(picks).toBe(1)
    await flushPromises()
    expect(timeframe).toHaveBeenCalledWith('M1')
    expect(centre).toHaveBeenCalledWith(Date.parse('2026-10-07T15:30:00Z') / 1000, 'unit_a')
    expect(useDockStore().reveal).toHaveBeenCalledWith('run-chart', 'link')
  })

  it('does nothing where the address names no run', async () => {
    useRunsStore().runs = [{ run_id: RUN, group: 'simulation', stream_files: [] } as unknown as RunInfo]
    open('?units=unit_a&debug=1')
    await flushPromises()
    expect(useRunsStore().selectRun).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?units=unit_a&debug=1')
  })

  /** A link to another server set up here: the switch reloads the page, and the link waits for it. */
  it('switches to the server a link names, and carries the link through the reload', async () => {
    const servers = useServersStore()
    const switchTo = vi.spyOn(servers, 'switchTo').mockResolvedValue()
    open(`${LINK}&server=tunnel`)
    servers.servers = [{ id: 'default' } as ServerEntry, { id: 'tunnel' } as ServerEntry]
    await nextTick()
    expect(switchTo).toHaveBeenCalledWith('tunnel')
    expect(sessionStorage.getItem('link.pending')).toContain(`run=${RUN}`)
    expect(useRunsStore().selectRun).not.toHaveBeenCalled()
  })

  it('applies a link a switch of server carried over, and only once', async () => {
    sessionStorage.setItem('link.pending', LINK)
    useRunsStore().runs = [{ run_id: RUN, group: 'autotrader', stream_files: [] } as unknown as RunInfo]
    open('')
    await nextTick()
    expect(useContextStore().main.run.id).toBe(RUN)
    expect(sessionStorage.getItem('link.pending')).toBeNull()
  })

  it('applies a link to a server not set up here nowhere, and says which', async () => {
    const servers = useServersStore()
    const switchTo = vi.spyOn(servers, 'switchTo').mockResolvedValue()
    open(`${LINK}&server=elsewhere`)
    servers.servers = [{ id: 'default' } as ServerEntry]
    await nextTick()
    expect(switchTo).not.toHaveBeenCalled()
    expect(servers.unknownLinkServer).toBe('elsewhere')
  })
})
