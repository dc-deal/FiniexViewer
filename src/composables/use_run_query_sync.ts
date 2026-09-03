import { watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRunsStore } from '@/stores/runs_store'
import { readQuery, writeParam } from '@/composables/query_param_utils'

/**
 * Keeps the run cascade (group / name / run) in the URL, so a run view is a shareable link that
 * survives reload. Same priority as the chart selection: URL params win over an empty store.
 */
export function useRunQuerySync(): void {
  const router = useRouter()
  const route = useRoute()
  const runsStore = useRunsStore()
  const { selectedGroup, selectedName, selectedRunId } = storeToRefs(runsStore)

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
    } else {
      // applied in cascade order — setGroup clears the name, setName clears the run
      if (params['group']) runsStore.setGroup(params['group'])
      if (params['name']) runsStore.setName(params['name'])
    }

    _ready = true
  })

  // only write URL after init is complete — prevents intermediate states from clobbering params
  watch([selectedGroup, selectedName, selectedRunId], ([group, name, run]) => {
    if (!_ready) return
    // merge, never replace — the chart selection owns params in the same query
    const query = readQuery(route.query)
    writeParam(query, 'group', group)
    writeParam(query, 'name', name)
    writeParam(query, 'run', run)
    router.replace({ query })
  })
}
