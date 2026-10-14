import { onMounted } from 'vue'
import { useContextStore } from '@/stores/context_store'
import { useRunsStore } from '@/stores/runs_store'

/**
 * Loads the run index and brings back the run the reader had open.
 *
 * The run itself is the context's, restored from storage before any view mounts; this only loads
 * what it names, and touches nothing else — a reload is not a new run, so the narrowing and the
 * mark stored with it stay as they were. A run the reader picks while this is still loading is a
 * new run like any other: the store discards an answer for a run that is no longer the chosen one.
 *
 * Called ONCE, at the app root, since 2026-10-14: a section shown as a panel of its own needs the
 * run while the Runs panel is closed or behind a tab. Fetching the index again when that panel is
 * shown again stays with the panel, the one place that knows it was shown.
 */
export function useRunBinding(): void {
  const context = useContextStore()
  const runsStore = useRunsStore()

  onMounted(async () => {
    await runsStore.loadRuns()
    const stored = context.main.run.id
    if (stored) await runsStore.loadRun(stored)
  })
}
