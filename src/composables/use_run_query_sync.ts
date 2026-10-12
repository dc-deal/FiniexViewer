import { watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRunsStore } from '@/stores/runs_store'
import { patchQuery, readQuery } from '@/composables/query_param_utils'
import { facetParamKeys } from '@/composables/use_facet_query'
import { POSITION_PARAM } from '@/composables/use_position_link'
import { ROSTER_FACET_PREFIX } from '@/composables/use_scenario_selection'

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

const ROSTER_KEYS = facetParamKeys(ROSTER_FACET_PREFIX)

/**
 * What a NEW run takes with it, and only a new one: a restore keeps everything its link carries.
 *
 * The position mark names a position of ONE run, and a position id is a counter per unit —
 * `pos_eurgbp_1` exists in every run that traded EURGBP — so carried into the next run it marks a
 * DIFFERENT position under the same name. The roster's narrowing (its facets and its search) was
 * made for the old roster and means nothing in the new one; its sort is a preference and stays.
 * Both were left behind until 2026-10-12: the roster is unmounted between two runs, so its own
 * reset never ran, and nothing else cleared the mark.
 *
 * These are params OTHER writers own — the run view writes the mark, the roster bar its facets —
 * and the keys come from them rather than being spelled here, so a renamed scheme cannot leave
 * this cascade clearing params nobody writes any more.
 */
const LEFT_BEHIND_BY_A_NEW_RUN: Record<string, null> = {
  [POSITION_PARAM]: null,
  [ROSTER_KEYS.facets]: null,
  [ROSTER_KEYS.search]: null,
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
    // Remembered, because a reader can pick another run while this one is still being restored —
    // its summary takes a request — and that pick is a NEW run, not part of the restore.
    const linked = params['run'] ?? null
    if (linked) {
      // The run alone is enough, and the index is the authority for whether it still exists.
      await runsStore.selectRun(linked)
      // one step BELOW the run, and selecting a run clears it — so it is applied afterwards, and
      // only where the LINKED run resolved and is still the one chosen. A unit without its run
      // narrows nothing, and the narrowing of one run is never handed to another.
      if (params['unit'] && selectedRunId.value === linked) {
        runsStore.setUnits(splitUnits(params['unit']))
      }
    }

    _ready = true
    /**
     * One write on the way out, so a link repairs itself on ARRIVAL rather than on the reader's
     * next click. The watch below cannot do it: during init it is held off by `_ready`, and after
     * init nothing has changed, so it never fires for a URL that was already correct about the run
     * and wrong about everything else. Found by the browser suite — the unit tests exercise the
     * watch, and this is the one path that never reaches it.
     *
     * A run the reader picked while the link was restoring is a new run, so what the link carried
     * for ITS run is cleared on the way out; the watch saw that pick while it was still held off.
     */
    const pickedMeanwhile = linked !== null && selectedRunId.value !== null
      && selectedRunId.value !== linked
    writeUrl(pickedMeanwhile)
  })

  /** The selection as query params, patched into whatever else the URL carries. */
  function writeUrl(runChanged = false): void {
    // a patch, never a whole query — the chart selection and two facet bars own params in the same
    // URL, and a writer that rebuilds the object drops whatever the others wrote in the same tick
    patchQuery(router, {
      run: selectedRunId.value,
      unit: selectedUnits.value.length ? selectedUnits.value.join(UNIT_SEPARATOR) : null,
      // `group` and `name` were the cascade's own params and mean nothing now. A saved link may
      // still carry them; they are removed rather than left to look meaningful.
      group: null,
      name: null,
      ...(runChanged ? LEFT_BEHIND_BY_A_NEW_RUN : {}),
    })
  }

  // only write URL after init is complete — prevents intermediate states from clobbering params
  watch([selectedRunId, selectedUnits], ([runId], [previousRunId]) => {
    if (!_ready) return
    writeUrl(runId !== previousRunId)
  })
}
