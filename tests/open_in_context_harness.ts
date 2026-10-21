import { provideOpenInContext } from '@/composables/use_open_in_context'

/** Where the panels tried to send the reader, in the order they asked. */
export interface TestOpenInContext {
  opened: { what: 'run' | 'deployment' | 'sweep', id: string, section?: string }[]
}

/**
 * The way out of a panel for a test host — RECORDED rather than performed, because going there is
 * the shell's work and a panel test has no shell. Shared rather than rebuilt per suite, for the
 * reason the position-link harness states: several panels act on this channel, and two copies of
 * the recording would drift.
 *
 * `canOpen: false` is a host with nowhere to send the reader, the panel mounted on its own.
 */
export function provideTestOpenInContext(canOpen = true): TestOpenInContext {
  const state: TestOpenInContext = { opened: [] }
  provideOpenInContext({
    openRun: (runId: string, sectionId?: string) => {
      state.opened.push(sectionId ? { what: 'run', id: runId, section: sectionId } : { what: 'run', id: runId })
    },
    openDeployment: (deploymentId: string) => {
      state.opened.push({ what: 'deployment', id: deploymentId })
    },
    openSweep: (sweepId: string) => { state.opened.push({ what: 'sweep', id: sweepId }) },
    canOpen,
  })
  return state
}
