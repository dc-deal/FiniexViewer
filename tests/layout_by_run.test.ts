import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { runKindOf, useLayoutByRun } from '@/composables/use_layout_by_run'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useNamedLayoutsStore } from '@/stores/named_layouts_store'
import { useRunsStore } from '@/stores/runs_store'
import { useSettingsStore } from '@/stores/settings_store'
import type { RunInfo } from '@/types/api/report_types'

let mounted: VueWrapper | null = null

function mountBinding(): void {
  mounted = mount(defineComponent({
    setup() {
      useLayoutByRun()
      return () => h('div')
    },
  }))
}

async function pickRun(id: string): Promise<void> {
  useContextStore().selectRun(id)
  await nextTick()
}

describe('runKindOf', () => {
  it('reads a backtest and a session from the pipeline, and nothing else', () => {
    expect(runKindOf('simulation')).toBe('backtest')
    expect(runKindOf('autotrader')).toBe('session')
    expect(runKindOf('live')).toBeNull()
  })
})

/** Picking a run chooses its layout (viewer#37): offered by default, loaded where asked, nothing where off. */
describe('useLayoutByRun', () => {
  let restore: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    useRunsStore().runs = [
      { run_id: 'bt', group: 'simulation' } as RunInfo,
      { run_id: 'session', group: 'autotrader' } as RunInfo,
    ]
    restore = vi.spyOn(useDockStore(), 'restore').mockImplementation((_layout, prepare) => {
      prepare?.()
      return true
    })
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  it('offers the layout a picked run maps to, where another is loaded, and nothing where it fits', async () => {
    const layouts = useNamedLayoutsStore()
    layouts.load('backtests')
    mountBinding()
    await pickRun('session')
    expect(layouts.offered?.id).toBe('deploys')
    await pickRun('bt')
    expect(layouts.offered).toBeNull()
    expect(restore).toHaveBeenCalledTimes(1)
  })

  it('counts a deployment picked as a session', async () => {
    const layouts = useNamedLayoutsStore()
    layouts.load('backtests')
    mountBinding()
    useContextStore().selectDeployment('deploy_1')
    await nextTick()
    expect(layouts.offered?.id).toBe('deploys')
  })

  /** An offer needs a layout loaded: a reader who never loaded one is not using layouts. */
  it('offers nothing where no layout is loaded, and nothing while it is off', async () => {
    const layouts = useNamedLayoutsStore()
    mountBinding()
    await pickRun('session')
    expect(layouts.offered).toBeNull()

    layouts.load('backtests')
    useSettingsStore().setLayoutByRun('off')
    await pickRun('session')
    expect(layouts.offered).toBeNull()
  })

  it('offers what the restored selection maps to, and switches to nothing on a reload', async () => {
    useSettingsStore().setLayoutByRun('switch')
    const layouts = useNamedLayoutsStore()
    layouts.load('backtests')
    // the selection a reload brings back is in place before the binding exists
    useContextStore().selectRun('session')
    mountBinding()
    await nextTick()
    expect(layouts.loaded?.id).toBe('backtests')

    useSettingsStore().setLayoutByRun('offer')
    await nextTick()
    expect(layouts.offered?.id).toBe('deploys')
  })

  it('loads the layout at the pick where the reader chose to switch', async () => {
    useSettingsStore().setLayoutByRun('switch')
    const layouts = useNamedLayoutsStore()
    layouts.load('backtests', 'medium')
    mountBinding()
    await pickRun('session')
    expect(layouts.loaded?.id).toBe('deploys')
    expect(layouts.loadedSize).toBe('medium')
    expect(layouts.offered).toBeNull()
  })

  it('maps a kind to the layout chosen for it, and to nothing where that layout is gone', async () => {
    const settings = useSettingsStore()
    const layouts = useNamedLayoutsStore()
    layouts.load('deploys')
    settings.setLayoutFor('session', 'backtests')
    mountBinding()
    await pickRun('session')
    expect(layouts.offered?.id).toBe('backtests')

    settings.setLayoutFor('session', 'own-gone')
    await nextTick()
    expect(layouts.offered).toBeNull()
  })
})
