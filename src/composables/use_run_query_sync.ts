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
 * Keeps the run and the scenarios narrowed to in the URL, so a run view is a shareable link that
 * survives reload. Same priority as the chart selection: URL params win over an empty store.
 *
 * Two params, not four. The group and the set were levels of a cascade the picker no longer has,
 * and they were never needed to restore a view: the index row carries both, so a link that names
 * the run alone reconstructs everything above it.
 */
export function useRunQuerySync(): void {
  const router = useRouter()
  const route = useRoute()
  const runsStore = useRunsStore()
  const { selectedRunId, selectedUnits } = storeToRefs(runsStore)

  let _ready = false

  onMounted(async () => {
    // wait for the router to finish its initial navigation before reading query params
    await router.isReady()
    // the index has to exist before a param can select anything in it
    await runsStore.loadRuns()

    const params = readQuery(route.query)
    if (params['run']) {
      // The run alone is enough, and the index is the authority for whether it still exists.
      await runsStore.selectRun(params['run'])
      // one step BELOW the run, and selecting a run clears it — so it is applied afterwards, and
      // only where the run actually resolved. A unit without a run narrows nothing.
      if (params['unit'] && selectedRunId.value) runsStore.setUnits(splitUnits(params['unit']))
    }

    _ready = true
    /**
     * One write on the way out, so a link repairs itself on ARRIVAL rather than on the reader's
     * next click. The watch below cannot do it: during init it is held off by `_ready`, and after
     * init nothing has changed, so it never fires for a URL that was already correct about the run
     * and wrong about everything else. Found by the browser suite — the unit tests exercise the
     * watch, and this is the one path that never reaches it.
     */
    writeUrl()
  })

  /** The selection as query params, merged into whatever else the URL carries. */
  function writeUrl(): void {
    // merge, never replace — the chart selection owns params in the same query
    const query = readQuery(route.query)
    writeParam(query, 'run', selectedRunId.value)
    writeParam(
      query,
      'unit',
      selectedUnits.value.length ? selectedUnits.value.join(UNIT_SEPARATOR) : null
    )
    // `group` and `name` were the cascade's own params and mean nothing now. A saved link may
    // still carry them; they are removed rather than left to look meaningful.
    writeParam(query, 'group', null)
    writeParam(query, 'name', null)
    router.replace({ query })
  }

  // only write URL after init is complete — prevents intermediate states from clobbering params
  watch([selectedRunId, selectedUnits], () => {
    if (!_ready) return
    writeUrl()
  })
}
