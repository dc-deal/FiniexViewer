import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getRuns, getRunSummary } from '@/api/api_client'
import type { RunInfo, RunSummary } from '@/types/api/report_types'

/** Distinct values in encounter order — the index arrives newest first and that order is kept. */
function unique(values: string[]): string[] {
  return [...new Set(values)]
}

/** Failure text for the UI: says what failed, keeps the detail, never shows a stack trace. */
function describeFailure(error: unknown, action: string): string {
  const detail = error instanceof Error ? error.message : String(error)
  return `${action}: ${detail}`
}

export const useRunsStore = defineStore('runs', () => {
  const runs = ref<RunInfo[]>([])
  const selectedGroup = ref<string | null>(null)
  const selectedName = ref<string | null>(null)
  const selectedRunId = ref<string | null>(null)
  const summary = ref<RunSummary | null>(null)
  const loadingRuns = ref(false)
  const loadingSummary = ref(false)
  const error = ref<string | null>(null)
  // the selected run exists but carries no run-summary artifact (backend 404)
  const summaryMissing = ref(false)

  // group -> name -> run, all three derived from the one index request
  const groups = computed(() => unique(runs.value.map(run => run.group)))

  const names = computed(() =>
    unique(runs.value.filter(run => run.group === selectedGroup.value).map(run => run.name))
  )

  const runsInSelection = computed(() =>
    runs.value.filter(run =>
      run.group === selectedGroup.value && run.name === selectedName.value
    )
  )

  const selectedRun = computed(() =>
    runs.value.find(run => run.run_id === selectedRunId.value) ?? null
  )

  async function loadRuns(): Promise<void> {
    // deliberately not cached — new runs appear while the app is open
    loadingRuns.value = true
    error.value = null
    try {
      // the index row carries run_id + group + name, so the cascade needs no request per run
      runs.value = await getRuns()
    } catch (e) {
      error.value = describeFailure(e, 'Could not load the run index')
    } finally {
      loadingRuns.value = false
    }
  }

  function clearRun(): void {
    selectedRunId.value = null
    summary.value = null
    summaryMissing.value = false
  }

  function setGroup(group: string): void {
    selectedGroup.value = group
    selectedName.value = null
    clearRun()
  }

  function setName(name: string): void {
    selectedName.value = name
    clearRun()
  }

  async function loadSummary(): Promise<void> {
    const runId = selectedRunId.value
    if (!runId) return

    loadingSummary.value = true
    error.value = null
    summary.value = null
    summaryMissing.value = false

    try {
      const result = await getRunSummary(runId)
      summary.value = result
      summaryMissing.value = result === null
    } catch (e) {
      error.value = describeFailure(e, 'Could not load the run summary')
    } finally {
      loadingSummary.value = false
    }
  }

  async function selectRun(runId: string): Promise<void> {
    selectedRunId.value = runId
    await loadSummary()
  }

  return {
    runs,
    groups,
    names,
    runsInSelection,
    selectedGroup,
    selectedName,
    selectedRunId,
    selectedRun,
    summary,
    summaryMissing,
    loadingRuns,
    loadingSummary,
    error,
    loadRuns,
    setGroup,
    setName,
    selectRun,
  }
})
