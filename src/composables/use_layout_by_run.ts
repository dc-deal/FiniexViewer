import { computed, ref, watch, watchEffect } from 'vue'
import { useContextStore } from '@/stores/context_store'
import { useNamedLayoutsStore } from '@/stores/named_layouts_store'
import { useRunsStore } from '@/stores/runs_store'
import { useSettingsStore } from '@/stores/settings_store'

/** The kinds of run a layout is chosen for (viewer#37): two, by the operator's word of 2026-11-04. */
export type RunKind = 'backtest' | 'session'

/**
 * A run's kind for choosing a layout, from `group`, the pipeline that produced it — the field the
 * backend's `run-kinds` names for it: `simulation` is a backtest, `autotrader` a session. Another
 * value maps to no layout rather than to a guess.
 */
export function runKindOf(group: string): RunKind | null {
  if (group === 'simulation') return 'backtest'
  if (group === 'autotrader') return 'session'
  return null
}

/**
 * The layout the chosen run maps to (viewer#37), as Settings › Layouts says: offered beside the
 * Layouts menu where another is loaded, loaded at the pick where the reader chose *switch*, nothing
 * where they chose *off*. A deployment picked counts as a session.
 *
 * Only a PICK switches — never the selection a reload brings back, which is in place before this
 * exists, so its watchers never see it; that one is offered at most. An offer needs a layout loaded:
 * a reader who never loaded one is not using layouts. Called ONCE, at the app root.
 */
export function useLayoutByRun(): void {
  const context = useContextStore()
  const runs = useRunsStore()
  const settingsStore = useSettingsStore()
  const layouts = useNamedLayoutsStore()

  /** The kind the reader picked last in this tab; until they pick, the stored selection speaks. */
  const picked = ref<RunKind | null>(null)

  const restored = computed<RunKind | null>(() => {
    if (runs.selectedRun) return runKindOf(runs.selectedRun.group)
    return context.main.deployment.id ? 'session' : null
  })

  /** The layout the kind on show maps to, where one is mapped and still exists. */
  const fitting = computed<string | null>(() => {
    const kind = picked.value ?? restored.value
    const { layoutByRun, layoutForBacktest, layoutForSession } = settingsStore.settings
    if (!kind || layoutByRun === 'off') return null
    const id = kind === 'backtest' ? layoutForBacktest : layoutForSession
    return layouts.layouts.some(layout => layout.id === id) ? id : null
  })

  watchEffect(() => {
    const id = fitting.value
    const loaded = layouts.loaded
    const offering = settingsStore.settings.layoutByRun === 'offer' && loaded !== null && id !== null && id !== loaded.id
    layouts.offer(offering ? id : null)
  })

  function onPick(kind: RunKind | null): void {
    if (!kind) return
    picked.value = kind
    if (settingsStore.settings.layoutByRun !== 'switch') return
    const id = fitting.value
    if (id !== null && id !== layouts.loaded?.id) layouts.load(id)
  }

  watch(() => context.main.run.id, id => {
    if (id) onPick(runs.selectedRun ? runKindOf(runs.selectedRun.group) : null)
  })
  watch(() => context.main.deployment.id, id => {
    if (id) onPick('session')
  })
}
