import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { usePanelJump } from '@/composables/use_panel_jump'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useLayoutStore } from '@/stores/layout_store'

const MARK = { scenario: 'EURGBP_partial_close', position: 'pos_eurgbp_1' }

/** The Runs panel as the dock draws it, with one section in its column. */
function drawRunsPanel(): HTMLElement {
  const panel = document.createElement('div')
  panel.dataset['panelKind'] = 'runs'
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
    const state = layout.arrangedPanels.find(panel => panel.id === 'trade-history')!
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
    dock.openIds = ['runs', 'report-trade-history']
    const brought: string[] = []
    dock.open = (id: string) => { brought.push(id) }
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

  /** A jump may start in a section panel: the Runs panel comes to the front for one in the column. */
  it('brings the Runs panel to the front for a section in the column', () => {
    const dock = useDockStore()
    const brought: string[] = []
    dock.open = (id: string) => { brought.push(id) }
    usePanelJump()('trade-history', MARK)
    expect(brought).toEqual(['runs'])
  })
})
