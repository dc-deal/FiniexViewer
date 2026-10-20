import { onMounted } from 'vue'
import { useContextStore } from '@/stores/context_store'
import { useSweepsStore } from '@/stores/sweeps_store'
import { onPanelShownAgain } from '@/composables/use_panel_visibility'

/**
 * Loads the list of sweeps and brings back the sweep the reader had open — the sweep is the
 * context's, restored from storage before any panel mounts, and this only loads what it names.
 */
export function useSweepBinding(): void {
  const context = useContextStore()
  const store = useSweepsStore()

  onMounted(async () => {
    await store.loadSweeps()
    const stored = context.main.sweep.id
    if (stored) await store.selectSweep(stored)
  })

  // a docked panel stays mounted, so the list and every ranking on it are fetched again whenever
  // the panel comes back: a sweep that finished, or grew, while it stood behind another tab
  onPanelShownAgain(() => { void store.refresh() })
}
