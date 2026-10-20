import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSectionStates } from '@/composables/use_section_states'
import { reportKindId } from '@/panel_kinds'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useLayoutStore } from '@/stores/layout_store'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import type { RunInfo } from '@/types/api/report_types'

function stateOf(sectionId: string) {
  return useSectionStates().value.find(state => state.section.id === sectionId)!
}

describe('useSectionStates', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /** Open as a panel is where it IS, whatever the column's flag says. */
  it('places a section open as a panel there, even where the column has it switched off', () => {
    useLayoutStore().hide('orders')
    useDockStore().openIds = [reportKindId('orders')]
    expect(stateOf('orders').place).toBe('panel')
  })

  /** One still on its way is not absent — it would flicker struck-through on every run change. */
  it('calls a section absent only once the chosen run has answered without it', () => {
    useRunsStore().runs = [{ run_id: 'r1', has_reports: true } as RunInfo]
    useContextStore().selectRun('r1')
    useRunReportsStore().loadingTradeHistory = true
    expect(stateOf('trade-history').absent).toBe(false)

    useRunReportsStore().loadingTradeHistory = false
    expect(stateOf('trade-history').absent).toBe(true)
  })

  /**
   * A section that failed to load is one the run carries: counted as absent it was struck in the
   * Panels menu, and the emptied bundle said the run did not carry it.
   */
  it('does not call a section absent where it failed to load', () => {
    useRunsStore().runs = [{ run_id: 'r1', has_reports: true } as RunInfo]
    useContextStore().selectRun('r1')
    useRunReportsStore().errors = { tradeHistory: 'Could not load the trade history: boom' }
    expect(stateOf('trade-history').absent).toBe(false)
  })
})
