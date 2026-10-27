import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { usePanelJump, useShowInList } from '@/composables/use_panel_jump'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useLayoutStore } from '@/stores/layout_store'
import { useRunsStore } from '@/stores/runs_store'
import { useDeploymentsStore } from '@/stores/deployments_store'
import { useSweepsStore } from '@/stores/sweeps_store'
import type { RunInfo } from '@/types/api/report_types'

const MARK = { scenario: 'EURGBP_partial_close', position: 'pos_eurgbp_1' }

/** The run report as the dock draws it, with one section in its column. */
function drawRunsPanel(): HTMLElement {
  const panel = document.createElement('div')
  panel.dataset['panelKind'] = 'run'
  panel.innerHTML = '<div data-panel="trade-history"></div>'
  document.body.appendChild(panel)
  return panel.querySelector<HTMLElement>('[data-panel="trade-history"]')!
}

function markedRow(): HTMLElement {
  const row = document.createElement('div')
  row.className = 'record-row marked'
  return row
}

describe('usePanelJump', () => {
  const scrolled = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    scrolled.mockReset()
    Element.prototype.scrollIntoView = scrolled
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('marks the position, and makes a hidden or folded section reachable', () => {
    drawRunsPanel()
    const layout = useLayoutStore()
    layout.hide('trade-history')
    usePanelJump()('trade-history', MARK)
    expect(useContextStore().main.run.position).toEqual(MARK)
    const state = layout.arrangedOf().find(panel => panel.id === 'trade-history')!
    expect(state.hidden).toBe(false)
    expect(state.open).toBe(true)
  })

  it('scrolls to the marked row once it is there', async () => {
    drawRunsPanel().appendChild(markedRow())
    usePanelJump()('trade-history', MARK)
    await flushPromises()
    expect(scrolled).toHaveBeenCalledTimes(1)
  })

  /** A section the jump had to open draws its rows later — the row is waited for, never guessed. */
  it('waits for a row the section draws only after the jump', async () => {
    const section = drawRunsPanel()
    usePanelJump()('trade-history', MARK)
    await flushPromises()
    expect(scrolled).not.toHaveBeenCalled()
    section.appendChild(markedRow())
    await flushPromises()
    expect(scrolled).toHaveBeenCalledTimes(1)
  })

  /** Searched where sections are drawn, never in the whole document. */
  it('ignores a marked row outside the Runs panel', async () => {
    drawRunsPanel()
    const elsewhere = document.createElement('div')
    elsewhere.innerHTML = '<div data-panel="trade-history"></div>'
    document.body.appendChild(elsewhere)
    elsewhere.firstElementChild!.appendChild(markedRow())
    usePanelJump()('trade-history', MARK)
    await flushPromises()
    expect(scrolled).not.toHaveBeenCalled()
  })

  /** A section open as a panel of its own is jumped to THERE: its panel to the front, its row found. */
  it('lands in the own panel of the section where it is open as one', async () => {
    const dock = useDockStore()
    dock.openIds = ['run', 'report-trade-history']
    const brought: string[] = []
    dock.reveal = (id: string) => { brought.push(id); return true }
    drawRunsPanel()
    const own = document.createElement('div')
    own.dataset['panelKind'] = 'report-trade-history'
    own.innerHTML = '<div data-panel="trade-history"></div>'
    document.body.appendChild(own)
    own.firstElementChild!.appendChild(markedRow())
    usePanelJump()('trade-history', MARK)
    await flushPromises()
    expect(brought).toEqual(['report-trade-history'])
    expect(scrolled).toHaveBeenCalledTimes(1)
  })

  /** A jump may start in a section panel: the run report comes to the front for one in the column. */
  it('brings the run report to the front for a section in the column', () => {
    const dock = useDockStore()
    const brought: string[] = []
    dock.reveal = (id: string) => { brought.push(id); return true }
    usePanelJump()('trade-history', MARK)
    expect(brought).toEqual(['run'])
  })
})

describe('useShowInList', () => {
  const scrolledBy = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    scrolledBy.mockReset()
    Element.prototype.scrollBy = scrolledBy
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  /** The run list as the dock draws it: its rows in a list of their own, the chosen one picked. */
  function drawRunList(): HTMLElement {
    const panel = document.createElement('div')
    panel.dataset['panelKind'] = 'runs'
    panel.innerHTML = '<div class="run-list"><button class="record-row record-unseen picked"></button>'
      + '<button class="record-row picked"></button></div>'
    document.body.appendChild(panel)
    return panel.querySelectorAll<HTMLElement>('.record-row')[1]!
  }

  async function afterAFrame(): Promise<void> {
    await new Promise(resolve => window.requestAnimationFrame(resolve))
    await flushPromises()
  }

  /**
   * A sweep's combination and a deployment's session are held by their own lists, which the run list
   * leaves them to: the way back leads there and not to the run list.
   */
  it.each([
    ['sweep', 'sweeps'],
    ['deployment', 'deployments'],
  ] as const)('leads a %s run to the list that holds it', (kind, panel) => {
    const brought: string[] = []
    useDockStore().reveal = (id: string, reason: string) => { brought.push(`${id} ${reason}`); return true }
    const chose = kind === 'sweep'
      ? vi.spyOn(useSweepsStore(), 'selectSweep').mockResolvedValue()
      : vi.spyOn(useDeploymentsStore(), 'selectDeployment').mockResolvedValue()
    useRunsStore().runs = [{ run_id: 'child', parent_id: `${kind}_1`, parent_kind: kind } as RunInfo]
    useContextStore().selectRun('child')
    useShowInList()()
    expect(brought).toEqual([`${panel} command`])
    expect(chose).toHaveBeenCalledWith(`${kind}_1`)
  })

  /** VS Code's *Reveal in Explorer*: the list comes to the front, the row is centred and marked. */
  it('brings the run list to the front, opens the family of the row, and centres the row in the list', async () => {
    const brought: string[] = []
    useDockStore().reveal = (id: string, reason: string) => { brought.push(`${id} ${reason}`); return true }
    const row = drawRunList()
    useShowInList()()
    expect(brought).toEqual(['runs command'])
    expect(useRunsStore().chosenRowAsked).toBe(1)

    await afterAFrame()
    expect(scrolledBy).toHaveBeenCalledTimes(1)
    // the measuring row of a closed family is never the one led to
    expect(row.classList.contains('flash')).toBe(true)
  })

  it('marks the row for a moment only', async () => {
    useDockStore().reveal = () => true
    const row = drawRunList()
    useShowInList()()
    await afterAFrame()
    expect(row.classList.contains('flash')).toBe(true)
    vi.advanceTimersByTime(1600)
    expect(row.classList.contains('flash')).toBe(false)
  })

  /** A second *Show in list* while the mark still shows restarts it; the first one's end does not cut it short. */
  it('restarts the mark on a second call, for its whole moment', async () => {
    useDockStore().reveal = () => true
    const row = drawRunList()
    useShowInList()()
    await afterAFrame()
    vi.advanceTimersByTime(1000)
    useShowInList()()
    await afterAFrame()
    vi.advanceTimersByTime(1000)
    expect(row.classList.contains('flash')).toBe(true)
    vi.advanceTimersByTime(600)
    expect(row.classList.contains('flash')).toBe(false)
  })

  /** The keyboard goes where the reader was led: into the list, never onto the row and its card. */
  it('leaves the focus in the list, not on the row', async () => {
    useDockStore().reveal = () => true
    const row = drawRunList()
    const list = row.closest<HTMLElement>('.run-list')!
    list.tabIndex = -1
    useShowInList()()
    await afterAFrame()
    expect(document.activeElement).toBe(list)
  })

  /** A reader who asked for less motion is taken there at once. */
  it('scrolls at once where the reader asked for less motion', async () => {
    useDockStore().reveal = () => true
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }))
    try {
      drawRunList()
      useShowInList()()
      await afterAFrame()
      expect(scrolledBy.mock.calls[0]![0]).toMatchObject({ behavior: 'auto' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
