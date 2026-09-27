import { watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRunsStore } from '@/stores/runs_store'
import { readQuery, writeParam } from '@/composables/query_param_utils'

/**
 * How several scenarios ride in one param. Measured 2026-09-27 over 58 names from the roster, the
 * run index and the portfolio: every one matches `[A-Za-z0-9_-]`, so nothing collides with the
 * separator. A name that ever carries a comma would not survive the round trip — the fix then is
 * repeated params, not an escape scheme.
 */
const UNIT_SEPARATOR = ','

function splitUnits(value: string): string[] {
  return value.split(UNIT_SEPARATOR).map(unit => unit.trim()).filter(Boolean)
}

/**
 * Keeps the run cascade (group / name / run / scenarios) in the URL, so a run view is a shareable
 * link that survives reload. Same priority as the chart selection: URL params win over an empty
 * store.
 */
export function useRunQuerySync(): void {
  const router = useRouter()
  const route = useRoute()
  const runsStore = useRunsStore()
  const { selectedGroup, selectedName, selectedRunId, selectedUnits } = storeToRefs(runsStore)

  let _ready = false

  onMounted(async () => {
    // wait for the router to finish its initial navigation before reading query params
    await router.isReady()
    // the index has to exist before a param can select anything in it
    await runsStore.loadRuns()

    const params = readQuery(route.query)
    if (params['run']) {
      // The run alone is enough: its index row carries group and name, so a link keeps working
      // even after the backend renames a group value. The stale params are simply not consulted,
      // and the watch below writes the corrected ones back into the URL.
      await runsStore.selectRun(params['run'])
      // one step BELOW the run, and selecting a run clears it — so it is applied afterwards, and
      // only where the run actually resolved. A unit without a run narrows nothing.
      if (params['unit'] && selectedRunId.value) runsStore.setUnits(splitUnits(params['unit']))
    } else {
      // applied in cascade order — setGroup clears the name, setName clears the run
      if (params['group']) runsStore.setGroup(params['group'])
      if (params['name']) runsStore.setName(params['name'])
    }

    _ready = true
  })

  // only write URL after init is complete — prevents intermediate states from clobbering params
  watch([selectedGroup, selectedName, selectedRunId, selectedUnits], ([group, name, run, units]) => {
    if (!_ready) return
    // merge, never replace — the chart selection owns params in the same query
    const query = readQuery(route.query)
    writeParam(query, 'group', group)
    writeParam(query, 'name', name)
    writeParam(query, 'run', run)
    writeParam(query, 'unit', units.length ? units.join(UNIT_SEPARATOR) : null)
    router.replace({ query })
  })
}
